import { Payment } from '../../../generated/prisma/client';

export interface ProcessPaymentResult {
  success: boolean;
  paymentId: string;
  transactionId?: string | null;
  status: 'processing' | 'completed' | 'failed';
  paymentUrl?: string | null;
  message: string;
  retryable?: boolean;
  data?: Record<string, any>;
}

export interface CallbackResult {
  success: boolean;
  paymentId: string;
  status: 'completed' | 'failed';
  message: string;
  data?: Record<string, any>;
}

export interface PaymentGatewayStrategy {
  processPayment(
    payment: Payment,
    gatewayIdempotencyKey?: string,
  ): Promise<ProcessPaymentResult>;

  callback(request: any): Promise<CallbackResult>;

  handleWebhook(request: any): Promise<CallbackResult>;

  processRefund(
    payment: Payment,
    amount: number,
    reason?: string,
  ): Promise<{ success: boolean; refundedAmount: number; message: string }>;
}
