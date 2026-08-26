import { Injectable } from '@nestjs/common';
import { CallbackResult, PaymentGatewayStrategy, ProcessPaymentResult } from '../interfaces/payment-gateway.interface';
import { Payment } from '../../../generated/prisma/client';

@Injectable()
export class MockPaymentStrategy implements PaymentGatewayStrategy {
  async processPayment(
    payment: Payment,
    gatewayIdempotencyKey?: string,
  ): Promise<ProcessPaymentResult> {
    const isSuccess = payment.amount < 50000;
    const transactionId = `TXN-MOCK-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    return {
      success: isSuccess,
      paymentId: payment.id,
      transactionId,
      status: isSuccess ? 'completed' : 'failed',
      paymentUrl: `https://mock-gateway.com/pay/${payment.id}`,
      message: isSuccess ? 'Payment processed successfully' : 'Payment failed: limit exceeded',
      data: {
        gateway_idempotency_key: gatewayIdempotencyKey,
        provider: 'mock',
      },
    };
  }

  async callback(request: any): Promise<CallbackResult> {
    return {
      success: true,
      paymentId: request.payment_id || 'mock-payment-id',
      status: 'completed',
      message: 'Mock payment callback processed',
    };
  }

  async handleWebhook(request: any): Promise<CallbackResult> {
    return {
      success: true,
      paymentId: request.payment_id || 'mock-payment-id',
      status: 'completed',
      message: 'Mock payment webhook handled',
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
      message: `Mock refund of ${amount} ${payment.currency} processed successfully`,
    };
  }
}
