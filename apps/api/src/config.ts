import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';

function required(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value) return value;
  if (isProd) throw new Error(`Missing required environment variable ${name}`);
  return devFallback;
}

export const config = {
  isProd,
  port: Number(process.env.PORT || 3000),
  appUrl: process.env.APP_URL || 'http://localhost:5174',
  renderExternalUrl: process.env.RENDER_EXTERNAL_URL || process.env.KEEP_ALIVE_URL || '',
  jwtAccessSecret: required('JWT_ACCESS_SECRET', 'dev-access-secret'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
  accessTtlSeconds: 15 * 60,
  refreshTtlDays: 7,
  tz: process.env.TZ_NAME || 'Asia/Kolkata',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 465),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
  mailFrom: process.env.MAIL_FROM || 'Property CRM <no-reply@example.com>',
};
