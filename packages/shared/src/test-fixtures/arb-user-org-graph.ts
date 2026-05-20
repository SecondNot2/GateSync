/**
 * fast-check arbitrary for a multi-tenant DB-shaped graph of users,
 * organizations, memberships, trips and trip participants.
 *
 * The graph is small but consistent (FK references resolve, memberships
 * resolve to existing users + orgs) so RBAC / recipient resolution / tenant
 * isolation property tests (Properties 15–18, 24, 25) can run without a real
 * Postgres instance.
 *
 * Variants:
 *   - `arbUserOrgGraph` — single org graph.
 *   - `arbMultiOrgUserGraph` — 2–3 organizations to exercise cross-org
 *     scenarios (Property 18 cross-org guard, Property 24 tenant scoping).
 */
import * as fc from 'fast-check';

import {
  membershipRoles,
  membershipStatuses,
  tripParticipantRoles,
  tripStatuses,
  tripTypes,
  type MembershipRole,
  type MembershipStatus,
  type TripParticipantRole,
  type TripStatus,
  type TripType
} from '../domain.js';
import { arbUuid } from './arb-uuid.js';

export interface UserFixture {
  id: string;
  email: string;
  fullName: string;
}

export interface OrganizationFixture {
  id: string;
  name: string;
}

export interface MembershipFixture {
  id: string;
  organizationId: string;
  userId: string;
  role: MembershipRole;
  status: MembershipStatus;
  deletedAt: Date | null;
}

export interface TripFixture {
  id: string;
  organizationId: string;
  tripType: TripType;
  currentStatus: TripStatus;
  driverUserId: string | null;
  plannedDate: Date;
}

export interface TripParticipantFixture {
  id: string;
  tripId: string;
  organizationId: string;
  userId: string;
  role: TripParticipantRole;
  deletedAt: Date | null;
}

export interface UserOrgGraph {
  users: UserFixture[];
  organizations: OrganizationFixture[];
  memberships: MembershipFixture[];
  trips: TripFixture[];
  participants: TripParticipantFixture[];
}

const arbDate = fc.date({
  min: new Date('2024-01-01T00:00:00Z'),
  max: new Date('2026-12-31T23:59:59Z'),
  noInvalidDate: true
});

const NAME_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzĐđÁÀẢÃẠÂẤẦẨẪẬĂẮẰẲẴẶÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴ ';
const ORG_ALPHABET = `${NAME_ALPHABET}0123456789.`;
const EMAIL_LOCAL_ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

const arbFromAlphabet = (alphabet: string, min: number, max: number): fc.Arbitrary<string> =>
  fc
    .array(
      fc.integer({ min: 0, max: alphabet.length - 1 }).map((i) => alphabet.charAt(i)),
      { minLength: min, maxLength: max }
    )
    .map((chars) => chars.join('').trim())
    .filter((s) => s.length >= min);

const arbEmail = fc
  .tuple(
    arbFromAlphabet(EMAIL_LOCAL_ALPHABET, 3, 12),
    fc.constantFrom('gatesync.test', 'example.com', 'mail.local')
  )
  .map(([local, domain]) => `${local}@${domain}`);

const arbFullName = arbFromAlphabet(NAME_ALPHABET, 3, 24);

const arbOrgName = arbFromAlphabet(ORG_ALPHABET, 3, 32);

const pickFrom = <T>(items: readonly T[]): fc.Arbitrary<T> => {
  if (items.length === 0) {
    throw new Error('pickFrom: empty input');
  }
  return fc.integer({ min: 0, max: items.length - 1 }).map((i) => items[i] as T);
};

interface BuildOrgOptions {
  userIds: readonly string[];
  organizationId: string;
  organizationName: string;
}

const arbOrgSlice = (
  opts: BuildOrgOptions
): fc.Arbitrary<{
  memberships: MembershipFixture[];
  trips: TripFixture[];
  participants: TripParticipantFixture[];
}> => {
  const { userIds, organizationId } = opts;

  if (userIds.length === 0) {
    return fc.constant({ memberships: [], trips: [], participants: [] });
  }

  const arbMembership = (userId: string): fc.Arbitrary<MembershipFixture> =>
    fc.record({
      id: arbUuid,
      organizationId: fc.constant(organizationId),
      userId: fc.constant(userId),
      role: fc.constantFrom(...membershipRoles),
      status: fc.constantFrom(...membershipStatuses),
      deletedAt: fc.option(arbDate, { nil: null, freq: 5 })
    });

  const arbTrip = (driverUserId: string | null): fc.Arbitrary<TripFixture> =>
    fc.record({
      id: arbUuid,
      organizationId: fc.constant(organizationId),
      tripType: fc.constantFrom(...tripTypes),
      currentStatus: fc.constantFrom(...tripStatuses),
      driverUserId: fc.constant(driverUserId),
      plannedDate: arbDate
    });

  const memberships = fc
    .uniqueArray(pickFrom(userIds), {
      minLength: 1,
      maxLength: userIds.length,
      selector: (id) => id
    })
    .chain((selectedUsers) =>
      fc
        .tuple(...selectedUsers.map((uid) => arbMembership(uid)))
        .map((arr) => arr as MembershipFixture[])
    );

  return memberships.chain((mships) => {
    const tripCount = fc.integer({ min: 0, max: 3 });
    return tripCount.chain((n) => {
      if (n === 0) return fc.constant({ memberships: mships, trips: [], participants: [] });
      const trips = fc
        .array(
          fc
            .option(pickFrom(userIds), { nil: null, freq: 3 })
            .chain((driverId) => arbTrip(driverId)),
          { minLength: n, maxLength: n }
        )
        .map((arr) => arr);

      return trips.chain((tripList) => {
        const participantArbs = tripList.map((trip) =>
          fc
            .uniqueArray(pickFrom(userIds), {
              minLength: 1,
              maxLength: Math.min(userIds.length, 4),
              selector: (id) => id
            })
            .chain((users) =>
              fc.tuple(
                ...users.map((uid) =>
                  fc.record({
                    id: arbUuid,
                    tripId: fc.constant(trip.id),
                    organizationId: fc.constant(organizationId),
                    userId: fc.constant(uid),
                    role: fc.constantFrom(...tripParticipantRoles),
                    deletedAt: fc.option(arbDate, { nil: null, freq: 5 })
                  })
                )
              )
            )
        );
        if (participantArbs.length === 0) {
          return fc.constant({ memberships: mships, trips: tripList, participants: [] });
        }
        return fc.tuple(...participantArbs).map((groups) => ({
          memberships: mships,
          trips: tripList,
          participants: groups.flat() as TripParticipantFixture[]
        }));
      });
    });
  });
};

const arbUserPool = (): fc.Arbitrary<UserFixture[]> =>
  fc.integer({ min: 2, max: 6 }).chain((n) =>
    fc
      .array(
        fc.record({
          id: arbUuid,
          email: arbEmail,
          fullName: arbFullName
        }),
        { minLength: n, maxLength: n }
      )
      .map((users) => {
        const seen = new Set<string>();
        return users.map((u) => {
          let id = u.id;
          while (seen.has(id)) id = `${id}-x`;
          seen.add(id);
          return { ...u, id };
        });
      })
  );

const arbOrgPool = (count: number): fc.Arbitrary<OrganizationFixture[]> =>
  fc.array(
    fc.record({
      id: arbUuid,
      name: arbOrgName
    }),
    { minLength: count, maxLength: count }
  );

/** Single-org user graph. */
export const arbUserOrgGraph: fc.Arbitrary<UserOrgGraph> = arbUserPool().chain((users) =>
  arbOrgPool(1).chain(([org]) => {
    if (!org) {
      return fc.constant<UserOrgGraph>({
        users,
        organizations: [],
        memberships: [],
        trips: [],
        participants: []
      });
    }
    return arbOrgSlice({
      userIds: users.map((u) => u.id),
      organizationId: org.id,
      organizationName: org.name
    }).map(({ memberships, trips, participants }) => ({
      users,
      organizations: [org],
      memberships,
      trips,
      participants
    }));
  })
);

/** Multi-org user graph (2–3 orgs sharing a user pool). */
export const arbMultiOrgUserGraph: fc.Arbitrary<UserOrgGraph> = arbUserPool().chain((users) =>
  fc.integer({ min: 2, max: 3 }).chain((orgCount) =>
    arbOrgPool(orgCount).chain((orgs) =>
      fc
        .tuple(
          ...orgs.map((org) =>
            arbOrgSlice({
              userIds: users.map((u) => u.id),
              organizationId: org.id,
              organizationName: org.name
            })
          )
        )
        .map((slices) => {
          const memberships: MembershipFixture[] = [];
          const trips: TripFixture[] = [];
          const participants: TripParticipantFixture[] = [];
          for (const slice of slices) {
            memberships.push(...slice.memberships);
            trips.push(...slice.trips);
            participants.push(...slice.participants);
          }
          return {
            users,
            organizations: orgs,
            memberships,
            trips,
            participants
          } satisfies UserOrgGraph;
        })
    )
  )
);
