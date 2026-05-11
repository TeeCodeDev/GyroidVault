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

async function sendResetEmail(email, token, origin) {
  const transporter = await getTransporter();
  if (!transporter) throw new Error('SMTP not configured');
  
  const from = get('SELECT value FROM system_settings WHERE key="smtp_from"')?.value || 'PrintVault <noreply@printvault.local>';
  const resetUrl = `${origin}/#/reset-password?token=${token}`;

  await transporter.sendMail({
    from,
    to: email,
    subject: 'Password Reset - PrintVault',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h1 style="color: #8b5cf6;">PrintVault</h1>
        <h2 style="color: #1e293b;">Password Reset Request</h2>
        <p style="color: #475569; line-height: 1.6;">A password reset was requested for your PrintVault account. Click the button below to choose a new password.</p>
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

module.exports = { sendResetEmail };
