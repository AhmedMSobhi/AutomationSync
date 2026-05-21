<<<<<<< HEAD
# AutomationSync
=======
# Odoo → Medusa Order Sync — Playwright Automation Tests

## Flow under test

```
Odoo (create order) → Confirm order → Trigger manual sync → Medusa Admin (verify)
```

---

## Project structure

```
odoo-to-medusa-tests/
├── playwright.config.ts
├── package.json
├── .env.example                              ← copy to .env and fill values
└── tests/
    ├── helpers/
    │   └── sync.helpers.ts                   ← all shared login, navigation, read helpers
    ├── 01-order-appears-in-medusa.spec.ts    ← Suite 1: order found in Medusa after sync
    ├── 02-fields-match.spec.ts               ← Suite 2: amounts, items, fees match
    ├── 03-status-sync.spec.ts                ← Suite 3: status transferred correctly
    └── 04-edge-cases.spec.ts                 ← Suite 4: boundary values & resilience
```

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Install Playwright browser
npx playwright install chromium

# 3. Set up environment
cp .env.example .env
# Edit .env with your real Odoo and Medusa URLs + credentials

# 4. Run all tests
npm test

# 5. View HTML report
npm run report
```

---

## Run individual suites

```bash
npm run test:suite1   # Suite 1 — order appears in Medusa
npm run test:suite2   # Suite 2 — fields match
npm run test:suite3   # Suite 3 — status sync
npm run test:suite4   # Suite 4 — edge cases
```

---

## Full test coverage

| Test ID    | Description                                                             | Suite |
|------------|-------------------------------------------------------------------------|-------|
| APPEAR-01  | Standard order appears in Medusa after sync                             | 1     |
| APPEAR-02  | Multi-line order appears in Medusa after sync                           | 1     |
| APPEAR-03  | High-value (free shipping) order appears in Medusa                      | 1     |
| APPEAR-04  | Order NOT visible in Medusa before sync is triggered                    | 1     |
| APPEAR-05  | Double sync does not create duplicate in Medusa                         | 1     |
| APPEAR-06  | Medusa shows a valid order status after sync                            | 1     |
| FIELDS-01  | Order total matches between Odoo and Medusa                             | 2     |
| FIELDS-02  | Shipping fee correct for order below threshold                          | 2     |
| FIELDS-03  | Free delivery order synced with 0 fee in Medusa                         | 2     |
| FIELDS-04  | Multi-line order total matches in Medusa                                | 2     |
| FIELDS-05  | Product quantities match in Medusa order lines                          | 2     |
| FIELDS-06  | Customer data transferred correctly to Medusa                           | 2     |
| FIELDS-07  | Decimal amounts transferred without rounding error                      | 2     |
| FIELDS-08  | Order at exactly free threshold gets 0 fee                              | 2     |
| FIELDS-09  | Order 1 halala below threshold carries standard fee                     | 2     |
| STATUS-01  | Confirmed Odoo order gets valid status in Medusa                        | 3     |
| STATUS-02  | Cancelled order does not appear as active in Medusa                     | 3     |
| STATUS-03  | Locked/done order reflects correctly in Medusa                          | 3     |
| STATUS-04  | Status update after first sync reflected on re-sync                     | 3     |
| STATUS-05  | Medusa status is not blank or errored after sync                        | 3     |
| STATUS-06  | Multiple orders have correct independent statuses in Medusa             | 3     |
| EDGE-01    | 1 halala above threshold → 0 fee in Medusa                              | 4     |
| EDGE-02    | 1 halala below threshold → standard fee in Medusa                       | 4     |
| EDGE-03    | Decimal unit price transfers without precision loss                     | 4     |
| EDGE-04    | Large quantity order syncs correctly                                    | 4     |
| EDGE-05    | Two orders do not cross-contaminate each other in Medusa                | 4     |
| EDGE-06    | Sync button disabled/absent on unconfirmed draft orders                 | 4     |
| EDGE-07    | Sync latency measured and within 60 s window                           | 4     |
| EDGE-08    | VAT-inclusive total used for free shipping threshold comparison         | 4     |

---

## Before you run — checklist

### 1. Update the sync trigger selector
In `sync.helpers.ts`, `triggerOdooToMedusaSync()` looks for a button labeled
"Sync to Medusa" / "Send to Medusa" or an Action menu item with those labels.
**Update the selector to match your actual Odoo customization.**

### 2. Update Medusa selectors
These selectors in `sync.helpers.ts` must match your Medusa Admin DOM:
- `getByTestId('order-total')` → your actual order total element
- `getByTestId('shipping-fee')` → your actual shipping fee element
- `[data-testid="order-status"]` → your actual status badge element
- `[data-testid="customer-email"]` → your customer display element

Use `npm run test:codegen -- https://your-medusa-admin.com` to record real selectors.

### 3. Pre-create test data in staging
| Resource | Details |
|---|---|
| Customer | Name: "Test Customer", with a linked email |
| Test Product A | Price configurable; below free shipping threshold |
| Test Product B | Price configurable; below free shipping threshold |
| Test Product X | Price ≥ FREE_SHIPPING_THRESHOLD (e.g. 500 SAR) |

### 4. Use a staging environment — never production

### 5. Workers = 1 (do not change)
Sync tests are inherently sequential. Running in parallel will cause
race conditions and false failures.

---

## Tips

- **Slow Odoo forms**: `slowMo: 200` in config gives Odoo's dynamic fields time to render.
  Increase to 400 if you see flaky field interactions.
- **Sync wait time**: Start with `SYNC_WAIT_MS=6000`. EDGE-07 measures real latency —
  use that to tune the value.
- **Codegen**: Run `npx playwright codegen https://your-odoo.com` to record clicks
  and auto-generate selectors for your specific Odoo instance.
>>>>>>> fcce9ec (automation sync)
