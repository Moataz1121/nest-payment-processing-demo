import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GetProductsDto } from './dto/get-products.dto';
import { ProductResource } from './resources/product.resource';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: GetProductsDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const perPage = query.per_page && query.per_page > 0 ? Math.min(query.per_page, 25) : 10;

    const skip = (page - 1) * perPage;

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        skip,
        take: perPage,
        orderBy: { id: 'asc' },
      }),
      this.prisma.product.count(),
    ]);

    const lastPage = Math.ceil(total / perPage) || 1;

    return {
      data: ProductResource.collection(products),
      meta: {
        total,
        total_count: total,
        per_page: perPage,
        current_page: page,
        last_page: lastPage,
        is_more: page < lastPage,
      },
    };
  }
}
