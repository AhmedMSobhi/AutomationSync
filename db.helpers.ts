import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

/** Wait before first DB query so Odoo → Medusa sync can finish (default 1 min). */
export const SYNC_DB_WAIT_MS = Number(process.env.SYNC_DB_WAIT_MS ?? 60_000);
/** Wait after qty update + confirm before re-querying DB (default 30s). */
export const SYNC_UPDATE_WAIT_MS = Number(process.env.SYNC_UPDATE_WAIT_MS ?? 30_000);
/** Extra time to keep polling after the initial wait (default 1 min). */
export const SYNC_DB_POLL_TIMEOUT_MS = Number(
  process.env.SYNC_DB_POLL_TIMEOUT_MS ?? 60_000
);
export const SYNC_DB_POLL_INTERVAL_MS = Number(
  process.env.SYNC_DB_POLL_INTERVAL_MS ?? 5_000
);

export interface DbConfig {
  host: string;
  port: string;
  database: string;
  user: string;
  proxyHint: string;
}

export function getDbConfig(): DbConfig {
  const url = process.env.DATABASE_URL ?? '';
  const parsed = new URL(url.replace(/^postgresql:/, 'http:'));
  return {
    host: parsed.hostname,
    port: parsed.port,
    database: parsed.pathname.replace(/^\//, '') || 'unknown',
    user: decodeURIComponent(parsed.username || ''),
    proxyHint: process.env.CLOUD_SQL_INSTANCE ?? '(set CLOUD_SQL_INSTANCE in .env)',
  };
}

/** Print the full DB connection checklist (call before connecting). */
export function printDbConnectionSteps(): void {
  const cfg = getDbConfig();
  console.log('\n────────── Database connection steps ──────────');
  console.log('[DB 1/7] Start Cloud SQL proxy (separate terminal):');
  console.log('         npm run db:proxy');
  console.log(`         → listens on ${cfg.host}:${cfg.port}`);
  console.log(`         → instance: ${cfg.proxyHint}`);
  console.log('[DB 2/7] Credentials from .env:');
  console.log(`         user=${cfg.user}  database=${cfg.database}`);
  console.log(`         host=${cfg.host}  port=${cfg.port}`);
  console.log('[DB 3/7] Connect with pg driver (node-postgres)...');
}

function logDbStep(step: string, message: string, detail?: string): void {
  console.log(`[DB ${step}] ${message}`);
  if (detail) console.log(`         ${detail}`);
}

/** Open a logged connection to Postgres via the proxy. */
export async function connectToDatabase(verbose = true): Promise<Client> {
  const cfg = getDbConfig();
  if (verbose) printDbConnectionSteps();

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    if (verbose) {
      logDbStep('3/7', 'Connected OK', `${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logDbStep('3/7', 'Connection FAILED', msg);
    console.log('         Fix: run "npm run db:proxy" and keep that window open.');
    throw err;
  }
  return client;
}

export async function waitBeforeDbQuery(): Promise<void> {
  const seconds = Math.round(SYNC_DB_WAIT_MS / 1000);
  logDbStep('5/7', `Waiting ${seconds}s for Odoo → Medusa sync…`);
  await new Promise((r) => setTimeout(r, SYNC_DB_WAIT_MS));
}

export interface DbConnectionInfo {
  ok: boolean;
  database: string;
  host: string;
  port: string;
  orderCount?: number;
  error?: string;
}

/** Verify proxy + credentials; prints each step. */
export async function verifyDbConnection(): Promise<DbConnectionInfo> {
  const cfg = getDbConfig();
  try {
    const client = await connectToDatabase();
    logDbStep('4/7', 'Running sanity query: COUNT(*) FROM "order"');
    const count = await client.query('SELECT COUNT(*)::int AS n FROM "order"');
    await client.end();
    logDbStep('4/7', 'Sanity check passed', `${count.rows[0].n} rows in "order" table`);
    return {
      ok: true,
      database: cfg.database,
      host: cfg.host,
      port: cfg.port,
      orderCount: count.rows[0].n,
    };
  } catch (err) {
    return {
      ok: false,
      database: cfg.database,
      host: cfg.host,
      port: cfg.port,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Display id shown in Medusa Admin orders list (numeric `display_id` column).
 * Falls back to metadata.source_number (Odoo ref, e.g. S56859).
 */
export function getMedusaDisplayIdFromOrderRow(
  row: Record<string, unknown>
): string {
  if (row.display_id != null && row.display_id !== '') {
    return String(row.display_id);
  }
  const meta = row.metadata as { source_number?: string } | null | undefined;
  if (meta?.source_number) {
    return meta.source_number;
  }
  throw new Error(
    'Order row has no display_id or metadata.source_number — cannot open in Medusa admin'
  );
}

/**
 * Medusa order row matched by Odoo record id:
 *   SELECT * FROM "order" WHERE metadata->>'odoo_id' = '<odooId>';
 */
export async function findOrderByOdooId(
  odooId: string,
  opts?: { quiet?: boolean }
): Promise<Record<string, unknown>[]> {
  const sql = `SELECT * FROM "order" WHERE metadata->>'odoo_id' = $1`;
  if (!opts?.quiet) {
    logDbStep('6/7', 'Query order by odoo_id', sql.replace('$1', `'${odooId}'`));
  }

  const client = await connectToDatabase(!opts?.quiet);
  try {
    const result = await client.query(sql, [odooId]);
    if (!opts?.quiet) {
      logDbStep('6/7', `Query returned ${result.rows.length} row(s)`);
    }
    return result.rows;
  } finally {
    await client.end();
  }
}

/**
 * Wait for sync (default 1 min), then poll Postgres until the order appears.
 */
export async function waitForOrderInDb(
  odooId: string,
  opts?: {
    initialWaitMs?: number;
    pollTimeoutMs?: number;
    intervalMs?: number;
    waitEnvLabel?: string;
  }
): Promise<Record<string, unknown>> {
  const initialWaitMs = opts?.initialWaitMs ?? SYNC_DB_WAIT_MS;
  const pollTimeoutMs = opts?.pollTimeoutMs ?? SYNC_DB_POLL_TIMEOUT_MS;
  const intervalMs = opts?.intervalMs ?? SYNC_DB_POLL_INTERVAL_MS;
  const waitLabel = opts?.waitEnvLabel ?? 'SYNC_DB_WAIT_MS';

  console.log('\n────────── Wait for synced order in DB ──────────');
  logDbStep(
    '5/7',
    `Initial wait ${Math.round(initialWaitMs / 1000)}s (${waitLabel})`,
    'sync pipeline needs time to update Postgres'
  );
  await new Promise((r) => setTimeout(r, initialWaitMs));

  logDbStep(
    '7/7',
    `Polling every ${intervalMs / 1000}s for up to ${Math.round(pollTimeoutMs / 1000)}s`,
    `odoo_id=${odooId}`
  );

  const deadline = Date.now() + pollTimeoutMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    const rows = await findOrderByOdooId(odooId, { quiet: true });
    console.log(`         poll #${attempt}: ${rows.length} row(s)`);
    if (rows.length > 0) {
      logDbStep('7/7', 'Order found in database', `id=${rows[0].id}`);
      return rows[0];
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(
    `No row in "order" with metadata.odoo_id="${odooId}" after ` +
      `${Math.round(initialWaitMs / 1000)}s wait + ${Math.round(pollTimeoutMs / 1000)}s polling. ` +
      'Is start-cloud-sql-proxy.bat running? Was sync triggered?'
  );
}

/** Parse Medusa order_summary.totals JSON → numeric order total. */
export function parseMedusaOrderTotal(totals: unknown): number {
  if (!totals || typeof totals !== 'object') return 0;
  const t = totals as Record<string, unknown>;
  const value =
    t.current_order_total ??
    t.original_order_total ??
    t.accounting_total;
  return typeof value === 'number' ? value : parseFloat(String(value)) || 0;
}

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** Order total from order_summary for a synced Odoo order. */
export async function getDbOrderTotalByOdooId(odooId: string): Promise<number> {
  const client = await connectToDatabase(false);
  try {
    const result = await client.query(
      `SELECT os.totals
       FROM "order" o
       JOIN order_summary os ON os.order_id = o.id AND os.deleted_at IS NULL
       WHERE o.metadata->>'odoo_id' = $1
       ORDER BY os.version DESC
       LIMIT 1`,
      [odooId]
    );
    return parseMedusaOrderTotal(result.rows[0]?.totals);
  } finally {
    await client.end();
  }
}

/**
 * Poll until latest order_summary total matches Odoo amount_total (incl. VAT).
 * Sync often inserts the order at v1 with a partial total, then v2/v3 seconds later.
 */
export async function waitForDbOrderTotalMatch(
  odooId: string,
  odooTotalInclTax: number,
  opts?: {
    tolerance?: number;
    pollTimeoutMs?: number;
    intervalMs?: number;
  }
): Promise<number> {
  const tolerance = opts?.tolerance ?? Number(process.env.AMOUNT_TOLERANCE ?? 0.01);
  const pollTimeoutMs = opts?.pollTimeoutMs ?? SYNC_DB_POLL_TIMEOUT_MS;
  const intervalMs = opts?.intervalMs ?? 2_000;

  console.log('\n────────── Wait for DB total to match Odoo (incl. VAT) ──────────');
  logDbStep(
    '7/7',
    `Polling every ${intervalMs / 1000}s for up to ${Math.round(pollTimeoutMs / 1000)}s`,
    `odoo_incl_vat=${odooTotalInclTax}`
  );

  const deadline = Date.now() + pollTimeoutMs;
  let attempt = 0;
  let lastTotal = 0;

  while (Date.now() < deadline) {
    attempt += 1;
    lastTotal = await getDbOrderTotalByOdooId(odooId);
    const diff = Math.abs(roundMoney(odooTotalInclTax) - roundMoney(lastTotal));
    console.log(
      `         total poll #${attempt}: DB ${lastTotal} (diff ${diff.toFixed(2)}, need ≤${tolerance})`
    );
    if (diff <= tolerance) {
      logDbStep('7/7', 'DB total matches Odoo incl. VAT', String(lastTotal));
      return lastTotal;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(
    `DB total did not match Odoo incl. VAT ${odooTotalInclTax} within ${Math.round(pollTimeoutMs / 1000)}s ` +
      `(last DB total: ${lastTotal}, tolerance ±${tolerance}). Sync may still be updating order_summary.`
  );
}

/**
 * Poll until DB line items (latest version per product) match Odoo lines.
 */
export async function waitForDbOrderLinesMatch(
  odooId: string,
  odooLines: { product: string; quantity: number }[],
  opts?: {
    pollTimeoutMs?: number;
    intervalMs?: number;
  }
): Promise<DbOrderLine[]> {
  const pollTimeoutMs = opts?.pollTimeoutMs ?? SYNC_DB_POLL_TIMEOUT_MS;
  const intervalMs = opts?.intervalMs ?? 2_000;

  console.log('\n────────── Wait for DB lines to match Odoo ──────────');
  logDbStep(
    '7/7',
    `Polling every ${intervalMs / 1000}s for up to ${Math.round(pollTimeoutMs / 1000)}s`,
    `${odooLines.length} Odoo line(s)`
  );

  const deadline = Date.now() + pollTimeoutMs;
  let attempt = 0;
  let lastDbLines: DbOrderLine[] = [];
  let lastCmp: LinesComparison | null = null;

  while (Date.now() < deadline) {
    attempt += 1;
    lastDbLines = await getDbOrderLinesByOdooId(odooId);
    lastCmp = compareOrderLines(odooLines, lastDbLines);
    const bad = lastCmp.lines.filter((l) => !l.lineMatch).length;
    console.log(
      `         lines poll #${attempt}: DB ${lastDbLines.length} row(s), ${bad} mismatch(es)`
    );
    if (lastCmp.match) {
      logDbStep('7/7', 'DB lines match Odoo', `${lastDbLines.length} product(s)`);
      return lastDbLines;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  if (lastCmp) logLinesComparison(lastCmp);
  throw new Error(
    `DB line items did not match Odoo within ${Math.round(pollTimeoutMs / 1000)}s ` +
      `(last DB rows: ${lastDbLines.length}).`
  );
}

/** Poll DB total + lines until both match Odoo (post-create or post-update). */
export async function verifyOrderSyncedInDb(
  odooId: string,
  odooLines: { product: string; quantity: number }[],
  odooUntaxed: number,
  odooTotalInclTax: number
): Promise<{ dbTotal: number; dbLines: DbOrderLine[] }> {
  const dbTotal = await waitForDbOrderTotalMatch(odooId, odooTotalInclTax);
  const dbLines = await waitForDbOrderLinesMatch(odooId, odooLines);

  const totalCmp = compareOrderTotals(odooUntaxed, odooTotalInclTax, dbTotal);
  logTotalComparison(totalCmp);
  if (!totalCmp.match) {
    throw new Error(
      `Odoo total incl. VAT ${odooTotalInclTax} !== DB ${dbTotal} (diff ${totalCmp.difference})`
    );
  }

  const linesCmp = compareOrderLines(odooLines, dbLines);
  logLinesComparison(linesCmp);
  if (!linesCmp.match) {
    throw new Error('Line items or quantities do not match Odoo vs DB');
  }

  return { dbTotal, dbLines };
}

/**
 * After Odoo confirm: wait for Medusa row + totals + lines to match.
 * Call this before any quantity update so creation is fully finished.
 */
export async function completeCreationOrderInDb(
  odooId: string,
  odooLines: { product: string; quantity: number }[],
  odooUntaxed: number,
  odooTotalInclTax: number
): Promise<{
  dbRow: Record<string, unknown>;
  displayId: string;
  dbTotal: number;
  dbLines: DbOrderLine[];
}> {
  console.log('\n────────── Finish creation — Odoo → Medusa DB sync ──────────');
  console.log(
    '         → Waiting ~1 min for sync (SYNC_DB_WAIT_MS) — do not close the browser'
  );

  const dbRow = await waitForOrderInDb(odooId);
  const displayId = getMedusaDisplayIdFromOrderRow(dbRow);
  const { dbTotal, dbLines } = await verifyOrderSyncedInDb(
    odooId,
    odooLines,
    odooUntaxed,
    odooTotalInclTax
  );

  console.log('         ✓ Creation order completed (DB totals + lines match Odoo)');
  return { dbRow, displayId, dbTotal, dbLines };
}

/**
 * After qty update + confirm: same DB checks as creation (same odoo_id).
 * Wait → find order row → poll total → poll lines → comparison tables.
 */
export async function completeOrderUpdateInDb(
  odooId: string,
  odooLines: { product: string; quantity: number }[],
  odooUntaxed: number,
  odooTotalInclTax: number
): Promise<{
  dbRow: Record<string, unknown>;
  displayId: string;
  dbTotal: number;
  dbLines: DbOrderLine[];
}> {
  console.log('\n────────── Finish update — Odoo → Medusa DB sync ──────────');
  console.log(
    `         → Waiting ${Math.round(SYNC_UPDATE_WAIT_MS / 1000)}s for sync (SYNC_UPDATE_WAIT_MS) — do not close the browser`
  );

  const dbRow = await waitForOrderInDb(odooId, {
    initialWaitMs: SYNC_UPDATE_WAIT_MS,
    waitEnvLabel: 'SYNC_UPDATE_WAIT_MS',
  });
  const displayId = getMedusaDisplayIdFromOrderRow(dbRow);
  console.log(`         → Same odoo_id=${odooId} — Medusa display_id=${displayId}`);

  const { dbTotal, dbLines } = await verifyOrderSyncedInDb(
    odooId,
    odooLines,
    odooUntaxed,
    odooTotalInclTax
  );

  console.log('         ✓ Update order completed (DB totals + lines match Odoo)');
  return { dbRow, displayId, dbTotal, dbLines };
}

export interface TotalComparison {
  odooUntaxed: number;
  odooTotalInclTax: number;
  dbTotal: number;
  difference: number;
  tolerance: number;
  match: boolean;
}

export function compareOrderTotals(
  odooUntaxed: number,
  odooTotalInclTax: number,
  dbTotal: number,
  tolerance = Number(process.env.AMOUNT_TOLERANCE ?? 0.01)
): TotalComparison {
  const odooRounded = roundMoney(odooTotalInclTax);
  const dbRounded = roundMoney(dbTotal);
  const difference = Math.abs(odooRounded - dbRounded);
  return {
    odooUntaxed,
    odooTotalInclTax: odooRounded,
    dbTotal: dbRounded,
    difference,
    tolerance,
    match: difference <= tolerance,
  };
}

export function logTotalComparison(c: TotalComparison): void {
  console.log('\n────────── Amount comparison (Odoo vs DB) ──────────');
  console.log(`  Odoo subtotal (ex VAT) : ${c.odooUntaxed} SAR`);
  console.log(`  Odoo total (incl VAT)  : ${c.odooTotalInclTax} SAR  ← compared to DB`);
  console.log(`  DB total               : ${c.dbTotal} SAR`);
  console.log(`  Difference             : ${c.difference.toFixed(2)} (tolerance ±${c.tolerance})`);
  console.log(`  Match                  : ${c.match ? 'YES ✓' : 'NO ✗'}`);
}

export interface DbOrderLine {
  product: string;
  quantity: number;
}

/**
 * Line items for a synced Odoo order — one row per product from `order_line_item`.
 * Quantity lives on versioned `order_item`; we take the latest version per line only
 * (subquery), so we do not multiply rows when sync writes v1/v2/v3 snapshots.
 */
export async function getDbOrderLinesByOdooId(odooId: string): Promise<DbOrderLine[]> {
  const client = await connectToDatabase(false);
  try {
    const result = await client.query(
      `SELECT COALESCE(oli.product_title, oli.title) AS product,
              (
                SELECT oi.quantity::numeric
                FROM order_item oi
                JOIN "order" o ON o.id = oi.order_id AND oi.deleted_at IS NULL
                WHERE oi.item_id = oli.id
                  AND o.metadata->>'odoo_id' = $1
                ORDER BY oi.version DESC
                LIMIT 1
              ) AS quantity
       FROM order_line_item oli
       WHERE oli.deleted_at IS NULL
         AND oli.id IN (
           SELECT DISTINCT oi.item_id
           FROM order_item oi
           JOIN "order" o ON o.id = oi.order_id AND oi.deleted_at IS NULL
           WHERE o.metadata->>'odoo_id' = $1
         )
       ORDER BY oli.created_at`,
      [odooId]
    );
    return result.rows.map((r) => ({
      product: String(r.product ?? '').trim(),
      quantity: Number(r.quantity),
    }));
  } finally {
    await client.end();
  }
}

function normalizeProductName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

function productsMatch(odooProduct: string, dbProduct: string): boolean {
  const a = normalizeProductName(odooProduct);
  const b = normalizeProductName(dbProduct);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export interface LineComparisonDetail {
  product: string;
  odooQuantity: number;
  dbQuantity: number;
  productMatch: boolean;
  quantityMatch: boolean;
  lineMatch: boolean;
}

export interface LinesComparison {
  match: boolean;
  odooLineCount: number;
  dbLineCount: number;
  lines: LineComparisonDetail[];
}

export function compareOrderLines(
  odooLines: { product: string; quantity: number }[],
  dbLines: DbOrderLine[]
): LinesComparison {
  const usedDb = new Set<number>();
  const lines: LineComparisonDetail[] = [];

  for (const oLine of odooLines) {
    const dbIdx = dbLines.findIndex(
      (d, i) => !usedDb.has(i) && productsMatch(oLine.product, d.product)
    );
    const dLine = dbIdx >= 0 ? dbLines[dbIdx] : undefined;
    if (dbIdx >= 0) usedDb.add(dbIdx);

    const productMatch = !!dLine;
    const quantityMatch = dLine ? oLine.quantity === dLine.quantity : false;
    lines.push({
      product: oLine.product,
      odooQuantity: oLine.quantity,
      dbQuantity: dLine?.quantity ?? -1,
      productMatch,
      quantityMatch,
      lineMatch: productMatch && quantityMatch,
    });
  }

  for (let i = 0; i < dbLines.length; i++) {
    if (usedDb.has(i)) continue;
    lines.push({
      product: dbLines[i].product,
      odooQuantity: -1,
      dbQuantity: dbLines[i].quantity,
      productMatch: false,
      quantityMatch: false,
      lineMatch: false,
    });
  }

  const match =
    odooLines.length === dbLines.length && lines.every((l) => l.lineMatch);

  return {
    match,
    odooLineCount: odooLines.length,
    dbLineCount: dbLines.length,
    lines,
  };
}

export function logDbLines(label: string, lines: DbOrderLine[]): void {
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

export function logLinesComparison(c: LinesComparison): void {
  console.log('\n────────── Line items & quantity comparison (Odoo vs DB) ──────────');
  console.log(`  Line count : Odoo ${c.odooLineCount}  |  DB ${c.dbLineCount}`);
  console.log('  ┌────┬────────────────────────────────────────────┬──────────┬──────────┬────────┐');
  console.log('  │ #  │ Product                                    │ Odoo Qty │ DB Qty   │ Status │');
  c.lines.forEach((line, i) => {
    const prod = line.product.length > 42 ? `${line.product.slice(0, 39)}...` : line.product;
    const status = line.lineMatch ? 'OK' : line.productMatch ? 'QTY!' : 'MISS';
    console.log(
      `  │ ${String(i + 1).padStart(2)} │ ${prod.padEnd(42)} │ ${String(line.odooQuantity).padStart(8)} │ ${String(line.dbQuantity).padStart(8)} │ ${status.padEnd(6)} │`
    );
  });
  console.log('  └────┴────────────────────────────────────────────┴──────────┴──────────┴────────┘');
  console.log(`  Overall: ${c.match ? 'ALL PRODUCTS & QUANTITIES MATCH ✓' : 'MISMATCH ✗'}`);
}
