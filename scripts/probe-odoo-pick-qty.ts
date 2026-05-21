import { test } from '@playwright/test';
import { loginOdoo, ODOO_URL } from '../sync.helpers';

const ODOO_ID = process.env.ODOO_INSPECT_ORDER_ID ?? '55665';

async function openFirstPick(page: import('@playwright/test').Page) {
  await page.goto(`${ODOO_URL}/sales/${ODOO_ID}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.o_loading, .o_blockUI').waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {});
  await page.locator('button[name="action_view_delivery"]').first().click();
  await page.locator('.o_loading, .o_blockUI').waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {});
  await page.waitForURL(/action-\d+/, { timeout: 30_000 });
  const transferRows = page.locator('table tbody tr.o_data_row, .o_list_table tbody tr.o_data_row');
  if ((await transferRows.count()) > 0) {
    await transferRows.first().dblclick();
    await page.locator('.o_loading, .o_blockUI').waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {});
  }
}

test('probe pick qty fields', async ({ page }) => {
  test.setTimeout(120_000);
  await loginOdoo(page);
  await openFirstPick(page);
  console.log('URL:', page.url());
  await page.getByRole('tab', { name: 'Operations' }).click().catch(() => {});
  await page.waitForTimeout(500);

  const o2m = page.locator('.o_field_one2many[name="move_ids_without_package"]');
  const rows = o2m.locator('tbody tr.o_data_row');
  const n = await rows.count();
  console.log('Move rows:', n);

  for (let i = 0; i < n; i++) {
    const row = rows.nth(i);
    const product = await row.locator('[name="product_id"]').first().innerText().catch(() => '');
    const demand = await row.locator('[name="product_uom_qty"] input, [name="product_uom_qty"]').first().innerText().catch(async () => {
      const inp = row.locator('[name="product_uom_qty"] input');
      if (await inp.count()) return inp.inputValue();
      return '';
    });
    const qty = await row.locator('[name="quantity"] input, [name="quantity"]').first().innerText().catch(async () => {
      const inp = row.locator('[name="quantity"] input');
      if (await inp.count()) return inp.inputValue();
      return '';
    });
    console.log(`  row ${i}: product=${product.slice(0, 40)} demand=${demand} quantity=${qty}`);
  }
});
