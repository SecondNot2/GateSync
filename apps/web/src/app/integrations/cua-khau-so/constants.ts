import type { ApiCuaKhauSoDirection, ApiCuaKhauSoPageSize, ApiCuaKhauSoStatus } from '@/lib/api/types';

export const PAGE_SIZE_OPTIONS: ApiCuaKhauSoPageSize[] = [10, 20, 50, 100];

export const STATUS_FILTERS: Array<
  { value: ''; label: string } | { value: ApiCuaKhauSoStatus; label: string }
> = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 1, label: 'Chưa hoàn thành nghiệp vụ' },
  { value: 2, label: 'Hoàn thành nghiệp vụ' },
  { value: 3, label: 'Đã hủy' }
];

export const DIRECTION_FILTERS: Array<
  { value: ''; label: string } | { value: ApiCuaKhauSoDirection; label: string }
> = [
  { value: '', label: 'Nhập + Xuất' },
  { value: 'IMPORT', label: 'Nhập khẩu' },
  { value: 'EXPORT', label: 'Xuất khẩu' }
];
