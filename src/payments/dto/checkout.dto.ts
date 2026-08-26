import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsNotEmpty, IsString, IsUUID, Min, ValidateNested } from 'class-validator';

export class CheckoutItemDto {
  @IsNotEmpty({ message: 'product_id is required' })
  @IsInt({ message: 'product_id must be an integer' })
  @Min(1, { message: 'product_id must be at least 1' })
  product_id: number;

  @IsNotEmpty({ message: 'quantity is required' })
  @IsInt({ message: 'quantity must be an integer' })
  @Min(1, { message: 'quantity must be at least 1' })
  quantity: number;
}

export class CheckoutDto {
  @IsNotEmpty({ message: 'payment_gateway_id is required' })
  @IsUUID('all', { message: 'payment_gateway_id must be a valid UUID' })
  payment_gateway_id: string;

  @IsNotEmpty({ message: 'idempotency_key is required' })
  @IsString({ message: 'idempotency_key must be a string' })
  idempotency_key: string;

  @IsArray({ message: 'items must be an array' })
  @ArrayMinSize(1, { message: 'items must contain at least one item' })
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items: CheckoutItemDto[];
}
