'use client';

import {
  ownershipTypes,
  vehicleTypes,
  type OwnershipType,
  type VehicleType
} from '@gatesync/shared';
import type { FormEvent, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { NoOrganizationState } from '@/components/no-organization-state';
import {
  createAdminDriver,
  createAdminVehicle,
  deleteAdminDriver,
  deleteAdminVehicle,
  loadAdminData,
  updateAdminDriver,
  updateAdminVehicle
} from '@/lib/operations/data';
import { isOrganizationAccessError, type OrganizationAccessIssue } from '@/lib/operations/errors';
import type {
  AdminDriver,
  AdminMember,
  AdminVehicle,
  AdminViewData
} from '@/lib/operations/view-model';
import {
  membershipRoleLabels,
  membershipStatusLabels,
  organizationTypeLabels,
  ownershipTypeLabels,
  vehicleTypeLabels
} from '@/lib/ui-labels';

type VehicleFormState = {
  plateNumber: string;
  vehicleType: VehicleType;
  ownershipType: OwnershipType;
  defaultDriverId: string;
};

type DriverFormState = {
  displayName: string;
  phone: string;
  licenseNumber: string;
};

const emptyVehicleForm: VehicleFormState = {
  plateNumber: '',
  vehicleType: 'CONTAINER_TRUCK',
  ownershipType: 'OWNED',
  defaultDriverId: ''
};

const emptyDriverForm: DriverFormState = {
  displayName: '',
  phone: '',
  licenseNumber: ''
};

const roleDescriptions: Record<AdminMember['role'], string> = {
  OWNER: 'Toàn quyền tổ chức, thành viên, đội xe, chuyến và cấu hình thanh toán.',
  ADMIN: 'Quản trị vận hành nội bộ, thành viên, đội xe và chuyến; không quản lý thanh toán.',
  DISPATCHER: 'Điều phối chuyến và đội xe, phù hợp cho ca trực vận hành.',
  DOCUMENT_STAFF: 'Xử lý chứng từ, tờ khai và sự kiện liên quan hồ sơ chuyến.',
  FIELD_OPERATOR: 'Cập nhật hiện trường và sự kiện vận hành được phân công.',
  VIEWER: 'Chỉ xem dữ liệu được cấp quyền, không thực hiện thao tác ghi.',
  BILLING_ADMIN: 'Theo dõi và xử lý nghiệp vụ thanh toán, không điều phối chuyến.'
};

export function AdminClient() {
  const [data, setData] = useState<AdminViewData>();
  const [error, setError] = useState<string>();
  const [organizationIssue, setOrganizationIssue] = useState<OrganizationAccessIssue>();
  const [message, setMessage] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [vehicleForm, setVehicleForm] = useState<VehicleFormState>(emptyVehicleForm);
  const [driverForm, setDriverForm] = useState<DriverFormState>(emptyDriverForm);
  const [editingVehicleId, setEditingVehicleId] = useState<string>();
  const [editingDriverId, setEditingDriverId] = useState<string>();
  const [isVehicleFormOpen, setIsVehicleFormOpen] = useState(false);
  const [isDriverFormOpen, setIsDriverFormOpen] = useState(false);
  const shellProps = data?.organization ? { organization: data.organization } : {};
  const canManageFleet = data?.profile.canManageFleet ?? false;

  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      setIsLoading(true);
      setError(undefined);
      setOrganizationIssue(undefined);

      try {
        const result = await loadAdminData();

        if (isMounted) {
          setData(result);
        }
      } catch (loadError) {
        if (isMounted) {
          if (isOrganizationAccessError(loadError)) {
            setOrganizationIssue(loadError.issue);
          }

          setError(
            loadError instanceof Error ? loadError.message : 'Không thể tải trang quản trị.'
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void fetchData();

    return () => {
      isMounted = false;
    };
  }, []);

  async function reload() {
    const result = await loadAdminData();
    setData(result);
  }

  function startCreateVehicle() {
    setVehicleForm(emptyVehicleForm);
    setEditingVehicleId(undefined);
    setIsVehicleFormOpen((value) => !value);
    setMessage(undefined);
  }

  function startCreateDriver() {
    setDriverForm(emptyDriverForm);
    setEditingDriverId(undefined);
    setIsDriverFormOpen((value) => !value);
    setMessage(undefined);
  }

  function editVehicle(vehicle: AdminVehicle) {
    setVehicleForm({
      plateNumber: vehicle.plateNumber,
      vehicleType: vehicle.vehicleType,
      ownershipType: vehicle.ownershipType,
      defaultDriverId: vehicle.defaultDriverId ?? ''
    });
    setEditingVehicleId(vehicle.id);
    setIsVehicleFormOpen(true);
    setMessage(undefined);
  }

  function editDriver(driver: AdminDriver) {
    setDriverForm({
      displayName: driver.name,
      phone: driver.phone === 'Chưa cập nhật' ? '' : driver.phone,
      licenseNumber: driver.licenseNumber === 'Chưa cập nhật' ? '' : driver.licenseNumber
    });
    setEditingDriverId(driver.id);
    setIsDriverFormOpen(true);
    setMessage(undefined);
  }

  async function submitVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(undefined);

    try {
      if (editingVehicleId) {
        await updateAdminVehicle(editingVehicleId, {
          plateNumber: vehicleForm.plateNumber.trim(),
          vehicleType: vehicleForm.vehicleType,
          ownershipType: vehicleForm.ownershipType,
          defaultDriverId: vehicleForm.defaultDriverId || null
        });
        setMessage('Đã cập nhật phương tiện.');
      } else {
        const payload: Parameters<typeof createAdminVehicle>[0] = {
          plateNumber: vehicleForm.plateNumber.trim(),
          vehicleType: vehicleForm.vehicleType,
          ownershipType: vehicleForm.ownershipType
        };

        if (vehicleForm.defaultDriverId) {
          payload.defaultDriverId = vehicleForm.defaultDriverId;
        }

        await createAdminVehicle(payload);
        setMessage('Đã thêm phương tiện mới.');
      }

      await reload();
      setVehicleForm(emptyVehicleForm);
      setEditingVehicleId(undefined);
      setIsVehicleFormOpen(false);
    } catch (submitError) {
      setMessage(submitError instanceof Error ? submitError.message : 'Không thể lưu phương tiện.');
    } finally {
      setIsSaving(false);
    }
  }

  async function submitDriver(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(undefined);

    try {
      const payload: Parameters<typeof createAdminDriver>[0] = {
        displayName: driverForm.displayName.trim()
      };

      if (driverForm.phone.trim()) {
        payload.phone = driverForm.phone.trim();
      }

      if (driverForm.licenseNumber.trim()) {
        payload.licenseNumber = driverForm.licenseNumber.trim();
      }

      if (editingDriverId) {
        await updateAdminDriver(editingDriverId, payload);
        setMessage('Đã cập nhật hồ sơ tài xế.');
      } else {
        await createAdminDriver(payload);
        setMessage('Đã thêm hồ sơ tài xế mới.');
      }

      await reload();
      setDriverForm(emptyDriverForm);
      setEditingDriverId(undefined);
      setIsDriverFormOpen(false);
    } catch (submitError) {
      setMessage(
        submitError instanceof Error ? submitError.message : 'Không thể lưu hồ sơ tài xế.'
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function removeVehicle(vehicle: AdminVehicle) {
    if (!window.confirm(`Gỡ phương tiện ${vehicle.plateNumber} khỏi tổ chức?`)) {
      return;
    }

    await runDelete(
      () => deleteAdminVehicle(vehicle.id),
      'Đã gỡ phương tiện.',
      'Không thể gỡ phương tiện.'
    );
  }

  async function removeDriver(driver: AdminDriver) {
    if (!window.confirm(`Gỡ hồ sơ tài xế ${driver.name} khỏi tổ chức?`)) {
      return;
    }

    await runDelete(
      () => deleteAdminDriver(driver.id),
      'Đã gỡ hồ sơ tài xế.',
      'Không thể gỡ hồ sơ tài xế.'
    );
  }

  async function runDelete(action: () => Promise<unknown>, success: string, failure: string) {
    setIsSaving(true);
    setMessage(undefined);

    try {
      await action();
      await reload();
      setMessage(success);
    } catch (deleteError) {
      setMessage(deleteError instanceof Error ? deleteError.message : failure);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppShell
      activeNav="admin"
      eyebrow="Quản trị nội bộ"
      title="Tổ chức, thành viên, phương tiện và tài xế"
      description="Quản lý thông tin tổ chức, đội vận hành, phương tiện và tài xế để dữ liệu điều phối luôn rõ ràng."
      {...shellProps}
      action={
        <button
          type="button"
          onClick={() => void reload()}
          className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700"
        >
          Tải lại dữ liệu
        </button>
      }
    >
      {isLoading ? <StatePanel message="Đang tải dữ liệu quản trị từ GateSync API..." /> : null}
      {!isLoading && organizationIssue && error ? (
        <NoOrganizationState issue={organizationIssue} message={error} />
      ) : null}
      {!isLoading && !organizationIssue && error ? (
        <StatePanel tone="error" message={error} />
      ) : null}
      {!isLoading && !error && data ? (
        <>
          {data.notice ? <NoticePanel message={data.notice} /> : null}
          {message ? <NoticePanel message={message} tone="info" /> : null}

          <section className="grid gap-5 xl:grid-cols-[1fr_24rem]">
            <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                Hồ sơ tổ chức
              </p>
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <InfoTile
                  label="Tên tổ chức"
                  title={data.profile.name}
                  detail={organizationTypeLabels[data.profile.type]}
                  className="md:col-span-2"
                />
                <InfoTile label="Mã số thuế" title={data.profile.taxCode} />
                <InfoTile label="Địa bàn" title={data.profile.location} />
                <InfoTile label="Email" title={data.profile.email} />
                <InfoTile label="Điện thoại" title={data.profile.phone} />
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                Điều hành đội nhóm
              </p>
              <p className="mt-4 text-sm leading-6 text-slate-700">
                Vai trò hiện tại:{' '}
                <span className="font-semibold text-slate-950">
                  {membershipRoleLabels[data.profile.currentUserRole]}
                </span>
                . API vẫn kiểm tra tenant và RBAC cho mọi thao tác ghi.
              </p>
              <p className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                {roleDescriptions[data.profile.currentUserRole]}
              </p>
              <div className="mt-5 grid gap-3 text-sm">
                <span className="rounded-2xl bg-slate-50 px-4 py-3">
                  {data.members.length} thành viên
                </span>
                <span className="rounded-2xl bg-slate-50 px-4 py-3">
                  {data.vehicles.length} phương tiện
                </span>
                <span className="rounded-2xl bg-slate-50 px-4 py-3">
                  {data.drivers.length} hồ sơ tài xế
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
              <span className="rounded-2xl bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-600">
                {data.profile.canManageMembers
                  ? 'Có quyền quản lý thành viên'
                  : 'Chỉ xem thành viên'}
              </span>
            </div>
            <div className="mt-5 divide-y divide-slate-100 overflow-hidden rounded-3xl border border-slate-100 bg-white">
              {data.members.map((member) => (
                <div
                  key={member.id}
                  className="grid gap-4 px-5 py-5 xl:grid-cols-[1fr_1fr_1fr_0.8fr] xl:items-center"
                >
                  <div>
                    <p className="font-semibold text-slate-950">{member.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Hoạt động gần nhất: {member.lastActiveAt}
                    </p>
                  </div>
                  <p className="text-sm text-slate-600">{member.email}</p>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {membershipRoleLabels[member.role]}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {roleDescriptions[member.role]}
                    </p>
                  </div>
                  <span className="w-fit rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                    {membershipStatusLabels[member.status]}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-2">
            <FleetPanel
              title="Đội xe đang quản lý"
              eyebrow="Phương tiện"
              actionLabel={isVehicleFormOpen ? 'Đóng form phương tiện' : 'Thêm phương tiện'}
              canManageFleet={canManageFleet}
              onClick={startCreateVehicle}
            >
              {isVehicleFormOpen ? (
                <VehicleForm
                  value={vehicleForm}
                  drivers={data.drivers}
                  isSaving={isSaving}
                  isEditing={Boolean(editingVehicleId)}
                  onChange={setVehicleForm}
                  onSubmit={submitVehicle}
                />
              ) : null}
              <div className="mt-5 space-y-3">
                {data.vehicles.length > 0 ? (
                  data.vehicles.map((vehicle) => (
                    <VehicleCard
                      key={vehicle.id}
                      vehicle={vehicle}
                      canManageFleet={canManageFleet}
                      onEdit={editVehicle}
                      onRemove={removeVehicle}
                    />
                  ))
                ) : (
                  <EmptyPanel message="Chưa có phương tiện nào trong tổ chức." />
                )}
              </div>
            </FleetPanel>

            <FleetPanel
              title="Hồ sơ tài xế"
              eyebrow="Tài xế"
              actionLabel={isDriverFormOpen ? 'Đóng form tài xế' : 'Thêm tài xế'}
              canManageFleet={canManageFleet}
              onClick={startCreateDriver}
            >
              {isDriverFormOpen ? (
                <DriverForm
                  value={driverForm}
                  isSaving={isSaving}
                  isEditing={Boolean(editingDriverId)}
                  onChange={setDriverForm}
                  onSubmit={submitDriver}
                />
              ) : null}
              <div className="mt-5 space-y-3">
                {data.drivers.length > 0 ? (
                  data.drivers.map((driver) => (
                    <DriverCard
                      key={driver.id}
                      driver={driver}
                      canManageFleet={canManageFleet}
                      onEdit={editDriver}
                      onRemove={removeDriver}
                    />
                  ))
                ) : (
                  <EmptyPanel message="Chưa có hồ sơ tài xế nào trong tổ chức." />
                )}
              </div>
            </FleetPanel>
          </section>
        </>
      ) : null}
    </AppShell>
  );
}

function VehicleForm({
  value,
  drivers,
  isSaving,
  isEditing,
  onChange,
  onSubmit
}: {
  value: VehicleFormState;
  drivers: AdminDriver[];
  isSaving: boolean;
  isEditing: boolean;
  onChange: (value: VehicleFormState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="mt-5 grid gap-3 rounded-3xl bg-slate-50 p-4">
      <InputField
        label="Biển số"
        value={value.plateNumber}
        placeholder="Ví dụ: 29H-456.78"
        required
        onChange={(plateNumber) => onChange({ ...value, plateNumber })}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Loại xe"
          value={value.vehicleType}
          options={vehicleTypes.map((type) => ({ value: type, label: vehicleTypeLabels[type] }))}
          onChange={(vehicleType) =>
            onChange({ ...value, vehicleType: vehicleType as VehicleType })
          }
        />
        <SelectField
          label="Sở hữu"
          value={value.ownershipType}
          options={ownershipTypes.map((type) => ({
            value: type,
            label: ownershipTypeLabels[type]
          }))}
          onChange={(ownershipType) =>
            onChange({ ...value, ownershipType: ownershipType as OwnershipType })
          }
        />
      </div>
      <SelectField
        label="Tài xế mặc định"
        value={value.defaultDriverId}
        options={[
          { value: '', label: 'Chưa gán' },
          ...drivers.map((driver) => ({ value: driver.id, label: driver.name }))
        ]}
        onChange={(defaultDriverId) => onChange({ ...value, defaultDriverId })}
      />
      <SubmitButton
        isSaving={isSaving}
        label={isEditing ? 'Cập nhật phương tiện' : 'Thêm phương tiện'}
      />
    </form>
  );
}

function DriverForm({
  value,
  isSaving,
  isEditing,
  onChange,
  onSubmit
}: {
  value: DriverFormState;
  isSaving: boolean;
  isEditing: boolean;
  onChange: (value: DriverFormState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="mt-5 grid gap-3 rounded-3xl bg-slate-50 p-4">
      <InputField
        label="Tên tài xế"
        value={value.displayName}
        placeholder="Nhập tên tài xế"
        required
        onChange={(displayName) => onChange({ ...value, displayName })}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <InputField
          label="Điện thoại"
          value={value.phone}
          placeholder="Ví dụ: 0988 123 456"
          onChange={(phone) => onChange({ ...value, phone })}
        />
        <InputField
          label="Số GPLX"
          value={value.licenseNumber}
          placeholder="Ví dụ: LX-29-004211"
          onChange={(licenseNumber) => onChange({ ...value, licenseNumber })}
        />
      </div>
      <SubmitButton isSaving={isSaving} label={isEditing ? 'Cập nhật tài xế' : 'Thêm tài xế'} />
    </form>
  );
}

function VehicleCard({
  vehicle,
  canManageFleet,
  onEdit,
  onRemove
}: {
  vehicle: AdminVehicle;
  canManageFleet: boolean;
  onEdit: (vehicle: AdminVehicle) => void;
  onRemove: (vehicle: AdminVehicle) => void;
}) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold text-slate-950">{vehicle.plateNumber}</p>
          <p className="mt-1 text-sm text-slate-600">
            {vehicleTypeLabels[vehicle.vehicleType]} · {ownershipTypeLabels[vehicle.ownershipType]}
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
      <CardActions
        enabled={canManageFleet}
        onEdit={() => onEdit(vehicle)}
        onRemove={() => onRemove(vehicle)}
      />
    </div>
  );
}

function DriverCard({
  driver,
  canManageFleet,
  onEdit,
  onRemove
}: {
  driver: AdminDriver;
  canManageFleet: boolean;
  onEdit: (driver: AdminDriver) => void;
  onRemove: (driver: AdminDriver) => void;
}) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
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
      <CardActions
        enabled={canManageFleet}
        onEdit={() => onEdit(driver)}
        onRemove={() => onRemove(driver)}
      />
    </div>
  );
}

function FleetPanel({
  title,
  eyebrow,
  actionLabel,
  canManageFleet,
  onClick,
  children
}: {
  title: string;
  eyebrow: string;
  actionLabel: string;
  canManageFleet: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            {eyebrow}
          </p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">{title}</h2>
        </div>
        <button
          type="button"
          disabled={!canManageFleet}
          onClick={onClick}
          className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
        >
          {canManageFleet ? actionLabel : 'Không có quyền sửa'}
        </button>
      </div>
      {children}
    </div>
  );
}

function InputField({
  label,
  value,
  placeholder,
  required = false,
  onChange
}: {
  label: string;
  value: string;
  placeholder: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </span>
      <input
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
      >
        {options.map((option) => (
          <option key={option.value || option.label} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SubmitButton({ isSaving, label }: { isSaving: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={isSaving}
      className="min-h-12 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
    >
      {isSaving ? 'Đang lưu...' : label}
    </button>
  );
}

function CardActions({
  enabled,
  onEdit,
  onRemove
}: {
  enabled: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  if (!enabled) {
    return (
      <div className="mt-4 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-xs font-semibold text-slate-500">
        Vai trò hiện tại chỉ được xem mục này. API sẽ từ chối mọi thao tác sửa hoặc gỡ nếu không đủ
        quyền.
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={onEdit}
        className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700"
      >
        Sửa
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full border border-rose-100 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
      >
        Gỡ
      </button>
    </div>
  );
}

function InfoTile({
  label,
  title,
  detail,
  className
}: {
  label: string;
  title: string;
  detail?: string;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-slate-100 bg-slate-50 p-4 ${className ?? ''}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-bold text-slate-950">{title}</p>
      {detail ? <p className="mt-1 text-sm text-slate-600">{detail}</p> : null}
    </div>
  );
}

function NoticePanel({
  message,
  tone = 'warning'
}: {
  message: string;
  tone?: 'warning' | 'info';
}) {
  const className =
    tone === 'info'
      ? 'border-sky-100 bg-sky-50 text-sky-800'
      : 'border-amber-100 bg-amber-50 text-amber-800';
  return (
    <div className={`rounded-3xl border px-5 py-4 text-sm font-semibold ${className}`}>
      {message}
    </div>
  );
}

function StatePanel({
  message,
  tone = 'loading'
}: {
  message: string;
  tone?: 'loading' | 'error';
}) {
  const className =
    tone === 'error'
      ? 'border-rose-100 bg-rose-50 text-rose-800'
      : 'border-slate-200 bg-white text-slate-600';
  return (
    <div className={`rounded-3xl border px-5 py-6 text-sm font-semibold shadow-soft ${className}`}>
      {message}
    </div>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-sm font-semibold text-slate-500">
      {message}
    </div>
  );
}
