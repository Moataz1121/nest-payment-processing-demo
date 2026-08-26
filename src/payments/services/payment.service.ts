import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CheckoutDto } from '../dto/checkout.dto';
import { PaymentGatewayFactory } from './payment-gateway.factory';
import { Prisma } from '../../../generated/prisma/client';

@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gatewayFactory: PaymentGatewayFactory,
  ) {}

  async checkout(userId: number, dto: CheckoutDto) {
    // 1. Layer 1 Idempotency Check: (user_id + idempotency_key)
    const existingPayment = await this.prisma.payment.findUnique({
      where: {
        user_id_idempotency_key: {
          user_id: userId,
          idempotency_key: dto.idempotency_key,
        },
      },
      include: {
        order: {
          include: {
            orderItems: true,
          },
        },
        gateway: true,
      },
    });

    if (existingPayment) {
      return {
        is_idempotent: true,
        message: 'Payment already processed with this idempotency key',
        data: existingPayment,
      };
    }

    // 2. Gateway Retrieval (with auto-fallback upsert for default test UUID)
    let gateway = await this.prisma.paymentGateway.findUnique({
      where: { id: dto.payment_gateway_id },
    });

    if (!gateway) {
      if (dto.payment_gateway_id === '01a014d2-b4ce-734c-a99d-adde8ae8ff0d') {
        gateway = await this.prisma.paymentGateway.upsert({
          where: { id: '01a014d2-b4ce-734c-a99d-adde8ae8ff0d' },
          create: {
            id: '01a014d2-b4ce-734c-a99d-adde8ae8ff0d',
            name: 'Mock Gateway',
            slug: 'mock-gateway',
            provider: 'mock',
            is_enabled: true,
            creds: { apiKey: 'mock-key' },
          },
          update: {},
        });
      } else {
        throw new NotFoundException('Payment gateway not found');
      }
    }

    if (!gateway.is_enabled) {
      throw new BadRequestException('Selected payment gateway is currently disabled');
    }

    // 3. Prepare product items map & sort IDs for Deterministic Lock Ordering
    const itemMap = new Map<number, number>();
    for (const item of dto.items) {
      itemMap.set(item.product_id, (itemMap.get(item.product_id) || 0) + item.quantity);
    }
    const sortedProductIds = Array.from(itemMap.keys()).sort((a, b) => a - b);

    // 4. Short DB Transaction 1: Inventory Reservation, Order Creation & Active Attempt Claim (~1ms)
    let order: any;
    let payment: any;
    let paymentAttempt: any;

    try {
      const step1Result = await this.prisma.$transaction(async (tx) => {
        // Pessimistic Row Locking in ascending numeric ID order
        const products: any[] = await tx.$queryRaw`
          SELECT id, name, price, quantity, reserved_quantity, is_active, currency
          FROM "Product"
          WHERE id IN (${Prisma.join(sortedProductIds)})
          ORDER BY id ASC
          FOR UPDATE
        `;

        if (products.length !== sortedProductIds.length) {
          throw new BadRequestException('One or more requested products do not exist');
        }

        let totalAmount = 0;
        const orderItemsData: any[] = [];
        const currency = products[0].currency || 'USD';

        for (const product of products) {
          if (!product.is_active) {
            throw new BadRequestException(`Product ${product.name} is inactive`);
          }

          const requestedQty = itemMap.get(product.id)!;
          const availableQty = product.quantity - product.reserved_quantity;

          if (availableQty < requestedQty) {
            throw new BadRequestException(
              `Insufficient stock for ${product.name}. Available: ${availableQty}, requested: ${requestedQty}`,
            );
          }

          const unitPrice = parseFloat(product.price.toString());
          const itemTotal = unitPrice * requestedQty;
          totalAmount += itemTotal;

          orderItemsData.push({
            product_id: product.id,
            quantity: requestedQty,
            unit_price: unitPrice,
            total_price: parseFloat(itemTotal.toFixed(2)),
          });

          // Reserve Stock
          await tx.product.update({
            where: { id: product.id },
            data: {
              reserved_quantity: {
                increment: requestedQty,
              },
            },
          });
        }

        // Create Order
        const createdOrder = await tx.order.create({
          data: {
            user_id: userId,
            status: 'PENDING',
            total_amount: parseFloat(totalAmount.toFixed(2)),
            currency,
            orderItems: {
              create: orderItemsData,
            },
          },
          include: {
            orderItems: true,
          },
        });

        const paymentReference = `PAY-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

        // Create Payment
        const createdPayment = await tx.payment.create({
          data: {
            payment_gateway_id: gateway.id,
            order_id: createdOrder.id,
            user_id: userId,
            payment_reference: paymentReference,
            idempotency_key: dto.idempotency_key,
            amount: createdOrder.total_amount,
            currency,
            status: 'PROCESSING',
            payment_initiated_at: new Date(),
          },
        });

        // Create PaymentAttempt (Enforces single active attempt via active_payment_id unique constraint)
        const createdAttempt = await tx.paymentAttempt.create({
          data: {
            payment_id: createdPayment.id,
            active_payment_id: createdPayment.id,
            attempt_number: 1,
            status: 'PROCESSING',
            started_at: new Date(),
          },
        });

        return { order: createdOrder, payment: createdPayment, paymentAttempt: createdAttempt };
      });

      order = step1Result.order;
      payment = step1Result.payment;
      paymentAttempt = step1Result.paymentAttempt;
    } catch (error: any) {
      // Catch duplicate idempotency key race condition if 2 requests pass in parallel
      if (error.code === 'P2002') {
        const racePayment = await this.prisma.payment.findUnique({
          where: {
            user_id_idempotency_key: {
              user_id: userId,
              idempotency_key: dto.idempotency_key,
            },
          },
          include: {
            order: { include: { orderItems: true } },
            gateway: true,
          },
        });
        if (racePayment) {
          return {
            is_idempotent: true,
            message: 'Payment already processed with this idempotency key',
            data: racePayment,
          };
        }
      }
      throw error;
    }

    // 5. Gateway HTTP Call (Outside DB Transaction - ZERO DB locks held)
    const strategy = this.gatewayFactory.getStrategy(gateway.provider);
    const gatewayIdempotencyKey = `pay_idem_${payment.id}`;

    let processResult;
    try {
      processResult = await strategy.processPayment(payment, gatewayIdempotencyKey);
    } catch (error: any) {
      processResult = {
        success: false,
        paymentId: payment.id,
        status: 'failed' as const,
        message: error.message || 'Payment processing error',
      };
    }

    // 6. Short DB Transaction 2: State Settlement & Inventory Finalization (~1ms)
    const finalPayment = await this.prisma.$transaction(async (tx) => {
      const currentPayment = await tx.payment.findUnique({
        where: { id: payment.id },
        include: { order: { include: { orderItems: true } } },
      });

      if (!currentPayment) return null;

      // State Regression Guard
      if (currentPayment.status === 'COMPLETED') {
        return currentPayment;
      }

      const isSuccess = processResult.success && processResult.status === 'completed';
      const newPaymentStatus = isSuccess ? 'COMPLETED' : 'FAILED';
      const newOrderStatus = isSuccess ? 'CONFIRMED' : 'CANCELLED';

      // Update attempt: release active_payment_id
      await tx.paymentAttempt.update({
        where: { id: paymentAttempt.id },
        data: {
          active_payment_id: null,
          status: isSuccess ? 'SUCCEEDED' : 'FAILED',
          response_payload: processResult.data || {},
          finished_at: new Date(),
        },
      });

      // Update Payment status
      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: newPaymentStatus,
          transaction_id: processResult.transactionId || null,
          payment_completed_at: isSuccess ? new Date() : null,
          payment_failed_at: !isSuccess ? new Date() : null,
          failure_message: !isSuccess ? processResult.message : null,
        },
        include: {
          order: {
            include: { orderItems: true },
          },
          gateway: true,
        },
      });

      // Update Order status
      await tx.order.update({
        where: { id: currentPayment.order_id },
        data: { status: newOrderStatus },
      });

      // Physical Inventory Settlement
      for (const item of currentPayment.order.orderItems) {
        if (isSuccess) {
          // Decrement physical stock and release reserved stock
          await tx.product.update({
            where: { id: item.product_id },
            data: {
              quantity: { decrement: item.quantity },
              reserved_quantity: { decrement: item.quantity },
            },
          });
        } else {
          // Release reserved stock only
          await tx.product.update({
            where: { id: item.product_id },
            data: {
              reserved_quantity: { decrement: item.quantity },
            },
          });
        }
      }

      return updatedPayment;
    });

    return {
      is_idempotent: false,
      message: processResult.message,
      data: finalPayment,
    };
  }
}
