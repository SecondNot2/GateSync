import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type {
  CuaKhauSoDirection,
  CuaKhauSoListStatus,
  CuaKhauSoPageSize
} from '../cua-khau-so.types';

export const cuaKhauSoPageSizes = [10, 20, 50, 100] satisfies CuaKhauSoPageSize[];
export const cuaKhauSoStatuses = [1, 2, 3] satisfies CuaKhauSoListStatus[];
export const cuaKhauSoDirections = ['IMPORT', 'EXPORT'] satisfies CuaKhauSoDirection[];

export class ListCuaKhauSoDeclarationsQueryDto {
  @ApiPropertyOptional({
    example: 1,
    minimum: 1
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageNumber?: number;

  @ApiPropertyOptional({
    enum: cuaKhauSoPageSizes,
    example: 20
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(cuaKhauSoPageSizes)
  pageSize?: CuaKhauSoPageSize;

  @ApiPropertyOptional({
    enum: cuaKhauSoStatuses,
    example: 1
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(cuaKhauSoStatuses)
  status?: CuaKhauSoListStatus;

  @ApiPropertyOptional({
    example: '12C34567'
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  keyword?: string;

  @ApiPropertyOptional({
    enum: cuaKhauSoDirections,
    example: 'IMPORT'
  })
  @IsOptional()
  @IsIn(cuaKhauSoDirections)
  direction?: CuaKhauSoDirection;

  toExternalParams() {
    const params = {
      pageNumber: this.pageNumber ?? 1,
      pageSize: this.pageSize ?? 20
    };

    return {
      ...params,
      ...(this.status ? { status: this.status } : {}),
      ...(this.keyword ? { keyword: this.keyword.trim() } : {}),
      ...(this.direction ? { direction: this.direction } : {})
    };
  }
}
