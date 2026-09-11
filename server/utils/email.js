const nodemailer = require('nodemailer');
const { get, all } = require('../database');

async function getTransporter() {
  const settings = all('SELECT * FROM system_settings WHERE key LIKE "smtp_%"');
  const config = {};
  settings.forEach(s => config[s.key] = s.value);
  
  if (!config.smtp_host) return null;

  return nodemailer.createTransport({
    host: config.smtp_host,
    port: parseInt(config.smtp_port) || 587,
    secure: config.smtp_secure === 'true',
    auth: {
      user: config.smtp_user,
      pass: config.smtp_pass,
    },
  });
}

function resolveBaseUrl(originOrReq) {
  try {
    // 1. Configured instance URL in system_settings
    const configured = get('SELECT value FROM system_settings WHERE key="instance_url"')?.value;
    if (configured && configured.trim().startsWith('http')) {
      return configured.trim().replace(/\/+$/, '');
    }

    // 2. Request object or string
    if (originOrReq) {
      if (typeof originOrReq === 'string' && originOrReq.startsWith('http')) {
        const u = new URL(originOrReq);
        return `${u.protocol}//${u.host}`;
      }
      if (typeof originOrReq === 'object' && originOrReq.headers) {
        const host = originOrReq.headers['x-forwarded-host'] || originOrReq.headers.host;
        const proto = originOrReq.headers['x-forwarded-proto'] || (originOrReq.secure ? 'https' : 'http');
        // Validate host syntax (alphanumeric, dots, dashes, optional port)
        if (host && /^[a-zA-Z0-9.:\-_]+$/.test(host) && !host.includes('/') && !host.includes('@')) {
          return `${proto}://${host}`;
        }
      }
    }
  } catch (e) {
    console.error('Error resolving base URL for email:', e);
  }

  return 'http://localhost:' + (process.env.PORT || 3000);
}

async function sendResetEmail(email, token, originOrReq) {
  const transporter = await getTransporter();
  if (!transporter) throw new Error('SMTP not configured');
  
  const from = get('SELECT value FROM system_settings WHERE key="smtp_from"')?.value || 'GyroidVault <noreply@gyroidvault.local>';
  const baseUrl = resolveBaseUrl(originOrReq);
  const cleanToken = encodeURIComponent(String(token).replace(/[^a-zA-Z0-9]/g, ''));
  const resetUrl = `${baseUrl}/#/reset-password?token=${cleanToken}`;

  await transporter.sendMail({
    from,
    to: email,
    subject: 'Password Reset - GyroidVault',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h1 style="color: #8b5cf6;">GyroidVault</h1>
        <h2 style="color: #1e293b;">Password Reset Request</h2>
        <p style="color: #475569; line-height: 1.6;">A password reset was requested for your GyroidVault account. Click the button below to choose a new password.</p>
        <div style="margin: 30px 0; text-align: center;">
          <a href="${resetUrl}" style="background-color: #8b5cf6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Reset Password</a>
        </div>
        <p style="color: #94a3b8; font-size: 0.875rem;">This link will expire in 1 hour. If you didn't request this, you can safely ignore this email.</p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
        <p style="color: #94a3b8; font-size: 0.75rem;">If the button doesn't work, copy and paste this link into your browser:<br>${resetUrl}</p>
      </div>
    `,
  });
}

async function sendTestEmail(email) {
  const transporter = await getTransporter();
  if (!transporter) throw new Error('SMTP not configured');
  
  const from = get('SELECT value FROM system_settings WHERE key="smtp_from"')?.value || 'GyroidVault <noreply@gyroidvault.local>';

  await transporter.sendMail({
    from,
    to: email,
    subject: 'GyroidVault SMTP Test Successful',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h1 style="color: #00d4ff;">GyroidVault</h1>
        <h2 style="color: #1e293b;">SMTP Configuration Test</h2>
        <p style="color: #475569; line-height: 1.6;">If you are reading this email, your SMTP settings in GyroidVault have been configured correctly!</p>
        <p style="color: #94a3b8; font-size: 0.875rem;">You can now use email features like password resets and user invites.</p>
      </div>
    `,
  });
}

async function sendInviteEmail(email, token, originOrReq) {
  const transporter = await getTransporter();
  if (!transporter) throw new Error('SMTP not configured');
  
  const from = get('SELECT value FROM system_settings WHERE key="smtp_from"')?.value || 'GyroidVault <noreply@gyroidvault.local>';
  const baseUrl = resolveBaseUrl(originOrReq);
  const cleanToken = encodeURIComponent(String(token).replace(/[^a-zA-Z0-9]/g, ''));
  const inviteUrl = `${baseUrl}/#/register?token=${cleanToken}`;

  await transporter.sendMail({
    from,
    to: email,
    subject: 'You have been invited to GyroidVault',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h1 style="color: #00d4ff;">GyroidVault</h1>
        <h2 style="color: #1e293b;">You're Invited!</h2>
        <p style="color: #475569; line-height: 1.6;">You have been invited to join a GyroidVault library. Click the button below to create your account.</p>
        <div style="margin: 30px 0; text-align: center;">
          <a href="${inviteUrl}" style="background-color: #00d4ff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Create Account</a>
        </div>
        <p style="color: #94a3b8; font-size: 0.875rem;">This invite link will expire in 7 days.</p>
      </div>
    `,
  });
}

module.exports = { sendResetEmail, sendTestEmail, sendInviteEmail, resolveBaseUrl };
