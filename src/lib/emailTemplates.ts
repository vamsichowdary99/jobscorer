import { SITE_URL } from '@/lib/site';

function shell(bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:40px;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <div style="text-align:center;margin-bottom:24px;">
        <span style="font-size:1.5rem;font-weight:800;letter-spacing:-0.025em;">
          <span style="color:#0f172a;">Job</span><span style="color:#135bec;">Scorer</span>
        </span>
      </div>
      ${bodyHtml}
    </div>
  </body>
</html>`;
}

function button(label: string, href: string): string {
  return `<a href="${href}" style="display:block;width:100%;box-sizing:border-box;text-align:center;padding:12px;background:#135bec;color:#fff;border-radius:8px;font-size:0.95rem;font-weight:600;text-decoration:none;">${label}</a>`;
}

export function welcomeEmailHtml(): string {
  return shell(`
    <h1 style="font-size:1.25rem;font-weight:800;color:#0f172a;text-align:center;margin:0 0 12px;">Welcome to JobScorer</h1>
    <p style="color:#64748b;font-size:0.9rem;line-height:1.6;text-align:center;margin:0 0 24px;">
      Upload your resume to get AI-scored job matches and personalized optimization tips.
    </p>
    ${button('Go to your dashboard', `${SITE_URL}/dashboard`)}
  `);
}

export function resumeReadyEmailHtml(matchCount: number): string {
  return shell(`
    <h1 style="font-size:1.25rem;font-weight:800;color:#0f172a;text-align:center;margin:0 0 12px;">Your matches are ready</h1>
    <p style="color:#64748b;font-size:0.9rem;line-height:1.6;text-align:center;margin:0 0 24px;">
      We found ${matchCount} job${matchCount === 1 ? '' : 's'} matched to your resume.
    </p>
    ${button('View your matches', `${SITE_URL}/dashboard/matches`)}
  `);
}
