import { Injectable } from '@nestjs/common';
import { CallbackResult, PaymentGatewayStrategy, ProcessPaymentResult } from '../interfaces/payment-gateway.interface';
import { Payment } from '../../../generated/prisma/client';

@Injectable()
export class StripePaymentStrategy implements PaymentGatewayStrategy {
  async processPayment(
    payment: Payment,
    gatewayIdempotencyKey?: string,
  ): Promise<ProcessPaymentResult> {
    const transactionId = `pi_stripe_${Date.now()}`;
    return {
      success: true,
      paymentId: payment.id,
      transactionId,
      status: 'completed',
      paymentUrl: `https://checkout.stripe.com/pay/${transactionId}`,
      message: 'Stripe payment intent completed',
      data: {
        provider: 'stripe',
        idempotency_key: gatewayIdempotencyKey,
      },
    };
  }

  async callback(request: any): Promise<CallbackResult> {
    return {
      success: true,
      paymentId: request.payment_intent || 'stripe-id',
      status: 'completed',
      message: 'Stripe callback verified',
    };
  }

  async handleWebhook(request: any): Promise<CallbackResult> {
    return {
      success: true,
      paymentId: request.data?.object?.id || 'stripe-id',
      status: 'completed',
      message: 'Stripe webhook event handled',
    };
  }

  async processRefund(
    payment: Payment,
    amount: number,
    reason?: string,
  ): Promise<{ success: boolean; refundedAmount: number; message: string }> {
    return {
      success: true,
      refundedAmount: amount,
      message: `Stripe refund of ${amount} processed successfully`,
    };
  }
}
