import type {
  DeclarationStatus,
  DeclarationType,
  TripDirection,
  TripEventType
} from '@prisma/client';

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
  registrationTransportDetails?: CuaKhauSoVehicleDetail[] | null;
  registrationTransportGoods?: CuaKhauSoGoodsGroup[] | null;
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
  vehicleType?: {
    id?: string;
    name?: string | null;
    code?: string | null;
  } | null;
  weight?: number | null;
  isChangeVehicle?: boolean | null;
  vehicleNationalityType?: 'VN' | 'CN' | string | null;
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
  checkChangeVehicle?: boolean | null;
};

export type CuaKhauSoProcedureStep = {
  step: number;
  label: string;
  done: boolean;
  occurredAt?: string;
};

export type CuaKhauSoDeclarationSummary = {
  externalId: string;
  declarationNumber: string;
  createdAt?: string;
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
  vehicles: Array<{
    id?: string;
    plateNumber: string;
    trailerNumber: string;
    driverName: string;
    vehicleType: string;
    nationality: string;
    weight?: number;
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
  eventType: TripEventType;
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
  linkedBy: 'requested' | 'declaration' | 'tripCode' | 'none';
  recordedEvents: Array<{
    id: string;
    eventType: TripEventType;
    occurredAt: string | Date;
  }>;
  skippedEvents: Array<{
    eventType: TripEventType;
    reason: string;
  }>;
  lastSyncAt: string;
};
