import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { PaymentService } from '../services/payment.service';
import { CheckoutDto } from '../dto/checkout.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@Controller('payments')
export class CheckoutController {
  constructor(private readonly paymentService: PaymentService) {}

  @UseGuards(JwtAuthGuard)
  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  async checkout(
    @CurrentUser('id') userId: number,
    @Body() dto: CheckoutDto,
  ) {
    const result = await this.paymentService.checkout(userId, dto);
    return {
      message: result.message,
      data: result.data,
    };
  }
}
