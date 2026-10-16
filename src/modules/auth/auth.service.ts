import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  AccountStatus,
  type Admin,
  type Provider,
  type Role,
  type Seeker,
  type User,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  AdminLoginDto,
  ProviderLoginDto,
  SeekerLoginDto,
} from './dto/login.dto.js';
import type {
  AdminSignupDto,
  ProviderSignupDto,
  SeekerSignupDto,
} from './dto/signup.dto.js';
import {
  ROLE_NAMES,
  toAuthRoleLabel,
  type AuthRoleLabel,
} from './role.constants.js';

export type AuthUser = {
  id: string;
  name: string;
  /** Role profile row id (admins/seekers/providers). */
  profileId: string | null;
  email: string | null;
  phone: string | null;
  role: AuthRoleLabel;
  status: AccountStatus;
};

export type AuthResponse = {
  accessToken: string;
  user: AuthUser;
};

type UserWithRelations = User & {
  role: Role;
  admin: Admin | null;
  seeker: Seeker | null;
  provider: Provider | null;
};

const userInclude = {
  role: true,
  admin: true,
  seeker: true,
  provider: true,
} as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async adminSignup(dto: AdminSignupDto): Promise<AuthResponse> {
    const email = this.normalizeEmail(dto.email);
    await this.ensureEmailAvailable(email);
    const role = await this.requireRole(ROLE_NAMES.ADMIN);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: dto.name.trim(),
          password: await this.hashPassword(dto.password),
          roleId: role.id,
          status: AccountStatus.ACTIVE,
          admin: {
            create: { email },
          },
        },
        include: userInclude,
      });
      return created;
    });

    return this.toAuthResponse(user);
  }

  async adminLogin(dto: AdminLoginDto): Promise<AuthResponse> {
    const email = this.normalizeEmail(dto.email);
    const admin = await this.prisma.admin.findUnique({
      where: { email },
      include: {
        user: { include: userInclude },
      },
    });

    if (!admin || admin.user.role.roleName !== ROLE_NAMES.ADMIN) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    await this.assertPassword(admin.user.password, dto.password);
    return this.toAuthResponse(admin.user);
  }

  async seekerSignup(dto: SeekerSignupDto): Promise<AuthResponse> {
    const email = this.normalizeEmail(dto.email);
    await this.ensureEmailAvailable(email);
    const role = await this.requireRole(ROLE_NAMES.SEEKER);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        password: await this.hashPassword(dto.password),
        roleId: role.id,
        status: AccountStatus.ACTIVE,
        seeker: {
          create: { email },
        },
      },
      include: userInclude,
    });

    return this.toAuthResponse(user);
  }

  async seekerLogin(dto: SeekerLoginDto): Promise<AuthResponse> {
    const email = this.normalizeEmail(dto.email);
    const seeker = await this.prisma.seeker.findUnique({
      where: { email },
      include: {
        user: { include: userInclude },
      },
    });

    if (!seeker || seeker.user.role.roleName !== ROLE_NAMES.SEEKER) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    await this.assertPassword(seeker.user.password, dto.password);
    return this.toAuthResponse(seeker.user);
  }

  async providerSignup(dto: ProviderSignupDto): Promise<AuthResponse> {
    const phone = this.normalizePhone(dto.phone);
    if (!phone) {
      throw new ConflictException('Enter a valid phone number.');
    }

    const existing = await this.prisma.provider.findUnique({ where: { phone } });
    if (existing) {
      throw new ConflictException('An account with this phone already exists.');
    }

    const role = await this.requireRole(ROLE_NAMES.PROVIDER);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        password: await this.hashPassword(dto.password),
        roleId: role.id,
        status: AccountStatus.PENDING,
        provider: {
          create: {
            phone,
            idCardFront: dto.idFrontUrl,
            idCardBack: dto.idBackUrl,
          },
        },
      },
      include: userInclude,
    });

    return this.toAuthResponse(user);
  }

  async providerLogin(dto: ProviderLoginDto): Promise<AuthResponse> {
    const phone = this.normalizePhone(dto.phone);
    const provider = await this.prisma.provider.findUnique({
      where: { phone },
      include: {
        user: { include: userInclude },
      },
    });

    if (!provider || provider.user.role.roleName !== ROLE_NAMES.PROVIDER) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    await this.assertPassword(provider.user.password, dto.password);
    return this.toAuthResponse(provider.user);
  }

  private async requireRole(roleName: string): Promise<Role> {
    const role = await this.prisma.role.findUnique({ where: { roleName } });
    if (!role || role.status !== 'ACTIVE') {
      throw new ConflictException(`Role "${roleName}" is not available.`);
    }
    return role;
  }

  private async ensureEmailAvailable(email: string) {
    const [admin, seeker] = await Promise.all([
      this.prisma.admin.findUnique({ where: { email } }),
      this.prisma.seeker.findUnique({ where: { email } }),
    ]);
    if (admin || seeker) {
      throw new ConflictException('An account with this email already exists.');
    }
  }

  private async assertPassword(
    hashedPassword: string,
    password: string,
  ): Promise<void> {
    const match = await bcrypt.compare(password, hashedPassword);
    if (!match) {
      throw new UnauthorizedException('Invalid credentials.');
    }
  }

  private async hashPassword(password: string) {
    return bcrypt.hash(password, 10);
  }

  private toAuthResponse(user: UserWithRelations): AuthResponse {
    const role = toAuthRoleLabel(user.role.roleName);
    const email = user.admin?.email ?? user.seeker?.email ?? null;
    const phone = user.provider?.phone ?? null;
    const profileId =
      user.admin?.id ?? user.seeker?.id ?? user.provider?.id ?? null;

    const payload = {
      sub: user.id,
      role,
      email,
      phone,
      profileId,
    };

    return {
      accessToken: this.jwt.sign(payload),
      user: {
        id: user.id,
        profileId,
        name: user.name,
        email,
        phone,
        role,
        status: user.status,
      },
    };
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private normalizePhone(phone: string) {
    return phone.replace(/\D/g, '');
  }
}
