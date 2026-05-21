import { test } from '@playwright/test';
import { loginOdoo, ODOO_URL } from '../sync.helpers';

test('list transfers', async ({ page }) => {
  const id = process.env.ODOO_INSPECT_ORDER_ID ?? '55665';
  await loginOdoo(page);
  await page.goto(`${ODOO_URL}/sales/${id}`);
  await page.locator('button[name="action_view_delivery"]').first().click();
  await page.waitForURL(/action-\d+/);
  const rows = page.locator('.o_list_view tbody tr.o_data_row');
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    console.log(`row ${i}:`, (await rows.nth(i).innerText()).replace(/\s+/g, ' | '));
  }
});
