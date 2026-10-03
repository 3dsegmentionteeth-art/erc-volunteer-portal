import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config';
import { logger } from './logger';

// Verification-email delivery. Three modes:
//  - test env      -> stream transport (buffers mail in memory, never sent);
//                    `lastCapturedMail()` lets tests assert the delivered message.
//  - SMTP_HOST set -> real delivery via the configured server.
//  - otherwise     -> log-only (dev fallback; see SECURITY.md — never production).

let transport: Transporter | null | undefined;
let lastMail:
  | { to: string; subject: string; url: string; raw: string; type: 'email-verification' | 'application-access' }
  | undefined;

export interface CapturedMail {
  to: string;
  subject: string;
  /** Full verification URL carrying the one-time token. */
  url: string;
  /** Kind of token email, so tests can distinguish concurrent captures. */
  type: 'email-verification' | 'application-access';
}

function getTransport(): Transporter | null {
  if (transport !== undefined) return transport;
  if (config.isTest) {
    transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
    return transport;
  }
  if (config.smtp.host) {
    transport = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
    return transport;
  }
  transport = null;
  return null;
}

export interface VerificationEmailTo {
  to: string;
  name: string;
  token: string;
}

export async function sendVerificationEmail({ to, name, token }: VerificationEmailTo): Promise<void> {
  const url = `${config.publicHost}/verify-email?token=${token}`;
  const subject = 'Verify your email — ERC Volunteer Service Portal';
  const text = [
    `Hello ${name},`,
    '',
    'Verify your email address to activate your volunteer account:',
    url,
    '',
    `This link expires after ${Math.round(config.auth.emailVerificationTtlMs / 3_600_000)} hours.`,
    'If you did not submit this registration, please ignore this message.',
  ].join('\n');

  await deliver({ to, subject, url, text, type: 'email-verification' });
}

export interface ApplicationAccessEmailTo {
  to: string;
  name: string;
  registrationId: string;
  token: string;
}

// Same three-mode delivery as the verification email. Carries the token the
// applicant proves to attach documents to their still-pending registration.
export async function sendApplicationAccessEmail({
  to,
  name,
  registrationId,
  token,
}: ApplicationAccessEmailTo): Promise<void> {
  const url = `${config.publicHost}/application/${registrationId}/documents?token=${token}`;
  const subject = 'Attach your documents — ERC Volunteer Service Portal';
  const text = [
    `Hello ${name},`,
    '',
    'Your application was received. Attach your documents to complete it:',
    url,
    '',
    `The link expires after ${Math.round(config.auth.applicationAccessTokenTtlMs / 3_600_000)} hours.`,
    'If you did not submit this registration, please ignore this message.',
  ].join('\n');

  await deliver({ to, subject, url, text, type: 'application-access' });
}

interface Deliver {
  to: string;
  subject: string;
  url: string;
  text: string;
  type: 'email-verification' | 'application-access';
}

async function deliver({ to, subject, url, text, type }: Deliver): Promise<void> {
  const t = getTransport();
  if (t) {
    const info = await t.sendMail({ from: config.smtp.from, to, subject, text });
    // streamTransport (test env only) resolves with the raw RFC822 message.
    if (info.message) {
      const raw = typeof info.message === 'string' ? info.message : info.message.toString();
      lastMail = { to, subject, url, raw, type };
    }
  }

  // Dev fallback: the one-time link also surfaces as a log line so local flows
  // work end-to-end before SMTP_* is configured. Never a production substitute
  // (SECURITY.md).
  if (!config.isProd) {
    const label = type === 'email-verification' ? 'VERIFICATION EMAIL' : 'APPLICATION-ACCESS EMAIL';
    logger.info(`${label} -> ${to}: ${url}`);
  }
  lastMail = { to, subject, url, raw: lastMail?.raw ?? '', type };
}

/** Test hook: last message rendered by the in-memory stream transport. */
export function lastCapturedMail(): CapturedMail | undefined {
  return lastMail;
}