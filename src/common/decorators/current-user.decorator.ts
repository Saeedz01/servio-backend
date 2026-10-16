import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

export type JwtPayload = {
  sub: string;
  role: string;
  email?: string | null;
  phone?: string | null;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
    return request.user;
  },
);
