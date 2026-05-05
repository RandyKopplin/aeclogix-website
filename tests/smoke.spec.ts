import { test, expect, Page } from '@playwright/test';

// =============================================================================
// /deploy-guard smoke spec for aeclogix.com
// =============================================================================
// What this verifies:
//   1. Each key page returns 200 and renders its expected H1 / title.
//   2. No console errors on initial load (warnings are tolerated).
//   3. Visual snapshot diff vs. committed baselines (first run captures).
//   4. All anchor hrefs resolve to absolute URLs or known-relative routes —
//      catches "broken relative path" bugs that have shipped before.
//   5. The /api/subscribe path works end-to-end (with ?smoke=1 short-circuit
//      to avoid polluting MailerLite).
//   6. The MailerLite-hosted JSONP form on /coi-checklist is present and
//      pointed at the correct hosted endpoint (we don't submit it — that
//      bypasses our server and would pollute subscribers).
// =============================================================================

// Per-page heading selector + content match. Most pages use <h1>; /reporter is a stepwise demo
// page whose visible top heading is an <h2id="step-title">, so it gets a different selector.
const KEY_PAGES: { path: string; headingSelector: string; expectedHeadingPattern: RegExp; titlePattern: RegExp }[] = [
  { path: '/',               headingSelector: 'h1',              expectedHeadingPattern: /AEC Firms/i,         titlePattern: /AECLogix/i },
  { path: '/pricing',        headingSelector: 'h1',              expectedHeadingPattern: /pricing|tier|plan/i, titlePattern: /AECLogix/i },
  { path: '/coi-checklist',  headingSelector: 'h1',              expectedHeadingPattern: /coi|checklist/i,     titlePattern: /AECLogix/i },
  { path: '/reporter',       headingSelector: 'h2#step-title',   expectedHeadingPattern: /.+/,                 titlePattern: /AECLogix|Reporter/i },
  { path: '/rfp-radar',      headingSelector: 'h1',              expectedHeadingPattern: /.+/,                 titlePattern: /AECLogix/i },
];

// Hostnames that are legitimate cross-origin destinations — links to these are not flagged.
const ALLOWED_EXTERNAL_HOSTS = [
  'aeclogix.com',
  'www.aeclogix.com',
  'calendar.app.google',
  'calendar.google.com',
  'mailerlite.com',
  'assets.mailerlite.com',
  'groot.mailerlite.com',
  'connect.mailerlite.com',
  'linkedin.com',
  'www.linkedin.com',
];

async function collectConsoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    errors.push(`pageerror: ${err.message}`);
  });
  return errors;
}

for (const { path, headingSelector, expectedHeadingPattern, titlePattern } of KEY_PAGES) {
  test(`${path} — loads cleanly, headers correct, snapshot stable`, async ({ page }) => {
    const errors = await collectConsoleErrors(page);

    const response = await page.goto(path, { waitUntil: 'networkidle' });
    expect(response, `${path} returned no response`).not.toBeNull();
    expect(response!.status(), `${path} HTTP status`).toBeLessThan(400);

    await expect(page).toHaveTitle(titlePattern);

    // First heading matching the per-page selector. Some pages have multiple — we check the first.
    const firstHeading = page.locator(headingSelector).first();
    await expect(firstHeading).toBeVisible();
    const headingText = (await firstHeading.textContent()) || '';
    expect(headingText, `${path} heading text (${headingSelector})`).toMatch(expectedHeadingPattern);

    // Snapshot — viewport only, not full page (full-page diffs are too flaky on dynamic content).
    await expect(page).toHaveScreenshot(`${path.replace(/[\/]/g, '_') || '_root'}.png`, {
      maxDiffPixelRatio: 0.02,
      fullPage: false,
    });

    // Console error budget: zero. If a page legitimately needs to error, add an explicit allowlist here.
    expect(errors, `${path} console errors`).toEqual([]);
  });
}

test('CTAs and anchors resolve to expected hosts', async ({ page, request }) => {
  await page.goto('/');
  const hrefs = await page.locator('a[href]').evaluateAll((els) =>
    (els as HTMLAnchorElement[]).map((a) => a.getAttribute('href') || '')
  );
  for (const href of hrefs) {
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
    if (href.startsWith('/')) continue; // relative-to-root is fine on a static site

    // Anything else must be a parseable absolute URL on an allowed host.
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      throw new Error(`Unparseable href on /: ${href}`);
    }
    if (!ALLOWED_EXTERNAL_HOSTS.includes(url.host)) {
      throw new Error(`href on / points at unexpected host ${url.host}: ${href}`);
    }
  }
});

test('/api/subscribe accepts smoke=1 and short-circuits before MailerLite', async ({ request }) => {
  const res = await request.post('/api/subscribe?smoke=1', {
    data: {
      firstName: 'SmokeTest',
      email: `deploy-guard+smoke-${Date.now()}@example.com`,
      magnet: 'rfp-extractor',
    },
  });
  expect(res.status(), '/api/subscribe?smoke=1 status').toBe(200);
  const body = await res.json();
  expect(body, 'smoke response shape').toMatchObject({ success: true, smoke: true });
});

test('/api/subscribe rejects bad email (validation still runs even with smoke=1)', async ({ request }) => {
  const res = await request.post('/api/subscribe?smoke=1', {
    data: { firstName: 'X', email: 'not-an-email', magnet: 'rfp-extractor' },
  });
  expect(res.status()).toBe(400);
});

test('/coi-checklist hosts the MailerLite JSONP form pointed at the expected endpoint', async ({ page }) => {
  await page.goto('/coi-checklist');
  const form = page.locator('form.ml-block-form').first();
  await expect(form).toBeVisible();
  const action = await form.getAttribute('action');
  expect(action, 'MailerLite form action URL').toMatch(
    /^https:\/\/assets\.mailerlite\.com\/jsonp\/2274882\/forms\/\d+\/subscribe$/
  );
  // Sanity: the form has an email input — guards against a markup regression that strips the field.
  await expect(form.locator('input[type="email"]')).toHaveCount(1, {
    // Some MailerLite embeds use input[name=fields[email]] without explicit type — broaden if needed.
  });
});
