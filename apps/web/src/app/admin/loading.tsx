import { OperationsPageLoading } from '@/components/page-loading';

export default function AdminLoading() {
  return (
    <OperationsPageLoading
      activeNav="admin"
      eyebrow="Quản trị nội bộ"
      title="Tổ chức, thành viên, phương tiện và tài xế"
      description="Đang tải dữ liệu nền phục vụ vận hành nội bộ."
    />
  );
}
