import { AccountStatus, PrismaClient, RoleStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { ROLE_NAMES } from '../src/modules/auth/role.constants.js';
import { DEMO_PROVIDER_SERVICES } from './seed-services-data.js';

const prisma = new PrismaClient();
const DEMO_PROVIDER_PHONE = '03044595469';

async function ensureRoles() {
  for (const roleName of [
    ROLE_NAMES.ADMIN,
    ROLE_NAMES.SEEKER,
    ROLE_NAMES.PROVIDER,
  ] as const) {
    await prisma.role.upsert({
      where: { roleName },
      create: {
        roleName,
        status: RoleStatus.ACTIVE,
      },
      update: {
        status: RoleStatus.ACTIVE,
      },
    });
  }
}

async function upsertAdmin() {
  const email = 'saeedzafar4595@gmail.com';
  const password = await bcrypt.hash('admin@123', 10);
  const role = await prisma.role.findUniqueOrThrow({
    where: { roleName: ROLE_NAMES.ADMIN },
  });

  const existing = await prisma.admin.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.userId },
      data: {
        name: 'Saeed Zafar',
        password,
        status: AccountStatus.ACTIVE,
        roleId: role.id,
      },
    });
    return;
  }

  await prisma.user.create({
    data: {
      name: 'Saeed Zafar',
      password,
      roleId: role.id,
      status: AccountStatus.ACTIVE,
      admin: { create: { email } },
    },
  });
}

async function upsertSeeker() {
  const email = 'seeker@gmail.com';
  const password = await bcrypt.hash('seeker@123', 10);
  const role = await prisma.role.findUniqueOrThrow({
    where: { roleName: ROLE_NAMES.SEEKER },
  });

  const existing = await prisma.seeker.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.userId },
      data: {
        name: 'Demo Seeker',
        password,
        status: AccountStatus.ACTIVE,
        roleId: role.id,
      },
    });
    return;
  }

  await prisma.user.create({
    data: {
      name: 'Demo Seeker',
      password,
      roleId: role.id,
      status: AccountStatus.ACTIVE,
      seeker: { create: { email } },
    },
  });
}

async function upsertProvider() {
  const phone = DEMO_PROVIDER_PHONE;
  const password = await bcrypt.hash('provider@123', 10);
  const role = await prisma.role.findUniqueOrThrow({
    where: { roleName: ROLE_NAMES.PROVIDER },
  });
  const placeholderFront = 'https://placehold.co/600x400?text=ID+Front';
  const placeholderBack = 'https://placehold.co/600x400?text=ID+Back';

  const existing = await prisma.provider.findUnique({ where: { phone } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.userId },
      data: {
        name: 'Demo Provider',
        password,
        status: AccountStatus.VERIFIED,
        roleId: role.id,
      },
    });
    await prisma.provider.update({
      where: { id: existing.id },
      data: {
        idCardFront: existing.idCardFront || placeholderFront,
        idCardBack: existing.idCardBack || placeholderBack,
      },
    });
    return;
  }

  await prisma.user.create({
    data: {
      name: 'Demo Provider',
      password,
      roleId: role.id,
      status: AccountStatus.VERIFIED,
      provider: {
        create: {
          phone,
          idCardFront: placeholderFront,
          idCardBack: placeholderBack,
        },
      },
    },
  });
}

async function seedDemoProviderServices() {
  const provider = await prisma.provider.findUnique({
    where: { phone: DEMO_PROVIDER_PHONE },
  });
  if (!provider) {
    throw new Error('Demo provider not found; cannot seed services.');
  }

  for (const item of DEMO_PROVIDER_SERVICES) {
    const existing = await prisma.service.findFirst({
      where: {
        providerId: provider.id,
        title: item.title,
      },
    });

    if (existing) {
      await prisma.service.update({
        where: { id: existing.id },
        data: {
          categoryId: item.categoryId,
          description: item.description,
          imageUrl: item.imageUrl,
          address: item.address,
          lat: item.lat,
          lng: item.lng,
          radiusKm: item.radiusKm,
          priceAmount: item.priceAmount,
          priceUnit: item.priceUnit,
          availability: item.availability,
          status: item.status,
        },
      });
      continue;
    }

    await prisma.service.create({
      data: {
        providerId: provider.id,
        categoryId: item.categoryId,
        title: item.title,
        description: item.description,
        imageUrl: item.imageUrl,
        address: item.address,
        lat: item.lat,
        lng: item.lng,
        radiusKm: item.radiusKm,
        priceAmount: item.priceAmount,
        priceUnit: item.priceUnit,
        availability: item.availability,
        status: item.status,
      },
    });
  }
}

async function main() {
  await ensureRoles();
  await upsertAdmin();
  await upsertSeeker();
  await upsertProvider();
  await seedDemoProviderServices();
  console.log('Seeded roles, demo accounts, and demo provider services.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
