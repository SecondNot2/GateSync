import type {
  MembershipRole,
  MembershipStatus,
  OrganizationType,
  OwnershipType,
  TripDirection,
  TripEventSource,
  TripEventStatus,
  TripEventType,
  TripStatus,
  TripType,
  VehicleType
} from '@gatesync/shared';

export const organizationTypeLabels: Record<OrganizationType, string> = {
  LOGISTICS_COMPANY: 'Doanh nghiệp logistics',
  CARGO_OWNER: 'Chủ hàng',
  CUSTOMS_AGENT: 'Đại lý hải quan',
  TRANSPORT_COMPANY: 'Đơn vị vận tải',
  YARD_OPERATOR: 'Đơn vị bãi',
  OTHER: 'Khác'
};

export const membershipRoleLabels: Record<MembershipRole, string> = {
  OWNER: 'Chủ sở hữu',
  ADMIN: 'Quản trị viên',
  DISPATCHER: 'Điều phối viên',
  DOCUMENT_STAFF: 'Nhân sự chứng từ',
  FIELD_OPERATOR: 'Nhân sự hiện trường',
  VIEWER: 'Chỉ xem',
  BILLING_ADMIN: 'Quản trị thanh toán'
};

export const membershipStatusLabels: Record<MembershipStatus, string> = {
  ACTIVE: 'Đang hoạt động',
  INVITED: 'Đã mời',
  SUSPENDED: 'Tạm khóa',
  REMOVED: 'Đã gỡ'
};

export const vehicleTypeLabels: Record<VehicleType, string> = {
  TRUCK: 'Xe tải',
  TRACTOR_HEAD: 'Đầu kéo',
  TRAILER: 'Rơ-moóc',
  CONTAINER_TRUCK: 'Xe container',
  VAN: 'Xe van',
  OTHER: 'Khác'
};

export const ownershipTypeLabels: Record<OwnershipType, string> = {
  OWNED: 'Sở hữu',
  LEASED: 'Thuê vận hành',
  PARTNER: 'Đối tác',
  CUSTOMER: 'Khách hàng',
  OTHER: 'Khác'
};

export const tripTypeLabels: Record<TripType, string> = {
  EXPORT_WITH_GOODS: 'Xuất khẩu có hàng',
  IMPORT_WITH_GOODS: 'Nhập khẩu có hàng',
  EMPTY_VEHICLE_ENTRY: 'Xe rỗng vào khu vực cửa khẩu',
  EMPTY_VEHICLE_EXIT: 'Xe rỗng rời khu vực cửa khẩu',
  YARD_ONLY: 'Điều phối trong bãi',
  INTERNAL_TRANSFER: 'Điều chuyển nội bộ'
};

export const tripDirectionLabels: Record<TripDirection, string> = {
  EXPORT: 'Chiều xuất',
  IMPORT: 'Chiều nhập',
  DOMESTIC: 'Nội địa',
  UNKNOWN: 'Chưa xác định'
};

export const tripStatusLabels: Record<TripStatus, string> = {
  PLANNED: 'Đã lập kế hoạch',
  IN_PROGRESS: 'Đang di chuyển',
  WAITING_YARD_ENTRY: 'Chờ vào bãi',
  IN_YARD: 'Đang trong bãi',
  AT_BORDER_GATE: 'Tại cửa khẩu',
  CUSTOMS_PROCESSING: 'Đang xử lý hải quan',
  INSPECTION_REQUIRED: 'Cần kiểm hóa',
  BLOCKED: 'Đang bị chặn',
  DELAYED: 'Bị chậm',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy'
};

export const tripEventTypeLabels: Record<TripEventType, string> = {
  TRIP_CREATED: 'Tạo chuyến',
  VEHICLE_ASSIGNED: 'Gán phương tiện',
  DRIVER_ASSIGNED: 'Gán tài xế',
  DEPARTED: 'Xe xuất phát',
  ARRIVED_BORDER_AREA: 'Đến khu vực cửa khẩu',
  WAITING_YARD_ENTRY: 'Bắt đầu chờ vào bãi',
  YARD_ENTRY_CONFIRMED: 'Xác nhận vào bãi',
  DRIVER_REPORTED_YARD_ENTRY: 'Tài xế báo đã vào bãi',
  YARD_EXIT_CONFIRMED: 'Xác nhận rời bãi',
  DRIVER_REPORTED_GATE_ENTRY: 'Tài xế báo vào cửa khẩu',
  DECLARATION_SUBMITTED: 'Nộp tờ khai',
  DECLARATION_APPROVED: 'Tờ khai được duyệt',
  DECLARATION_REJECTED: 'Tờ khai bị từ chối',
  BORDER_GATE_ENTRY_CONFIRMED: 'Xác nhận vào cửa khẩu',
  CUSTOMS_PROCESSING: 'Xử lý hải quan',
  INSPECTION_REQUIRED: 'Yêu cầu kiểm hóa',
  INSPECTION_COMPLETED: 'Hoàn tất kiểm hóa',
  FEE_PAID: 'Đã nộp phí',
  BORDER_GATE_EXIT_CONFIRMED: 'Xác nhận rời cửa khẩu',
  PROOF_IMAGE_UPLOADED: 'Tải ảnh minh chứng',
  DRIVER_NOTE_ADDED: 'Tài xế thêm ghi chú',
  TRIP_CANCELLED: 'Hủy chuyến',
  TRIP_COMPLETED: 'Hoàn tất chuyến'
};

export const tripEventStatusLabels: Record<TripEventStatus, string> = {
  RECORDED: 'Đã ghi nhận',
  CONFIRMED: 'Đã xác nhận',
  REJECTED: 'Bị từ chối',
  CORRECTED: 'Đã hiệu chỉnh',
  CONFLICTING: 'Có xung đột'
};

export const tripEventSourceLabels: Record<TripEventSource, string> = {
  MANUAL: 'Cập nhật thủ công',
  DRIVER_APP: 'Ứng dụng tài xế',
  IMPORT: 'Tệp nhập liệu',
  CUA_KHAU_SO: 'Cửa khẩu số được ủy quyền',
  XUAN_CUONG: 'Hệ thống bãi được ủy quyền',
  GPS: 'Nhà cung cấp GPS',
  SYSTEM: 'Hệ thống GateSync',
  AI_ASSISTANT: 'Trợ lý AI'
};

export function formatDelay(minutes: number) {
  if (minutes <= 0) {
    return 'Đúng tiến độ';
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours === 0) {
    return `Chậm ${remainingMinutes} phút`;
  }

  if (remainingMinutes === 0) {
    return `Chậm ${hours} giờ`;
  }

  return `Chậm ${hours} giờ ${remainingMinutes} phút`;
}
