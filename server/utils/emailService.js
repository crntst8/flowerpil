import nodemailer from 'nodemailer';
import crypto from 'crypto';

/**
 * Flowerpil email helper utilities using Brevo SMTP relay.
 * Respects legacy env keys (BREVO_EMAIL/BREVO_SMTP_PASSWORD) alongside defaults.
 */

let transporter = null;

const REQUIRED_ENV_GROUPS = [
  {
    keys: ['BREVO_USER', 'BREVO_EMAIL'],
    label: 'BREVO_USER/BREVO_EMAIL'
  },
  {
    keys: ['BREVO_PASS', 'BREVO_SMTP_PASSWORD'],
    label: 'BREVO_PASS/BREVO_SMTP_PASSWORD'
  }
];

const DEFAULT_SENDERS = {
  passwordReset: 'admin@flowerpil.io',
  signup: 'hello@flowerpil.io',
  referral: 'referrals@flowerpil.io'
};

const DEFAULT_SENDER_NAMES = {
  passwordReset: 'Flowerpil Admin',
  signup: 'Flowerpil',
  referral: 'Flowerpil Referrals'
};

const resolveSender = (channel) => {
  const upper = channel.toUpperCase();
  const address = process.env[`EMAIL_FROM_${upper}`] || DEFAULT_SENDERS[channel];
  const label = process.env[`EMAIL_FROM_${upper}_NAME`] || DEFAULT_SENDER_NAMES[channel];
  return `"${label}" <${address}>`;
};

const shouldMockEmails = () => {
  if (process.env.MOCK_EMAIL === 'true') return true;
  if (process.env.NODE_ENV === 'test' && process.env.MOCK_EMAIL !== 'false') return true;
  return false;
};

const getTransporter = () => {
  if (shouldMockEmails()) return null;

  if (!transporter) {
    const missing = REQUIRED_ENV_GROUPS
      .filter(({ keys }) => !keys.some((key) => process.env[key]))
      .map(({ label }) => label);
    if (missing.length) {
      throw new Error(`Missing email configuration: ${missing.join(', ')}`);
    }

    const smtpHost = process.env.BREVO_HOST || 'smtp-relay.brevo.com';
    const smtpPort = Number.parseInt(process.env.BREVO_PORT || '587', 10);
    const smtpUser = process.env.BREVO_USER || process.env.BREVO_EMAIL;
    const smtpPass = process.env.BREVO_PASS || process.env.BREVO_SMTP_PASSWORD;

    transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: false,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });

    console.log('[EMAIL_SERVICE] SMTP transporter ready', {
      host: smtpHost,
      port: smtpPort,
      user: smtpUser
    });
  }

  return transporter;
};

const sendPlaintextEmail = async ({ to, from, subject, text, cc, bcc, replyTo }) => {
  if (!to) throw new Error('Email recipient missing');

  if (shouldMockEmails()) {
    console.log('[EMAIL_SERVICE] Mock email send', { to, subject });
    return { success: true, messageId: 'mock-message' };
  }

  const activeTransporter = getTransporter();

  try {
    const info = await activeTransporter.sendMail({
      to,
      ...(cc ? { cc } : {}),
      ...(bcc ? { bcc } : {}),
      ...(replyTo ? { replyTo } : {}),
      from,
      subject,
      text
    });
    console.log('[EMAIL_SERVICE] Email sent', { to, subject, messageId: info.messageId });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[EMAIL_SERVICE] Failed to send email', {
      to,
      subject,
      error: error?.message || error
    });
    throw error;
  }
};

/**
 * Generate 6-digit numeric verification code.
 */
export const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Hash code with HMAC-SHA256 using EMAIL_CODE_PEPPER for additional security.
 */
export const hashCode = (code) => {
  if (!process.env.EMAIL_CODE_PEPPER) {
    throw new Error('EMAIL_CODE_PEPPER environment variable not set');
  }

  return crypto
    .createHmac('sha256', process.env.EMAIL_CODE_PEPPER)
    .update(code)
    .digest('hex');
};

/**
 * Compare a raw code to stored hash using constant-time comparison.
 */
export const verifyCodeHash = (code, hash) => {
  const codeHash = hashCode(code);
  return crypto.timingSafeEqual(Buffer.from(codeHash), Buffer.from(hash));
};

export const sendPasswordResetEmail = async ({ email, resetLink, expiresMinutes = 60 }) => {
  const subject = 'Reset your Flowerpil password';
  const text = [
    'You requested to reset your Flowerpil password.',
    `Reset link: ${resetLink}`,
    `The link remains active for ${expiresMinutes} minutes.`,
    "If you didn't request this, ignore the email."
  ].join('\n\n');

  return sendPlaintextEmail({
    to: email,
    from: resolveSender('passwordReset'),
    subject,
    text
  });
};

export const sendSignupConfirmationEmail = async ({ email, confirmationCode = null, accountType = 'account' }) => {
  const subject = 'hello & thankyou';
  const lines = [
    `hey - thankyou for opening a ${accountType} for Flowerpil.`,
    confirmationCode
      ? `Your confirmation code: ${confirmationCode}\nEnter this code in the app to finish signing up.`
      : 'if you have any issues, find features clunky, or would love to see a feature included, use the feedback button (bottom right of yr screen) to let us know.',
    'you can also get in touch at dev@flowerpil.com anytime with anything else.',
    'take care,',

    'colby xx'


  ].filter(Boolean);

  return sendPlaintextEmail({
    to: email,
    from: resolveSender('signup'),
    subject,
    text: lines.join('\n\n')
  });
};

export const sendReferralSubmissionEmail = async ({ email, referralCode, inviteeName = '', issuerName = '' }) => {
  const subject = 'flowerpil referral code';
  const greeting = inviteeName ? `Hey ${inviteeName}!` : 'Hi there,';
  const inviterLine = issuerName
    ? `Here's your referral code for signup.`
    : 'You were invited to explore Flowerpil.';

  const text = [
    greeting,
    inviterLine,
    `Referral code: ${referralCode}`,
    'Use this code + this email address to make an account.',
    'flowerpil.io/signup',
    ' ',
    'Important:',
    'If you intend to use Apple Music for importing, please follow the steps at flowerpil.io/apple-flow to get started.',
    'For Qobiz, visit flowerpil.io/qobiz-help.',
    ' ',
    'If you have any issues, email dev@flowerpil.com or use the feedback bubble on yr screen once signed up!.',
    'Thanks for giving us something to listen to!'

  ].join('\n\n');

  return sendPlaintextEmail({
    to: email,
    from: resolveSender('referral'),
    subject,
    text
  });
};

/**
 * Send a custom admin email to one or more users
 */
export const sendAdminEmail = async ({ to, subject, body, replyTo = 'dev@flowerpil.com' }) => {
  const from = resolveSender('signup');

  return sendPlaintextEmail({
    to,
    from,
    subject,
    text: body,
    replyTo
  });
};

export const sendTop10PublishEmail = async ({ email, displayName, publicUrl, referralCode }) => {
  const subject = 'flowerpil - your top 10 of 2025';
  const name = displayName && displayName.trim() ? displayName.trim() : 'there';
  const text = [
    `Hey ${name}!`,
    'Thanks for making a top ten playlist for 2025. Here\'s the link to the public page:',
    publicUrl,
    'If you\'re interested in making playlists regularly, you can sign up as a curator at',
    'flowerpil.io/signup',
    `with this referral code: ${referralCode}`,
    'you can import from any platform (or none at all) and export wherever you like then share playlists with one account, one link.',
    'otherwise, thanks for making a playlist!',
    '<3 from flowerpil',
    '--'
  ].join('\n\n');

  return sendPlaintextEmail({
    to: email,
    from: resolveSender('signup'),
    subject,
    text
  });
};

export const sendTop10ResumeEmail = async ({ email, displayName, resumeUrl, expiresMinutes = 10 }) => {
  const subject = 'flowerpil - restart your top 10';
  const name = displayName && displayName.trim() ? ` ${displayName.trim()}` : '';
  const text = [
    `Hey${name}!`,
    'Use this link to restart your Top 10 of 2025:',
    resumeUrl,
    `This link expires in ${expiresMinutes} minutes.`,
    'If you did not request this, you can ignore this email.'
  ].join('\n\n');

  return sendPlaintextEmail({
    to: email,
    from: resolveSender('signup'),
    subject,
    text
  });
};

export const verifyEmailConnection = async () => {
  if (shouldMockEmails()) {
    console.log('[EMAIL_SERVICE] Mock mode – SMTP verification skipped');
    return true;
  }

  try {
    const activeTransporter = getTransporter();
    await activeTransporter.verify();
    console.log('[EMAIL_SERVICE] SMTP connection verified');
    return true;
  } catch (error) {
    console.error('[EMAIL_SERVICE] SMTP verification failed', error?.message || error);
    throw error;
  }
};

export const sendCustomPlaintextEmail = async ({ to, subject, text, from = null, cc = null, bcc = null, replyTo = null }) => {
  const resolvedFrom = from || resolveSender('signup');
  return sendPlaintextEmail({
    to,
    cc,
    bcc,
    replyTo,
    from: resolvedFrom,
    subject,
    text
  });
};

export default {
  generateVerificationCode,
  hashCode,
  verifyCodeHash,
  sendPasswordResetEmail,
  sendSignupConfirmationEmail,
  sendReferralSubmissionEmail,
  sendTop10PublishEmail,
  sendTop10ResumeEmail,
  verifyEmailConnection
};
