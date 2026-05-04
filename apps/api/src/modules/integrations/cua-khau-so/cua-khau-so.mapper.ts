import { Injectable } from '@nestjs/common';
import type { DeclarationStatus, DeclarationType, TripDirection, TripEventType } from '@prisma/client';
import type {
  CuaKhauSoDeclarationDetail,
  CuaKhauSoDeclarationDetailView,
  CuaKhauSoDeclarationListResponse,
  CuaKhauSoDeclarationLite,
  CuaKhauSoDeclarationSummary,
  CuaKhauSoEventCandidate,
  CuaKhauSoGoodsGroup,
  CuaKhauSoMappedList,
  CuaKhauSoPaymentInfo,
  CuaKhauSoProcedureStep,
  CuaKhauSoVehicleDetail
} from './cua-khau-so.types';

const procedureStepLabels = [
  'Vào cửa khẩu',
  'Vào bãi tập kết',
  'Xe trong bãi',
  'Thanh toán',
  'Xuất bãi tập kết',
  'Rời cửa khẩu'
] as const;

@Injectable()
export class CuaKhauSoMapper {
  mapListResponse(response: CuaKhauSoDeclarationListResponse): CuaKhauSoMappedList {
    const listData = response.data?.listData ?? [];

    return {
      declarations: listData.map((declaration) => this.mapSummary(declaration)),
      totalCount: response.data?.totalCount ?? listData.length,
      totalPage: response.data?.totalPage ?? 1,
      message: this.nonEmpty(response.message, 'Đã tải dữ liệu Cửa khẩu số.')
    };
  }

  mapSummary(declaration: CuaKhauSoDeclarationLite): CuaKhauSoDeclarationSummary {
    const direction = this.mapDirection(declaration.type);
    const firstVehicle = declaration.mainVehicles?.[0];
    const summary: CuaKhauSoDeclarationSummary = {
      externalId: this.nonEmpty(declaration.id, 'unknown'),
      declarationNumber: this.nonEmpty(declaration.numberOfDeclaration, 'Chưa có số tờ khai'),
      direction,
      declarationType: this.mapDeclarationType(direction),
      status: this.mapDeclarationStatus(declaration),
      statusLabel: this.mapStatusLabel(declaration),
      gateName: this.nonEmpty(declaration.gate?.name, 'Chưa xác định'),
      companyGoodsName: this.nonEmpty(declaration.companyGoodsName, 'Chưa cập nhật'),
      plateNumber: this.nonEmpty(declaration.licencePlateVNTQ, firstVehicle?.licencePlate, 'Chưa cập nhật'),
      trailerNumber: this.nonEmpty(declaration.numberOfTrailer, firstVehicle?.numberOfMooc, 'Chưa cập nhật'),
      changePlateNumber: this.nonEmpty(declaration.licencePlateChange, 'Không sang tải'),
      completed: Boolean(declaration.confirmFinish),
      paymentStatus: this.mapPaymentStatus(declaration.paymentOfTax)
    };

    const createdAt = this.toIsoString(declaration.createDate);
    const gateCode = this.trimToUndefined(declaration.gate?.code);

    if (createdAt) {
      summary.createdAt = createdAt;
    }

    if (gateCode) {
      summary.gateCode = gateCode;
    }

    if (typeof declaration.totalWeight === 'number') {
      summary.totalWeight = declaration.totalWeight;
    }

    return summary;
  }

  mapDetail(detail: CuaKhauSoDeclarationDetail, organizationId: string): CuaKhauSoDeclarationDetailView {
    const summary = this.mapSummary(detail);
    const arrivalAt = this.resolveArrivalAt(detail);

    return {
      ...summary,
      borderGuardDeclarationNumber: this.nonEmpty(
        detail.numberOfDeclarationBorderGuard,
        'Chưa cập nhật'
      ),
      arrivalAt: arrivalAt ?? 'Chưa cập nhật',
      feePayingCompany: {
        name: this.nonEmpty(detail.feePayingCompanyName, detail.company?.name, 'Chưa cập nhật'),
        taxCode: this.nonEmpty(detail.feePayingCompanyTaxCode, detail.company?.taxCode, 'Chưa cập nhật'),
        address: this.nonEmpty(detail.feePayingCompanyAddress, detail.company?.address, 'Chưa cập nhật'),
        phone: this.nonEmpty(detail.feePayingCompanyPhone, detail.company?.phone, 'Chưa cập nhật')
      },
      parkingPlace: {
        name: this.nonEmpty(detail.parkingPlace?.name, 'Chưa cập nhật'),
        address: this.nonEmpty(detail.parkingPlace?.address, 'Chưa cập nhật'),
        description: this.nonEmpty(detail.parkingPlace?.description, 'Chưa cập nhật')
      },
      infrastructureCharges: detail.infrastructureCharges ?? 0,
      transferCharges: detail.transferCharges ?? 0,
      vehicles: (detail.registrationTransportDetails ?? []).map((vehicle) => this.mapVehicle(vehicle)),
      goods: (detail.registrationTransportGoods ?? []).map((group) => this.mapGoodsGroup(group)),
      procedureSteps: this.deriveProcedureSteps(detail),
      eventCandidates: this.buildEventCandidates(detail, organizationId)
    };
  }

  mapCustomsDeclaration(detail: CuaKhauSoDeclarationDetail) {
    const direction = this.mapDirection(detail.type);
    const data: {
      declarationNumber: string;
      declarationType: DeclarationType;
      customsOfficeCode?: string;
      status: DeclarationStatus;
      submittedAt?: Date;
      approvedAt?: Date;
      rejectedAt?: Date;
    } = {
      declarationNumber: this.nonEmpty(detail.numberOfDeclaration, detail.id),
      declarationType: this.mapDeclarationType(direction),
      status: this.mapDeclarationStatus(detail)
    };
    const customsOfficeCode = this.trimToUndefined(detail.gate?.code);
    const submittedAt = this.toDate(detail.createDate);
    const approvedAt = detail.confirmFinish
      ? this.toDate(
          this.firstNonEmpty(
            detail.confirmFinishTime,
            detail.registrationTransportDetails?.[0]?.confirmOutVNTime,
            detail.registrationTransportDetails?.[0]?.confirmOutTQTime
          )
        )
      : undefined;

    if (customsOfficeCode) {
      data.customsOfficeCode = customsOfficeCode;
    }

    if (submittedAt) {
      data.submittedAt = submittedAt;
    }

    if (approvedAt) {
      data.approvedAt = approvedAt;
    }

    return data;
  }

  deriveProcedureSteps(detail: CuaKhauSoDeclarationDetail): CuaKhauSoProcedureStep[] {
    const vehicle = detail.registrationTransportDetails?.[0];
    const steps: CuaKhauSoProcedureStep[] = [
      {
        step: 1,
        label: procedureStepLabels[0],
        done: Boolean(vehicle?.checkBorderGuard && vehicle.confirmArrivalVehicleCustoms)
      },
      {
        step: 2,
        label: procedureStepLabels[1],
        done: Boolean(vehicle?.confirmInParkingCustoms)
      },
      {
        step: 3,
        label: procedureStepLabels[2],
        done: Boolean(detail.confirmStartCheck)
      },
      {
        step: 4,
        label: procedureStepLabels[3],
        done: detail.paymentOfTax?.paymentStatus === 2
      },
      {
        step: 5,
        label: procedureStepLabels[4],
        done: Boolean(vehicle?.confirmOutParkingBorderGuard || detail.checkAllConfirmOutTQ)
      },
      {
        step: 6,
        label: procedureStepLabels[5],
        done: Boolean(detail.confirmFinish)
      }
    ];
    const occurredAtValues = [
      this.firstNonEmpty(vehicle?.confirmArrivalVehicleCustomsTime, vehicle?.checkBorderGuardTime),
      vehicle?.confirmInParkingCustomsTime,
      vehicle?.checkCustomsTime,
      this.resolvePaymentTime(detail.paymentOfTax),
      this.firstNonEmpty(vehicle?.confirmOutParkingBorderGuardTime, vehicle?.confirmOutParkingCustomsTime),
      this.firstNonEmpty(detail.confirmFinishTime, vehicle?.confirmOutVNTime, vehicle?.confirmOutTQTime)
    ];

    return steps.map((step, index) => {
      const occurredAt = this.toIsoString(occurredAtValues[index]);

      if (!occurredAt) {
        return step;
      }

      return {
        ...step,
        occurredAt
      };
    });
  }

  buildEventCandidates(
    detail: CuaKhauSoDeclarationDetail,
    organizationId: string
  ): CuaKhauSoEventCandidate[] {
    const vehicle = detail.registrationTransportDetails?.[0];
    const candidates: CuaKhauSoEventCandidate[] = [];

    this.addCandidate(
      candidates,
      organizationId,
      detail,
      'DECLARATION_SUBMITTED',
      detail.createDate,
      'Cửa khẩu số ghi nhận tờ khai vận tải.',
      0.95,
      'declaration-submitted'
    );

    if (vehicle?.checkBorderGuard && vehicle.confirmArrivalVehicleCustoms) {
      this.addCandidate(
        candidates,
        organizationId,
        detail,
        'BORDER_GATE_ENTRY_CONFIRMED',
        this.firstNonEmpty(vehicle.confirmArrivalVehicleCustomsTime, vehicle.checkBorderGuardTime),
        'Cửa khẩu số xác nhận xe đã vào khu vực cửa khẩu.',
        0.9,
        'border-gate-entry'
      );
    }

    if (vehicle?.confirmInParkingCustoms) {
      this.addCandidate(
        candidates,
        organizationId,
        detail,
        'YARD_ENTRY_CONFIRMED',
        vehicle.confirmInParkingCustomsTime,
        'Cửa khẩu số xác nhận xe đã vào bãi tập kết.',
        0.85,
        'yard-entry'
      );
    }

    if (detail.confirmStartCheck && vehicle?.checkCustomsTime) {
      this.addCandidate(
        candidates,
        organizationId,
        detail,
        'CUSTOMS_PROCESSING',
        vehicle.checkCustomsTime,
        'Cửa khẩu số ghi nhận bắt đầu xử lý kiểm tra.',
        0.8,
        'customs-processing'
      );
    }

    if (detail.paymentOfTax?.paymentStatus === 2) {
      this.addCandidate(
        candidates,
        organizationId,
        detail,
        'FEE_PAID',
        this.resolvePaymentTime(detail.paymentOfTax),
        'Cửa khẩu số ghi nhận thanh toán phí.',
        0.85,
        'fee-paid'
      );
    }

    if (vehicle?.confirmOutParkingBorderGuard || vehicle?.confirmOutParkingCustoms) {
      this.addCandidate(
        candidates,
        organizationId,
        detail,
        'YARD_EXIT_CONFIRMED',
        this.firstNonEmpty(vehicle.confirmOutParkingBorderGuardTime, vehicle.confirmOutParkingCustomsTime),
        'Cửa khẩu số xác nhận xe đã rời bãi tập kết.',
        0.85,
        'yard-exit'
      );
    }

    if (detail.confirmFinish) {
      this.addCandidate(
        candidates,
        organizationId,
        detail,
        'BORDER_GATE_EXIT_CONFIRMED',
        this.firstNonEmpty(detail.confirmFinishTime, vehicle?.confirmOutVNTime, vehicle?.confirmOutTQTime),
        'Cửa khẩu số xác nhận hoàn tất quy trình tại cửa khẩu.',
        0.9,
        'border-gate-exit'
      );
    }

    return candidates.sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt));
  }

  private addCandidate(
    candidates: CuaKhauSoEventCandidate[],
    organizationId: string,
    detail: CuaKhauSoDeclarationDetail,
    eventType: TripEventType,
    occurredAtValue: string | null | undefined,
    note: string,
    confidence: number,
    step: string
  ) {
    const occurredAt = this.toIsoString(occurredAtValue);

    if (!occurredAt) {
      return;
    }

    const sourceRef = this.nonEmpty(detail.id, detail.numberOfDeclaration, step);
    const declarationNumber = this.nonEmpty(detail.numberOfDeclaration, 'Chưa có số tờ khai');

    candidates.push({
      eventType,
      occurredAt,
      sourceRef,
      idempotencyKey: `cua-khau-so:${organizationId}:${sourceRef}:${eventType}`,
      note,
      confidence,
      rawPayload: {
        source: 'CUA_KHAU_SO',
        step,
        externalId: sourceRef,
        declarationNumber,
        gateName: detail.gate?.name ?? null,
        vehiclePlate: detail.registrationTransportDetails?.[0]?.licencePlate ?? null
      }
    });
  }

  private mapVehicle(vehicle: CuaKhauSoVehicleDetail) {
    const mapped: CuaKhauSoDeclarationDetailView['vehicles'][number] = {
      plateNumber: this.nonEmpty(vehicle.licencePlate, 'Chưa cập nhật'),
      trailerNumber: this.nonEmpty(vehicle.numberOfMooc, 'Chưa cập nhật'),
      driverName: this.nonEmpty(vehicle.driverName, 'Chưa cập nhật'),
      vehicleType: this.nonEmpty(vehicle.vehicleType?.name, vehicle.vehicleType?.code, 'Chưa cập nhật'),
      nationality: this.nonEmpty(vehicle.vehicleNationalityType, 'Chưa cập nhật')
    };

    if (vehicle.id) {
      mapped.id = vehicle.id;
    }

    if (typeof vehicle.weight === 'number') {
      mapped.weight = vehicle.weight;
    }

    return mapped;
  }

  private mapGoodsGroup(group: CuaKhauSoGoodsGroup) {
    const mapped: CuaKhauSoDeclarationDetailView['goods'][number] = {
      companyName: this.nonEmpty(group.companyName, 'Chưa cập nhật'),
      companyTaxCode: this.nonEmpty(group.companyTaxCode, 'Chưa cập nhật'),
      declarationNumber: this.nonEmpty(group.numberHQ, 'Chưa cập nhật'),
      declarationType: this.nonEmpty(group.typeHQ, 'Chưa cập nhật'),
      items: (group.registrationTransportGoodsDetails ?? []).map((item) => {
        const mappedItem: CuaKhauSoDeclarationDetailView['goods'][number]['items'][number] = {
          name: this.nonEmpty(item.nameProduct, 'Chưa cập nhật'),
          hsCode: this.nonEmpty(item.hsCode, 'Chưa cập nhật')
        };

        if (item.id) {
          mappedItem.id = item.id;
        }

        if (typeof item.weight === 'number') {
          mappedItem.weight = item.weight;
        }

        if (typeof item.priceVND === 'number') {
          mappedItem.priceVnd = item.priceVND;
        }

        return mappedItem;
      })
    };

    if (group.id) {
      mapped.id = group.id;
    }

    return mapped;
  }

  private resolveArrivalAt(detail: CuaKhauSoDeclarationDetail): string | undefined {
    const arrivalDate = this.trimToUndefined(detail.arrivalDate);
    const arrivalTime = this.trimToUndefined(detail.arrivalTime);

    if (!arrivalDate) {
      return undefined;
    }

    if (!arrivalTime) {
      return this.toIsoString(arrivalDate);
    }

    const dateOnly = arrivalDate.split('T')[0];
    return this.toIsoString(`${dateOnly}T${arrivalTime}`);
  }

  private resolvePaymentTime(payment: CuaKhauSoPaymentInfo | null | undefined): string | undefined {
    return this.firstNonEmpty(payment?.actionTime, payment?.tollDate, payment?.paymentDate);
  }

  private mapDirection(value: unknown): TripDirection {
    if (value === 0) {
      return 'IMPORT';
    }

    if (value === 1) {
      return 'EXPORT';
    }

    return 'UNKNOWN';
  }

  private mapDeclarationType(direction: TripDirection): DeclarationType {
    if (direction === 'IMPORT' || direction === 'EXPORT') {
      return direction;
    }

    return 'OTHER';
  }

  private mapDeclarationStatus(declaration: Pick<CuaKhauSoDeclarationLite, 'confirmFinish'>): DeclarationStatus {
    if (declaration.confirmFinish) {
      return 'APPROVED';
    }

    return 'SUBMITTED';
  }

  private mapStatusLabel(declaration: Pick<CuaKhauSoDeclarationLite, 'confirmFinish'>) {
    return declaration.confirmFinish ? 'Hoàn thành' : 'Chưa hoàn thành';
  }

  private mapPaymentStatus(payment: CuaKhauSoPaymentInfo | null | undefined) {
    if (!payment) {
      return 'Chưa có thông tin thanh toán';
    }

    if (payment.paymentStatus === 2) {
      return 'Đã thanh toán';
    }

    return 'Chưa thanh toán';
  }

  private toIsoString(value: string | null | undefined): string | undefined {
    const date = this.toDate(value);
    return date?.toISOString();
  }

  private toDate(value: string | null | undefined): Date | undefined {
    const trimmed = this.trimToUndefined(value);

    if (!trimmed) {
      return undefined;
    }

    const date = new Date(trimmed);

    if (Number.isNaN(date.getTime())) {
      return undefined;
    }

    return date;
  }

  private nonEmpty(...values: Array<string | number | null | undefined>): string {
    for (const value of values) {
      const trimmed = this.trimToUndefined(value);

      if (trimmed) {
        return trimmed;
      }
    }

    return '';
  }

  private firstNonEmpty(...values: Array<string | number | null | undefined>): string | undefined {
    for (const value of values) {
      const trimmed = this.trimToUndefined(value);

      if (trimmed) {
        return trimmed;
      }
    }

    return undefined;
  }

  private trimToUndefined(value: string | number | null | undefined): string | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }

    const trimmed = String(value).trim();
    return trimmed || undefined;
  }
}
