import { strict as assert } from 'node:assert';
import { CalendarService } from '../src/calendar/calendar.service';
import { BookingsService } from '../src/bookings/bookings.service';
import { JobsService } from '../src/jobs/jobs.service';

process.env.MYTITAN_FEATURE_CALENDAR_V2_HARD_CONFLICTS = 'on';
process.env.MYTITAN_FEATURE_AUTOMATIONS_V1 = 'off';
process.env.MYTITAN_FEATURE_NOTIFICATIONS_V1 = 'off';

const noopNotifications = { sendEntityUpdate: async () => ({}) };
const noopAudit = { log: async () => {} };
const noopAutomations = { getSettings: async () => ({ bookingRemindersEnabled: false }) };
const noopService = new Proxy(
  {},
  {
    get: () => async () => ({}),
  },
);

async function testListBookingsIncludesTenantScope() {
  let userWhere: any = null;
  let bookingWhere: any = null;
  const prisma = {
    user: {
      findMany: async ({ where }: any) => {
        userWhere = where;
        return [{ id: 'tech-1', email: 'tech@tenant.test' }];
      },
    },
    booking: {
      findMany: async ({ where }: any) => {
        bookingWhere = where;
        return [];
      },
    },
  };
  const service = new CalendarService(prisma as any, noopNotifications as any, noopAudit as any);
  await service.listBookings('tenant-123', { from: '2026-02-01T00:00:00Z', to: '2026-02-02T00:00:00Z' });
  assert.strictEqual(userWhere?.companyId, 'tenant-123');
  assert.strictEqual(bookingWhere?.companyId, 'tenant-123');
}

async function testListSchedulesFiltersByTenant() {
  let userWhere: any = null;
  let settingWhere: any = null;
  let exceptionWhere: any = null;
  const prisma = {
    user: {
      findMany: async ({ where }: any) => {
        userWhere = where;
        return [{ id: 'tech-2', email: 'tech2@tenant.test' }];
      },
    },
    techScheduleSetting: {
      findMany: async ({ where }: any) => {
        settingWhere = where;
        return [];
      },
    },
    techScheduleException: {
      findMany: async ({ where }: any) => {
        exceptionWhere = where;
        return [];
      },
    },
    tenantSetting: {
      findUnique: async () => ({ businessConfigJson: {} }),
    },
  };
  const service = new CalendarService(prisma as any, noopNotifications as any, noopAudit as any);
  await service.listSchedules('tenant-abc', { from: '2026-03-01T00:00:00Z', to: '2026-03-08T00:00:00Z' });
  assert.strictEqual(userWhere?.companyId, 'tenant-abc');
  assert.strictEqual(settingWhere?.companyId, 'tenant-abc');
  assert.strictEqual(exceptionWhere?.companyId, 'tenant-abc');
}

async function testBookingCreateRespectsTechnicianLock() {
  const lockInvocations: string[] = [];
  const conflictBooking = { id: 'conflict-1', startsAt: new Date(), endsAt: new Date(Date.now() + 60 * 60 * 1000) };
  const tx = {
    booking: {
      findMany: async () => [conflictBooking],
      create: async () => ({ id: 'new-booking' }),
    },
    $executeRaw: async (query: TemplateStringsArray) => {
      lockInvocations.push(query[0]);
    },
  };
  const prisma = {
    service: {
      findMany: async () => [],
    },
    serviceCatalogItem: {
      findFirst: async () => null,
    },
    job: {
      findFirst: async () => ({ id: 'job-1', companyId: 'tenant', status: 'OPEN' }),
    },
    location: {
      findFirst: async () => ({ id: 'loc-1', companyId: 'tenant' }),
    },
    user: {
      findFirst: async () => ({ id: 'tech-99', companyId: 'tenant' }),
    },
    tenantSetting: {
      findUnique: async () => ({ businessConfigJson: {} }),
    },
    $transaction: async (callback: any) => callback(tx),
  };
  const service = new BookingsService(
    prisma as any,
    noopAudit as any,
    noopNotifications as any,
    noopAutomations as any,
    noopService as any,
    noopService as any,
    noopService as any,
    noopService as any,
    noopService as any,
    noopService as any,
  );
  let thrown: any = null;
  try {
    await service.create('tenant', 'user-xyz', {
      jobId: 'job-1',
      locationId: 'loc-1',
      assignedUserId: 'tech-99',
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    } as any);
  } catch (error: any) {
    thrown = error;
  }
  assert.ok(thrown, 'Expected booking creation to throw ConflictException');
  assert.strictEqual(thrown.constructor?.name, 'ConflictException');
  assert.ok(lockInvocations.some((query) => query.includes('pg_advisory_xact_lock')));
}

async function testJobBulkIdempotentState() {
  let updateCalls = 0;
  let findFirstCalls = 0;
  const prisma = {
    job: {
      findFirst: async ({ where }: any) => {
        findFirstCalls += 1;
        return {
          id: where.id,
          companyId: where.companyId,
          status: 'COMPLETED',
          completedAt: new Date(),
          assignedUserId: 'tech',
          locationId: 'loc',
          tags: ['tag'],
          invoiceDueAt: new Date('2026-02-01T00:00:00Z'),
        };
      },
      update: async () => {
        updateCalls += 1;
        throw new Error('Update should not run for idempotent bulk');
      },
    },
  };
  const jobsService = new JobsService(
    noopService as any,
    noopService as any,
    prisma as any,
    { log: async () => {} } as any,
    {} as any,
    { notifyJobCompleted: async () => {} } as any,
    {} as any,
    noopService as any,
    noopService as any,
    noopService as any,
    noopService as any,
    noopService as any,
  );
  const result = await jobsService.bulk('tenant', 'actor', {
    jobIds: ['job-1'],
    operation: 'setStatus',
    status: 'COMPLETED',
  } as any);
  assert.strictEqual(result.successCount, 1);
  assert.strictEqual(result.failed.length, 0);
  assert.strictEqual(updateCalls, 0);
  assert.strictEqual(findFirstCalls, 1);
}

async function main() {
  await testListBookingsIncludesTenantScope();
  await testListSchedulesFiltersByTenant();
  await testBookingCreateRespectsTechnicianLock();
  await testJobBulkIdempotentState();
  console.log('Scheduling and booking tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
