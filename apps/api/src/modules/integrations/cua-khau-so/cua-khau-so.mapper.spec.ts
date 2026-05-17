import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { CuaKhauSoMapper } from './cua-khau-so.mapper';
import type { CuaKhauSoDeclarationDetail } from './cua-khau-so.types';

function loadFixture(): CuaKhauSoDeclarationDetail {
  const raw = JSON.parse(
    readFileSync(
      path.resolve(
        process.cwd(),
        'src/modules/integrations/cua-khau-so/__fixtures__/raw-json.json'
      ),
      'utf8'
    )
  ) as { data: CuaKhauSoDeclarationDetail };

  return raw.data;
}

test('CuaKhauSoMapper maps real fixture into declaration detail, steps and event candidates', () => {
  const mapper = new CuaKhauSoMapper();
  const detail = loadFixture();
  const mapped = mapper.mapDetail(detail, 'org-1');

  assert.equal(mapped.declarationNumber, '2026050300533');
  assert.equal(mapped.direction, 'IMPORT');
  assert.equal(mapped.declarationType, 'IMPORT');
  assert.equal(mapped.gateName, 'Hữu Nghị');
  assert.equal(mapped.procedureSteps.length, 6);
  assert.equal(mapped.procedureSteps[0]?.done, true);
  assert.equal(mapped.procedureSteps[1]?.done, true);
  assert.equal(mapped.vehicles[0]?.borderGuardConfirmed, true);
  assert.equal(mapped.vehicles[0]?.customsArrivalConfirmed, true);
  assert.equal(mapped.vehicles[0]?.selfWeight, 8045);
  assert.equal(mapped.vehicles[0]?.unloadingPlace, 'Bãi Xuân Cương');
  assert.equal(
    mapped.vehicles.every((vehicle) => vehicle.nationality === 'CN'),
    true
  );
  assert.equal(
    mapped.vehicles.some((vehicle) => vehicle.plateNumber === '29E07714'),
    false
  );
  assert.equal(mapped.transshipmentVehicles.length, 2);
  assert.equal(mapped.transshipmentVehicles[0]?.driverIdentityNumber, '.');
  assert.equal(
    mapped.transshipmentVehicles[0]?.vehicleRegistrationFormId,
    'bcbad4b8-9378-4eba-beb9-bf853ef5258a'
  );
  assert.equal(
    mapped.eventCandidates.some((event) => event.eventType === 'DECLARATION_SUBMITTED'),
    true
  );
  assert.equal(
    mapped.eventCandidates.some((event) => event.eventType === 'BORDER_GATE_ENTRY_CONFIRMED'),
    true
  );
  assert.equal(
    mapped.eventCandidates.every((event) => event.idempotencyKey.startsWith('cua-khau-so:org-1:')),
    true
  );
  assert.equal(
    mapped.eventCandidates.every((event) => !('rawPayload' in event)),
    true
  );
});

test('CuaKhauSoMapper maps list response variants from Cửa khẩu số', () => {
  const mapper = new CuaKhauSoMapper();
  const declaration = {
    id: '84b718cf-4a72-4c7e-91d8-24e51ae53154',
    numberOfDeclaration: '2026050300533',
    createDate: '2026-05-03T13:15:21.972699',
    type: 0,
    gate: {
      code: 'CKHN',
      name: 'Hữu Nghị'
    },
    confirmFinish: true,
    companyGoodsName: 'Công ty Logistics',
    licencePlateVNTQ: '29E06997',
    numberOfTrailer: 'MOOC-01',
    paymentOfTax: {
      paymentStatus: 2
    }
  };

  const canonical = mapper.mapListResponse({
    message: 'Thành công',
    data: {
      listData: [declaration],
      totalCount: 1,
      totalPage: 1
    }
  });
  const dataArray = mapper.mapListResponse({
    message: 'Thành công',
    data: [declaration],
    totalCount: '2',
    totalPage: '1'
  } as never);
  const nestedRecords = mapper.mapListResponse({
    message: 'Thành công',
    data: {
      records: [declaration],
      total: '3',
      totalPages: '2'
    }
  } as never);

  assert.equal(canonical.declarations[0]?.declarationNumber, '2026050300533');
  assert.equal(dataArray.totalCount, 2);
  assert.equal(dataArray.declarations[0]?.plateNumber, '29E06997');
  assert.equal(nestedRecords.totalCount, 3);
  assert.equal(nestedRecords.totalPage, 2);
  assert.equal(nestedRecords.declarations[0]?.gateName, 'Hữu Nghị');
});

test('CuaKhauSoMapper waits for CBBP and CBHQ before marking vehicle entry', () => {
  const mapper = new CuaKhauSoMapper();
  const mapped = mapper.mapDetail(
    {
      id: '84b718cf-4a72-4c7e-91d8-24e51ae53154',
      numberOfDeclaration: '2026050300533',
      createDate: '2026-05-03T13:15:21.972699',
      type: 0,
      registrationTransportDetails: [
        {
          vehicleNationalityType: 'CN',
          confirmArrivalVehicleCustoms: true,
          confirmArrivalVehicleCustomsTime: '2026-05-03T13:20:21.972699',
          checkBorderGuard: false
        }
      ]
    },
    'org-1'
  );

  assert.equal(mapped.procedureSteps[0]?.done, false);
  assert.equal(mapped.procedureSteps[0]?.status, 'WAITING_AUTHORITY');
  assert.equal(mapped.transshipment.borderGuardLagging, true);
  assert.equal(
    mapped.eventCandidates.some((event) => event.eventType === 'BORDER_GATE_ENTRY_CONFIRMED'),
    false
  );
});

test('CuaKhauSoMapper requires license and VN transshipment vehicle BP/HQ times for eligibility', () => {
  const mapper = new CuaKhauSoMapper();
  const mapped = mapper.mapDetail(
    {
      id: '84b718cf-4a72-4c7e-91d8-24e51ae53154',
      numberOfDeclaration: '2026050300533',
      createDate: '2026-05-03T13:15:21.972699Z',
      type: 0,
      registrationTransportDetails: [
        {
          vehicleNationalityType: 'CN',
          checkBorderGuard: true,
          checkBorderGuardTime: '2026-05-03T13:20:21.972699Z',
          confirmArrivalVehicleCustoms: true,
          confirmArrivalVehicleCustomsTime: '2026-05-03T13:21:21.972699Z',
          confirmTransportLicense: true,
          confirmTransportLicenseTime: '2026-05-03T13:22:21.972699Z'
        }
      ],
      businessVehicleRegistrationForms: [
        {
          internationalTransportationLicenseNumber: 'C26YF0666521'
        }
      ],
      changeVehicle: {
        changeVehicleDetails: [
          {
            id: 'cv-1',
            licencePlate: 'FF0666',
            licencePlateChange: '29E06997',
            emptyVehicleEnteredGateTime: '2026-05-03T13:23:21.972699Z',
            emptyVehicleEnteredGateCustomsTime: '2026-05-03T13:24:21.972699Z',
            checkChangeVehicle: true,
            checkChangeVehicleTime: '2026-05-03T13:25:21.972699Z',
            confirmOutOfParkinglotTimeByBorderGate: '2026-05-03T13:26:21.972699Z',
            checkChangeVehicleOutGateCustomVNTime: '2026-05-03T13:27:21.972699Z'
          }
        ]
      }
    },
    'org-1'
  );

  assert.equal(mapped.transshipment.eligible, true);
  assert.equal(mapped.transshipment.signed, true);
  assert.equal(mapped.transshipment.vietnamVehicleEntered, true);
  assert.equal(
    mapped.eventCandidates.some((event) => event.eventType === 'TRANSSHIPMENT_ELIGIBLE'),
    true
  );
  assert.equal(mapped.transshipmentVehicles[0]?.borderGuardEntered, true);
  assert.equal(mapped.transshipmentVehicles[0]?.customsEntered, true);
  assert.equal(mapped.transshipmentVehicles[0]?.borderGuardOutAt, '2026-05-03T13:26:21.972Z');
  assert.equal(mapped.transshipmentVehicles[0]?.customsOutAt, '2026-05-03T13:27:21.972Z');
});

test('CuaKhauSoMapper maps export declaration with correct direction and completion', () => {
  const mapper = new CuaKhauSoMapper();
  const raw = JSON.parse(
    readFileSync(
      path.resolve(
        process.cwd(),
        'src/modules/integrations/cua-khau-so/__fixtures__/export-completed.json'
      ),
      'utf8'
    )
  ) as CuaKhauSoDeclarationDetail;

  const mapped = mapper.mapSummary(raw);

  assert.equal(mapped.direction, 'EXPORT');
  assert.equal(mapped.declarationType, 'EXPORT');
  assert.equal(mapped.completed, true);
  assert.equal(mapped.statusLabel, 'Hoàn thành');
  assert.equal(mapped.paymentStatus, 'Đã thanh toán');
});

test('CuaKhauSoMapper generates BORDER_GATE_EXIT_CONFIRMED when confirmFinish is true even if isFinish is false', () => {
  const mapper = new CuaKhauSoMapper();
  const raw = JSON.parse(
    readFileSync(
      path.resolve(
        process.cwd(),
        'src/modules/integrations/cua-khau-so/__fixtures__/export-completed.json'
      ),
      'utf8'
    )
  ) as CuaKhauSoDeclarationDetail;

  assert.equal(raw.isFinish, false);
  assert.equal(raw.confirmFinish, true);

  const candidates = mapper.buildEventCandidates(raw, 'org-1');
  const exitEvent = candidates.find((c) => c.eventType === 'BORDER_GATE_EXIT_CONFIRMED');

  assert.ok(exitEvent, 'BORDER_GATE_EXIT_CONFIRMED should be generated when confirmFinish is true');
  assert.equal(
    candidates.some((c) => c.eventType === 'BORDER_GATE_ENTRY_CONFIRMED'),
    true
  );
  assert.equal(
    candidates.some((c) => c.eventType === 'FEE_PAID'),
    true
  );
});

test('CuaKhauSoMapper maps plain import without transshipment', () => {
  const mapper = new CuaKhauSoMapper();
  const raw = JSON.parse(
    readFileSync(
      path.resolve(
        process.cwd(),
        'src/modules/integrations/cua-khau-so/__fixtures__/import-plain.json'
      ),
      'utf8'
    )
  ) as CuaKhauSoDeclarationDetail;

  const mapped = mapper.mapDetail(raw, 'org-1');

  assert.equal(mapped.direction, 'IMPORT');
  assert.equal(mapped.declarationType, 'IMPORT');
  assert.equal(mapped.completed, false);
  assert.equal(mapped.transshipmentVehicles.length, 0);
  assert.equal(mapped.transshipment.eligible, false);
  assert.equal(mapped.transshipment.signed, false);
});

test('CuaKhauSoMapper handles border guard lag with WAITING_AUTHORITY status', () => {
  const mapper = new CuaKhauSoMapper();
  const mapped = mapper.mapDetail(
    {
      id: 'lag-test-001',
      numberOfDeclaration: '20260509LAG01',
      createDate: '2026-05-09T10:00:00',
      type: 0,
      registrationTransportDetails: [
        {
          vehicleNationalityType: 'CN',
          checkBorderGuard: false,
          confirmArrivalVehicleCustoms: true,
          confirmArrivalVehicleCustomsTime: '2026-05-09T10:05:00'
        }
      ]
    },
    'org-1'
  );

  assert.equal(mapped.procedureSteps[0]?.done, false);
  assert.equal(mapped.procedureSteps[0]?.status, 'WAITING_AUTHORITY');
  assert.equal(mapped.transshipment.borderGuardLagging, true);
  assert.equal(
    mapped.eventCandidates.some((e) => e.eventType === 'BORDER_GATE_ENTRY_CONFIRMED'),
    false,
    'Should not generate BORDER_GATE_ENTRY_CONFIRMED when border guard has not confirmed'
  );
});

test('CuaKhauSoMapper omits event candidates without trusted timestamps', () => {
  const mapper = new CuaKhauSoMapper();
  const candidates = mapper.buildEventCandidates(
    {
      id: '84b718cf-4a72-4c7e-91d8-24e51ae53154',
      numberOfDeclaration: '2026050300533',
      type: 0,
      confirmStartCheck: true,
      paymentOfTax: {
        paymentStatus: 2
      },
      registrationTransportDetails: [
        {
          checkBorderGuard: true,
          confirmArrivalVehicleCustoms: true,
          confirmInParkingCustoms: true,
          confirmOutParkingBorderGuard: true
        }
      ]
    },
    'org-1'
  );

  assert.equal(candidates.length, 0);
});
