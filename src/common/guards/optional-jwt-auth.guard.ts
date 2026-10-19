import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { JwtPayload } from '../decorators/current-user.decorator.js';

/**
 * Attaches JWT payload when a valid Bearer token is present.
 * Does not reject missing/invalid tokens (guest-friendly routes).
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return true;
    }

    const token = header.slice('Bearer '.length).trim();
    if (!token) return true;

    try {
      request.user = this.jwt.verify<JwtPayload>(token);
    } catch {
      // Treat invalid token as unauthenticated for optional routes.
    }
    return true;
  }
}
