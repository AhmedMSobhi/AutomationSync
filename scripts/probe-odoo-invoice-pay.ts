import { test } from '@playwright/test';
import { loginOdoo, ODOO_URL } from '../sync.helpers';

const ODOO_ID = process.env.ODOO_INSPECT_ORDER_ID ?? '55686';

test('probe invoice pay UI', async ({ page }) => {
  await loginOdoo(page);
  await page.goto(`${ODOO_URL}/sales/${ODOO_ID}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.o_loading, .o_blockUI').waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {});
  await page.getByRole('radio', { name: /sales order/i }).waitFor({ timeout: 60_000 }).catch(() => {});

  const smart = await page.locator('.oe_stat_button, .o_stat_button, button.oe_stat_button').all();
  console.log('\n── Smart buttons ──');
  for (const btn of smart) {
    const text = (await btn.innerText()).replace(/\s+/g, ' ').trim();
    const name = await btn.getAttribute('name').catch(() => '');
    if (text) console.log(`  [${name}] ${text}`);
  }

  const invCandidates = [
    page.locator('button[name="action_view_invoice"]'),
    page.getByRole('button', { name: /invoice/i }),
    page.locator('.oe_stat_button').filter({ hasText: /invoice/i }),
  ];
  for (const loc of invCandidates) {
    if (await loc.first().isVisible().catch(() => false)) {
      console.log('\nClick Invoices…');
      await loc.first().click();
      await page.locator('.o_loading, .o_blockUI').waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {});
      console.log('URL:', page.url());
      break;
    }
  }

  const payBtn = page.getByRole('button', { name: /^pay$/i });
  if (await payBtn.isVisible().catch(() => false)) {
    console.log('\nClick Pay…');
    await payBtn.click();
    await page.waitForTimeout(1500);
    const modalBtns = page.locator('.modal-dialog button, .o_dialog button');
    const n = await modalBtns.count();
    console.log(`Modal buttons (${n}):`);
    for (let i = 0; i < n; i++) {
      const t = (await modalBtns.nth(i).innerText()).trim();
      const name = await modalBtns.nth(i).getAttribute('name').catch(() => '');
      if (t) console.log(`  [${name}] ${t}`);
    }
  }

  const buttons = await page.getByRole('button').all();
  console.log('\n── Buttons ──');
  for (const btn of buttons) {
    const text = (await btn.innerText()).replace(/\s+/g, ' ').trim();
    const name = await btn.getAttribute('name').catch(() => '');
    if (text && text.length < 60) console.log(`  [${name}] ${text}`);
  }
});
