import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
dotenv.config();

export default defineConfig({
  testDir: '.',
  testMatch: [
    /.*\.spec\.ts$/,
    /create-update-order-from-odoo\.ts$/,
    /scripts\/probe-.*\.ts$/,
  ],
  timeout:  360_000,   // full cycle: Odoo UI + 1 min sync wait + DB poll
  retries:  1,
  workers:  1,        // MUST be serial — sync tests depend on order
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],

  use: {
    headless:    false,
    slowMo:      200,  // helps with Odoo's dynamic form rendering
    screenshot:  'only-on-failure',
    video:       'retain-on-failure',
    trace:       'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
