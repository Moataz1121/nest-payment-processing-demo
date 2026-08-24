import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class GetProductsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be an integer' })
  @Min(1, { message: 'page must be at least 1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'per_page must be an integer' })
  @Min(1, { message: 'per_page must be at least 1' })
  @Max(25, { message: 'per_page cannot exceed 25' })
  per_page?: number = 10;
}
