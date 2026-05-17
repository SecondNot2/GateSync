import { OperationsPageLoading } from '@/components/page-loading';

export default function SyncRunsLoading() {
  return (
    <OperationsPageLoading
      activeNav="admin"
      eyebrow="Quản trị nội bộ"
      title="Lịch sử đồng bộ tích hợp"
      description="Đang tải lịch sử các lần chạy đồng bộ AUTO SYNC theo tổ chức."
    />
  );
}
