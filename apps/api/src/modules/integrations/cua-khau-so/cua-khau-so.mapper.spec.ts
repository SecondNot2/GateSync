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
