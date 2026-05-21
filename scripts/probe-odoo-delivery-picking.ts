/**
 * Probe stock picking / delivery list after clicking Delivery smart button.
 */
import { test } from '@playwright/test';
import { loginOdoo, ODOO_URL } from '../sync.helpers';

const ODOO_ID = process.env.ODOO_INSPECT_ORDER_ID ?? '55665';

test('probe delivery picking UI', async ({ page }) => {
  test.setTimeout(180_000);
  await loginOdoo(page);
  await page.goto(`${ODOO_URL}/sales/${ODOO_ID}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.o_loading, .o_blockUI').waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {});

  const deliveryBtn = page.locator('button[name="action_view_delivery"]').first();
  await deliveryBtn.waitFor({ state: 'visible', timeout: 30_000 });
  console.log('Click Delivery smart button…');
  await deliveryBtn.click();
  await page.locator('.o_loading, .o_blockUI').waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  console.log('URL after click:', page.url());

  const breadcrumb = await page.locator('.o_breadcrumb, .breadcrumb').first().innerText().catch(() => '');
  console.log('Breadcrumb:', breadcrumb.replace(/\s+/g, ' ').trim());

  const h1 = await page.locator('h1, .o_form_view .o_field_char').first().innerText().catch(() => '');
  console.log('H1/primary:', h1.replace(/\s+/g, ' ').trim().slice(0, 80));

  const listRows = page.locator('table tbody tr, .o_list_table tbody tr.o_data_row');
  const rowCount = await listRows.count();
  console.log(`List rows: ${rowCount}`);
  for (let i = 0; i < Math.min(rowCount, 6); i++) {
    const text = (await listRows.nth(i).innerText()).replace(/\s+/g, ' ').trim().slice(0, 100);
    console.log(`  row ${i}: ${text}`);
  }

  const pickingLinks = page.getByRole('link').filter({ hasText: /WH\/|OUT\/|PICK\/|delivery/i });
  const linkCount = await pickingLinks.count();
  console.log(`Picking-like links: ${linkCount}`);
  for (let i = 0; i < Math.min(linkCount, 8); i++) {
    console.log(`  link ${i}:`, (await pickingLinks.nth(i).innerText()).trim());
  }

  if (linkCount > 0) {
    console.log('Open first picking link…');
    await pickingLinks.first().click();
    await page.locator('.o_loading, .o_blockUI').waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {});
    console.log('After link URL:', page.url());
  } else if (rowCount > 0) {
    console.log('Open first list row…');
    await listRows.first().dblclick();
    await page.locator('.o_loading, .o_blockUI').waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {});
    console.log('Picking URL:', page.url());
  }

  const buttons = await page.getByRole('button').all();
  console.log(`\n── Buttons on picking view (${buttons.length}) ──`);
  for (const btn of buttons) {
    const text = (await btn.innerText()).replace(/\s+/g, ' ').trim();
    const name = await btn.getAttribute('name').catch(() => '');
    if (text && text.length < 60) console.log(`  [${name ?? ''}] ${text}`);
  }

  const tabs = await page.getByRole('tab').all();
  console.log('\n── Tabs ──');
  for (const tab of tabs) {
    const t = (await tab.innerText()).trim();
    if (t) console.log(`  ${t}`);
  }

  const fields = await page.locator('[name]').all();
  const names = new Set<string>();
  for (const f of fields.slice(0, 80)) {
    const n = await f.getAttribute('name').catch(() => '');
    if (n && /qty|quantity|done|reserved|product|move/i.test(n)) names.add(n);
  }
  console.log('\n── Relevant field names ──');
  for (const n of [...names].sort()) console.log(`  ${n}`);
});
