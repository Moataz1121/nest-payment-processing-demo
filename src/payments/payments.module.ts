import { Module } from '@nestjs/common';
import { CheckoutController } from './controllers/checkout.controller';
import { PaymentService } from './services/payment.service';
import { PaymentGatewayFactory } from './services/payment-gateway.factory';
import { MockPaymentStrategy } from './strategies/mock-payment.strategy';
import { MoyasarPaymentStrategy } from './strategies/moyasar-payment.strategy';
import { StripePaymentStrategy } from './strategies/stripe-payment.strategy';

@Module({
  controllers: [CheckoutController],
  providers: [
    PaymentService,
    PaymentGatewayFactory,
    MockPaymentStrategy,
    MoyasarPaymentStrategy,
    StripePaymentStrategy,
  ],
  exports: [PaymentService, PaymentGatewayFactory],
})
export class PaymentsModule {}
