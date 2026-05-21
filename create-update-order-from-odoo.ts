/**

 * Debug — full cycle with printed steps (Odoo → DB).

 * Run: npm run test:step1  (requires: npm run db:proxy)
 * Full create + update + DB re-verify: npm run test:step1:full
 * Update only (same as full): npm run test:step1:update
 * Inspector: npm run test:step1:debug  (login Odoo, then pause — not a blank page)

 */



import { test, expect } from '@playwright/test';

import {

  loginOdoo,

  // loginMedusa,

  // MEDUSA_APP_URL,

  createOdooOrder,

  buildPostCreateQuantityUpdates,

  updateOdooOrderLineQuantities,

  openOdooDraftOrderForInspect,

  getOdooOrderTotal,

  getOdooOrderUntaxedTotal,

  // openMedusaOrderByDisplayId,

  // getMedusaOrderTotal,

  logOdooLines,

  // AMOUNT_TOLERANCE,

  ODOO_URL,

  ODOO_TEST_CUSTOMER,

  ODOO_TEST_CUSTOMER_SEARCH,

  buildOdooTestOrderLines,

} from './sync.helpers';

import {

  verifyDbConnection,

  completeCreationOrderInDb,

  completeOrderUpdateInDb,

  logDbLines,

} from './db.helpers';

import { logFlowStep, logFlowHeader, logFlowSummary, resetFlowSteps } from './flow-log';



test.describe('Debug — Odoo create + DB verify', () => {

  // test('DEBUG-MEDUSA-LOGIN | Medusa Admin login only, then pause', async ({ page }) => {

  //   resetFlowSteps();

  //   logFlowHeader('DEBUG-MEDUSA-LOGIN');

  //   logFlowStep('Open Medusa login', `${MEDUSA_APP_URL}/login`);

  //   await loginMedusa(page);

  //   logFlowStep('Login successful', page.url());

  //   await page.pause();

  // });



  test('DEBUG-LOGIN | Open Odoo and log in, then pause', async ({ page }) => {

    resetFlowSteps();

    logFlowHeader('DEBUG-LOGIN');

    logFlowStep('Open Odoo and log in', ODOO_URL);

    await loginOdoo(page);

    logFlowStep('Login successful');

    await page.pause();

  });



  test('DEBUG-INSPECT | Odoo draft order — pause to inspect add-product cycle', async ({
    page,
  }) => {

    resetFlowSteps();

    logFlowHeader('DEBUG-INSPECT — add product cycle');

    await loginOdoo(page);

    await openOdooDraftOrderForInspect(page, {
      customerSearch: ODOO_TEST_CUSTOMER_SEARCH,
      customerName: ODOO_TEST_CUSTOMER,
    });

    logFlowStep('Inspector: record locators for', {
      add_product: 'Add a product',
      product_search: 'Search a product combobox',
      product_option: 'dropdown option',
      quantity: 'product_uom_qty',
      confirm: 'Confirm',
    });

    logFlowStep('Paused on draft order — use Pick locator, then F8 to try one line manually');

    await page.pause();

  });



  test('DEBUG-CREATE | Full cycle: Odoo → sync → DB → pause', async ({ page }) => {

    test.setTimeout(360_000);

    resetFlowSteps();

    logFlowHeader('FULL CYCLE — Odoo → Medusa DB');



    logFlowStep('Log in to Odoo', ODOO_URL);

    await loginOdoo(page);



    const orderLines = buildOdooTestOrderLines();

    logFlowStep(`Create sales order in Odoo (${orderLines.length} line(s) from .env)`, {

      customer: ODOO_TEST_CUSTOMER,

      lines: orderLines,

    });

    const { name: odooOrderName, odooId, lines: odooLines } = await createOdooOrder(page, {

      customerSearch: ODOO_TEST_CUSTOMER_SEARCH,

      customerName: ODOO_TEST_CUSTOMER,

      lines: orderLines,

    });



    logFlowStep('Read totals from Odoo UI');

    const odooTotalInclTax = await getOdooOrderTotal(page);

    const odooUntaxed = await getOdooOrderUntaxedTotal(page);

    logFlowStep('Odoo order created', {

      name: odooOrderName,

      odoo_id: odooId,

      subtotal_ex_vat: odooUntaxed,

      total_incl_vat: odooTotalInclTax,

    });

    logOdooLines('Odoo line items (product + quantity):', odooLines);



    logFlowStep(

      'Wait for automatic Odoo → Medusa sync',

      'No manual sync button — pipeline runs after confirm (~1 min)'

    );

    console.log(

      '         → Waiting ~1 min for sync (SYNC_DB_WAIT_MS) — do not close the browser'

    );



    logFlowStep('Connect to PostgreSQL (Cloud SQL proxy)');

    const db = await verifyDbConnection();

    if (!db.ok) {

      logFlowStep('DATABASE CONNECTION FAILED', db.error);

      console.error('Start proxy: npm run db:proxy');

      throw new Error(db.error ?? 'DB connection failed');

    }

    logFlowStep('Database connected', {

      host: `${db.host}:${db.port}`,

      database: db.database,

      orders_in_table: db.orderCount,

    });



    logFlowStep('Complete creation — wait for DB sync and verify');

    const {
      displayId,
      dbTotal,
      dbLines,
    } = await completeCreationOrderInDb(
      odooId,
      odooLines,
      odooUntaxed,
      odooTotalInclTax
    );

    logFlowStep('Order found in database', { display_id: displayId });

    logFlowStep('DB order data loaded (after create)', { total: dbTotal });

    logDbLines('DB line items (product + quantity):', dbLines);



    // ── Medusa Admin UI (paused — re-enable when order-total selector is ready) ──

    // const medusaCtx = await browser.newContext();

    // const medusaPage = await medusaCtx.newPage();

    // try {

    //   logFlowStep('Log in to Medusa Admin');

    //   await loginMedusa(medusaPage);

    //

    //   logFlowStep(

    //     'Open orders list and click row with display_id',

    //     { display_id: displayId }

    //   );

    //   await openMedusaOrderByDisplayId(medusaPage, displayId);

    //

    //   logFlowStep('Read order total from Medusa Admin UI');

    //   const medusaTotal = await getMedusaOrderTotal(medusaPage);

    //   logFlowStep('Medusa UI total', { medusa_total: medusaTotal, db_total: dbTotal });

    //

    //   expect(

    //     Math.abs(medusaTotal - dbTotal),

    //     `Medusa UI ${medusaTotal} !== DB ${dbTotal}`

    //   ).toBeLessThanOrEqual(AMOUNT_TOLERANCE);

    //

    //   await expect(medusaPage.getByText(odooOrderName)).toBeVisible();

    // } finally {

    //   await medusaCtx.close();

    // }



    logFlowSummary([

      `Odoo order: ${odooOrderName} (id ${odooId})`,

      `Medusa display_id: ${displayId}`,

      `Total incl. VAT: ${odooTotalInclTax} SAR — MATCH (Odoo vs DB)`,

      `Lines: ${odooLines.length} item(s), qty matched`,

      'Full cycle PASSED',

    ]);



    logFlowStep('Pause in Playwright Inspector — press F8 to finish');

    await page.pause();

  });



  test('DEBUG-UPDATE-QTY | Create → update qty → confirm → re-verify DB', async ({
    page,
  }) => {
    test.setTimeout(600_000);

    resetFlowSteps();
    logFlowHeader('CREATE → UPDATE QTY → LOCK → RE-VERIFY');

    await loginOdoo(page);

    const orderLines = buildOdooTestOrderLines();
    const qtyUpdates = buildPostCreateQuantityUpdates();

    logFlowHeader('PHASE 1 — Create order');
    logFlowStep(`Create sales order (${orderLines.length} line(s))`, {
      customer: ODOO_TEST_CUSTOMER,
      lines: orderLines,
    });

    const { name: odooOrderName, odooId, lines: odooLinesInitial } =
      await createOdooOrder(page, {
        customerSearch: ODOO_TEST_CUSTOMER_SEARCH,
        customerName: ODOO_TEST_CUSTOMER,
        lines: orderLines,
      });

    let odooTotalInclTax = await getOdooOrderTotal(page);
    let odooUntaxed = await getOdooOrderUntaxedTotal(page);
    logOdooLines('Odoo lines after create:', odooLinesInitial);

    logFlowStep('Wait for sync after create');
    console.log(
      '         → Waiting ~1 min for sync (SYNC_DB_WAIT_MS) — do not close the browser'
    );

    const db = await verifyDbConnection();
    if (!db.ok) throw new Error(db.error ?? 'DB connection failed');

    const { displayId } = await completeCreationOrderInDb(
      odooId,
      odooLinesInitial,
      odooUntaxed,
      odooTotalInclTax
    );

    logFlowHeader('PHASE 2 — Unlock → Quotation → update qty → Confirm');
    logFlowStep('Target quantities after update', {
      line1: qtyUpdates[0]?.quantity,
      line2: qtyUpdates[1]?.quantity,
      line3: qtyUpdates[2]?.quantity,
    });

    const {
      lines: odooLinesUpdated,
      odooTotalInclTax: totalAfterUpdate,
      odooUntaxed: untaxedAfterUpdate,
    } = await updateOdooOrderLineQuantities(page, qtyUpdates, { odooId });

    odooTotalInclTax = totalAfterUpdate;
    odooUntaxed = untaxedAfterUpdate;
    logOdooLines('Odoo lines after update + confirm:', odooLinesUpdated);

    logFlowHeader('PHASE 3 — Re-verify DB (same checks as create)');
    logFlowStep('Complete update — wait for sync, then verify DB', {
      odoo_id: odooId,
      expected_lines: odooLinesUpdated,
      odoo_total_incl_vat: odooTotalInclTax,
    });

    const {
      displayId: displayIdAfterUpdate,
      dbTotal,
      dbLines,
    } = await completeOrderUpdateInDb(
      odooId,
      odooLinesUpdated,
      odooUntaxed,
      odooTotalInclTax
    );

    logFlowStep('Order re-verified in database', {
      odoo_id: odooId,
      display_id: displayIdAfterUpdate,
      db_total: dbTotal,
    });
    logDbLines('DB line items after update:', dbLines);

    logFlowSummary([
      `Odoo order: ${odooOrderName} (id ${odooId})`,
      `Medusa display_id: ${displayId}`,
      `After update: ${odooTotalInclTax} SAR incl. VAT — MATCH (DB ${dbTotal})`,
      `Qty: ${qtyUpdates.map((u) => u.quantity).join(', ')}`,
      `Lines: ${odooLinesUpdated.length} item(s) matched`,
      'Create + update + re-verify PASSED',
    ]);

    logFlowStep('Pause in Playwright Inspector — press F8 to finish');
    await page.pause();
  });

});


