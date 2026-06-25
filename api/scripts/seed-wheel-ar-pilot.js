#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const LOCATIONS = [
  {
    code: 'WHEEL-CHICHESTER',
    name: 'Chichester Wheel A&E',
    tradingName: 'Wheel A+E LTD',
    addressLine1: 'Harwoods Jaguar',
    addressLine2: 'Terminus Road',
    city: 'Chichester',
    state: 'West Sussex',
    postalCode: 'PO19 8TX',
    country: 'GB',
    phone: '+442394211001',
    alternateAddress: 'Terminus Road, Apuldram, GB, PO19 8GS',
  },
  {
    code: 'WHEEL-BOGNOR',
    name: 'Bognor Regis Wheel A&E',
    tradingName: 'Water Front Accident Repair Centre',
    addressLine1: 'Water Front Accident Repair Centre',
    addressLine2: 'Shripney Road',
    city: 'Bognor Regis',
    state: 'West Sussex',
    postalCode: 'PO22 9NJ',
    country: 'GB',
    phone: null,
    alternateAddress: null,
  },
  {
    code: 'WHEEL-BASINGSTOKE',
    name: 'Basingstoke Wheel A&E',
    tradingName: 'Wheel A&E',
    addressLine1: 'Wheel A&E',
    addressLine2: 'Houndmills Road',
    city: 'Basingstoke',
    state: 'Hampshire',
    postalCode: 'RG21 6XL',
    country: 'GB',
    phone: '+442394211001',
    alternateAddress: 'Wheel A&E, Houndmills Road, Basingstoke, GB, RG21 6XL',
  },
];

const BOOKING_FIELDS = [
  {
    questionKey: 'phone',
    label: 'Phone',
    type: 'phone',
    required: true,
    optionsJson: {
      placeholder: 'Enter phone number',
      visibility: 'PUBLIC',
      sortOrder: 10,
      defaultValue: '+44',
    },
  },
  {
    questionKey: 'vehicle_registration',
    label: 'Reg Number',
    type: 'vehicle_registration',
    required: true,
    optionsJson: {
      placeholder: 'Reg Number',
      visibility: 'PUBLIC',
      sortOrder: 30,
    },
  },
  {
    questionKey: 'locking_wheel_nut',
    label: 'Locking Wheel Nut Readily Available?',
    type: 'checkbox',
    required: true,
    optionsJson: {
      visibility: 'PUBLIC',
      sortOrder: 40,
      consentMode: true,
    },
  },
];

async function main() {
  const tenants = await prisma.company.findMany({
    where: { name: { equals: 'Wheel A&R', mode: 'insensitive' } },
    select: { id: true, name: true },
  });
  if (tenants.length !== 1) {
    throw new Error(`Expected exactly one Wheel A&R tenant, found ${tenants.length}. No pilot data was changed.`);
  }

  const tenant = tenants[0];
  const settings = await prisma.tenantSetting.findUnique({
    where: { tenantId: tenant.id },
    select: { businessConfigJson: true },
  });
  if (settings) {
    const currentConfig = settings.businessConfigJson && typeof settings.businessConfigJson === 'object' ? settings.businessConfigJson : {};
    const currentWorkflow = currentConfig.bookingWorkflow && typeof currentConfig.bookingWorkflow === 'object' ? currentConfig.bookingWorkflow : {};
    await prisma.tenantSetting.update({
      where: { tenantId: tenant.id },
      data: {
        defaultTimezone: 'Europe/London',
        businessConfigJson: {
          ...currentConfig,
          bookingWorkflow: {
            ...currentWorkflow,
            locationFirstScheduling: true,
            locationRequiredForBooking: true,
            technicianAssignmentRequired: false,
          },
        },
      },
    });
  }

  for (const input of LOCATIONS) {
    const existing = await prisma.location.findFirst({
      where: { companyId: tenant.id, code: input.code },
      select: { id: true },
    });
    const locationData = {
      name: input.name,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2,
      city: input.city,
      state: input.state,
      postalCode: input.postalCode,
      country: input.country,
      phone: input.phone,
      timezone: 'Europe/London',
      bookingLeadTimeMins: 120,
      isActive: true,
      metadataJson: {
        tradingName: input.tradingName,
        alternateAddress: input.alternateAddress,
        slotMinutes: 30,
        bookingCutoffMins: 120,
        arrivalInstructions: 'Report to reception when you arrive.',
        parkingInstructions: 'Use the customer parking area and follow on-site signs.',
        pilotSource: 'wheel_ar_launch_readiness',
      },
    };
    const location = existing
      ? await prisma.location.update({
          where: { id: existing.id },
          data: locationData,
        })
      : await prisma.location.create({
          data: {
            companyId: tenant.id,
            code: input.code,
            kind: 'BRANCH',
            ...locationData,
          },
        });

    for (let weekday = 0; weekday <= 6; weekday += 1) {
      const isClosed = weekday === 0;
      await prisma.locationBusinessHour.upsert({
        where: { locationId_weekday: { locationId: location.id, weekday } },
        create: {
          companyId: tenant.id,
          locationId: location.id,
          weekday,
          startMinute: isClosed ? null : 9 * 60,
          endMinute: isClosed ? null : 17 * 60,
          isClosed,
        },
        update: {
          startMinute: isClosed ? null : 9 * 60,
          endMinute: isClosed ? null : 17 * 60,
          isClosed,
        },
      });
    }
  }

  for (const field of BOOKING_FIELDS) {
    await prisma.bookingQuestion.upsert({
      where: {
        companyId_questionKey: {
          companyId: tenant.id,
          questionKey: field.questionKey,
        },
      },
      create: {
        companyId: tenant.id,
        ...field,
      },
      update: {
        label: field.label,
        type: field.type,
        required: field.required,
        optionsJson: field.optionsJson,
        isActive: true,
      },
    });
  }

  console.log(`Wheel A&R pilot ready: ${LOCATIONS.length} locations, ${BOOKING_FIELDS.length} booking fields`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
