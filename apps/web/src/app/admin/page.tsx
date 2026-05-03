import { AppShell } from '@/components/app-shell';
import { adminDrivers, adminMembers, adminVehicles, demoOrganization } from '@/lib/demo-data';
import {
  membershipRoleLabels,
  membershipStatusLabels,
  organizationTypeLabels,
  ownershipTypeLabels,
  vehicleTypeLabels
} from '@/lib/ui-labels';

export default function AdminPage() {
  return (
    <AppShell
      activeNav="admin"
      eyebrow="Quản trị nội bộ"
      title="Tổ chức, thành viên, phương tiện và tài xế"
      description="Quản lý thông tin tổ chức, đội vận hành, phương tiện và tài xế để dữ liệu điều phối luôn rõ ràng."
    >
      <section className="grid gap-5 xl:grid-cols-[1fr_24rem]">
        <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Hồ sơ tổ chức
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 md:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Tên tổ chức
              </p>
              <p className="mt-2 text-xl font-bold text-slate-950">{demoOrganization.name}</p>
              <p className="mt-1 text-sm text-slate-600">
                {organizationTypeLabels[demoOrganization.type]}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Mã số thuế
              </p>
              <p className="mt-2 text-xl font-bold text-slate-950">{demoOrganization.taxCode}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Địa bàn
              </p>
              <p className="mt-2 text-xl font-bold text-slate-950">{demoOrganization.location}</p>
            </div>
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Điều hành đội nhóm
          </p>
          <p className="mt-4 text-sm leading-6 text-slate-700">
            Cập nhật thành viên, xe và tài xế giúp điều phối viên phân công đúng người, đúng phương
            tiện.
          </p>
          <div className="mt-5 grid gap-3 text-sm">
            <span className="rounded-2xl bg-slate-50 px-4 py-3">
              Kiểm tra người phụ trách từng chuyến
            </span>
            <span className="rounded-2xl bg-slate-50 px-4 py-3">
              Theo dõi xe và tài xế đang hoạt động
            </span>
            <span className="rounded-2xl bg-slate-50 px-4 py-3">
              Bổ sung hồ sơ còn thiếu trước khi vận hành
            </span>
          </div>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              Thành viên
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">Phân quyền đội vận hành</h2>
          </div>
          <button className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
            Mời thành viên
          </button>
        </div>
        <div className="mt-5 overflow-hidden rounded-3xl border border-slate-100 bg-white">
          <div className="hidden grid-cols-[1fr_1fr_0.8fr_0.8fr] gap-4 bg-slate-950 px-5 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300 xl:grid">
            <span>Người dùng</span>
            <span>Email</span>
            <span>Vai trò</span>
            <span>Trạng thái</span>
          </div>
          <div className="divide-y divide-slate-100">
            {adminMembers.map((member) => (
              <div
                key={member.id}
                className="grid gap-4 px-5 py-5 xl:grid-cols-[1fr_1fr_0.8fr_0.8fr] xl:items-center"
              >
                <div>
                  <p className="font-semibold text-slate-950">{member.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Hoạt động gần nhất: {member.lastActiveAt}
                  </p>
                </div>
                <p className="text-sm text-slate-600">{member.email}</p>
                <p className="text-sm font-semibold text-slate-800">
                  {membershipRoleLabels[member.role]}
                </p>
                <span className="w-fit rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                  {membershipStatusLabels[member.status]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                Phương tiện
              </p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950">Đội xe đang quản lý</h2>
            </div>
            <button className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-500">
              Thêm phương tiện · Sắp có
            </button>
          </div>
          <div className="mt-5 space-y-3">
            {adminVehicles.map((vehicle) => (
              <div key={vehicle.id} className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold text-slate-950">{vehicle.plateNumber}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {vehicleTypeLabels[vehicle.vehicleType]} ·{' '}
                      {ownershipTypeLabels[vehicle.ownershipType]}
                    </p>
                  </div>
                  <span className="w-fit rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                    {vehicle.health}
                  </span>
                </div>
                <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                  <span>Tài xế mặc định: {vehicle.defaultDriver}</span>
                  <span>Chuyến hiện tại: {vehicle.currentTrip}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                Tài xế
              </p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950">Hồ sơ tài xế</h2>
            </div>
            <button className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-500">
              Thêm tài xế · Sắp có
            </button>
          </div>
          <div className="mt-5 space-y-3">
            {adminDrivers.map((driver) => (
              <div key={driver.id} className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold text-slate-950">{driver.name}</p>
                    <p className="mt-1 text-sm text-slate-600">{driver.phone}</p>
                  </div>
                  <span className="w-fit rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                    {driver.identityStatus}
                  </span>
                </div>
                <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                  <span>GPLX: {driver.licenseNumber}</span>
                  <span>Xe gán: {driver.assignedVehicle}</span>
                  <span>Chuyến hiện tại: {driver.activeTrip}</span>
                  <span>Phạm vi xem: chuyến được phân công</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
