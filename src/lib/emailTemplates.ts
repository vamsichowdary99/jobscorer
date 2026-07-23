import { SITE_URL } from '@/lib/site';

function shell(bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="height:4px;background:#135bec;line-height:0;font-size:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:40px 40px 32px;">
                <div style="text-align:center;margin-bottom:28px;">
                  <span style="font-size:1.375rem;font-weight:800;letter-spacing:-0.02em;">
                    <span style="color:#0f172a;">Job</span><span style="color:#135bec;">Scorer</span>
                  </span>
                </div>
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 40px;background:#f8fafc;border-top:1px solid #e5e7eb;">
                <p style="margin:0;color:#94a3b8;font-size:0.75rem;line-height:1.5;text-align:center;">
                  JobScorer &middot; AI-powered job matching &amp; resume optimization<br>
                  You're receiving this because it relates to your JobScorer account.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function button(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td align="center" style="border-radius:8px;background:#135bec;">
        <a href="${href}" style="display:block;width:100%;box-sizing:border-box;text-align:center;padding:13px 12px;color:#ffffff;font-size:0.95rem;font-weight:600;text-decoration:none;">${label}</a>
      </td>
    </tr>
  </table>`;
}

export function welcomeEmailHtml(): string {
  return shell(`
    <h1 style="font-size:1.25rem;font-weight:800;color:#0f172a;text-align:center;margin:0 0 12px;">Welcome to JobScorer</h1>
    <p style="color:#64748b;font-size:0.9rem;line-height:1.6;text-align:center;margin:0 0 28px;">
      Upload your resume to get AI-scored job matches and personalized optimization tips.
    </p>
    ${button('Go to your dashboard', `${SITE_URL}/dashboard`)}
  `);
}

export function resumeReadyEmailHtml(matchCount: number): string {
  return shell(`
    <h1 style="font-size:1.25rem;font-weight:800;color:#0f172a;text-align:center;margin:0 0 12px;">Your matches are ready</h1>
    <p style="color:#64748b;font-size:0.9rem;line-height:1.6;text-align:center;margin:0 0 28px;">
      We found ${matchCount} job${matchCount === 1 ? '' : 's'} matched to your resume.
    </p>
    ${button('View your matches', `${SITE_URL}/dashboard/matches`)}
  `);
}
