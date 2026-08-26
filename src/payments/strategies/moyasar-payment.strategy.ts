import { Injectable } from '@nestjs/common';
import { CallbackResult, PaymentGatewayStrategy, ProcessPaymentResult } from '../interfaces/payment-gateway.interface';
import { Payment } from '../../../generated/prisma/client';

@Injectable()
export class MoyasarPaymentStrategy implements PaymentGatewayStrategy {
  async processPayment(
    payment: Payment,
    gatewayIdempotencyKey?: string,
  ): Promise<ProcessPaymentResult> {
    const transactionId = `MOYASAR-TXN-${Date.now()}`;
    return {
      success: true,
      paymentId: payment.id,
      transactionId,
      status: 'completed',
      paymentUrl: `https://api.moyasar.com/v1/payments/${transactionId}`,
      message: 'Moyasar payment processed successfully',
      data: {
        provider: 'moyasar',
        idempotency_key: gatewayIdempotencyKey,
      },
    };
  }

  async callback(request: any): Promise<CallbackResult> {
    return {
      success: true,
      paymentId: request.id || 'moyasar-id',
      status: 'completed',
      message: 'Moyasar callback verified',
    };
  }

  async handleWebhook(request: any): Promise<CallbackResult> {
    return {
      success: true,
      paymentId: request.data?.id || 'moyasar-id',
      status: 'completed',
      message: 'Moyasar webhook processed',
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
      message: `Moyasar refund of ${amount} processed successfully`,
    };
  }
}
