import { sendEmail } from '@/lib/email';
import type { NotificationChannel } from '../channel';

/**
 * Email channel — delivers the message's pre-rendered email via Resend. Skips
 * silently when the message carries no email payload (not every event emails).
 */
export const emailChannel: NotificationChannel = {
  name: 'email',
  async send(_ctx, msg) {
    if (!msg.email) return;
    await sendEmail({
      to: msg.email.to,
      subject: msg.email.subject,
      html: msg.email.html,
      ...(msg.email.text ? { text: msg.email.text } : {}),
    });
  },
};
