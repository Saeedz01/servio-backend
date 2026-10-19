import { AccountStatus, PrismaClient, RoleStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { ROLE_NAMES } from '../src/modules/auth/role.constants.js';
import { SERVICE_CATEGORIES } from './seed-categories-data.js';
import { DEMO_PROVIDER_SERVICES } from './seed-services-data.js';

const prisma = new PrismaClient();

const DEMO_ADMIN_PHONE = '03011111111';
const DEMO_SEEKER_PHONE = '03022222222';
const DEMO_PROVIDER_PHONE = '03044595469';

async function ensureServiceCategories() {
  for (const category of SERVICE_CATEGORIES) {
    await prisma.serviceCategory.upsert({
      where: { slug: category.slug },
      create: {
        name: category.name,
        slug: category.slug,
        description: category.description,
        isActive: true,
      },
      update: {
        name: category.name,
        description: category.description,
        isActive: true,
      },
    });
  }
}

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

async function upsertUserByPhone(input: {
  phone: string;
  name: string;
  password: string;
  roleName: string;
  status: AccountStatus;
}) {
  const role = await prisma.role.findUniqueOrThrow({
    where: { roleName: input.roleName },
  });
  const password = await bcrypt.hash(input.password, 10);

  const existing = await prisma.user.findUnique({ where: { phone: input.phone } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        password,
        status: input.status,
        roleId: role.id,
      },
    });
    return existing.id;
  }

  const created = await prisma.user.create({
    data: {
      name: input.name,
      phone: input.phone,
      password,
      roleId: role.id,
      status: input.status,
    },
  });
  return created.id;
}

async function upsertAdmin() {
  await upsertUserByPhone({
    phone: DEMO_ADMIN_PHONE,
    name: 'Saeed Zafar',
    password: 'admin@123',
    roleName: ROLE_NAMES.ADMIN,
    status: AccountStatus.ACTIVE,
  });
}

async function upsertSeeker() {
  await upsertUserByPhone({
    phone: DEMO_SEEKER_PHONE,
    name: 'Demo Seeker',
    password: 'seeker@123',
    roleName: ROLE_NAMES.SEEKER,
    status: AccountStatus.ACTIVE,
  });
}

async function upsertProvider() {
  const placeholderFront = 'https://placehold.co/600x400?text=ID+Front';
  const placeholderBack = 'https://placehold.co/600x400?text=ID+Back';
  const role = await prisma.role.findUniqueOrThrow({
    where: { roleName: ROLE_NAMES.PROVIDER },
  });
  const password = await bcrypt.hash('provider@123', 10);

  const existing = await prisma.user.findUnique({
    where: { phone: DEMO_PROVIDER_PHONE },
    include: { provider: true },
  });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: 'Demo Provider',
        password,
        status: AccountStatus.VERIFIED,
        roleId: role.id,
      },
    });

    if (existing.provider) {
      await prisma.provider.update({
        where: { id: existing.provider.id },
        data: {
          idCardFront: existing.provider.idCardFront || placeholderFront,
          idCardBack: existing.provider.idCardBack || placeholderBack,
        },
      });
    } else {
      await prisma.provider.create({
        data: {
          userId: existing.id,
          idCardFront: placeholderFront,
          idCardBack: placeholderBack,
        },
      });
    }
    return;
  }

  await prisma.user.create({
    data: {
      name: 'Demo Provider',
      phone: DEMO_PROVIDER_PHONE,
      password,
      roleId: role.id,
      status: AccountStatus.VERIFIED,
      provider: {
        create: {
          idCardFront: placeholderFront,
          idCardBack: placeholderBack,
        },
      },
    },
  });
}

async function seedDemoProviderServices() {
  const user = await prisma.user.findUnique({
    where: { phone: DEMO_PROVIDER_PHONE },
    include: { provider: true },
  });
  const provider = user?.provider;
  if (!provider) {
    throw new Error('Demo provider not found; cannot seed services.');
  }

  const categories = await prisma.serviceCategory.findMany({
    select: { id: true, slug: true },
  });
  const categoryIdBySlug = new Map(
    categories.map((category) => [category.slug, category.id]),
  );

  for (const item of DEMO_PROVIDER_SERVICES) {
    const categoryId = categoryIdBySlug.get(item.categorySlug);
    if (!categoryId) {
      throw new Error(
        `Missing service category for slug "${item.categorySlug}".`,
      );
    }

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
          categoryId,
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
        categoryId,
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
  await ensureServiceCategories();
  await upsertAdmin();
  await upsertSeeker();
  await upsertProvider();
  await seedDemoProviderServices();
  console.log(
    'Seeded roles, service categories, phone-based demo accounts, and provider services.',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
