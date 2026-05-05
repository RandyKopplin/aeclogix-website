// Vercel Serverless Function: /api/subscribe
// Receives lead form submissions from lead-magnet pages and posts them to MailerLite.
// Routes to different MailerLite groups based on the `magnet` field in the request body.
//
// Required environment variables (set in Vercel Project Settings):
//   MAILERLITE_API_KEY               - MailerLite bearer token (rotated, never committed)
//   MAILERLITE_GROUP_ID              - default subscriber group (RFP Extractor lead magnet)
//   MAILERLITE_STARTER_KIT_GROUP_ID  - optional override for the AECCanon Starter Kit notify group
//                                       (falls back to hardcoded group ID below; group IDs are
//                                       not secrets — they're public in MailerLite form embeds)
//
// Magnet allowlist — add new magnets here as more lead magnets are added to the site.
const MAGNET_GROUPS = {
  'rfp-extractor': function () { return process.env.MAILERLITE_GROUP_ID; },
  'starter-kit':   function () { return process.env.MAILERLITE_STARTER_KIT_GROUP_ID || '185853422226900306'; }
};

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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const apiKey = process.env.MAILERLITE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'Server not configured' });
  }

  const ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({ success: false, error: 'Too many requests. Try again in a minute.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  // Honeypot
  if (body.website) {
    return res.status(200).json({ success: true });
  }

  const firstName = (body.firstName || '').toString().trim().slice(0, 80);
  const email = (body.email || '').toString().trim().toLowerCase().slice(0, 254);
  const firmName = (body.firmName || '').toString().trim().slice(0, 120);
  const role = (body.role || '').toString().trim().slice(0, 60);
  const magnet = (body.magnet || 'rfp-extractor').toString().trim();

  if (!firstName) {
    return res.status(400).json({ success: false, error: 'First name is required.' });
  }
  if (!validEmail(email)) {
    return res.status(400).json({ success: false, error: 'Valid email is required.' });
  }

  // Resolve magnet → group ID via the allowlist (server-controlled; client cannot inject arbitrary groups)
  const groupResolver = MAGNET_GROUPS[magnet];
  if (!groupResolver) {
    return res.status(400).json({ success: false, error: 'Unknown lead magnet.' });
  }
  const groupId = groupResolver();
  if (!groupId) {
    return res.status(500).json({ success: false, error: 'Server not configured for this magnet.' });
  }

  // Smoke-test short-circuit: ?smoke=1 returns success without calling MailerLite.
  // Used by /deploy-guard to verify the full validation pipeline end-to-end without polluting subscribers.
  // Validation above still runs, so the smoke test exercises every code path except the outbound MailerLite POST.
  const isSmoke = (req.query && req.query.smoke === '1')
    || (typeof req.url === 'string' && req.url.indexOf('smoke=1') !== -1);
  if (isSmoke) {
    return res.status(200).json({ success: true, smoke: true });
  }

  try {
    const mlRes = await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        email: email,
        fields: {
          name: firstName,
          company: firmName,
          role: role
        },
        groups: [groupId],
        status: 'active'
      })
    });

    const mlJson = await mlRes.json().catch(function () { return {}; });

    if (!mlRes.ok) {
      // Log status only, never log email addresses or tokens
      console.warn('MailerLite subscribe failed with status', mlRes.status);
      return res.status(502).json({ success: false, error: 'Subscription service error. Please try again.' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Subscribe handler error:', err && err.message ? err.message : 'unknown');
    return res.status(500).json({ success: false, error: 'Server error. Please try again.' });
  }
};
