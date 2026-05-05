import { OperationsPageLoading } from '@/components/page-loading';

export default function TripsLoading() {
  return (
    <OperationsPageLoading
      activeNav="trips"
      eyebrow="Quản lý chuyến đi"
      title="Danh sách chuyến đang vận hành"
      description="Đang tải hàng chờ vận hành, bộ lọc và các chuyến cần xử lý."
    />
  );
}
