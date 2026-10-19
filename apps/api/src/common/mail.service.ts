import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import { config } from '../config';

export interface MailInput {
  to: string;
  subject: string;
  heading: string;
  lines: string[];
  action?: { label: string; url: string };
}

/**
 * Sends email over SMTP (e.g. Resend). With no SMTP_HOST configured — the default in
 * development — messages are printed to the API console instead of being sent.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private readonly transport: Transporter | null;

  constructor() {
    this.transport = config.smtp.host
      ? nodemailer.createTransport({
          host: config.smtp.host,
          port: config.smtp.port,
          secure: config.smtp.port === 465,
          auth: { user: config.smtp.user, pass: config.smtp.pass },
        })
      : null;
  }

  async send(input: MailInput): Promise<boolean> {
    const html = this.render(input);
    const text = [input.heading, '', ...input.lines, input.action ? `\n${input.action.label}: ${input.action.url}` : ''].join('\n');
    if (!this.transport) {
      this.logger.log(`\n──── EMAIL (dev, not sent) ────\nTo: ${input.to}\nSubject: ${input.subject}\n\n${text}\n───────────────────────────────`);
      return true;
    }
    try {
      await this.transport.sendMail({ from: config.mailFrom, to: input.to, subject: input.subject, html, text });
      return true;
    } catch (e) {
      this.logger.error(`Email to ${input.to} failed: ${(e as Error).message}`);
      return false;
    }
  }

  private render({ heading, lines, action }: MailInput): string {
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const body = lines.map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#0f1f1c">${esc(l)}</p>`).join('');
    const button = action
      ? `<p style="margin:24px 0 0"><a href="${esc(action.url)}" style="display:inline-block;background:#0e7c6b;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">${esc(action.label)}</a></p>`
      : '';
    return `<!doctype html><html><body style="margin:0;background:#f0f3f2;font-family:'Plus Jakarta Sans',Segoe UI,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:32px">
<tr><td><p style="margin:0 0 20px;font-weight:800;color:#0e7c6b;font-size:16px">Property CRM</p>
<h1 style="margin:0 0 16px;font-size:22px;color:#0f1f1c">${esc(heading)}</h1>${body}${button}
<p style="margin:28px 0 0;font-size:12px;color:#5a6864">This is an automated message from Property CRM.</p></td></tr></table>
</td></tr></table></body></html>`;
  }
}
