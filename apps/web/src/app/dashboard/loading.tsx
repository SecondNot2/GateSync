import { OperationsPageLoading } from '@/components/page-loading';

export default function DashboardLoading() {
  return (
    <OperationsPageLoading
      activeNav="dashboard"
      eyebrow="Vận hành thời gian thực"
      title="Bảng điều phối cửa khẩu"
      description="Đang chuẩn bị dữ liệu ca trực và các chuyến cần ưu tiên."
    />
  );
}
