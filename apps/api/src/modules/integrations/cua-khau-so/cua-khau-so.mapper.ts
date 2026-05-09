import { Injectable } from '@nestjs/common';
import type { DeclarationStatus, DeclarationType, TripDirection } from '@prisma/client';
import type {
  CuaKhauSoDeclarationDetail,
  CuaKhauSoDeclarationDetailView,
  CuaKhauSoDeclarationListResponse,
  CuaKhauSoDeclarationLite,
  CuaKhauSoDeclarationSummary,
  CuaKhauSoEventCandidate,
  CuaKhauSoEventCandidateView,
  CuaKhauSoChangeVehicleDetail,
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
    const listData = this.resolveListData(response);

    return {
      declarations: listData.map((declaration) => this.mapSummary(declaration)),
      totalCount: this.resolveTotalCount(response, listData.length),
      totalPage: this.resolveTotalPage(response),
      message: this.nonEmpty(response.message, 'Đã tải dữ liệu Cửa khẩu số.')
    };
  }

  mapSummary(declaration: CuaKhauSoDeclarationLite): CuaKhauSoDeclarationSummary {
    const direction = this.mapDirection(declaration.type);
    const firstVehicle = declaration.mainVehicles?.[0];
    const completed = this.isBusinessCompleted(declaration);
    const summary: CuaKhauSoDeclarationSummary = {
      externalId: this.nonEmpty(declaration.id, 'unknown'),
      declarationNumber: this.nonEmpty(declaration.numberOfDeclaration, 'Chưa có số tờ khai'),
      direction,
      declarationType: this.mapDeclarationType(direction),
      status: this.mapDeclarationStatus(declaration),
      statusLabel: this.mapStatusLabel(declaration),
      gateName: this.nonEmpty(declaration.gate?.name, 'Chưa xác định'),
      companyGoodsName: this.nonEmpty(declaration.companyGoodsName, 'Chưa cập nhật'),
      plateNumber: this.nonEmpty(
        declaration.licencePlateVNTQ,
        firstVehicle?.licencePlate,
        'Chưa cập nhật'
      ),
      trailerNumber: this.nonEmpty(
        declaration.numberOfTrailer,
        firstVehicle?.numberOfMooc,
        'Chưa cập nhật'
      ),
      changePlateNumber: this.nonEmpty(declaration.licencePlateChange, 'Không sang tải'),
      completed,
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

  mapDetail(
    detail: CuaKhauSoDeclarationDetail,
    organizationId: string
  ): CuaKhauSoDeclarationDetailView {
    const summary = this.mapSummary(detail);
    const arrivalAt = this.resolveArrivalAt(detail);
    const transshipment = this.resolveTransshipment(detail);

    return {
      ...summary,
      borderGuardDeclarationNumber: this.nonEmpty(
        detail.numberOfDeclarationBorderGuard,
        'Chưa cập nhật'
      ),
      arrivalAt: arrivalAt ?? 'Chưa cập nhật',
      createdBy: {
        username: this.nonEmpty(detail.createdUser?.username, 'Chưa cập nhật'),
        displayName: this.nonEmpty(detail.createdUser?.displayName, 'Chưa cập nhật'),
        phoneNumber: this.nonEmpty(detail.createdUser?.phoneNumber, 'Chưa cập nhật')
      },
      feePayingCompany: {
        name: this.nonEmpty(detail.feePayingCompanyName, detail.company?.name, 'Chưa cập nhật'),
        taxCode: this.nonEmpty(
          detail.feePayingCompanyTaxCode,
          detail.company?.taxCode,
          'Chưa cập nhật'
        ),
        address: this.nonEmpty(
          detail.feePayingCompanyAddress,
          detail.company?.address,
          'Chưa cập nhật'
        ),
        phone: this.nonEmpty(detail.feePayingCompanyPhone, detail.company?.phone, 'Chưa cập nhật')
      },
      parkingPlace: {
        name: this.nonEmpty(detail.parkingPlace?.name, 'Chưa cập nhật'),
        address: this.nonEmpty(detail.parkingPlace?.address, 'Chưa cập nhật'),
        description: this.nonEmpty(detail.parkingPlace?.description, 'Chưa cập nhật')
      },
      infrastructureCharges: detail.infrastructureCharges ?? 0,
      transferCharges: detail.transferCharges ?? 0,
      transshipment,
      checks: this.resolveChecks(detail),
      vehicles: this.mapVehicles(detail),
      transshipmentVehicles: (detail.changeVehicle?.changeVehicleDetails ?? []).map((vehicle) =>
        this.mapTransshipmentVehicle(vehicle)
      ),
      goods: (detail.registrationTransportGoods ?? []).map((group) => this.mapGoodsGroup(group)),
      procedureSteps: this.deriveProcedureSteps(detail),
      eventCandidates: this.buildEventCandidates(detail, organizationId).map((candidate) =>
        this.toEventCandidateView(candidate)
      )
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
    const approvedAt = this.isBusinessCompleted(detail)
      ? this.toDate(
          this.firstNonEmpty(
            detail.confirmFinishTime,
            detail.registrationTransportDetails?.[0]?.confirmOutVNTime,
            detail.registrationTransportDetails?.[0]?.confirmOutTQTime,
            this.resolvePaymentTime(detail.paymentOfTax)
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
    const vehicle = this.resolvePrimaryVehicle(detail);
    const vehicleEntered = Boolean(
      vehicle?.checkBorderGuard && vehicle.confirmArrivalVehicleCustoms
    );
    const customsArrivedWithoutBorderGuard = Boolean(
      vehicle?.confirmArrivalVehicleCustoms && !vehicle.checkBorderGuard
    );
    const steps: CuaKhauSoProcedureStep[] = [
      {
        step: 1,
        label: procedureStepLabels[0],
        done: vehicleEntered,
        status: vehicleEntered
          ? 'DONE'
          : customsArrivedWithoutBorderGuard
            ? 'WAITING_AUTHORITY'
            : 'PENDING',
        description: vehicleEntered
          ? 'CBBP và CBHQ đã cùng xác nhận xe vào cửa khẩu.'
          : customsArrivedWithoutBorderGuard
            ? 'CBHQ đã xác nhận xe vào nhưng CBBP chưa tích xác nhận; chưa tính là xe đã vào.'
            : 'Chưa đủ xác nhận CBBP và CBHQ.'
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
        done: this.isBusinessCompleted(detail),
        status: this.isBusinessCompleted(detail)
          ? 'DONE'
          : this.isTaxPaid(detail.paymentOfTax)
            ? 'WAITING_AUTHORITY'
            : 'PENDING',
        description: this.isBusinessCompleted(detail)
          ? 'Cửa khẩu số đã xác nhận hoàn tất.'
          : this.isTaxPaid(detail.paymentOfTax)
            ? 'Thuế đã thanh toán, hồ sơ doanh nghiệp đã hoàn tất; đang chờ xác nhận công quyền.'
            : 'Chưa có xác nhận rời cửa khẩu.'
      }
    ];
    const stepOneOccurredAt = vehicleEntered
      ? this.latestIsoString(
          vehicle?.confirmArrivalVehicleCustomsTime,
          vehicle?.checkBorderGuardTime
        )
      : this.firstNonEmpty(
          vehicle?.confirmArrivalVehicleCustomsTime,
          vehicle?.checkBorderGuardTime
        );
    const occurredAtValues = [
      stepOneOccurredAt,
      vehicle?.confirmInParkingCustomsTime,
      vehicle?.checkCustomsTime,
      this.resolvePaymentTime(detail.paymentOfTax),
      this.firstNonEmpty(
        vehicle?.confirmOutParkingBorderGuardTime,
        vehicle?.confirmOutParkingCustomsTime
      ),
      this.firstNonEmpty(
        detail.confirmFinishTime,
        vehicle?.confirmOutVNTime,
        vehicle?.confirmOutTQTime
      )
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
    const vehicle = this.resolvePrimaryVehicle(detail);
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
        this.latestIsoString(
          vehicle.confirmArrivalVehicleCustomsTime,
          vehicle.checkBorderGuardTime
        ),
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

    const transshipment = this.resolveTransshipment(detail);

    if (transshipment.eligible) {
      this.addCandidate(
        candidates,
        organizationId,
        detail,
        'TRANSSHIPMENT_ELIGIBLE',
        transshipment.eligibleAt,
        'Cửa khẩu số ghi nhận xe đủ điều kiện ký sang tải.',
        0.85,
        'transshipment-eligible'
      );
    }

    if (transshipment.signed) {
      this.addCandidate(
        candidates,
        organizationId,
        detail,
        'TRANSSHIPMENT_SIGNED',
        transshipment.signedAt,
        'Cửa khẩu số ghi nhận đã ký/xác nhận sang tải.',
        0.85,
        'transshipment-signed'
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
        this.firstNonEmpty(
          vehicle.confirmOutParkingBorderGuardTime,
          vehicle.confirmOutParkingCustomsTime
        ),
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
        this.firstNonEmpty(
          detail.confirmFinishTime,
          vehicle?.confirmOutVNTime,
          vehicle?.confirmOutTQTime
        ),
        'Cửa khẩu số xác nhận hoàn tất quy trình tại cửa khẩu.',
        0.9,
        'border-gate-exit'
      );
    }

    return candidates.sort(
      (left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt)
    );
  }

  private addCandidate(
    candidates: CuaKhauSoEventCandidate[],
    organizationId: string,
    detail: CuaKhauSoDeclarationDetail,
    eventType: string,
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
    const vehicle = detail.registrationTransportDetails?.[0];

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
        yardName: detail.parkingPlace?.name ?? null,
        vehiclePlate: vehicle?.licencePlate ?? detail.licencePlateVNTQ ?? null,
        driverName: vehicle?.driverName ?? null,
        paymentCompleted: this.isTaxPaid(detail.paymentOfTax)
      }
    });
  }

  private toEventCandidateView(candidate: CuaKhauSoEventCandidate): CuaKhauSoEventCandidateView {
    return {
      eventType: candidate.eventType,
      occurredAt: candidate.occurredAt,
      sourceRef: candidate.sourceRef,
      idempotencyKey: candidate.idempotencyKey,
      note: candidate.note,
      confidence: candidate.confidence
    };
  }

  private mapVehicles(detail: CuaKhauSoDeclarationDetail) {
    const sourceVehicles = (detail.registrationTransportDetails ?? []).map((vehicle) =>
      this.mapVehicle(vehicle, detail)
    );
    const sourcePlateNumbers = new Set(sourceVehicles.map((vehicle) => vehicle.plateNumber));
    const receivingVehicles = (detail.changeVehicle?.changeVehicleDetails ?? [])
      .map((vehicle) => this.mapReceivingVehicleAsVehicle(vehicle, detail))
      .filter((vehicle) => !sourcePlateNumbers.has(vehicle.plateNumber));

    return [...sourceVehicles, ...receivingVehicles];
  }

  private mapVehicle(vehicle: CuaKhauSoVehicleDetail, detail: CuaKhauSoDeclarationDetail) {
    const transshipmentPlateNumbers = (detail.changeVehicle?.changeVehicleDetails ?? [])
      .filter((changeVehicle) => changeVehicle.licencePlate === vehicle.licencePlate)
      .map((changeVehicle) => this.trimToUndefined(changeVehicle.licencePlateChange))
      .filter((value): value is string => Boolean(value));
    const mapped: CuaKhauSoDeclarationDetailView['vehicles'][number] = {
      plateNumber: this.nonEmpty(vehicle.licencePlate, 'Chưa cập nhật'),
      trailerNumber: this.nonEmpty(vehicle.numberOfTrailer, vehicle.numberOfMooc, 'Chưa cập nhật'),
      driverName: this.nonEmpty(vehicle.driverName, 'Chưa cập nhật'),
      vehicleType: this.nonEmpty(
        vehicle.vehicleType?.name,
        vehicle.vehicleType?.code,
        'Chưa cập nhật'
      ),
      nationality: this.nonEmpty(vehicle.vehicleNationalityType, 'Chưa cập nhật'),
      containerNumber: this.nonEmpty(vehicle.numberOfContainer, 'Không có dữ liệu'),
      phoneNumber: this.nonEmpty(vehicle.driverPhone, 'Chưa cập nhật'),
      statusLabel: this.resolveVehicleStatusLabel(vehicle),
      transshipmentPlateNumber: this.nonEmpty(
        transshipmentPlateNumbers.join(', '),
        'Không sang tải'
      ),
      responsiblePlateNumber: 'Không có dữ liệu',
      goodsGroup: this.nonEmpty(detail.companyGoodsName, 'Chưa cập nhật'),
      note: this.nonEmpty(
        vehicle.description,
        vehicle.confirmTransportLicenseNote,
        'Không có ghi chú'
      ),
      transportLicenseNumber: this.resolveTransportLicenseNumber(detail, vehicle),
      borderGuardConfirmed: Boolean(vehicle.checkBorderGuard),
      customsArrivalConfirmed: Boolean(vehicle.confirmArrivalVehicleCustoms),
      inParkingConfirmed: Boolean(vehicle.confirmInParkingCustoms),
      transportLicenseConfirmed: Boolean(vehicle.confirmTransportLicense)
    };

    if (vehicle.id) {
      mapped.id = vehicle.id;
    }

    if (typeof vehicle.weight === 'number') {
      mapped.weight = vehicle.weight;
    }

    if (typeof vehicle.price === 'number') {
      mapped.price = vehicle.price;
    }

    if (typeof vehicle.feeRate === 'number') {
      mapped.feeRate = vehicle.feeRate;
    }

    this.assignIso(mapped, 'borderGuardAt', vehicle.checkBorderGuardTime);
    this.assignIso(mapped, 'customsArrivalAt', vehicle.confirmArrivalVehicleCustomsTime);
    this.assignIso(mapped, 'inParkingAt', vehicle.confirmInParkingCustomsTime);
    this.assignIso(mapped, 'transportLicenseConfirmedAt', vehicle.confirmTransportLicenseTime);
    this.assignIso(mapped, 'customsProcessingAt', vehicle.checkCustomsTime);
    this.assignIso(mapped, 'outParkingBorderGuardAt', vehicle.confirmOutParkingBorderGuardTime);
    this.assignIso(mapped, 'outParkingCustomsAt', vehicle.confirmOutParkingCustomsTime);

    return mapped;
  }

  private mapReceivingVehicleAsVehicle(
    vehicle: CuaKhauSoChangeVehicleDetail,
    detail: CuaKhauSoDeclarationDetail
  ) {
    const mapped: CuaKhauSoDeclarationDetailView['vehicles'][number] = {
      plateNumber: this.nonEmpty(vehicle.licencePlateChange, 'Chưa cập nhật'),
      trailerNumber: this.nonEmpty(vehicle.numberOfMooc, 'Chưa cập nhật'),
      driverName: this.nonEmpty(vehicle.driverName, 'Chưa cập nhật'),
      vehicleType: this.nonEmpty(vehicle.vehicleTypeEnumText, 'Chưa cập nhật'),
      nationality: 'VN',
      containerNumber: this.nonEmpty(vehicle.numberOfContainerOrMooc, 'Không có dữ liệu'),
      phoneNumber: 'Chưa cập nhật',
      statusLabel: vehicle.checkChangeVehicle ? 'Đã xác nhận sang tải' : 'Xe VN nhận sang tải',
      transshipmentPlateNumber: 'Không sang tải',
      responsiblePlateNumber: 'Không có dữ liệu',
      goodsGroup: this.nonEmpty(detail.companyGoodsName, 'Chưa cập nhật'),
      note: this.nonEmpty(vehicle.description, 'Không có ghi chú'),
      transportLicenseNumber: this.resolveReceivingVehicleLicenseNumber(detail, vehicle),
      borderGuardConfirmed: Boolean(vehicle.emptyVehicleEnteredGateTime),
      customsArrivalConfirmed: Boolean(vehicle.emptyVehicleEnteredGateCustomsTime),
      inParkingConfirmed: Boolean(vehicle.checkChangeVehicle),
      transportLicenseConfirmed: false
    };

    if (vehicle.id) {
      mapped.id = vehicle.id;
    }

    if (typeof vehicle.weight === 'number') {
      mapped.weight = vehicle.weight;
    }

    if (typeof vehicle.price === 'number') {
      mapped.price = vehicle.price;
    }

    if (typeof vehicle.feeRate === 'number') {
      mapped.feeRate = vehicle.feeRate;
    }

    this.assignIso(mapped, 'borderGuardAt', vehicle.emptyVehicleEnteredGateTime);
    this.assignIso(mapped, 'customsArrivalAt', vehicle.emptyVehicleEnteredGateCustomsTime);
    this.assignIso(mapped, 'inParkingAt', vehicle.checkChangeVehicleTime);
    this.assignIso(mapped, 'customsProcessingAt', vehicle.checkChangeVehicleTime);
    this.assignIso(
      mapped,
      'outParkingCustomsAt',
      this.firstNonEmpty(
        vehicle.confirmOutOfParkinglotTimeByCustoms,
        vehicle.checkChangeVehicleOutGateCustomVNTime
      )
    );

    return mapped;
  }

  private mapTransshipmentVehicle(vehicle: CuaKhauSoChangeVehicleDetail) {
    const customsOutAt = this.firstNonEmpty(
      vehicle.confirmOutOfParkinglotTimeByCustoms,
      vehicle.checkChangeVehicleOutGateCustomVNTime
    );
    const mapped: CuaKhauSoDeclarationDetailView['transshipmentVehicles'][number] = {
      sourcePlateNumber: this.nonEmpty(vehicle.licencePlate, 'Chưa cập nhật'),
      plateNumber: this.nonEmpty(vehicle.licencePlateChange, 'Chưa cập nhật'),
      driverName: this.nonEmpty(vehicle.driverName, 'Chưa cập nhật'),
      vehicleType: this.nonEmpty(vehicle.vehicleTypeEnumText, 'Chưa cập nhật'),
      areaChange: this.nonEmpty(vehicle.areaChange, 'Chưa cập nhật'),
      containerNumber: this.nonEmpty(vehicle.numberOfContainerOrMooc, 'Không có dữ liệu'),
      trailerNumber: this.nonEmpty(vehicle.numberOfMooc, 'Chưa cập nhật'),
      customsDeclarationNumbers: this.nonEmpty(
        vehicle.numberHQs?.filter(Boolean).join(', '),
        'Chưa cập nhật'
      ),
      statusLabel: vehicle.checkChangeVehicle ? 'Đã xác nhận sang tải' : 'Chưa xác nhận sang tải',
      note: this.nonEmpty(vehicle.description, 'Không có ghi chú'),
      borderGuardEntered: Boolean(vehicle.emptyVehicleEnteredGateTime),
      customsEntered: Boolean(vehicle.emptyVehicleEnteredGateCustomsTime),
      changeConfirmed: Boolean(vehicle.checkChangeVehicle),
      customsOutConfirmed: Boolean(
        vehicle.confirmOutOfParkinglotByCustoms || vehicle.checkChangeVehicleOutGateCustomVN
      ),
      medicalQuarantineConfirmed: Boolean(vehicle.checkMedicalQuarantine)
    };

    if (vehicle.id) {
      mapped.id = vehicle.id;
    }

    if (vehicle.vehicleRegistrationFormId) {
      mapped.vehicleRegistrationFormId = vehicle.vehicleRegistrationFormId;
    }

    if (typeof vehicle.weight === 'number') {
      mapped.weight = vehicle.weight;
    }

    if (typeof vehicle.price === 'number') {
      mapped.price = vehicle.price;
    }

    if (typeof vehicle.feeRate === 'number') {
      mapped.feeRate = vehicle.feeRate;
    }

    this.assignIso(mapped, 'borderGuardEnteredAt', vehicle.emptyVehicleEnteredGateTime);
    this.assignIso(mapped, 'customsEnteredAt', vehicle.emptyVehicleEnteredGateCustomsTime);
    this.assignIso(mapped, 'changeConfirmedAt', vehicle.checkChangeVehicleTime);
    this.assignIso(mapped, 'customsOutAt', customsOutAt);
    this.assignIso(mapped, 'medicalQuarantineAt', vehicle.checkMedicalQuarantineTime);

    return mapped;
  }

  private resolveVehicleStatusLabel(vehicle: CuaKhauSoVehicleDetail) {
    if (vehicle.confirmOutTQ || vehicle.confirmOutVN) {
      return 'Đã rời cửa khẩu';
    }

    if (vehicle.confirmOutParkingBorderGuard || vehicle.confirmOutParkingCustoms) {
      return 'Đã rời bãi';
    }

    if (vehicle.checkChangeVehicle) {
      return 'Đã xác nhận sang tải';
    }

    if (vehicle.confirmInParkingCustoms) {
      return 'Đã vào bãi';
    }

    if (vehicle.checkBorderGuard && vehicle.confirmArrivalVehicleCustoms) {
      return 'Đã tới cửa khẩu';
    }

    if (vehicle.confirmArrivalVehicleCustoms && !vehicle.checkBorderGuard) {
      return 'Chờ CBBP xác nhận';
    }

    return 'Đang theo dõi';
  }

  private resolveTransportLicenseNumber(
    detail: CuaKhauSoDeclarationDetail,
    vehicle: CuaKhauSoVehicleDetail
  ) {
    const form = detail.businessVehicleRegistrationForms?.find(
      (item) =>
        !item.registrationTransportDetailId || item.registrationTransportDetailId === vehicle.id
    );

    return this.nonEmpty(form?.internationalTransportationLicenseNumber, 'Chưa cập nhật');
  }

  private resolveReceivingVehicleLicenseNumber(
    detail: CuaKhauSoDeclarationDetail,
    vehicle: CuaKhauSoChangeVehicleDetail
  ) {
    const form = detail.businessVehicleRegistrationForms?.find(
      (item) => item.changeVehicleDetailId === vehicle.id
    );

    return this.nonEmpty(form?.internationalTransportationLicenseNumber, 'Chưa cập nhật');
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

  private resolveTransshipment(detail: CuaKhauSoDeclarationDetail) {
    const vehicle = this.resolvePrimaryVehicle(detail);
    const licenseForm = detail.businessVehicleRegistrationForms?.[0];
    const licenseNumber = this.nonEmpty(licenseForm?.internationalTransportationLicenseNumber);
    const licenseRegistered = Boolean(licenseForm && licenseNumber);
    const chinaVehicleEntered = Boolean(
      vehicle?.checkBorderGuard && vehicle.confirmArrivalVehicleCustoms
    );
    const foreignVehicleRequired = Boolean(
      vehicle && this.nonEmpty(vehicle.vehicleNationalityType).toUpperCase() !== 'VN'
    );
    const foreignVehicleEntered = !foreignVehicleRequired || chinaVehicleEntered;
    const transshipmentVehicles = detail.changeVehicle?.changeVehicleDetails ?? [];
    const vietnamVehicleEntered = transshipmentVehicles.some(
      (changeVehicle) =>
        Boolean(changeVehicle.emptyVehicleEnteredGateTime) &&
        Boolean(changeVehicle.emptyVehicleEnteredGateCustomsTime)
    );
    const transportLicenseConfirmed = Boolean(vehicle?.confirmTransportLicense);
    const borderGuardLagging = Boolean(
      vehicle?.confirmArrivalVehicleCustoms && !vehicle.checkBorderGuard
    );
    const unmetConditions = [
      ...(licenseRegistered ? [] : ['Chưa có giấy phép vận tải mục 9.']),
      ...(transportLicenseConfirmed ? [] : ['Chưa xác nhận giấy phép vận tải mục 11.']),
      ...(foreignVehicleEntered ? [] : ['Xe không VN chưa đủ xác nhận CBBP và CBHQ vào cửa khẩu.']),
      ...(vietnamVehicleEntered ? [] : ['Xe VN nhận sang tải chưa đủ thời gian vào BP/HQ.'])
    ];
    const eligible =
      licenseRegistered &&
      transportLicenseConfirmed &&
      foreignVehicleEntered &&
      vietnamVehicleEntered;
    const signed =
      eligible &&
      Boolean(
        detail.checkAllChangeVehicle ||
        transshipmentVehicles.some((item) => item.checkChangeVehicle)
      );
    const eligibleAt = this.latestIsoString(
      vehicle?.checkBorderGuardTime,
      vehicle?.confirmArrivalVehicleCustomsTime,
      vehicle?.confirmTransportLicenseTime,
      ...transshipmentVehicles.flatMap((item) => [
        item.emptyVehicleEnteredGateTime,
        item.emptyVehicleEnteredGateCustomsTime
      ])
    );
    const signedAt = this.firstNonEmpty(
      ...transshipmentVehicles.map((item) => item.checkChangeVehicleTime),
      eligibleAt
    );
    const transshipment: CuaKhauSoDeclarationDetailView['transshipment'] = {
      licenseRegistered,
      transportLicenseConfirmed,
      chinaVehicleEntered,
      vietnamVehicleEntered,
      foreignVehicleRequired,
      foreignVehicleEntered,
      borderGuardLagging,
      eligible,
      signed,
      licenseNumber: licenseNumber || 'Chưa cập nhật',
      statusLabel: eligible
        ? signed
          ? 'Đã ký/xác nhận sang tải'
          : 'Đủ điều kiện ký sang tải'
        : 'Chưa đủ điều kiện ký sang tải',
      unmetConditions
    };

    if (borderGuardLagging) {
      this.assignIso(
        transshipment,
        'borderGuardLaggedSince',
        vehicle?.confirmArrivalVehicleCustomsTime
      );
    }

    if (eligibleAt) {
      transshipment.eligibleAt = eligibleAt;
    }

    if (signedAt) {
      transshipment.signedAt = this.toIsoString(signedAt) ?? signedAt;
    }

    return transshipment;
  }

  private resolvePrimaryVehicle(detail: CuaKhauSoDeclarationDetail) {
    return (
      detail.registrationTransportDetails?.find(
        (vehicle) => this.nonEmpty(vehicle.vehicleNationalityType).toUpperCase() !== 'VN'
      ) ?? detail.registrationTransportDetails?.[0]
    );
  }

  private assignIso<T extends object>(
    target: T,
    key: keyof T & string,
    value: string | null | undefined
  ) {
    const isoString = this.toIsoString(value);

    if (isoString) {
      (target as Record<string, string>)[key] = isoString;
    }
  }

  private resolveChecks(detail: CuaKhauSoDeclarationDetail) {
    const vehicle = detail.registrationTransportDetails?.[0];

    return [
      {
        key: 'medical',
        label: 'Kiểm dịch y tế',
        done: Boolean(detail.checkAllMedicalQuarantine || vehicle?.checkMedicalQuarantine),
        detail: this.nonEmpty(
          vehicle?.checkMedicalQuarantineTime,
          detail.checkAllMedicalQuarantine ? 'Đã xác nhận' : 'Chưa xác nhận'
        )
      },
      {
        key: 'phytosanitary',
        label: 'Kiểm dịch thực vật',
        done: Boolean(detail.checkPhytosanitary || vehicle?.checkPhytosanitary),
        detail: this.nonEmpty(
          vehicle?.checkPhytosanitaryTime,
          detail.checkPhytosanitary ? 'Đã xác nhận' : 'Chưa xác nhận'
        )
      },
      {
        key: 'animal',
        label: 'Kiểm dịch động vật',
        done: Boolean(detail.checkAnimalQuarantine || vehicle?.checkAnimalQuarantine),
        detail: this.nonEmpty(
          vehicle?.checkAnimalQuarantineTime,
          detail.checkAnimalQuarantine ? 'Đã xác nhận' : 'Chưa xác nhận'
        )
      },
      {
        key: 'transshipment',
        label: 'Sang tải',
        done: Boolean(detail.checkAllChangeVehicle || vehicle?.checkChangeVehicle),
        detail: this.nonEmpty(
          vehicle?.checkChangeVehicleTime,
          detail.checkAllChangeVehicle ? 'Đã xác nhận' : 'Chưa xác nhận'
        )
      }
    ];
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

  private mapDeclarationStatus(declaration: CuaKhauSoDeclarationLite): DeclarationStatus {
    if (this.isBusinessCompleted(declaration)) {
      return 'APPROVED';
    }

    return 'SUBMITTED';
  }

  private mapStatusLabel(declaration: CuaKhauSoDeclarationLite) {
    return this.isBusinessCompleted(declaration) ? 'Hoàn thành' : 'Chưa hoàn thành';
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

  private isBusinessCompleted(declaration: CuaKhauSoDeclarationLite) {
    if (declaration.confirmFinish) {
      return true;
    }

    if (declaration.type === 0 && declaration.checkAllConfirmOutVN) {
      return true;
    }

    if (declaration.type === 1 && declaration.checkAllConfirmOutTQ) {
      return true;
    }

    return false;
  }

  private isTaxPaid(payment: CuaKhauSoPaymentInfo | null | undefined) {
    return payment?.paymentStatus === 2;
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

    const vietnameseDate = trimmed.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    );

    if (vietnameseDate) {
      const [, day, month, year, hour = '0', minute = '0', second = '0'] = vietnameseDate;
      const date = new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second)
      );

      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }

    const date = new Date(trimmed);

    if (Number.isNaN(date.getTime())) {
      return undefined;
    }

    return date;
  }

  private latestIsoString(...values: Array<string | null | undefined>): string | undefined {
    const dates = values
      .map((value) => this.toDate(value))
      .filter((value): value is Date => value !== undefined);

    if (dates.length === 0) {
      return undefined;
    }

    return new Date(Math.max(...dates.map((date) => date.getTime()))).toISOString();
  }

  private resolveListData(response: CuaKhauSoDeclarationListResponse): CuaKhauSoDeclarationLite[] {
    const responseRecord = this.toRecord(response);
    const data = responseRecord?.data;
    const dataRecord = this.toRecord(data);
    const knownCandidates = [
      dataRecord?.listData,
      dataRecord?.items,
      dataRecord?.records,
      dataRecord?.rows,
      responseRecord?.listData,
      responseRecord?.items,
      responseRecord?.records,
      responseRecord?.rows
    ];

    for (const candidate of knownCandidates) {
      const listData = this.asDeclarationArray(candidate, true);

      if (listData) {
        return listData;
      }
    }

    return (
      this.asDeclarationArray(data, true) ??
      this.findDeclarationArray(data) ??
      this.findDeclarationArray(response) ??
      []
    );
  }

  private resolveTotalCount(response: CuaKhauSoDeclarationListResponse, fallback: number) {
    const responseRecord = this.toRecord(response);
    const dataRecord = this.toRecord(responseRecord?.data);
    const candidates = [
      dataRecord?.totalCount,
      dataRecord?.total,
      dataRecord?.count,
      dataRecord?.totalElements,
      responseRecord?.totalCount,
      responseRecord?.total,
      responseRecord?.count,
      responseRecord?.totalElements
    ];

    for (const candidate of candidates) {
      const totalCount = this.toNumber(candidate);

      if (totalCount !== undefined) {
        return totalCount;
      }
    }

    return fallback;
  }

  private resolveTotalPage(response: CuaKhauSoDeclarationListResponse) {
    const responseRecord = this.toRecord(response);
    const dataRecord = this.toRecord(responseRecord?.data);
    const candidates = [
      dataRecord?.totalPage,
      dataRecord?.totalPages,
      dataRecord?.pages,
      responseRecord?.totalPage,
      responseRecord?.totalPages,
      responseRecord?.pages
    ];

    for (const candidate of candidates) {
      const totalPage = this.toNumber(candidate);

      if (totalPage !== undefined) {
        return totalPage;
      }
    }

    return 1;
  }

  private findDeclarationArray(value: unknown): CuaKhauSoDeclarationLite[] | undefined {
    const record = this.toRecord(value);

    if (!record) {
      return undefined;
    }

    for (const candidate of Object.values(record)) {
      const listData = this.asDeclarationArray(candidate, false);

      if (listData) {
        return listData;
      }
    }

    return undefined;
  }

  private asDeclarationArray(
    value: unknown,
    allowEmpty: boolean
  ): CuaKhauSoDeclarationLite[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }

    if (value.length === 0) {
      return allowEmpty ? [] : undefined;
    }

    return this.isDeclarationLike(value[0]) ? (value as CuaKhauSoDeclarationLite[]) : undefined;
  }

  private isDeclarationLike(value: unknown): value is CuaKhauSoDeclarationLite {
    const record = this.toRecord(value);
    return Boolean(record && ('id' in record || 'numberOfDeclaration' in record));
  }

  private toRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private toNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }

    return undefined;
  }

  private nonEmpty(...values: Array<string | number | null | undefined>) {
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
