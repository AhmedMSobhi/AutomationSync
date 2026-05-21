import { test } from '@playwright/test';
import { loginOdoo, ODOO_URL } from '../sync.helpers';

test('probe invoice pay flow', async ({ page }) => {
  const id = process.env.ODOO_INSPECT_ORDER_ID ?? '55686';
  await loginOdoo(page);
  await page.goto(`${ODOO_URL}/sales/${id}`);
  await page.locator('.o_loading, .o_blockUI').waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {});

  await page.locator('button[name="action_view_invoice"]').first().click();
  await page.locator('.o_loading, .o_blockUI').waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  console.log('After invoices click URL:', page.url());

  const pay = page.getByRole('button', { name: /^pay$/i });
  console.log('Pay visible:', await pay.isVisible().catch(() => false));
  if (await pay.isVisible().catch(() => false)) {
    await pay.click();
    await page.waitForTimeout(1500);
    const dlg = page
      .locator('.modal-dialog')
      .filter({ hasText: /pay/i })
      .last();
    for (const btn of await dlg.getByRole('button').all()) {
      const t = (await btn.innerText()).trim();
      const name = await btn.getAttribute('name');
      console.log('  btn:', t, name);
    }
    const create = dlg.getByRole('button', { name: /create payment/i });
    console.log('Create Payment count:', await create.count());
  }
});
