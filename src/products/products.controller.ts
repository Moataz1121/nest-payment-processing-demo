import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ProductsService } from './products.service';
import { GetProductsDto } from './dto/get-products.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(@Query() query: GetProductsDto) {
    const { data, meta } = await this.productsService.findAll(query);
    return {
      message: 'Products retrieved successfully',
      data,
      meta,
    };
  }
}
