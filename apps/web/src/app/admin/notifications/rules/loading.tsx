import { OperationsPageLoading } from '@/components/page-loading';

export default function NotificationRulesLoading() {
  return (
    <OperationsPageLoading
      activeNav="admin"
      eyebrow="Quản trị thông báo"
      title="Quy tắc thông báo"
      description="Đang tải danh sách quy tắc thông báo của tổ chức."
    />
  );
}
