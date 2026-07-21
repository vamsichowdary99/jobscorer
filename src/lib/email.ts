import { Resend } from 'resend';
import { SITE_NAME } from '@/lib/site';

// jobscorer.in is the Resend-verified sending domain (SPF/DKIM/DMARC all verified).
const FROM_ADDRESS = `${SITE_NAME} <notifications@jobscorer.in>`;

let client: Resend | null = null;
function getClient(): Resend {
  if (!client) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not set');
    }
    client = new Resend(process.env.RESEND_API_KEY);
  }
  return client;
}

export async function sendEmail(opts: { to: string; subject: string; html: string }) {
  const { error } = await getClient().emails.send({
    from: FROM_ADDRESS,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }
}
