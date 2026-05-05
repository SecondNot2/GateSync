import { OperationsPageLoading } from '@/components/page-loading';

export default function TripDetailLoading() {
  return (
    <OperationsPageLoading
      activeNav="trips"
      eyebrow="Chi tiết chuyến"
      title="Đang tải chuyến"
      description="Đang tải trạng thái hiện tại, việc cần làm và timeline vận hành."
    />
  );
}
