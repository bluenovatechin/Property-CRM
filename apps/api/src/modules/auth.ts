import { Body, Controller, Get, HttpCode, Injectable, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import { TokenType, User } from '@prisma/client';
import bcrypt from 'bcryptjs';
import type { CookieOptions, Request, Response } from 'express';
import { OAuth2Client, TokenPayload } from 'google-auth-library';
import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';
import { z } from 'zod';
import { config } from '../config';
import { ActivityService } from '../common/activity.service';
import { ACCESS_COOKIE, AnyRole, AuthUser, CurrentUser, Public, REFRESH_COOKIE } from '../common/auth';
import { BusinessError } from '../common/errors';
import { MailService } from '../common/mail.service';
import { permissionsFor } from '../common/permissions';
import { addDays, randomToken, sha256 } from '../common/util';
import { parse } from '../common/validation';
import { PrismaService } from '../prisma.service';

function checkTotp(token: string, secret: string): boolean {
  try {
    const res = verifySync({ token: token.trim(), secret: secret.trim() });
    return Boolean(res?.valid);
  } catch {
    return false;
  }
}

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

const passwordSchema = z.string().min(8, 'Use at least 8 characters').max(128);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly activity: ActivityService,
  ) {}

  async login(email: string, password: string, res: Response) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    const invalid = new UnauthorizedException({ code: 'INVALID_LOGIN', message: 'Email or password is incorrect.' });
    if (!user || user.deletedAt) throw invalid;
    if (user.status === 'DISABLED') throw new BusinessError('ACCOUNT_DISABLED', 'This account is disabled. Contact your administrator.', 403);
    if (user.status === 'INVITED' || !user.passwordHash) {
      throw new BusinessError('INVITE_PENDING', 'Please set your password using the link in your invite email.', 401);
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new BusinessError('ACCOUNT_LOCKED', `Too many wrong attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`, 423);
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      const failed = user.failedLogins + 1;
      const lock = failed >= MAX_FAILED_LOGINS;
      await this.prisma.user.update({
        where: { id: user.id },
        data: lock ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60000) } : { failedLogins: failed },
      });
      if (lock) throw new BusinessError('ACCOUNT_LOCKED', `Too many wrong attempts. The account is locked for ${LOCK_MINUTES} minutes.`, 423);
      throw invalid;
    }

    if (user.twoFactorEnabled && user.twoFactorSecret) {
      const tempToken = await this.jwt.signAsync({ sub: user.id, is2FA: true }, { secret: config.jwtAccessSecret, expiresIn: 300 });
      return { requires2FA: true, tempToken };
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
    await this.activity.log(user, user.companyId, { entityType: 'AUTH', entityId: user.id, action: 'login', summary: `${user.name} signed in` });
    const tokens = await this.issueTokens(user.id, res);
    const profile = await this.profile(user.id);
    return { ...profile, ...tokens };
  }

  async issueTokens(userId: string, res: Response) {
    const access = await this.jwt.signAsync({ sub: userId }, { secret: config.jwtAccessSecret, expiresIn: config.accessTtlSeconds });
    const refresh = randomToken(48);
    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: sha256(refresh), expiresAt: addDays(new Date(), config.refreshTtlDays) },
    });
    res.cookie(ACCESS_COOKIE, access, { ...this.cookieBase(), maxAge: config.accessTtlSeconds * 1000 });
    res.cookie(REFRESH_COOKIE, refresh, { ...this.cookieBase(), path: '/api/v1/auth', maxAge: config.refreshTtlDays * 86_400_000 });
    return { accessToken: access, refreshToken: refresh };
  }

  async signAccessToken(userId: string) {
    return this.jwt.signAsync({ sub: userId }, { secret: config.jwtAccessSecret, expiresIn: config.accessTtlSeconds });
  }

  async refresh(req: Request, res: Response, bodyToken?: string) {
    const token = bodyToken || (req.headers['x-refresh-token'] as string) || req.cookies?.[REFRESH_COOKIE];
    if (!token) throw new UnauthorizedException({ code: 'NOT_SIGNED_IN', message: 'Please sign in.' });
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date() || stored.user.status !== 'ACTIVE' || stored.user.deletedAt) {
      this.clearCookies(res);
      throw new UnauthorizedException({ code: 'NOT_SIGNED_IN', message: 'Please sign in again.' });
    }
    // Rotate: each refresh token works once.
    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    const tokens = await this.issueTokens(stored.userId, res);
    return { ok: true, ...tokens };
  }

  async logout(req: Request, res: Response, everywhere = false, userId?: string, bodyToken?: string) {
    const token = bodyToken || (req.headers['x-refresh-token'] as string) || req.cookies?.[REFRESH_COOKIE];
    if (everywhere && userId) {
      await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    } else if (token) {
      await this.prisma.refreshToken.updateMany({ where: { tokenHash: sha256(token), revokedAt: null }, data: { revokedAt: new Date() } });
    }
    this.clearCookies(res);
    return { ok: true };
  }

  async profile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        company: { select: { name: true } },
        propertyAccess: { select: { propertyId: true } },
        tenant: { select: { id: true, fullName: true } },
        owner: { select: { id: true, name: true } },
        teamOwner: { select: { id: true, name: true } },
      },
    });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      company: user.company.name,
      permissions: permissionsFor(user.role),
      propertyIds: user.propertyAccess.map((a) => a.propertyId),
      twoFactorEnabled: user.twoFactorEnabled,
      tenant: user.tenant,
      owner: user.owner,
      teamOwner: user.teamOwner,
    };
  }

  async login2FA(tempToken: string, code: string, res: Response) {
    let payload: { sub: string; is2FA?: boolean };
    try {
      payload = await this.jwt.verifyAsync(tempToken, { secret: config.jwtAccessSecret });
    } catch {
      throw new UnauthorizedException({ code: '2FA_SESSION_EXPIRED', message: 'Verification session expired. Please sign in again.' });
    }
    if (!payload.is2FA) throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: 'Invalid 2FA token.' });
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.deletedAt || user.status !== 'ACTIVE' || !user.twoFactorSecret) {
      throw new UnauthorizedException({ code: 'NOT_SIGNED_IN', message: 'Please sign in again.' });
    }
    const isValid = checkTotp(code, user.twoFactorSecret);
    if (!isValid) {
      throw new BusinessError('INVALID_2FA_CODE', 'Invalid 6-digit code. Please check your authenticator app and try again.', 400);
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
    await this.activity.log(user, user.companyId, { entityType: 'AUTH', entityId: user.id, action: 'login_2fa', summary: `${user.name} signed in with 2FA` });
    const tokens = await this.issueTokens(user.id, res);
    const profile = await this.profile(user.id);
    return { ...profile, ...tokens };
  }

  async generate2FA(u: AuthUser) {
    const secret = generateSecret();
    const otpauth = generateURI({ issuer: 'Property CRM', label: u.email, secret });
    const qrCode = await QRCode.toDataURL(otpauth);
    return { secret, qrCode };
  }

  async enable2FA(u: AuthUser, secret: string, code: string) {
    const isValid = checkTotp(code, secret);
    if (!isValid) {
      throw new BusinessError('INVALID_2FA_CODE', 'Invalid code. Check your authenticator app and enter the 6-digit code.', 400);
    }
    await this.prisma.user.update({ where: { id: u.id }, data: { twoFactorEnabled: true, twoFactorSecret: secret.trim() } });
    await this.activity.log(u, u.companyId, { entityType: 'AUTH', entityId: u.id, action: 'enable_2fa', summary: `${u.name} enabled two-factor authentication` });
    return { ok: true };
  }

  async disable2FA(u: AuthUser, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    if (!user.twoFactorSecret) return { ok: true };
    const isValid = checkTotp(code, user.twoFactorSecret);
    if (!isValid) {
      throw new BusinessError('INVALID_2FA_CODE', 'Invalid code. Enter the 6-digit code from your authenticator app to confirm disabling 2FA.', 400);
    }
    await this.prisma.user.update({ where: { id: u.id }, data: { twoFactorEnabled: false, twoFactorSecret: null } });
    await this.activity.log(u, u.companyId, { entityType: 'AUTH', entityId: u.id, action: 'disable_2fa', summary: `${u.name} disabled two-factor authentication` });
    return { ok: true };
  }

  async googleLogin(credential: string, res: Response) {
    const client = new OAuth2Client(config.googleClientId || undefined);
    let payload: TokenPayload | undefined;
    try {
      const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: config.googleClientId ? config.googleClientId : undefined,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException({ code: 'INVALID_GOOGLE_TOKEN', message: 'Google sign in verification failed.' });
    }
    if (!payload || !payload.email) {
      throw new UnauthorizedException({ code: 'INVALID_GOOGLE_ACCOUNT', message: 'No email returned from Google.' });
    }
    const email = payload.email.toLowerCase().trim();
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ googleId: payload.sub }, { email }], deletedAt: null },
    });
    if (!user) {
      throw new BusinessError(
        'USER_NOT_REGISTERED',
        `No Property CRM account found for ${email}. Please ask your company administrator for an invite.`,
        404,
      );
    }
    if (user.status === 'DISABLED') {
      throw new BusinessError('ACCOUNT_DISABLED', 'This account is disabled. Contact your administrator.', 403);
    }
    if (!user.googleId) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { googleId: payload.sub, status: user.status === 'INVITED' ? 'ACTIVE' : user.status },
      });
    }
    if (user.twoFactorEnabled && user.twoFactorSecret) {
      const tempToken = await this.jwt.signAsync({ sub: user.id, is2FA: true }, { secret: config.jwtAccessSecret, expiresIn: 300 });
      return { requires2FA: true, tempToken };
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
    await this.activity.log(user, user.companyId, { entityType: 'AUTH', entityId: user.id, action: 'google_login', summary: `${user.name} signed in with Google` });
    const tokens = await this.issueTokens(user.id, res);
    const profile = await this.profile(user.id);
    return { ...profile, ...tokens };
  }

  /** Creates a one-time invite/reset token and returns the raw value (only its hash is stored). */
  async createToken(userId: string, type: TokenType): Promise<string> {
    const raw = randomToken(32);
    const hours = type === 'INVITE' ? 48 : 0.5;
    await this.prisma.authToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } });
    await this.prisma.authToken.create({
      data: { userId, type, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + hours * 3_600_000) },
    });
    return raw;
  }

  /**
   * Emails a set-password link. When no email service is configured (SMTP_HOST empty),
   * the link is returned instead so the inviter can share it by WhatsApp/SMS.
   */
  async sendInvite(user: Pick<User, 'id' | 'email' | 'name' | 'role'>): Promise<{ emailed: boolean; inviteUrl?: string }> {
    const token = await this.createToken(user.id, 'INVITE');
    const url = `${config.appUrl}/accept-invite?token=${token}`;
    const tenant = user.role === 'TENANT';
    const sent = await this.mail.send({
      to: user.email,
      subject: tenant ? 'Your tenant portal is ready' : 'You have been invited to Property CRM',
      heading: tenant ? `Welcome, ${user.name}` : `Hello ${user.name}`,
      lines: tenant
        ? ['You can now see your lease, monthly rent and raise maintenance requests online.', 'Set your password to get started. The link is valid for 48 hours.']
        : ['An account has been created for you in Property CRM.', 'Set your password to sign in. The link is valid for 48 hours.'],
      action: { label: 'Set my password', url },
    });
    const emailed = !!config.smtp.host && sent;
    return emailed ? { emailed } : { emailed, inviteUrl: url };
  }

  private async consumeToken(raw: string, type: TokenType) {
    const token = await this.prisma.authToken.findUnique({ where: { tokenHash: sha256(raw) }, include: { user: true } });
    if (!token || token.type !== type || token.usedAt || token.expiresAt < new Date()) {
      throw new BusinessError('LINK_INVALID', 'This link has expired or was already used. Ask for a new one.', 400);
    }
    await this.prisma.authToken.update({ where: { id: token.id }, data: { usedAt: new Date() } });
    return token.user;
  }

  async acceptInvite(rawToken: string, password: string, res: Response) {
    const user = await this.consumeToken(rawToken, 'INVITE');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(password, 12), status: 'ACTIVE', failedLogins: 0, lockedUntil: null },
    });
    await this.activity.log(user, user.companyId, { entityType: 'USER', entityId: user.id, action: 'invite_accepted', summary: `${user.name} accepted the invite` });
    const tokens = await this.issueTokens(user.id, res);
    const profile = await this.profile(user.id);
    return { ...profile, ...tokens };
  }

  async forgot(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (user && user.status === 'ACTIVE' && !user.deletedAt) {
      const token = await this.createToken(user.id, 'RESET');
      await this.mail.send({
        to: user.email,
        subject: 'Reset your Property CRM password',
        heading: 'Reset your password',
        lines: ['We received a request to reset your password.', 'The link is valid for 30 minutes. If you did not ask for this, ignore this email.'],
        action: { label: 'Choose a new password', url: `${config.appUrl}/reset-password?token=${token}` },
      });
    }
    // Same answer whether or not the email exists, so accounts cannot be discovered.
    return { ok: true };
  }

  async reset(rawToken: string, password: string) {
    const user = await this.consumeToken(rawToken, 'RESET');
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 12), failedLogins: 0, lockedUntil: null } });
    await this.prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    return { ok: true };
  }

  async changePassword(u: AuthUser, current: string, next: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    if (!user.passwordHash || !(await bcrypt.compare(current, user.passwordHash))) {
      throw new BusinessError('WRONG_PASSWORD', 'Your current password is incorrect.', 400);
    }
    await this.prisma.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(next, 12) } });
    return { ok: true };
  }

  private cookieBase(): CookieOptions {
    return { httpOnly: true, secure: config.isProd, sameSite: 'lax', path: '/' };
  }

  private clearCookies(res: Response) {
    res.clearCookie(ACCESS_COOKIE, { ...this.cookieBase() });
    res.clearCookie(REFRESH_COOKIE, { ...this.cookieBase(), path: '/api/v1/auth' });
  }
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @Post('login')
  @HttpCode(200)
  login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const { email, password } = parse(z.object({ email: z.string().email('Enter a valid email'), password: z.string().min(1, 'Enter your password') }), body);
    return this.auth.login(email, password, res);
  }

  @Public()
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @Post('login-2fa')
  @HttpCode(200)
  login2FA(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const { tempToken, code } = parse(z.object({ tempToken: z.string().min(10), code: z.string().min(6).max(8) }), body);
    return this.auth.login2FA(tempToken, code, res);
  }

  @Public()
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @Post('google')
  @HttpCode(200)
  googleLogin(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const { credential } = parse(z.object({ credential: z.string().min(10) }), body);
    return this.auth.googleLogin(credential, res);
  }

  @AnyRole()
  @Get('2fa/setup')
  setup2FA(@CurrentUser() u: AuthUser) {
    return this.auth.generate2FA(u);
  }

  @AnyRole()
  @Post('2fa/enable')
  @HttpCode(200)
  enable2FA(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const { secret, code } = parse(z.object({ secret: z.string().min(10), code: z.string().min(6).max(8) }), body);
    return this.auth.enable2FA(u, secret, code);
  }

  @AnyRole()
  @Post('2fa/disable')
  @HttpCode(200)
  disable2FA(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const { code } = parse(z.object({ code: z.string().min(6).max(8) }), body);
    return this.auth.disable2FA(u, code);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() body?: { refreshToken?: string }) {
    return this.auth.refresh(req, res, body?.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() body?: { refreshToken?: string }) {
    return this.auth.logout(req, res, false, undefined, body?.refreshToken);
  }

  @AnyRole()
  @Post('logout-all')
  @HttpCode(200)
  logoutAll(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentUser() u: AuthUser) {
    return this.auth.logout(req, res, true, u.id);
  }

  @AnyRole()
  @Get('me')
  async me(@CurrentUser() u: AuthUser, @Req() req: Request) {
    const profile = await this.auth.profile(u.id);
    const authHeader = req.headers.authorization;
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    const accessToken = bearer || (await this.auth.signAccessToken(u.id));
    return { ...profile, accessToken };
  }

  @Public()
  @Post('accept-invite')
  @HttpCode(200)
  acceptInvite(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const { token, password } = parse(z.object({ token: z.string().min(10), password: passwordSchema }), body);
    return this.auth.acceptInvite(token, password, res);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  forgot(@Body() body: unknown) {
    const { email } = parse(z.object({ email: z.string().email('Enter a valid email') }), body);
    return this.auth.forgot(email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  reset(@Body() body: unknown) {
    const { token, password } = parse(z.object({ token: z.string().min(10), password: passwordSchema }), body);
    return this.auth.reset(token, password);
  }

  @AnyRole()
  @Post('change-password')
  @HttpCode(200)
  change(@Body() body: unknown, @CurrentUser() u: AuthUser) {
    const { current, next } = parse(z.object({ current: z.string().min(1), next: passwordSchema }), body);
    return this.auth.changePassword(u, current, next);
  }
}
