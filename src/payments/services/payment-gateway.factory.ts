import { Injectable } from '@nestjs/common';
import { PaymentGatewayStrategy } from '../interfaces/payment-gateway.interface';
import { MockPaymentStrategy } from '../strategies/mock-payment.strategy';
import { MoyasarPaymentStrategy } from '../strategies/moyasar-payment.strategy';
import { StripePaymentStrategy } from '../strategies/stripe-payment.strategy';

@Injectable()
export class PaymentGatewayFactory {
  constructor(
    private readonly mockStrategy: MockPaymentStrategy,
    private readonly moyasarStrategy: MoyasarPaymentStrategy,
    private readonly stripeStrategy: StripePaymentStrategy,
  ) {}

  public getStrategy(gatewaySlug: string): PaymentGatewayStrategy {
    const slug = (gatewaySlug || '').toLowerCase();
    if (slug.includes('moyasar')) {
      return this.moyasarStrategy;
    }
    if (slug.includes('stripe')) {
      return this.stripeStrategy;
    }
    return this.mockStrategy;
  }
}
