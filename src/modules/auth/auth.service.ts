import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  AccountStatus,
  type Provider,
  type Role,
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
  /** Provider profile id when role is PROVIDER; otherwise null. */
  profileId: string | null;
  phone: string;
  role: AuthRoleLabel;
  status: AccountStatus;
};

export type AuthResponse = {
  accessToken: string;
  user: AuthUser;
};

type UserWithRelations = User & {
  role: Role;
  provider: Provider | null;
};

const userInclude = {
  role: true,
  provider: true,
} as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async adminSignup(dto: AdminSignupDto): Promise<AuthResponse> {
    const phone = this.requirePhone(dto.phone);
    await this.ensurePhoneAvailable(phone);
    const role = await this.requireRole(ROLE_NAMES.ADMIN);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        phone,
        password: await this.hashPassword(dto.password),
        roleId: role.id,
        status: AccountStatus.ACTIVE,
      },
      include: userInclude,
    });

    return this.toAuthResponse(user);
  }

  async adminLogin(dto: AdminLoginDto): Promise<AuthResponse> {
    return this.loginByPhoneAndRole(dto.phone, dto.password, ROLE_NAMES.ADMIN);
  }

  async seekerSignup(dto: SeekerSignupDto): Promise<AuthResponse> {
    const phone = this.requirePhone(dto.phone);
    await this.ensurePhoneAvailable(phone);
    const role = await this.requireRole(ROLE_NAMES.SEEKER);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        phone,
        password: await this.hashPassword(dto.password),
        roleId: role.id,
        status: AccountStatus.ACTIVE,
      },
      include: userInclude,
    });

    return this.toAuthResponse(user);
  }

  async seekerLogin(dto: SeekerLoginDto): Promise<AuthResponse> {
    return this.loginByPhoneAndRole(dto.phone, dto.password, ROLE_NAMES.SEEKER);
  }

  async providerSignup(dto: ProviderSignupDto): Promise<AuthResponse> {
    const phone = this.requirePhone(dto.phone);
    await this.ensurePhoneAvailable(phone);
    const role = await this.requireRole(ROLE_NAMES.PROVIDER);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        phone,
        password: await this.hashPassword(dto.password),
        roleId: role.id,
        status: AccountStatus.PENDING,
        provider: {
          create: {
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
    return this.loginByPhoneAndRole(
      dto.phone,
      dto.password,
      ROLE_NAMES.PROVIDER,
    );
  }

  private async loginByPhoneAndRole(
    rawPhone: string,
    password: string,
    roleName: string,
  ): Promise<AuthResponse> {
    const phone = this.normalizePhone(rawPhone);
    const user = await this.prisma.user.findFirst({
      where: {
        phone,
        role: { roleName },
      },
      include: userInclude,
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    await this.assertPassword(user.password, password);
    return this.toAuthResponse(user);
  }

  private async requireRole(roleName: string): Promise<Role> {
    const role = await this.prisma.role.findUnique({ where: { roleName } });
    if (!role || role.status !== 'ACTIVE') {
      throw new ConflictException(`Role "${roleName}" is not available.`);
    }
    return role;
  }

  private requirePhone(raw: string): string {
    const phone = this.normalizePhone(raw);
    if (!phone) {
      throw new ConflictException('Enter a valid phone number.');
    }
    return phone;
  }

  private async ensurePhoneAvailable(phone: string) {
    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing) {
      throw new ConflictException('An account with this phone already exists.');
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
    const profileId = user.provider?.id ?? null;

    const payload = {
      sub: user.id,
      role,
      phone: user.phone,
      profileId,
    };

    return {
      accessToken: this.jwt.sign(payload),
      user: {
        id: user.id,
        profileId,
        name: user.name,
        phone: user.phone,
        role,
        status: user.status,
      },
    };
  }

  private normalizePhone(phone: string) {
    return phone.replace(/\D/g, '');
  }
}
