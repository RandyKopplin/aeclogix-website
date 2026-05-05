import { defineConfig, devices } from '@playwright/test';

// SITE_URL is set by the GitHub Action and by the /deploy-guard skill.
// Defaults to production for local invocation; override via env to point at a preview URL.
const SITE_URL = process.env.SITE_URL || 'https://aeclogix.com';

export default defineConfig({
  testDir: './tests',
  // Snapshots live next to the spec; first run captures, subsequent runs diff.
  snapshotPathTemplate: '{testDir}/__snapshots__/{testFilePath}/{arg}{ext}',
  // Fail loud on flaky tests — smoke is meant to gate deploys.
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    baseURL: SITE_URL,
    // Treat HTTPS errors as failures — production should never have cert issues.
    ignoreHTTPSErrors: false,
    // Screenshot only on failure to keep artifact size sane; full traces on retry.
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  // Single project — desktop Chromium. Add mobile/Firefox if/when needed.
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
});
