import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import {
  AdminLoginDto,
  ProviderLoginDto,
  SeekerLoginDto,
} from './dto/login.dto.js';
import {
  AdminSignupDto,
  ProviderSignupDto,
  SeekerSignupDto,
} from './dto/signup.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('admin/signup')
  adminSignup(@Body() dto: AdminSignupDto) {
    return this.authService.adminSignup(dto);
  }

  @Post('admin/login')
  @HttpCode(HttpStatus.OK)
  adminLogin(@Body() dto: AdminLoginDto) {
    return this.authService.adminLogin(dto);
  }

  @Post('seeker/signup')
  seekerSignup(@Body() dto: SeekerSignupDto) {
    return this.authService.seekerSignup(dto);
  }

  @Post('seeker/login')
  @HttpCode(HttpStatus.OK)
  seekerLogin(@Body() dto: SeekerLoginDto) {
    return this.authService.seekerLogin(dto);
  }

  @Post('provider/signup')
  providerSignup(@Body() dto: ProviderSignupDto) {
    return this.authService.providerSignup(dto);
  }

  @Post('provider/login')
  @HttpCode(HttpStatus.OK)
  providerLogin(@Body() dto: ProviderLoginDto) {
    return this.authService.providerLogin(dto);
  }
}
