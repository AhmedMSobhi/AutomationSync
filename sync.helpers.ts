import { Locator, Page, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { waitBeforeDbQuery } from './db.helpers';
dotenv.config({ path: path.resolve(__dirname, '.env') });

// ─── Config ───────────────────────────────────────────────────────────────────
/** Odoo 17+ app root, e.g. https://instance.odoo.com/odoo */
export const ODOO_URL = normalizeOdooAppUrl(process.env.ODOO_URL!);
/** Medusa Admin app base, e.g. https://host/app */
export const MEDUSA_APP_URL = normalizeMedusaAppUrl(process.env.MEDUSA_ADMIN_URL!);
/** @deprecated use MEDUSA_APP_URL */
export const MEDUSA_URL = MEDUSA_APP_URL;

function normalizeOdooAppUrl(url: string): string {
  const trimmed = url.replace(/\/$/, '');
  if (/\/odoo$/i.test(trimmed)) return trimmed;
  const origin = trimmed.replace(/\/web\/?$/i, '');
  return `${origin}/odoo`;
}

function normalizeMedusaAppUrl(url: string): string {
  const trimmed = url.replace(/\/$/, '');
  const appIdx = trimmed.indexOf('/app');
  if (appIdx !== -1) return trimmed.slice(0, appIdx + 4);
  return trimmed;
}
export const SYNC_WAIT_MS     = Number(process.env.SYNC_WAIT_MS ?? 6000);
export const STANDARD_FEE     = Number(process.env.STANDARD_SHIPPING_FEE ?? 25);
export const FREE_THRESHOLD   = Number(process.env.FREE_SHIPPING_THRESHOLD ?? 400);
export const AMOUNT_TOLERANCE = Number(process.env.AMOUNT_TOLERANCE ?? 0.01);

/** Defaults from staging — override in .env */
export const ODOO_TEST_CUSTOMER_SEARCH =
  process.env.ODOO_TEST_CUSTOMER_SEARCH ?? 'mawa';
export const ODOO_TEST_CUSTOMER =
  process.env.ODOO_TEST_CUSTOMER ?? 'mawada';
export const ODOO_TEST_PRODUCT =
  process.env.ODOO_TEST_PRODUCT ?? '[FRMT0203] Auskobe Beef';
/** Extra ms to wait before clicking Confirm (Odoo recalculates lines) */
export const ODOO_CONFIRM_WAIT_MS =
  Number(process.env.ODOO_CONFIRM_WAIT_MS ?? 3000);

// ─── Auth ─────────────────────────────────────────────────────────────────────

function odooOrigin(): string {
  return ODOO_URL.replace(/\/odoo\/?$/i, '');
}

export async function loginOdoo(page: Page): Promise<void> {
  const email = process.env.ODOO_EMAIL?.trim();
  const password = process.env.ODOO_PASSWORD;
  if (!email || !password) {
    throw new Error('ODOO_EMAIL and ODOO_PASSWORD must be set in .env');
  }

  const loginUrl = `${odooOrigin()}/web/login?redirect=${encodeURIComponent('/odoo')}`;
  console.log(`[Odoo] Login → ${loginUrl}`);
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });

  if (page.url() === 'about:blank' || !page.url().includes('odoo.com')) {
    throw new Error(`Odoo login failed — page stuck on ${page.url()}`);
  }

  // Session already active — Odoo skips the form
  if (/\/odoo(\/|$|\?)/.test(page.url()) && !page.url().includes('/web/login')) {
    console.log(`[Odoo] Already logged in → ${page.url()}`);
    return;
  }

  const emailField = page
    .locator('input[name="login"]')
    .or(page.getByLabel(/^email$/i))
    .or(page.getByPlaceholder(/email/i))
    .first();
  const passwordField = page
    .locator('input[name="password"]')
    .or(page.getByLabel(/^password$/i))
    .or(page.getByPlaceholder(/password/i))
    .first();

  await emailField.waitFor({ state: 'visible', timeout: 30_000 });
  await emailField.fill(email);
  await passwordField.fill(password);
  await page.getByRole('button', { name: /^log in$/i }).click();

  await page.waitForURL(
    (url) => {
      const u = url.toString();
      return !u.includes('/web/login');
    },
    { timeout: 90_000 }
  );

  if (page.url().includes('/web/login')) {
    const errMsg = await page
      .locator('.alert-danger, .o_notification_content, .text-danger')
      .first()
      .innerText()
      .catch(() => '');
    throw new Error(
      `Odoo login failed — check ODOO_EMAIL / ODOO_PASSWORD in .env.${errMsg ? ` (${errMsg.trim()})` : ''}`
    );
  }

  if (!/\/odoo(\/|$|\?)/.test(page.url())) {
    await page.goto(ODOO_URL, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  }

  await page.waitForLoadState('domcontentloaded');
  console.log(`[Odoo] Login OK → ${page.url()}`);
}

export async function loginMedusa(page: Page): Promise<void> {
  const email = process.env.MEDUSA_ADMIN_EMAIL?.trim();
  const password = process.env.MEDUSA_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'MEDUSA_ADMIN_EMAIL and MEDUSA_ADMIN_PASSWORD must be set in .env'
    );
  }

  console.log(`[Medusa] Login → ${MEDUSA_APP_URL}/login (user: ${email})`);
  await page.goto(`${MEDUSA_APP_URL}/login`, {
    waitUntil: 'domcontentloaded',
    timeout: 90_000,
  });
  await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {});

  if (/\/orders|\/dashboard/.test(page.url())) {
    console.log('[Medusa] Already on admin — skipping login form');
    return;
  }

  // Medusa v2 admin: email/password appear after "Continue with Email"
  const continueEmail = page.getByRole('button', { name: /continue with email/i });
  if (await continueEmail.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await continueEmail.click();
    await page
      .locator('input[type="email"], input[name="email"]')
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 });
  }

  const emailField = page
    .locator('input[type="email"], input[name="email"]')
    .or(page.getByRole('textbox', { name: /email/i }))
    .or(page.getByPlaceholder(/email/i))
    .first();
  await emailField.waitFor({ state: 'visible', timeout: 30_000 });
  await emailField.click();
  await emailField.fill(email);

  const passwordField = page
    .locator('input[type="password"], input[name="password"]')
    .or(page.getByPlaceholder(/password/i))
    .first();
  await passwordField.waitFor({ state: 'visible', timeout: 15_000 });
  await passwordField.fill(password);

  const signIn = page.getByRole('button', { name: /sign in|log in/i });
  if (await signIn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await signIn.click();
  } else {
    const formSubmit = page.locator('button[type="submit"]').first();
    if (await formSubmit.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await formSubmit.click();
    } else {
      await passwordField.press('Enter');
    }
  }

  await page.waitForURL(
    (url) => {
      const u = url.toString();
      return u.includes('run.app') && /\/(orders|dashboard)/.test(u);
    },
    { timeout: 90_000 }
  );
  await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {});

  if (!page.url().includes('run.app') || page.url() === 'about:blank') {
    throw new Error(`Medusa login failed — unexpected URL: ${page.url()}`);
  }
  console.log(`[Medusa] Login OK → ${page.url()}`);
}

// ─── Odoo: Order creation ─────────────────────────────────────────────────────

export interface OdooOrderLine {
  product: string;
  quantity: number;
}

export interface OdooOrderResult {
  /** Odoo display name, e.g. S56847 */
  name: string;
  /** Numeric Odoo sale.order id — use for metadata->>'odoo_id' in Postgres */
  odooId: string;
  /** Product lines with quantities */
  lines: OdooOrderLine[];
}

export interface OdooOrderOptions {
  /** Text typed into the Customer combobox */
  customerSearch?: string;
  /** Exact option label to pick, e.g. "mawada" */
  customerName: string;
  lines: {
    /** Exact product option label, e.g. "[FRMT0203] Auskobe Beef" */
    product: string;
    productSearch?: string;
    quantity: number;
    unitPrice?: number;
  }[];
  shippingFeeOverride?: number;
}

/**
 * Order lines for tests — configured only in .env (never hardcode products in specs).
 *
 * Option A — numbered vars (add more lines in .env, no code change):
 *   ODOO_TEST_PRODUCT, ODOO_TEST_PRODUCT_SEARCH, ODOO_TEST_PRODUCT_QTY
 *   ODOO_TEST_PRODUCT_2, ODOO_TEST_PRODUCT_2_SEARCH, ODOO_TEST_PRODUCT_2_QTY
 *   ODOO_TEST_PRODUCT_3, … (any index until a product name is missing)
 *
 * Option B — JSON array (unlimited lines, one variable):
 *   ODOO_TEST_ORDER_LINES=[{"product":"…","search":"…","quantity":1},…]
 */
export function buildOdooTestOrderLines(): OdooOrderOptions['lines'] {
  const jsonRaw = process.env.ODOO_TEST_ORDER_LINES?.trim();
  if (jsonRaw) {
    return parseOdooOrderLinesJson(jsonRaw);
  }

  const lines = parseOdooOrderLinesNumbered();
  if (lines.length > 0) {
    return lines;
  }

  return [
    {
      product: ODOO_TEST_PRODUCT,
      productSearch: process.env.ODOO_TEST_PRODUCT_SEARCH?.trim(),
      quantity: Number(process.env.ODOO_TEST_PRODUCT_QTY ?? 1),
    },
  ];
}

function parseOdooOrderLinesJson(raw: string): OdooOrderOptions['lines'] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      'ODOO_TEST_ORDER_LINES must be valid JSON, e.g. [{"product":"Name","search":"txt","quantity":1}]'
    );
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('ODOO_TEST_ORDER_LINES must be a non-empty JSON array');
  }

  return parsed.map((row, i) => {
    if (!row || typeof row !== 'object') {
      throw new Error(`ODOO_TEST_ORDER_LINES[${i}] must be an object`);
    }
    const r = row as Record<string, unknown>;
    const product = String(r.product ?? r.name ?? '').trim();
    if (!product) {
      throw new Error(`ODOO_TEST_ORDER_LINES[${i}]: missing "product"`);
    }
    const search = r.search ?? r.productSearch;
    return {
      product,
      productSearch: search != null ? String(search).trim() : undefined,
      quantity: Number(r.quantity ?? r.qty ?? 1),
    };
  });
}

function parseOdooOrderLinesNumbered(): OdooOrderOptions['lines'] {
  const lines: OdooOrderOptions['lines'] = [];

  const first = process.env.ODOO_TEST_PRODUCT?.trim();
  if (first) {
    lines.push({
      product: first,
      productSearch: process.env.ODOO_TEST_PRODUCT_SEARCH?.trim(),
      quantity: Number(process.env.ODOO_TEST_PRODUCT_QTY ?? 1),
    });
  }

  for (let n = 2; ; n++) {
    const product = process.env[`ODOO_TEST_PRODUCT_${n}`]?.trim();
    if (!product) break;
    lines.push({
      product,
      productSearch: process.env[`ODOO_TEST_PRODUCT_${n}_SEARCH`]?.trim(),
      quantity: Number(process.env[`ODOO_TEST_PRODUCT_${n}_QTY`] ?? 1),
    });
  }

  const maxLines = Number(process.env.ODOO_TEST_ORDER_LINE_COUNT ?? 0);
  if (maxLines > 0 && lines.length > maxLines) {
    return lines.slice(0, maxLines);
  }

  return lines;
}

export interface OdooLineQuantityUpdate {
  product: string;
  productSearch?: string;
  quantity: number;
}

/** Post-create qty targets: line1=3, line2=0.5, line3=12.36 (override via .env *_QTY_UPDATE). */
export function buildPostCreateQuantityUpdates(): OdooLineQuantityUpdate[] {
  const base = buildOdooTestOrderLines();
  const defaults = [3, 0.5, 12.36];

  return base.map((line, i) => {
    const suffix = i === 0 ? '' : `_${i + 1}`;
    const envKey =
      i === 0 ? 'ODOO_TEST_PRODUCT_QTY_UPDATE' : `ODOO_TEST_PRODUCT${suffix}_QTY_UPDATE`;
    const fromEnv = process.env[envKey]?.trim();
    const quantity =
      fromEnv != null && fromEnv !== '' ? Number(fromEnv) : (defaults[i] ?? line.quantity);
    return {
      product: line.product,
      productSearch: line.productSearch,
      quantity,
    };
  });
}

async function dismissOdooDialog(page: Page): Promise<void> {
  const closeBtn = page.getByRole('button', { name: 'Close' });
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click();
  }
}

function orderLineDataRows(page: Page) {
  return page.locator('.o_field_one2many[name="order_line"] tbody tr.o_data_row');
}

function orderLineQtyCell(row: Locator): Locator {
  return row.locator('td[name="product_uom_qty"]').first();
}

function orderLineQtyInput(row: Locator): Locator {
  return row.locator('[name="product_uom_qty"] input').first();
}

/** Save the current line (do not use Escape — it drops unsaved rows). */
async function saveOrderLineEditor(page: Page): Promise<void> {
  await page.getByRole('combobox', { name: 'Customer' }).click();
  await page.locator('.o_loading, .o_blockUI').waitFor({
    state: 'hidden',
    timeout: 15_000,
  }).catch(() => {});
  await page.waitForTimeout(400);
}

/** Append one product line on the open order form. */
async function appendOrderLine(
  page: Page,
  line: OdooOrderOptions['lines'][number],
  rowsBefore: number
): Promise<OdooOrderLine> {
  const table = page.locator('.o_field_one2many[name="order_line"]');
  await page.getByRole('tab', { name: 'Order Lines' }).click();
  if (rowsBefore > 0) {
    await commitOrderLines(page);
  }

  const addBtn = table.getByRole('button', { name: 'Add a product' });
  const targetCount = rowsBefore + 1;
  for (let attempt = 1; attempt <= 2; attempt++) {
    await addBtn.click();
    try {
      await expect
        .poll(async () => orderLineDataRows(page).count(), {
          timeout: 30_000,
          intervals: [200, 500, 1000],
        })
        .toBeGreaterThanOrEqual(targetCount);
      break;
    } catch (e) {
      if (attempt === 2) throw e;
      console.log(
        `         ⚠ Line row count still ${rowsBefore}, retry Add a product (${attempt}/2)`
      );
      await commitOrderLines(page);
    }
  }

  if (rowsBefore === 0) {
    await expect(orderLineDataRows(page).first()).toBeVisible({ timeout: 30_000 });
  }

  const row = orderLineDataRows(page).last();
  const productInput = row
    .locator('[name="product_id"] input')
    .or(row.getByRole('combobox', { name: 'Search a product' }))
    .first();

  await productInput.click();
  await productInput.fill(line.productSearch ?? line.product);
  await page.getByRole('option').filter({ hasText: line.product }).first().click();

  const qtyInput = orderLineQtyInput(row);
  await qtyInput.clear();
  await qtyInput.fill(String(line.quantity));
  await qtyInput.press('Tab');

  if (line.unitPrice !== undefined) {
    const priceInput = row.locator('[name="price_unit"] input');
    if ((await priceInput.count()) > 0) {
      await priceInput.clear();
      await priceInput.fill(String(line.unitPrice));
      await priceInput.press('Tab');
    }
  }

  await saveOrderLineEditor(page);

  const qtyText = await qtyInput.inputValue().catch(() => String(line.quantity));
  return {
    product: line.product,
    quantity: parseFloat(qtyText) || line.quantity,
  };
}

/** Close inline editors so Confirm is accepted. */
async function commitOrderLines(page: Page): Promise<void> {
  await saveOrderLineEditor(page);
  await page.getByRole('tab', { name: 'Order Lines' }).click();
  await page.locator('.o_loading, .o_blockUI').waitFor({
    state: 'hidden',
    timeout: 15_000,
  }).catch(() => {});
}

/** Wait for Odoo to finish rendering lines before Confirm. */
async function waitBeforeConfirm(page: Page): Promise<void> {
  await page.locator('.o_loading, .o_blockUI').waitFor({
    state: 'hidden',
    timeout: 30_000,
  }).catch(() => {});

  const confirmBtn = page.getByRole('button', { name: 'Confirm' });
  await confirmBtn.waitFor({ state: 'visible', timeout: 30_000 });
  await expect(confirmBtn).toBeEnabled({ timeout: 30_000 });

  if (ODOO_CONFIRM_WAIT_MS > 0) {
    await page.waitForTimeout(ODOO_CONFIRM_WAIT_MS);
  }
}

/**
 * Open a draft sales order with customer selected — pauses before product lines (Inspector).
 */
export async function openOdooDraftOrderForInspect(
  page: Page,
  opts: { customerSearch?: string; customerName: string }
): Promise<void> {
  console.log('         → Sales → New order (ready to add products)');
  await page.goto(`${ODOO_URL}/sales`, { waitUntil: 'domcontentloaded' });
  await dismissOdooDialog(page);

  await page.getByRole('button', { name: 'New' }).click();

  const customerCombo = page.getByRole('combobox', { name: 'Customer' });
  await customerCombo.click();
  await customerCombo.fill(opts.customerSearch ?? opts.customerName);
  await page.getByRole('option', { name: opts.customerName }).click();
  await commitOrderLines(page);
}

/**
 * Creates a Sales Order in Odoo.
 * Returns display name (S56847) and numeric id for DB: metadata->>'odoo_id'.
 */
export async function createOdooOrder(
  page: Page,
  opts: OdooOrderOptions
): Promise<OdooOrderResult> {
  console.log('         → Sales → New order');
  await page.goto(`${ODOO_URL}/sales`);
  await page.waitForLoadState('domcontentloaded');
  await dismissOdooDialog(page);

  await page.getByRole('button', { name: 'New' }).click();

  const customerCombo = page.getByRole('combobox', { name: 'Customer' });
  await customerCombo.click();
  await customerCombo.fill(opts.customerSearch ?? opts.customerName);
  await page.getByRole('option', { name: opts.customerName }).click();

  const capturedLines: OdooOrderLine[] = [];

  for (let i = 0; i < opts.lines.length; i++) {
    const rowsBefore = i === 0 ? 0 : await orderLineDataRows(page).count();
    console.log(
      `         → Line ${i + 1}/${opts.lines.length}: ${opts.lines[i].product} (qty ${opts.lines[i].quantity})`
    );
    capturedLines.push(await appendOrderLine(page, opts.lines[i], rowsBefore));
  }

  await commitOrderLines(page);
  await waitBeforeConfirm(page);

  const saveBtn = page.getByRole('button', { name: 'Save manually' });
  if (await saveBtn.isVisible().catch(() => false)) {
    await saveBtn.click();
    await page.locator('.o_loading, .o_blockUI').waitFor({
      state: 'hidden',
      timeout: 30_000,
    }).catch(() => {});
  }

  console.log('         → Confirm order');
  await page.getByRole('button', { name: 'Confirm' }).click();

  // URL updates before the status bar radio shows "checked" (often stays disabled briefly)
  await page.waitForURL(/\/sales\/\d+/, { timeout: 90_000 });
  await page.locator('.o_loading, .o_blockUI').waitFor({
    state: 'hidden',
    timeout: 30_000,
  }).catch(() => {});
  await expect(page.getByRole('radio', { name: 'Sales Order' })).toBeChecked({
    timeout: 15_000,
  }).catch(() => {});

  const odooId = page.url().match(/\/sales\/(\d+)/)?.[1] ?? '';
  if (!odooId) {
    throw new Error(`Order confirm failed — expected /sales/<id> in URL, got: ${page.url()}`);
  }

  const orderName = await page
    .locator('.o_breadcrumb .active, .breadcrumb-item.active, h1')
    .first()
    .innerText()
    .catch(() => '');

  const name = orderName.trim() || odooId;
  await waitForOdooSalesOrderComplete(page);
  console.log(`         ✓ Confirmed: ${name} (odoo_id=${odooId}) — creation complete in Odoo`);

  // Use lines captured on the draft form; re-reading the grid after confirm is flaky/slow
  return { name, odooId, lines: capturedLines };
}

/** Odoo UI shows confirmed Sales Order — safe to sync-check DB and later edit lines. */
export async function waitForOdooSalesOrderComplete(page: Page): Promise<void> {
  await page.locator('.o_loading, .o_blockUI').waitFor({
    state: 'hidden',
    timeout: 60_000,
  }).catch(() => {});
  await expect(page.getByRole('radio', { name: 'Sales Order' })).toBeChecked({
    timeout: 60_000,
  });
  console.log('         ✓ Odoo status: Sales Order (creation complete)');
}

async function dismissOdooConfirmDialog(page: Page): Promise<void> {
  const dialog = page.locator('.modal-dialog, .o_dialog');
  if (!(await dialog.isVisible().catch(() => false))) return;
  for (const name of [/^ok$/i, /^yes$/i, /^confirm$/i]) {
    const btn = dialog.getByRole('button', { name });
    if (await btn.first().isVisible().catch(() => false)) {
      await btn.first().click();
      await page.locator('.o_loading, .o_blockUI').waitFor({
        state: 'hidden',
        timeout: 15_000,
      }).catch(() => {});
      return;
    }
  }
}

async function waitForOdooToolbarReady(page: Page): Promise<void> {
  await page.locator('.o_loading, .o_blockUI').waitFor({
    state: 'hidden',
    timeout: 60_000,
  }).catch(() => {});
}

function odooActionButtonLocators(page: Page, label: RegExp | string): Locator[] {
  const pattern =
    typeof label === 'string' ? new RegExp(label, 'i') : label;
  const locs: Locator[] = [
    page.getByRole('button', { name: pattern }),
    page.locator('.o_statusbar_buttons button').filter({ hasText: pattern }),
    page.locator('.o_statusbar_buttons a').filter({ hasText: pattern }),
    page.locator('.o_form_statusbar button').filter({ hasText: pattern }),
    page.locator('.o_form_statusbar a').filter({ hasText: pattern }),
    page.locator('header .o_statusbar_buttons button').filter({ hasText: pattern }),
    page.locator('button').filter({ hasText: pattern }),
  ];
  if (/unlock/i.test(pattern.source)) {
    locs.unshift(page.locator('button[name="action_unlock"]'));
  }
  if (/set to quotation/i.test(pattern.source)) {
    locs.unshift(page.locator('button[name="action_draft"]'));
  }
  return locs;
}

async function findEnabledOdooActionButton(
  page: Page,
  label: RegExp | string
): Promise<Locator | null> {
  for (const loc of odooActionButtonLocators(page, label)) {
    const btn = loc.first();
    if (!(await btn.isVisible().catch(() => false))) continue;
    if (await btn.isEnabled().catch(() => false)) return btn;
  }
  return null;
}

async function waitForEnabledOdooActionButton(
  page: Page,
  label: RegExp | string,
  timeoutMs = 60_000
): Promise<Locator> {
  let found: Locator | null = null;
  await expect
    .poll(
      async () => {
        found = await findEnabledOdooActionButton(page, label);
        return found !== null;
      },
      { timeout: timeoutMs }
    )
    .toBe(true);
  return found!;
}

const ODOO_UI_PROBE_MS = 3_000;

/** Statusbar Confirm — only present on draft/sent quotations, not on confirmed SO. */
function odooStatusbarConfirmButton(page: Page): Locator {
  return page
    .locator('.o_statusbar_buttons')
    .getByRole('button', { name: /^confirm$/i })
    .first();
}

async function isOdooSalesOrderConfirmed(page: Page): Promise<boolean> {
  return page
    .getByRole('radio', { name: /^sales order$/i })
    .isChecked({ timeout: ODOO_UI_PROBE_MS })
    .catch(() => false);
}

async function isOdooOnQuotation(page: Page): Promise<boolean> {
  if (await isOdooSalesOrderConfirmed(page)) return false;

  const quotationChecked = await page
    .getByRole('radio', { name: /^quotation$/i })
    .isChecked({ timeout: ODOO_UI_PROBE_MS })
    .catch(() => false);
  if (quotationChecked) return true;

  const confirm = odooStatusbarConfirmButton(page);
  const visible = await confirm.isVisible({ timeout: ODOO_UI_PROBE_MS }).catch(() => false);
  if (!visible) return false;
  return confirm.isEnabled({ timeout: ODOO_UI_PROBE_MS }).catch(() => false);
}

/** Step 1 — Unlock confirmed sales order; waits until Set to Quotation is available. */
export async function unlockOdooSalesOrder(page: Page): Promise<void> {
  console.log('         → Unlock: open Order Lines tab');
  await page.getByRole('tab', { name: 'Order Lines' }).click();
  await waitForOdooToolbarReady(page);

  if (await findEnabledOdooActionButton(page, /set to quotation/i)) {
    console.log('         ✓ Already unlocked (Set to Quotation available)');
    return;
  }

  if (await isOdooOnQuotation(page)) {
    console.log('         ✓ Already on Quotation');
    return;
  }

  if (!(await isOdooSalesOrderConfirmed(page))) {
    throw new Error(
      'Expected confirmed Sales Order before unlock — status bar is not on Sales Order'
    );
  }

  console.log('         → Looking for enabled Unlock button');
  const unlockBtn = await findEnabledOdooActionButton(page, /unlock/i);
  if (!unlockBtn) {
    const unlockVisible = await page
      .getByRole('button', { name: /unlock/i })
      .first()
      .isVisible({ timeout: ODOO_UI_PROBE_MS })
      .catch(() => false);
    if (unlockVisible) {
      throw new Error(
        'Unlock is visible but disabled — order still locked; wait and retry'
      );
    }
    throw new Error('Enabled Unlock button not found on sales order');
  }

  console.log('         → Click Unlock');
  await unlockBtn.click();
  await waitForOdooToolbarReady(page);
  await dismissOdooConfirmDialog(page);

  console.log('         → Wait for Set to Quotation');
  await waitForEnabledOdooActionButton(page, /set to quotation/i, 60_000);
  console.log('         ✓ Order unlocked — Set to Quotation available');
}

/** Step 2 — Set to Quotation so line quantities can be edited. */
export async function setOdooOrderToQuotation(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Order Lines' }).click();
  await waitForOdooToolbarReady(page);

  if (await isOdooOnQuotation(page)) {
    console.log('         ✓ Already on Quotation');
    return;
  }

  const setQuotationBtn = await waitForEnabledOdooActionButton(
    page,
    /set to quotation/i,
    60_000
  );

  console.log('         → Set to Quotation');
  await setQuotationBtn.click();
  await waitForOdooToolbarReady(page);
  await dismissOdooConfirmDialog(page);

  await expect.poll(() => isOdooOnQuotation(page), { timeout: 60_000 }).toBe(true);
  console.log('         ✓ Order set to Quotation');
}

/** Unlock → Set to Quotation (required before editing qty on confirmed orders). */
export async function unlockOdooSalesOrderForEdit(page: Page): Promise<void> {
  await unlockOdooSalesOrder(page);
  await setOdooOrderToQuotation(page);
}

async function setOrderLineQuantityInRow(
  page: Page,
  row: Locator,
  quantity: number
): Promise<void> {
  await row.scrollIntoViewIfNeeded();

  let textbox = orderLineQtyInput(row);
  if (!(await textbox.isVisible().catch(() => false))) {
    await orderLineQtyCell(row).click({ timeout: 10_000 });
    textbox = orderLineQtyInput(row);
  }
  if (!(await textbox.isVisible().catch(() => false))) {
    await row.dblclick();
    await page.waitForTimeout(400);
    textbox = orderLineQtyInput(row).or(row.getByRole('textbox').last());
  }

  await expect(textbox).toBeVisible({ timeout: 10_000 });
  await textbox.click();
  await textbox.press('Control+a');
  await textbox.fill(String(quantity));
  await textbox.press('Tab');
  await page.waitForTimeout(400);
}

async function saveOdooSalesOrderChanges(page: Page): Promise<void> {
  await commitOrderLines(page);
  const saveBtn = page.getByRole('button', { name: 'Save manually' });
  if (await saveBtn.isVisible().catch(() => false)) {
    console.log('         → Save manually');
    await saveBtn.click();
    await page.locator('.o_loading, .o_blockUI').waitFor({
      state: 'hidden',
      timeout: 30_000,
    }).catch(() => {});
  }
  await page.waitForTimeout(800);
}

/** Step 4 — Confirm order after qty edit (back to Sales Order). */
export async function confirmOdooSalesOrder(page: Page): Promise<void> {
  const confirmBtn = odooStatusbarConfirmButton(page);
  await confirmBtn.waitFor({ state: 'visible', timeout: 30_000 });
  await expect(confirmBtn).toBeEnabled({ timeout: 60_000 });
  console.log('         → Confirm order');
  await confirmBtn.click();
  await waitForOdooToolbarReady(page);
  await dismissOdooConfirmDialog(page);
  await waitForOdooSalesOrderComplete(page);
  console.log('         ✓ Order confirmed — Sales Order');
}

/** @deprecated Use confirmOdooSalesOrder — kept for compatibility. */
export async function lockOdooSalesOrder(page: Page): Promise<void> {
  await confirmOdooSalesOrder(page);
}

/**
 * Unlock → Set to Quotation → update qty → Confirm.
 * Call only after creation + initial DB verify completed.
 */
export type OdooOrderUpdateResult = {
  lines: OdooOrderLine[];
  odooTotalInclTax: number;
  odooUntaxed: number;
};

export async function updateOdooOrderLineQuantities(
  page: Page,
  updates: OdooLineQuantityUpdate[],
  opts?: { odooId?: string }
): Promise<OdooOrderUpdateResult> {
  console.log('         → Flow: Unlock → Set to Quotation → update qty → Confirm');
  const odooId =
    opts?.odooId?.trim() || page.url().match(/\/sales\/(\d+)/)?.[1] || '';
  if (odooId) {
    const orderUrl = `${ODOO_URL}/sales/${odooId}`;
    console.log(`         → Re-open order after DB wait: ${orderUrl}`);
    await page.goto(orderUrl, { waitUntil: 'domcontentloaded' });
  } else {
    console.log('         → Reload order form (no odoo id in URL)');
    await page.reload({ waitUntil: 'domcontentloaded' });
  }
  await waitForOdooSalesOrderComplete(page);
  await unlockOdooSalesOrder(page);
  await setOdooOrderToQuotation(page);

  const rows = orderLineDataRows(page);
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  const rowCount = await rows.count();
  if (rowCount < updates.length) {
    throw new Error(`Expected ${updates.length} line rows, found ${rowCount}`);
  }

  for (let i = 0; i < updates.length; i++) {
    const u = updates[i];
    console.log(
      `         → Line ${i + 1}/${updates.length}: ${u.product} → qty ${u.quantity}`
    );
    await setOrderLineQuantityInRow(page, rows.nth(i), u.quantity);
    await saveOrderLineEditor(page);
  }

  await saveOdooSalesOrderChanges(page);
  await confirmOdooSalesOrder(page);
  await waitForOdooToolbarReady(page);

  console.log('         → Read Odoo totals after update (for Phase 3 DB verify)');
  const odooTotalInclTax = await getOdooOrderTotal(page);
  const odooUntaxed = await getOdooOrderUntaxedTotal(page);
  console.log(
    `         ✓ Odoo totals: ${odooUntaxed} ex VAT, ${odooTotalInclTax} incl. VAT`
  );

  const lines = updates.map((u) => ({ product: u.product, quantity: u.quantity }));
  console.log('         ✓ Qty update complete — target quantities for DB line compare');
  return { lines, odooTotalInclTax, odooUntaxed };
}

export async function waitForSyncAfterOdooUpdate(): Promise<void> {
  const ms = Number(process.env.SYNC_UPDATE_WAIT_MS ?? 30_000);
  console.log(
    `[Sync] Waiting ${Math.round(ms / 1000)}s after update (SYNC_UPDATE_WAIT_MS)…`
  );
  await new Promise((r) => setTimeout(r, ms));
}

// ─── Sync wait (automatic Odoo → Medusa after confirm) ─────────────────────

/** Wait for automatic sync pipeline (default 1 min — see SYNC_DB_WAIT_MS). */
export async function waitForAutomaticSync(): Promise<void> {
  console.log('[Sync] Odoo → Medusa syncs automatically after order confirm.');
  await waitBeforeDbQuery();
}

// ─── Odoo: Read order data ────────────────────────────────────────────────────

async function readLineFromRow(row: ReturnType<Page['locator']>): Promise<OdooOrderLine | null> {
  const product =
    (await row
      .getByRole('combobox', { name: 'Search a product' })
      .inputValue()
      .catch(() => '')) ||
    (await row
      .locator('[name="product_id"] .o_field_widget, [name="product_id"]')
      .first()
      .innerText()
      .catch(() => ''));

  if (!product.trim()) return null;

  const qtyInput = row.locator('[name="product_uom_qty"] input');
  let quantity = 1;
  if ((await qtyInput.count()) > 0) {
    quantity = parseFloat((await qtyInput.first().inputValue()) || '1') || 1;
  } else {
    const qtyText = await row
      .locator('[name="product_uom_qty"]')
      .first()
      .innerText()
      .catch(() => '1');
    quantity = parseFloat(qtyText.replace(/[^\d.]/g, '')) || 1;
  }

  return { product: product.trim(), quantity };
}

/** Read product + quantity from the order lines table on the current Odoo form. */
export async function getOdooOrderLines(page: Page): Promise<OdooOrderLine[]> {
  if (page.isClosed()) return [];

  await page.getByRole('tab', { name: 'Order Lines' }).click().catch(() => {});

  const lines: OdooOrderLine[] = [];
  const selectors = [
    '.o_field_one2many[name="order_line"] tbody tr.o_data_row',
    '.o_list_renderer tbody tr.o_data_row',
    'tbody tr.o_data_row',
    'tbody tr',
  ];

  for (const sel of selectors) {
    const rows = page.locator(sel).filter({
      has: page.locator('[name="product_id"], [name="product_uom_qty"]'),
    });
    const count = await rows.count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      const line = await readLineFromRow(rows.nth(i));
      if (line) lines.push(line);
    }
    if (lines.length > 0) break;
  }

  return lines;
}

/** Print a table of product lines with quantities. */
export function logOdooLines(label: string, lines: OdooOrderLine[]): void {
  console.log(`\n  ${label}`);
  console.log('  ┌────┬────────────────────────────────────────────┬──────────┐');
  console.log('  │ #  │ Product                                    │ Quantity │');
  lines.forEach((l, i) => {
    const prod = l.product.length > 42 ? `${l.product.slice(0, 39)}...` : l.product;
    console.log(
      `  │ ${String(i + 1).padStart(2)} │ ${prod.padEnd(42)} │ ${String(l.quantity).padStart(8)} │`
    );
  });
  console.log('  └────┴────────────────────────────────────────────┴──────────┘');
}

const ODOO_READ_TIMEOUT_MS = 15_000;

export async function getOdooOrderTotal(page: Page): Promise<number> {
  const text = await page
    .locator('[name="amount_total"] .o_field_monetary, [name="amount_total"]')
    .first()
    .innerText({ timeout: ODOO_READ_TIMEOUT_MS });
  return parseCurrency(text);
}

/** Subtotal excl. VAT (amount_untaxed on Odoo form). */
export async function getOdooOrderUntaxedTotal(page: Page): Promise<number> {
  const text = await page
    .locator('[name="amount_untaxed"] .o_field_monetary, [name="amount_untaxed"]')
    .first()
    .innerText({ timeout: ODOO_READ_TIMEOUT_MS });
  return parseCurrency(text);
}

export async function getOdooDeliveryFee(page: Page): Promise<number> {
  try {
    const deliveryRow = page.locator('tr', { hasText: /delivery|shipping/i }).first();
    const feeText = await deliveryRow.locator('[name="price_subtotal"], td').last().innerText();
    return parseCurrency(feeText);
  } catch {
    return 0;
  }
}

export async function getOdooOrderStatus(page: Page): Promise<string> {
  return (
    await page
      .locator('.o_statusbar_status .btn-primary, .o_field_statusbar .o_status_label')
      .first()
      .innerText()
  ).trim();
}

export async function getOdooCustomerName(page: Page): Promise<string> {
  return (
    await page.locator('[name="partner_id"] .o_field_widget').first().innerText()
  ).trim();
}

// ─── Medusa: Find and read order ──────────────────────────────────────────────

/**
 * Search for an order in Medusa Admin using the Odoo order name as reference.
 * Adjust the search field if your integration stores the reference differently.
 */
export async function findMedusaOrderByRef(page: Page, odooOrderName: string): Promise<void> {
  await page.goto(`${MEDUSA_APP_URL}/orders/list`);
  await page.waitForLoadState('networkidle');

  const searchBox = page.getByPlaceholder(/search/i).first();
  await searchBox.fill(odooOrderName);
  await page.keyboard.press('Enter');
  await page.waitForLoadState('networkidle');

  // Click the first matching result
  await page.getByText(odooOrderName).first().click();
  await page.waitForLoadState('networkidle');
}

/**
 * Open orders list and click the row that contains `order.display_id` from the DB row.
 */
export async function openMedusaOrderByDisplayId(
  page: Page,
  displayId: string
): Promise<void> {
  const id = String(displayId).trim();
  const rowMatchers = [id, `#${id}`];

  console.log(`[Medusa] Open orders list → click row containing display_id ${id}`);
  await page.goto(`${MEDUSA_APP_URL}/orders/list`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {});

  await page
    .locator('table tbody tr, [data-testid="orders-table"] [role="row"], tbody tr')
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 })
    .catch(() => {});

  if (await clickOrderRowWithDisplayId(page, rowMatchers)) {
    return;
  }

  const searchBox = page.getByPlaceholder(/search/i).first();
  if (await searchBox.isVisible().catch(() => false)) {
    console.log(`[Medusa] Row not visible — search list for ${id}`);
    await searchBox.fill(id);
    await page.keyboard.press('Enter');
    await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {});
    if (await clickOrderRowWithDisplayId(page, rowMatchers)) {
      return;
    }
  }

  throw new Error(
    `No order row containing display_id "${id}" on ${MEDUSA_APP_URL}/orders/list`
  );
}

async function clickOrderRowWithDisplayId(
  page: Page,
  rowMatchers: string[]
): Promise<boolean> {
  for (const text of rowMatchers) {
    const row = page.getByRole('row').filter({ hasText: text }).first();
    if (await row.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await row.click();
      await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {});
      console.log(`[Medusa] Clicked order row containing "${text}"`);
      return true;
    }

    const cell = page.getByRole('cell', { name: new RegExp(`#?${text}`, 'i') }).first();
    if (await cell.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await cell.click();
      await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {});
      console.log(`[Medusa] Clicked cell "${text}"`);
      return true;
    }
  }
  return false;
}

/** @deprecated Use openMedusaOrderByDisplayId with order.display_id from DB */
export async function openMedusaOrderById(page: Page, medusaOrderId: string): Promise<void> {
  return openMedusaOrderByDisplayId(page, medusaOrderId);
}

export async function getMedusaOrderTotal(page: Page): Promise<number> {
  const byTestId = page.getByTestId('order-total');
  if (await byTestId.isVisible().catch(() => false)) {
    return parseCurrency(await byTestId.innerText());
  }

  const totalRow = page
    .locator('tr, [class*="row"], div')
    .filter({ hasText: /^total$/i })
    .first();
  if (await totalRow.isVisible().catch(() => false)) {
    const rowText = await totalRow.innerText();
    const amounts = rowText.match(/[\d,]+\.?\d*/g);
    if (amounts?.length) {
      return parseCurrency(amounts[amounts.length - 1]);
    }
  }

  throw new Error(
    'Could not read order total in Medusa admin — add data-testid="order-total" or update getMedusaOrderTotal()'
  );
}

export async function getMedusaShippingFee(page: Page): Promise<number> {
  const text = await page.getByTestId('shipping-fee').innerText();
  return parseCurrency(text);
}

export async function getMedusaOrderStatus(page: Page): Promise<string> {
  return (
    await page
      .locator('[data-testid="order-status"], .order-status-badge')
      .first()
      .innerText()
  ).trim();
}

export async function getMedusaCustomerEmail(page: Page): Promise<string> {
  return (
    await page.locator('[data-testid="customer-email"]').first().innerText()
  ).trim();
}

// ─── Odoo: Delivery picks (stock picking / transfers) ─────────────────────────

export interface OdooDeliveryPickLine {
  product: string;
  demand: number;
  quantity: number;
}

export interface OdooDeliveryPickQuantityUpdate {
  product: string;
  quantity: number;
}

/** Done-qty targets on delivery pick lines — defaults to post-SO update qty (3, 0.5, 12.36). */
export function buildOdooDeliveryPickQuantityUpdates(): OdooDeliveryPickQuantityUpdate[] {
  return buildPostCreateQuantityUpdates().map((u) => ({
    product: u.product,
    quantity: u.quantity,
  }));
}

/** Only transfers in Waiting status (skips Done / Cancelled). */
function isWaitingTransferRow(text: string): boolean {
  return /\bwaiting\b/i.test(text);
}

/** Transfers to update + validate (default: WH/PICK then WH/OUT, Waiting only). */
export function parseOdooDeliveryTransferRefs(): string[] {
  const raw = process.env.ODOO_DELIVERY_TRANSFER_TYPES?.trim();
  if (raw) {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return ['WH/PICK', 'WH/OUT'];
}

/** Transfer list rows only (reference contains WH/). */
function deliveryTransferListRows(page: Page) {
  return page
    .locator('.o_list_view tbody tr.o_data_row, .o_list_table tbody tr.o_data_row')
    .filter({ hasText: /WH\// });
}

async function waitForDeliveryTransferList(page: Page): Promise<void> {
  await expect
    .poll(async () => deliveryTransferListRows(page).count(), {
      timeout: 60_000,
      intervals: [300, 500, 1000],
    })
    .toBeGreaterThan(0);
}

/** Breadcrumb only — never goto action URL (loads all warehouse transfers). */
async function returnToOdooDeliveryTransferList(page: Page): Promise<void> {
  const transfersLink = page.getByRole('link', { name: /^transfers$/i });
  if (await transfersLink.isVisible().catch(() => false)) {
    console.log('         → Back to transfers list (breadcrumb)');
    await transfersLink.click();
    await waitForOdooToolbarReady(page);
    await waitForDeliveryTransferList(page);
    return;
  }
  throw new Error(
    'Cannot return to order transfers list — use Delivery on the sales order again'
  );
}

/** Odoo chain: PICK → … → OUT via toolbar button after validating PICK. */
export async function goToNextOdooDeliveryTransfer(page: Page): Promise<string> {
  await waitForOdooToolbarReady(page);

  const prevName = await readCurrentTransferRef(page);
  const nextBtn = page.locator('button[name="action_next_transfer"]').first();
  await nextBtn.waitFor({ state: 'visible', timeout: 30_000 });
  await expect(nextBtn).toBeEnabled({ timeout: 60_000 });

  console.log(`         → Next Transfer (from ${prevName})`);
  await nextBtn.click();
  await waitForOdooToolbarReady(page);
  await dismissOdooConfirmDialog(page);

  await expect
    .poll(async () => readCurrentTransferRef(page), { timeout: 60_000 })
    .not.toBe(prevName);

  await ensureOdooDeliveryPickOperationsVisible(page);
  await expect(deliveryMoveDataRows(page).first()).toBeVisible({
    timeout: 30_000,
  });

  const name = await readCurrentTransferRef(page);
  console.log(`         ✓ Next transfer open: ${name}`);
  return name;
}

async function readCurrentTransferRef(page: Page): Promise<string> {
  const ref = await page
    .locator('.o_breadcrumb .active, h1')
    .first()
    .innerText()
    .catch(() => '');
  return ref.replace(/\s+/g, ' ').trim() || page.url();
}

export async function openOdooSalesOrderById(
  page: Page,
  odooId: string
): Promise<void> {
  const orderUrl = `${ODOO_URL}/sales/${odooId}`;
  console.log(`         → Open sales order: ${orderUrl}`);
  await page.goto(orderUrl, { waitUntil: 'domcontentloaded' });
  await waitForOdooToolbarReady(page);
  await dismissOdooDialog(page);
  await waitForOdooSalesOrderComplete(page);
}

function deliveryMoveDataRows(page: Page) {
  return page.locator(
    '.o_field_one2many[name="move_ids_without_package"] tbody tr.o_data_row'
  );
}

function deliveryMoveQtyInput(row: Locator): Locator {
  return row.locator('[name="quantity"] input').first();
}

function deliveryMoveQtyCell(row: Locator): Locator {
  return row.locator('td[name="quantity"], [name="quantity"]').first();
}

async function ensureOdooDeliveryPickOperationsVisible(page: Page): Promise<void> {
  await waitForOdooToolbarReady(page);

  const opsTab = page.getByRole('tab', { name: 'Operations' });
  if (await opsTab.isVisible().catch(() => false)) {
    await opsTab.click();
    await waitForOdooToolbarReady(page);
  }
}

function transferRefPattern(transferRef: string): RegExp {
  const escaped = transferRef.replace(/[/]/g, '\\/');
  return new RegExp(escaped);
}

async function findDeliveryTransferRow(
  page: Page,
  transferRef: string,
  orderName?: string
): Promise<Locator> {
  let rows = deliveryTransferListRows(page);
  const n = await rows.count();
  if (n > 15) {
    throw new Error(
      `Transfers list has ${n} rows (expected ≤15 for this order). ` +
        'Re-open Delivery from the sales order — do not reload the action URL.'
    );
  }

  const pattern = transferRefPattern(transferRef);
  const statuses: string[] = [];

  for (let i = 0; i < n; i++) {
    const row = rows.nth(i);
    const text = (await row.innerText()).replace(/\s+/g, ' ');
    if (!pattern.test(text)) continue;
    if (orderName && !text.includes(orderName)) continue;

    const status = text.match(
      /\b(Waiting|Done|Cancelled|Ready|Draft)\b/i
    )?.[1];
    statuses.push(`${transferRef} row ${i + 1}: ${status ?? 'unknown'}`);

    if (!isWaitingTransferRow(text)) continue;

    console.log(
      `         → Waiting ${transferRef}: ${text.match(/WH\/[^\s|]+/)?.[0] ?? text.slice(0, 40)}`
    );
    return row;
  }

  throw new Error(
    `No Waiting "${transferRef}" for this order (${n} row(s)). ` +
      `Seen: ${statuses.join('; ') || 'none'}`
  );
}

async function readDeliveryMoveFromRow(
  row: Locator
): Promise<OdooDeliveryPickLine | null> {
  const product =
    (await row
      .locator('[name="product_id"]')
      .first()
      .innerText()
      .catch(() => '')) || '';
  if (!product.trim()) return null;

  const demandInp = row.locator('[name="product_uom_qty"] input');
  let demand = 0;
  if ((await demandInp.count()) > 0) {
    demand = parseFloat((await demandInp.inputValue()) || '0') || 0;
  } else {
    const t = await row
      .locator('[name="product_uom_qty"]')
      .first()
      .innerText()
      .catch(() => '0');
    demand = parseFloat(t.replace(/[^\d.]/g, '')) || 0;
  }

  const qtyInp = deliveryMoveQtyInput(row);
  let quantity = 0;
  if (await qtyInp.isVisible().catch(() => false)) {
    quantity = parseFloat((await qtyInp.inputValue()) || '0') || 0;
  } else {
    const t = await deliveryMoveQtyCell(row).innerText().catch(() => '0');
    quantity = parseFloat(t.replace(/[^\d.]/g, '')) || 0;
  }

  return { product: product.trim(), demand, quantity };
}

function deliveryRowMatchesProduct(rowProduct: string, target: string): boolean {
  const a = rowProduct.toLowerCase();
  const b = target.toLowerCase();
  if (a.includes(b) || b.includes(a)) return true;
  const short = b.slice(0, Math.min(24, b.length));
  return short.length >= 8 && a.includes(short);
}

async function setDeliveryMoveQuantityInRow(
  page: Page,
  row: Locator,
  quantity: number
): Promise<void> {
  await row.scrollIntoViewIfNeeded();

  let textbox = deliveryMoveQtyInput(row);
  if (!(await textbox.isVisible().catch(() => false))) {
    await deliveryMoveQtyCell(row).click({ timeout: 10_000 });
    textbox = deliveryMoveQtyInput(row);
  }
  if (!(await textbox.isVisible().catch(() => false))) {
    await row.dblclick();
    await page.waitForTimeout(400);
    textbox = deliveryMoveQtyInput(row);
  }

  await expect(textbox).toBeVisible({ timeout: 10_000 });
  await textbox.click();
  await textbox.press('Control+a');
  await textbox.fill(String(quantity));
  await textbox.press('Tab');
  await page.waitForTimeout(400);
}

/** Sales order → Delivery → order-scoped transfers list (do not reload action URL). */
export async function openOdooDeliveryTransferList(
  page: Page,
  odooId: string
): Promise<string> {
  await openOdooSalesOrderById(page, odooId);

  const orderName = await page
    .locator('.o_breadcrumb .active, h1')
    .first()
    .innerText()
    .catch(() => '');
  const orderLabel = orderName.replace(/\s+/g, ' ').trim();

  console.log('         → Delivery: open transfers list');
  const deliveryBtn = page.locator('button[name="action_view_delivery"]').first();
  await deliveryBtn.waitFor({ state: 'visible', timeout: 30_000 });
  await deliveryBtn.click();
  await waitForOdooToolbarReady(page);
  await page.waitForURL(/\/sales\/\d+\/action-\d+/, { timeout: 60_000 });

  if ((await deliveryTransferListRows(page).count()) === 0) {
    await returnToOdooDeliveryTransferList(page).catch(() => {});
  }

  await waitForDeliveryTransferList(page);
  const count = await deliveryTransferListRows(page).count();
  if (count > 15) {
    throw new Error(
      `Transfers list has ${count} rows — expected only this order's deliveries`
    );
  }
  console.log(
    `         ✓ Order transfers list (${count} row(s))${orderLabel ? ` — ${orderLabel}` : ''}`
  );
  return orderLabel;
}

/**
 * Open one transfer from the list (e.g. WH/PICK or WH/OUT).
 * Returns full reference (e.g. WH/PICK/48242).
 */
export async function openOdooDeliveryTransferByRef(
  page: Page,
  transferRef: string,
  opts?: { orderName?: string; alreadyOnList?: boolean }
): Promise<string> {
  if (!opts?.alreadyOnList) {
    await returnToOdooDeliveryTransferList(page);
  } else {
    await waitForDeliveryTransferList(page);
  }

  const row = await findDeliveryTransferRow(
    page,
    transferRef,
    opts?.orderName
  );
  const rowText = (await row.innerText()).replace(/\s+/g, ' ').trim().slice(0, 80);
  console.log(`         → Open transfer ${transferRef} — ${rowText}`);

  await row.dblclick();
  await waitForOdooToolbarReady(page);
  await page
    .waitForURL(/\/action-\d+\/\d+/, { timeout: 60_000 })
    .catch(() => {});

  await ensureOdooDeliveryPickOperationsVisible(page);
  await expect(deliveryMoveDataRows(page).first()).toBeVisible({
    timeout: 30_000,
  });

  const name = await readCurrentTransferRef(page);
  const pattern = transferRefPattern(transferRef);
  if (!pattern.test(name)) {
    throw new Error(
      `Expected transfer ${transferRef}, but form shows: ${name}`
    );
  }
  console.log(`         ✓ Transfer open: ${name}`);
  return name;
}

/**
 * Sales order → Delivery → open one transfer (by ref or list index).
 * @deprecated Prefer openOdooDeliveryTransferList + openOdooDeliveryTransferByRef
 */
export async function openOdooDeliveryPickFromSalesOrder(
  page: Page,
  opts?: { odooId?: string; pickIndex?: number; transferRef?: string }
): Promise<string> {
  const odooId =
    opts?.odooId?.trim() || page.url().match(/\/sales\/(\d+)/)?.[1] || '';
  if (!odooId) {
    throw new Error('openOdooDeliveryPickFromSalesOrder: odooId required');
  }

  const orderName = await openOdooDeliveryTransferList(page, odooId);

  if (opts?.transferRef) {
    return openOdooDeliveryTransferByRef(page, opts.transferRef, {
      orderName,
      alreadyOnList: true,
    });
  }

  const pickIndex = opts?.pickIndex ?? 0;
  const row = deliveryTransferListRows(page).nth(pickIndex);
  await row.dblclick();
  await waitForOdooToolbarReady(page);
  await ensureOdooDeliveryPickOperationsVisible(page);
  return readCurrentTransferRef(page);
}

/** Read Operations lines on the open delivery pick form. */
export async function getOdooDeliveryPickLines(
  page: Page
): Promise<OdooDeliveryPickLine[]> {
  await ensureOdooDeliveryPickOperationsVisible(page);
  const lines: OdooDeliveryPickLine[] = [];
  const rows = deliveryMoveDataRows(page);
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    const line = await readDeliveryMoveFromRow(rows.nth(i));
    if (line) lines.push(line);
  }
  return lines;
}

export function logOdooDeliveryPickLines(
  label: string,
  lines: OdooDeliveryPickLine[]
): void {
  console.log(`\n  ${label}`);
  console.log('  ┌────┬────────────────────────────────────────────┬──────────┬──────────┐');
  console.log('  │ #  │ Product                                    │ Demand   │ Done     │');
  for (let i = 0; i < lines.length; i++) {
    const p = lines[i].product.length > 42 ? `${lines[i].product.slice(0, 39)}...` : lines[i].product;
    const d = String(lines[i].demand).padStart(8);
    const q = String(lines[i].quantity).padStart(8);
    console.log(`  │ ${String(i + 1).padStart(2)} │ ${p.padEnd(42)} │ ${d} │ ${q} │`);
  }
  console.log('  └────┴────────────────────────────────────────────┴──────────┴──────────┘');
}

/** Set done qty on each Operations line on the currently open transfer form. */
export async function setOdooDeliveryPickLineQuantitiesOnForm(
  page: Page,
  updates: OdooDeliveryPickQuantityUpdate[]
): Promise<OdooDeliveryPickLine[]> {
  await ensureOdooDeliveryPickOperationsVisible(page);

  const rows = deliveryMoveDataRows(page);
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  const rowCount = await rows.count();

  for (let u = 0; u < updates.length; u++) {
    const update = updates[u];
    let matched = false;
    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      const line = await readDeliveryMoveFromRow(row);
      if (!line || !deliveryRowMatchesProduct(line.product, update.product)) {
        continue;
      }
      console.log(
        `         → Line ${i + 1}/${rowCount}: ${update.product} → done qty ${update.quantity}`
      );
      await setDeliveryMoveQuantityInRow(page, row, update.quantity);
      matched = true;
      break;
    }
    if (!matched) {
      throw new Error(
        `Delivery pick line not found for product: ${update.product}`
      );
    }
  }

  const saveBtn = page.getByRole('button', { name: 'Save manually' });
  if (await saveBtn.isVisible().catch(() => false)) {
    console.log('         → Save transfer');
    await saveBtn.click();
    await waitForOdooToolbarReady(page);
  }

  const lines = await getOdooDeliveryPickLines(page);
  console.log('         ✓ Transfer quantities updated');
  return lines;
}

/**
 * Open delivery pick → set done quantity on each Operations line → save.
 * Single transfer only; use updateAndValidateOdooDeliveryTransfers for WH/PICK + WH/OUT.
 */
export async function updateOdooDeliveryPickLineQuantities(
  page: Page,
  updates: OdooDeliveryPickQuantityUpdate[],
  opts?: { odooId?: string; pickIndex?: number; transferRef?: string }
): Promise<OdooDeliveryPickLine[]> {
  const odooId =
    opts?.odooId?.trim() || page.url().match(/\/sales\/(\d+)/)?.[1] || '';
  if (!odooId) {
    throw new Error('updateOdooDeliveryPickLineQuantities: odooId required');
  }

  const orderName = await openOdooDeliveryTransferList(page, odooId);
  if (opts?.transferRef) {
    await openOdooDeliveryTransferByRef(page, opts.transferRef, {
      orderName,
      alreadyOnList: true,
    });
  } else {
    await deliveryTransferListRows(page)
      .nth(opts?.pickIndex ?? 0)
      .dblclick();
    await waitForOdooToolbarReady(page);
    await ensureOdooDeliveryPickOperationsVisible(page);
  }

  return setOdooDeliveryPickLineQuantitiesOnForm(page, updates);
}

export type OdooDeliveryTransferResult = {
  transferRef: string;
  transferName: string;
  lines: OdooDeliveryPickLine[];
};

/**
 * WH/PICK (Waiting) → qty → Validate → Next Transfer → WH/OUT → qty → Validate.
 */
export async function updateAndValidateOdooDeliveryTransfers(
  page: Page,
  updates: OdooDeliveryPickQuantityUpdate[],
  opts: { odooId: string; transferRefs?: string[] }
): Promise<OdooDeliveryTransferResult[]> {
  const refs = opts.transferRefs ?? parseOdooDeliveryTransferRefs();
  const pickRef = refs[0] ?? 'WH/PICK';
  const outRef = refs[1] ?? 'WH/OUT';
  const results: OdooDeliveryTransferResult[] = [];

  const orderName = await openOdooDeliveryTransferList(page, opts.odooId);

  console.log(`\n         ═══ ${pickRef} (Waiting) ═══`);
  const pickName = await openOdooDeliveryTransferByRef(page, pickRef, {
    orderName,
    alreadyOnList: true,
  });
  let lines = await setOdooDeliveryPickLineQuantitiesOnForm(page, updates);
  logOdooDeliveryPickLines(`Lines after update (${pickRef}):`, lines);
  await validateOdooDeliveryPick(page);
  results.push({ transferRef: pickRef, transferName: pickName, lines });

  const nextTransferWaitMs = Number(
    process.env.ODOO_NEXT_TRANSFER_WAIT_MS ?? 10_000
  );
  console.log(
    `         → Wait ${nextTransferWaitMs / 1000}s after PICK validate, then Next Transfer`
  );
  await page.waitForTimeout(nextTransferWaitMs);

  console.log(`\n         ═══ ${outRef} (Next Transfer) ═══`);
  const outName = await goToNextOdooDeliveryTransfer(page);
  const outPattern = transferRefPattern(outRef);
  if (!outPattern.test(outName)) {
    throw new Error(
      `Next Transfer opened "${outName}" — expected ${outRef}`
    );
  }

  lines = await setOdooDeliveryPickLineQuantitiesOnForm(page, updates);
  logOdooDeliveryPickLines(`Lines after update (${outRef}):`, lines);
  await validateOdooDeliveryPick(page);
  results.push({ transferRef: outRef, transferName: outName, lines });

  console.log(
    `         ✓ PICK → OUT done: ${results.map((r) => r.transferName).join(' → ')}`
  );
  return results;
}

/** Validate transfer only (does not click Check Availability). */
export async function validateOdooDeliveryPick(page: Page): Promise<void> {
  await waitForOdooToolbarReady(page);
  await ensureOdooDeliveryPickOperationsVisible(page);

  const validateBtn = page
    .locator('button[name="button_validate"]')
    .or(page.getByRole('button', { name: /^validate$/i }))
    .first();

  if (!(await validateBtn.isVisible().catch(() => false))) {
    console.log('         ✓ Transfer already validated (no Validate button)');
    return;
  }

  console.log('         → Validate');
  await expect(validateBtn).toBeEnabled({ timeout: 90_000 });
  await validateBtn.click();
  await waitForOdooToolbarReady(page);
  await dismissOdooConfirmDialog(page);

  const applyImmediate = page.getByRole('button', { name: /^apply$/i });
  if (await applyImmediate.isVisible().catch(() => false)) {
    console.log('         → Apply immediate transfer');
    await applyImmediate.click();
    await waitForOdooToolbarReady(page);
    await dismissOdooConfirmDialog(page);
  }

  console.log('         ✓ Delivery pick validated');
}

// ─── Odoo: Invoice payment ────────────────────────────────────────────────────

function odooPayInvoiceDialog(page: Page) {
  return page.locator('.modal-dialog').filter({ hasText: /^pay/i }).last();
}

/**
 * Sales order → Invoices → Pay → Create Payment (register payment wizard).
 */
export async function payOdooSalesOrderInvoice(
  page: Page,
  odooId: string
): Promise<void> {
  await openOdooSalesOrderById(page, odooId);

  console.log('         → Invoices');
  const invoicesBtn = page.locator('button[name="action_view_invoice"]').first();
  await invoicesBtn.waitFor({ state: 'visible', timeout: 30_000 });
  await invoicesBtn.click();
  await waitForOdooToolbarReady(page);
  await page
    .waitForURL(/\/invoicing\/|\/invoice\/|\/account\//, { timeout: 60_000 })
    .catch(() => {});

  const payBtn = page.getByRole('button', { name: /^pay$/i }).first();
  await payBtn.waitFor({ state: 'visible', timeout: 30_000 });
  await expect(payBtn).toBeEnabled({ timeout: 60_000 });

  console.log('         → Pay');
  await payBtn.click();
  await waitForOdooToolbarReady(page);

  const payDialog = odooPayInvoiceDialog(page);
  await payDialog.waitFor({ state: 'visible', timeout: 30_000 });

  const createPaymentBtn = payDialog
    .locator('button[name="action_create_payments"]')
    .or(payDialog.getByRole('button', { name: /create payment/i }))
    .first();

  console.log('         → Create Payment');
  await createPaymentBtn.waitFor({ state: 'visible', timeout: 30_000 });
  await expect(createPaymentBtn).toBeEnabled({ timeout: 60_000 });
  await createPaymentBtn.click();
  await waitForOdooToolbarReady(page);
  await dismissOdooConfirmDialog(page);

  console.log('         ✓ Invoice payment created (Create Payment)');
}

// ─── Utilities ────────────────────────────────────────────────────────────────

export function parseCurrency(text: string): number {
  return parseFloat(text.replace(/[^0-9.]/g, '')) || 0;
}

export async function waitForSync(ms = SYNC_WAIT_MS): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

/** Unique reference tag for traceability in test runs */
export function testTag(): string {
  return `AUTO-${Date.now()}`;
}
