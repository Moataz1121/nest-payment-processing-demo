import { Product } from '../../../generated/prisma/client';

export class ProductResource {
  id: number;
  name: string;
  currency: string;
  is_active: boolean;
  price: number;
  quantity: number;
  // reserved_quantity: number;
  // createdAt: Date;
  // updatedAt: Date;

  constructor(product: Product) {
    this.id = product.id;
    this.name = product.name;
    this.currency = product.currency;
    this.is_active = product.is_active;
    this.price = product.price;
    this.quantity = product.quantity;
    // this.reserved_quantity = product.reserved_quantity;
    // this.createdAt = product.createdAt;
    // this.updatedAt = product.updatedAt;
  }

  static single(product: Product) {
    return new ProductResource(product);
  }

  static collection(products: Product[]) {
    return products.map((product) => new ProductResource(product));
  }
}
