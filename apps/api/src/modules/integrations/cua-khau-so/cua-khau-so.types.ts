import type { DeclarationStatus, DeclarationType, TripDirection } from '@prisma/client';

export type CuaKhauSoDirection = 'IMPORT' | 'EXPORT';
export type CuaKhauSoListStatus = 1 | 2 | 3;
export type CuaKhauSoPageSize = 10 | 20 | 50 | 100;

export type CuaKhauSoLoginRequest = {
  username: string;
  password: string;
};

export type CuaKhauSoSession = {
  accessToken: string;
  refreshCookies: string[];
  username: string;
  expiresAt: Date;
};

export type CuaKhauSoSessionSummary = {
  authenticated: boolean;
  username?: string;
  expiresAt?: string;
};

export type CuaKhauSoExternalListParams = {
  pageNumber: number;
  pageSize: CuaKhauSoPageSize;
  status?: CuaKhauSoListStatus;
  keyword?: string;
  direction?: CuaKhauSoDirection;
};

export type CuaKhauSoDeclarationListResponse = {
  result?: number;
  code?: string;
  message?: string;
  data?: {
    listData?: CuaKhauSoDeclarationLite[];
    totalCount?: number;
    totalPage?: number;
  };
};

export type CuaKhauSoDeclarationLite = {
  id: string;
  numberOfDeclaration?: string | null;
  createDate?: string | null;
  type?: 0 | 1 | number | null;
  gate?: CuaKhauSoGateInfo | null;
  confirmFinish?: boolean | null;
  companyGoodsName?: string | null;
  licencePlateVNTQ?: string | null;
  numberOfTrailer?: string | null;
  licencePlateChange?: string | null;
  isChangeVehicle?: boolean | null;
  totalWeight?: number | null;
  mainVehicles?: CuaKhauSoVehicleBrief[] | null;
  changeVehicles?: CuaKhauSoVehicleBrief[] | null;
  paymentOfTax?: CuaKhauSoPaymentInfo | null;
  paymentOfEconomic?: CuaKhauSoPaymentInfo | null;
  procedureOfficerName?: string | null;
  procedureOfficerPhone?: string | null;
  confirmStartCheck?: boolean | null;
  [key: string]: unknown;
};

export type CuaKhauSoDeclarationDetailResponse = {
  data?: CuaKhauSoDeclarationDetail;
  [key: string]: unknown;
};

export type CuaKhauSoEmptyVehicleLogResponse = {
  data?: CuaKhauSoEmptyVehicleLogItem[] | null;
  [key: string]: unknown;
};

export type CuaKhauSoEmptyVehicleLogItem = {
  value?: string | Record<string, unknown> | null;
  [key: string]: unknown;
};

export type CuaKhauSoDeclarationDetail = CuaKhauSoDeclarationLite & {
  numberOfDeclarationBorderGuard?: string | null;
  arrivalDate?: string | null;
  arrivalTime?: string | null;
  feePayingCompanyName?: string | null;
  feePayingCompanyTaxCode?: string | null;
  feePayingCompanyAddress?: string | null;
  feePayingCompanyPhone?: string | null;
  company?: CuaKhauSoCompanyInfo | null;
  parkingPlace?: CuaKhauSoParkingPlace | null;
  infrastructureCharges?: number | null;
  transferCharges?: number | null;
  confirmFinishTime?: string | null;
  createdUser?: CuaKhauSoUserInfo | null;
  checkAllBorderGuard?: boolean | null;
  checkAllConfirmArrivalVehicleCustoms?: boolean | null;
  checkAllConfirmInParkingCustoms?: boolean | null;
  checkAllConfirmOutTQ?: boolean | null;
  checkAllConfirmOutVN?: boolean | null;
  checkAllMedicalQuarantine?: boolean | null;
  checkAllChangeVehicle?: boolean | null;
  checkPhytosanitary?: boolean | null;
  checkPhytosanitaryTime?: string | null;
  checkAnimalQuarantine?: boolean | null;
  checkAnimalQuarantineTime?: string | null;
  registrationTransportDetails?: CuaKhauSoVehicleDetail[] | null;
  registrationTransportGoods?: CuaKhauSoGoodsGroup[] | null;
  businessVehicleRegistrationForms?: CuaKhauSoBusinessVehicleRegistrationForm[] | null;
  changeVehicle?: CuaKhauSoChangeVehicleInfo | null;
};

export type CuaKhauSoGateInfo = {
  id?: string;
  code?: string | null;
  name?: string | null;
  description?: string | null;
};

export type CuaKhauSoCompanyInfo = {
  id?: string;
  taxCode?: string | null;
  name?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type CuaKhauSoParkingPlace = {
  id?: string;
  name?: string | null;
  address?: string | null;
  description?: string | null;
};

export type CuaKhauSoUserInfo = {
  id?: string;
  username?: string | null;
  displayName?: string | null;
  phoneNumber?: string | null;
};

export type CuaKhauSoPaymentInfo = {
  id?: string;
  code?: string | null;
  paymentStatus?: 0 | 1 | 2 | number | null;
  total?: number | null;
  totalPaid?: number | null;
  payerName?: string | null;
  payerTaxCode?: string | null;
  actionTime?: string | null;
  tollDate?: string | null;
  paymentDate?: string | null;
  [key: string]: unknown;
};

export type CuaKhauSoVehicleBrief = {
  licencePlate?: string | null;
  numberOfMooc?: string | null;
};

export type CuaKhauSoVehicleDetail = CuaKhauSoVehicleBrief & {
  id?: string;
  driverName?: string | null;
  driverPhone?: string | null;
  vehicleType?: {
    id?: string;
    name?: string | null;
    code?: string | null;
  } | null;
  weight?: number | null;
  price?: number | null;
  feeRate?: number | null;
  numberOfContainer?: string | null;
  isChangeVehicle?: boolean | null;
  vehicleNationalityType?: 'VN' | 'CN' | string | null;
  checkPhytosanitary?: boolean | null;
  checkPhytosanitaryTime?: string | null;
  descriptionRequestPhytosanitary?: string | null;
  checkAnimalQuarantine?: boolean | null;
  checkAnimalQuarantineTime?: string | null;
  checkMedicalQuarantine?: boolean | null;
  checkMedicalQuarantineTime?: string | null;
  checkBorderGuard?: boolean | null;
  checkBorderGuardTime?: string | null;
  confirmArrivalVehicleCustoms?: boolean | null;
  confirmArrivalVehicleCustomsTime?: string | null;
  confirmInParkingCustoms?: boolean | null;
  confirmInParkingCustomsTime?: string | null;
  checkCustoms?: boolean | null;
  checkCustomsTime?: string | null;
  checkChangeVehicle?: boolean | null;
  checkChangeVehicleTime?: string | null;
  confirmTransportLicense?: boolean | null;
  confirmTransportLicenseTime?: string | null;
  confirmTransportLicenseNote?: string | null;
  description?: string | null;
  confirmOutParkingCustoms?: boolean | null;
  confirmOutParkingCustomsTime?: string | null;
  confirmOutParkingBorderGuard?: boolean | null;
  confirmOutParkingBorderGuardTime?: string | null;
  confirmOutTQ?: boolean | null;
  confirmOutTQTime?: string | null;
  confirmOutVN?: boolean | null;
  confirmOutVNTime?: string | null;
  shipmentStatus?: number | null;
  [key: string]: unknown;
};

export type CuaKhauSoBusinessVehicleRegistrationForm = {
  id?: string;
  internationalTransportationLicenseNumber?: string | null;
  registrationTransportId?: string | null;
  registrationTransportDetailId?: string | null;
  changeVehicleDetailId?: string | null;
  vehicleRegistrationFormId?: string | null;
  [key: string]: unknown;
};

export type CuaKhauSoGoodsGroup = {
  id?: string;
  companyName?: string | null;
  companyTaxCode?: string | null;
  numberHQ?: string | null;
  typeHQ?: string | null;
  registrationTransportGoodsDetails?: CuaKhauSoGoodsItem[] | null;
};

export type CuaKhauSoGoodsItem = {
  id?: string;
  nameProduct?: string | null;
  priceVND?: number | null;
  hsCode?: string | null;
  weight?: number | null;
};

export type CuaKhauSoChangeVehicleInfo = {
  id?: string;
  changeVehicleDetails?: CuaKhauSoChangeVehicleDetail[] | null;
};

export type CuaKhauSoChangeVehicleDetail = {
  id?: string;
  licencePlate?: string | null;
  licencePlateChange?: string | null;
  driverName?: string | null;
  areaChange?: string | null;
  price?: number | null;
  feeRate?: number | null;
  weight?: number | null;
  vehicleTypeEnumText?: string | null;
  numberOfContainerOrMooc?: string | null;
  numberOfMooc?: string | null;
  description?: string | null;
  numberHQs?: string[] | null;
  vehicleRegistrationFormId?: string | null;
  checkChangeVehicle?: boolean | null;
  checkChangeVehicleTime?: string | null;
  checkMedicalQuarantine?: boolean | null;
  checkMedicalQuarantineTime?: string | null;
  checkChangeVehicleOutGateCustomVN?: boolean | null;
  checkChangeVehicleOutGateCustomVNTime?: string | null;
  confirmOutOfParkinglotByCustoms?: boolean | null;
  confirmOutOfParkinglotTimeByCustoms?: string | null;
  emptyVehicleEnteredGateTime?: string | null;
  emptyVehicleEnteredGateCustomsTime?: string | null;
};

export type CuaKhauSoProcedureStep = {
  step: number;
  label: string;
  done: boolean;
  occurredAt?: string;
  status?: 'DONE' | 'WAITING_AUTHORITY' | 'PENDING';
  description?: string;
};

export type CuaKhauSoDeclarationSummary = {
  externalId: string;
  declarationNumber: string;
  createdAt?: string;
  sourceObservedAt?: string;
  lastIngestedAt?: string;
  linkedTripId?: string;
  linkedTripCode?: string;
  direction: TripDirection;
  declarationType: DeclarationType;
  status: DeclarationStatus;
  statusLabel: string;
  gateName: string;
  gateCode?: string;
  companyGoodsName: string;
  plateNumber: string;
  trailerNumber: string;
  changePlateNumber: string;
  totalWeight?: number;
  completed: boolean;
  paymentStatus: string;
};

export type CuaKhauSoDeclarationDetailView = CuaKhauSoDeclarationSummary & {
  borderGuardDeclarationNumber: string;
  arrivalAt: string;
  createdBy?: {
    username: string;
    displayName: string;
    phoneNumber: string;
  };
  feePayingCompany: {
    name: string;
    taxCode: string;
    address: string;
    phone: string;
  };
  parkingPlace: {
    name: string;
    address: string;
    description: string;
  };
  infrastructureCharges: number;
  transferCharges: number;
  transshipment: {
    licenseRegistered: boolean;
    transportLicenseConfirmed: boolean;
    chinaVehicleEntered: boolean;
    vietnamVehicleEntered: boolean;
    foreignVehicleRequired: boolean;
    foreignVehicleEntered: boolean;
    borderGuardLagging: boolean;
    eligible: boolean;
    signed: boolean;
    licenseNumber: string;
    statusLabel: string;
    unmetConditions: string[];
    borderGuardLaggedSince?: string;
    eligibleAt?: string;
    signedAt?: string;
  };
  checks: Array<{
    key: string;
    label: string;
    done: boolean;
    detail: string;
  }>;
  vehicles: Array<{
    id?: string;
    plateNumber: string;
    trailerNumber: string;
    driverName: string;
    vehicleType: string;
    nationality: string;
    containerNumber: string;
    phoneNumber: string;
    statusLabel: string;
    transshipmentPlateNumber: string;
    responsiblePlateNumber: string;
    goodsGroup: string;
    note: string;
    transportLicenseNumber: string;
    weight?: number;
    price?: number;
    feeRate?: number;
    borderGuardConfirmed: boolean;
    customsArrivalConfirmed: boolean;
    inParkingConfirmed: boolean;
    transportLicenseConfirmed: boolean;
    borderGuardAt?: string;
    customsArrivalAt?: string;
    inParkingAt?: string;
    transportLicenseConfirmedAt?: string;
    customsProcessingAt?: string;
    outParkingBorderGuardAt?: string;
    outParkingCustomsAt?: string;
  }>;
  transshipmentVehicles: Array<{
    id?: string;
    sourcePlateNumber: string;
    plateNumber: string;
    driverName: string;
    vehicleType: string;
    areaChange: string;
    containerNumber: string;
    trailerNumber: string;
    customsDeclarationNumbers: string;
    statusLabel: string;
    note: string;
    weight?: number;
    price?: number;
    feeRate?: number;
    vehicleRegistrationFormId?: string;
    borderGuardEntered: boolean;
    customsEntered: boolean;
    changeConfirmed: boolean;
    customsOutConfirmed: boolean;
    medicalQuarantineConfirmed: boolean;
    borderGuardEnteredAt?: string;
    customsEnteredAt?: string;
    changeConfirmedAt?: string;
    customsOutAt?: string;
    medicalQuarantineAt?: string;
  }>;
  goods: Array<{
    id?: string;
    companyName: string;
    companyTaxCode: string;
    declarationNumber: string;
    declarationType: string;
    items: Array<{
      id?: string;
      name: string;
      hsCode: string;
      weight?: number;
      priceVnd?: number;
    }>;
  }>;
  procedureSteps: CuaKhauSoProcedureStep[];
  eventCandidates: CuaKhauSoEventCandidateView[];
};

export type CuaKhauSoMappedList = {
  declarations: CuaKhauSoDeclarationSummary[];
  totalCount: number;
  totalPage: number;
  message: string;
};

export type CuaKhauSoEventCandidate = {
  eventType: string;
  occurredAt: string;
  sourceRef: string;
  idempotencyKey: string;
  note: string;
  confidence: number;
  rawPayload: Record<string, unknown>;
};

export type CuaKhauSoEventCandidateView = Omit<CuaKhauSoEventCandidate, 'rawPayload'>;

export type CuaKhauSoSyncResult = {
  declaration: CuaKhauSoDeclarationSummary & {
    id: string;
  };
  linkedTripId?: string;
  linkedBy: 'requested' | 'declaration' | 'tripCode' | 'created' | 'none';
  recordedEvents: Array<{
    id: string;
    eventType: string;
    occurredAt: string | Date;
  }>;
  skippedEvents: Array<{
    eventType: string;
    reason: string;
  }>;
  lastSyncAt: string;
};
