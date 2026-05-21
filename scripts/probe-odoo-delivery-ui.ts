/**
 * One-off probe: list Odoo smart buttons / tabs on a confirmed sales order.
 * Run: node node_modules/@playwright/test/cli.js test scripts/probe-odoo-delivery-ui.ts
 */
import { test } from '@playwright/test';
import { loginOdoo, ODOO_URL } from '../sync.helpers';

const ODOO_ID = process.env.ODOO_INSPECT_ORDER_ID ?? '55665';

test('probe delivery UI', async ({ page }) => {
  test.setTimeout(120_000);
  await loginOdoo(page);
  await page.goto(`${ODOO_URL}/sales/${ODOO_ID}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.o_loading, .o_blockUI').waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {});
  await page.getByRole('radio', { name: /sales order/i }).waitFor({ timeout: 60_000 }).catch(() => {});
  console.log('URL:', page.url());
  console.log('Title:', await page.title());

  const smartButtons = await page
    .locator('.oe_stat_button, .o_stat_button, button.oe_stat_button, a.oe_stat_button')
    .all();
  console.log('\n── Smart buttons ──');
  for (const btn of smartButtons) {
    const text = (await btn.innerText()).replace(/\s+/g, ' ').trim();
    const name = await btn.getAttribute('name').catch(() => '');
    if (text) console.log(`  [${name ?? ''}] ${text}`);
  }

  const tabs = await page.getByRole('tab').all();
  console.log('\n── Tabs ──');
  for (const tab of tabs) {
    const name = await tab.innerText().catch(() => '');
    if (name.trim()) console.log(`  ${name.trim()}`);
  }

  const headerButtons = await page.locator('header button, .o_statusbar_buttons button').all();
  console.log('\n── Header / statusbar buttons ──');
  for (const btn of headerButtons) {
    const text = (await btn.innerText()).replace(/\s+/g, ' ').trim();
    const name = await btn.getAttribute('name').catch(() => '');
    if (text && text.length < 80) console.log(`  [${name ?? ''}] ${text}`);
  }

  const deliveryish = page.getByText(/delivery|pick|transfer|shipping/i);
  const n = await deliveryish.count();
  console.log(`\n── Elements matching delivery|pick|transfer (${n}) ──`);
  for (let i = 0; i < Math.min(n, 25); i++) {
    const el = deliveryish.nth(i);
    const tag = await el.evaluate((e) => e.tagName).catch(() => '?');
    const text = (await el.innerText()).replace(/\s+/g, ' ').trim().slice(0, 60);
    console.log(`  <${tag}> ${text}`);
  }

  const allButtons = await page.getByRole('button').all();
  console.log(`\n── All role=button (${allButtons.length}) ──`);
  for (const btn of allButtons.slice(0, 40)) {
    const text = (await btn.innerText()).replace(/\s+/g, ' ').trim();
    const name = await btn.getAttribute('name').catch(() => '');
    if (text) console.log(`  [${name ?? ''}] ${text.slice(0, 70)}`);
  }
});
