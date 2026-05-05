// Vercel Serverless Function: /api/email-checklist
// Sends the extracted RFP checklist to the subscriber as an inline HTML email.
// Fire-and-forget from the client: if this fails, extraction still succeeded
// and the user has the checklist on screen.
//
// Required environment variables (set in Vercel Project Settings):
//   RESEND_API_KEY      - your Resend API key (https://resend.com)
//   RESEND_FROM_EMAIL   - sender address, e.g. "RFP Radar <radar@aeclogix.com>"
//                          (defaults to a resend.dev sandbox address if unset)

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 10;
const rateLimitStore = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitStore.get(ip) || { count: 0, start: now };
  if (now - entry.start > RATE_LIMIT_WINDOW_MS) {
    entry.count = 0;
    entry.start = now;
  }
  entry.count += 1;
  rateLimitStore.set(ip, entry);
  return entry.count > RATE_LIMIT_MAX;
}

function validEmail(s) {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function priorityColor(p) {
  const key = (p || '').toLowerCase();
  if (key === 'high') return { bg: '#fff2e5', border: '#f79546', text: '#c56a20' };
  if (key === 'medium') return { bg: '#eef0f5', border: '#2a3550', text: '#2a3550' };
  return { bg: '#f4f4f2', border: '#6b6b6b', text: '#6b6b6b' };
}

function renderItems(items, showReason) {
  if (!Array.isArray(items) || items.length === 0) {
    return '<tr><td style="padding:14px 20px;color:#6b6b6b;font-size:13px;font-family:Arial,sans-serif;">No items in this category.</td></tr>';
  }
  return items.map(function (it) {
    const p = priorityColor(it.priority);
    const pLabel = (it.priority || 'medium').toUpperCase();
    const text = escapeHtml(it.text || '');
    const reasonRow = (showReason && it.reason)
      ? '<div style="margin-top:6px;font-size:12px;color:#6b6b6b;font-family:Courier New,monospace;">// ' + escapeHtml(it.reason) + '</div>'
      : '';
    return (
      '<tr>' +
        '<td style="padding:14px 20px;border-bottom:1px solid #eee;border-left:4px solid ' + p.border + ';background:#ffffff;vertical-align:top;">' +
          '<div style="font-family:Arial,sans-serif;font-size:14px;color:#0e0e0e;line-height:1.5;">' + text + '</div>' +
          reasonRow +
        '</td>' +
        '<td style="padding:14px 20px;border-bottom:1px solid #eee;background:#ffffff;text-align:right;vertical-align:top;white-space:nowrap;">' +
          '<span style="display:inline-block;padding:4px 10px;font-family:Courier New,monospace;font-size:10px;letter-spacing:0.12em;background:' + p.bg + ';color:' + p.text + ';border:1px solid ' + p.border + ';">' + pLabel + '</span>' +
        '</td>' +
      '</tr>'
    );
  }).join('');
}

function renderEmail(data, opts) {
  const pi = data.projectInfo || {};
  const projectName = escapeHtml(pi.name) || 'Your RFP';
  const location = escapeHtml(pi.location) || 'Not specified';
  const budget = escapeHtml(pi.budget) || 'Not specified';
  const deadline = escapeHtml(pi.deadline) || 'Not specified';
  const subject = 'Your RFP Radar checklist: ' + projectName;
  const preheader = 'Priority-ranked checklist for ' + projectName + '. Export, print, forward to your team.';

  const html = [
    '<!DOCTYPE html>',
    '<html><head><meta charset="utf-8"><title>' + escapeHtml(subject) + '</title></head>',
    '<body style="margin:0;padding:0;background:#f4f4f2;font-family:Arial,Helvetica,sans-serif;color:#0e0e0e;">',
    '<div style="display:none;max-height:0;overflow:hidden;">' + escapeHtml(preheader) + '</div>',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2;padding:24px 0;">',
    '<tr><td align="center">',
    '<table role="presentation" width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;background:#ffffff;border:1px solid #e5e5e5;">',

    // Header bar (black)
    '<tr><td style="background:#0e0e0e;padding:20px 28px;">' +
      '<table role="presentation" width="100%"><tr>' +
        '<td style="font-family:Arial Black,Arial,sans-serif;font-weight:900;font-size:18px;letter-spacing:0.04em;"><span style="color:#f79546;">AEC</span><span style="color:#ffffff;">LOGIX</span></td>' +
        '<td align="right" style="font-family:Courier New,monospace;font-size:10px;letter-spacing:0.2em;color:#6b6b6b;text-transform:uppercase;">/ RFP RADAR</td>' +
      '</tr></table>' +
    '</td></tr>',

    // Intro
    '<tr><td style="padding:32px 28px 12px;">' +
      '<div style="font-family:Courier New,monospace;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#f79546;margin-bottom:10px;">01 / YOUR CHECKLIST</div>' +
      '<h1 style="margin:0 0 12px;font-family:Arial Black,Arial,sans-serif;font-size:26px;line-height:1.1;text-transform:uppercase;letter-spacing:0.02em;color:#0e0e0e;">' + projectName + '</h1>' +
      '<p style="margin:0 0 0;font-size:14px;line-height:1.6;color:#6b6b6b;">Here is the checklist RFP Radar pulled from your document. Priority-ranked. Review against the source before you submit your proposal.</p>' +
    '</td></tr>',

    // Project info card
    '<tr><td style="padding:20px 28px 0;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0e0e0e;color:#ffffff;">' +
        '<tr>' +
          '<td style="padding:18px 20px;width:50%;border-right:1px solid rgba(255,255,255,0.08);">' +
            '<div style="font-family:Courier New,monospace;font-size:9px;letter-spacing:0.22em;color:#f79546;text-transform:uppercase;margin-bottom:4px;">LOCATION</div>' +
            '<div style="font-family:Arial,sans-serif;font-size:14px;font-weight:bold;">' + location + '</div>' +
          '</td>' +
          '<td style="padding:18px 20px;width:50%;">' +
            '<div style="font-family:Courier New,monospace;font-size:9px;letter-spacing:0.22em;color:#f79546;text-transform:uppercase;margin-bottom:4px;">BUDGET</div>' +
            '<div style="font-family:Arial,sans-serif;font-size:14px;font-weight:bold;">' + budget + '</div>' +
          '</td>' +
        '</tr>' +
        '<tr>' +
          '<td style="padding:18px 20px;width:50%;border-top:1px solid rgba(255,255,255,0.08);border-right:1px solid rgba(255,255,255,0.08);">' +
            '<div style="font-family:Courier New,monospace;font-size:9px;letter-spacing:0.22em;color:#f79546;text-transform:uppercase;margin-bottom:4px;">DEADLINE</div>' +
            '<div style="font-family:Arial,sans-serif;font-size:14px;font-weight:bold;">' + deadline + '</div>' +
          '</td>' +
          '<td style="padding:18px 20px;width:50%;border-top:1px solid rgba(255,255,255,0.08);">' +
            '<div style="font-family:Courier New,monospace;font-size:9px;letter-spacing:0.22em;color:#f79546;text-transform:uppercase;margin-bottom:4px;">EXTRACTED</div>' +
            '<div style="font-family:Arial,sans-serif;font-size:14px;font-weight:bold;">' + new Date().toISOString().slice(0,10) + '</div>' +
          '</td>' +
        '</tr>' +
      '</table>' +
    '</td></tr>',

    // Submission Requirements section
    '<tr><td style="padding:32px 28px 8px;">' +
      '<div style="font-family:Courier New,monospace;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#f79546;margin-bottom:6px;">02 / SUBMISSION REQUIREMENTS</div>' +
      '<h2 style="margin:0;font-family:Arial Black,Arial,sans-serif;font-size:18px;text-transform:uppercase;letter-spacing:0.02em;color:#0e0e0e;">What They Want in the Submission</h2>' +
    '</td></tr>',
    '<tr><td style="padding:8px 28px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + renderItems(data.submissionRequirements, false) + '</table></td></tr>',

    // Scope
    '<tr><td style="padding:32px 28px 8px;">' +
      '<div style="font-family:Courier New,monospace;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#f79546;margin-bottom:6px;">03 / SCOPE REQUIREMENTS</div>' +
      '<h2 style="margin:0;font-family:Arial Black,Arial,sans-serif;font-size:18px;text-transform:uppercase;letter-spacing:0.02em;color:#0e0e0e;">What the Architect Must Deliver</h2>' +
    '</td></tr>',
    '<tr><td style="padding:8px 28px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + renderItems(data.scopeRequirements, false) + '</table></td></tr>',

    // Hidden
    '<tr><td style="padding:32px 28px 8px;">' +
      '<div style="font-family:Courier New,monospace;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#f79546;margin-bottom:6px;">04 / HIDDEN REQUIREMENTS</div>' +
      '<h2 style="margin:0;font-family:Arial Black,Arial,sans-serif;font-size:18px;text-transform:uppercase;letter-spacing:0.02em;color:#0e0e0e;">What Is Buried in the Appendix</h2>' +
    '</td></tr>',
    '<tr><td style="padding:8px 28px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + renderItems(data.hiddenRequirements, true) + '</table></td></tr>',

    // CTA back to tool
    '<tr><td style="padding:36px 28px;text-align:center;">' +
      '<a href="https://aeclogix.com/rfp-radar/app" style="display:inline-block;background:#f79546;color:#0e0e0e;padding:14px 32px;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;border:2px solid #f79546;">RUN ANOTHER RFP</a>' +
    '</td></tr>',

    // Footer
    '<tr><td style="background:#0e0e0e;padding:24px 28px;">' +
      '<table role="presentation" width="100%"><tr>' +
        '<td style="font-family:Courier New,monospace;font-size:10px;letter-spacing:0.18em;color:#6b6b6b;text-transform:uppercase;">AECLOGIX / AUTOMATION AS A SERVICE FOR AEC FIRMS</td>' +
        '<td align="right" style="font-family:Courier New,monospace;font-size:10px;letter-spacing:0.18em;"><a href="https://aeclogix.com" style="color:#f79546;text-decoration:none;">AECLOGIX.COM</a></td>' +
      '</tr></table>' +
    '</td></tr>',

    '</table>',
    '<div style="margin-top:16px;font-family:Arial,sans-serif;font-size:11px;color:#6b6b6b;max-width:620px;text-align:center;">You received this because you requested an extraction on aeclogix.com/rfp-radar. Questions? Reply to this email.</div>',
    '</td></tr></table>',
    '</body></html>'
  ].join('');

  return { subject: subject, html: html };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return res.status(500).json({ success: false, error: 'Server not configured - RESEND_API_KEY missing' });
  }

  const ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({ success: false, error: 'Too many requests.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const email = (body.email || '').toString().trim().toLowerCase();
  if (!validEmail(email)) {
    return res.status(400).json({ success: false, error: 'Valid email is required.' });
  }

  const data = body.checklistData;
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ success: false, error: 'Checklist data is required.' });
  }

  const rendered = renderEmail(data);
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'RFP Radar <onboarding@resend.dev>';

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + resendKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [email],
        subject: rendered.subject,
        html: rendered.html
      })
    });

    const resendJson = await resendRes.json().catch(function () { return {}; });

    if (!resendRes.ok) {
      console.warn('Resend send failed', resendRes.status, JSON.stringify(resendJson).slice(0, 300));
      return res.status(502).json({
        success: false,
        error: 'Email service error: ' + ((resendJson && resendJson.message) || resendRes.status)
      });
    }

    return res.status(200).json({ success: true, id: resendJson.id });
  } catch (err) {
    console.error('Email handler error:', err && err.message ? err.message : 'unknown');
    return res.status(500).json({ success: false, error: 'Server error. Please try again.' });
  }
};
