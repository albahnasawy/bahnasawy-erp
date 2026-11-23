import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bahnasawy-verify-'));
process.env.DB_PATH = path.join(tempDir, 'verify.db');
process.env.BACKUPS_DIR = path.join(tempDir, 'backups');

const { createApp } = await import('./index.ts');
const { closeDb } = await import('./db.ts');

async function reqJson<T = Record<string, unknown>>(
  baseUrl: string,
  urlPath: string,
  options: { method?: string; token?: string; body?: unknown; expectedStatus?: number } = {}
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const res = await fetch(`${baseUrl}${urlPath}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = (await res.json()) as T & { error?: string };
  if (options.expectedStatus !== undefined) {
    assert.equal(
      res.status,
      options.expectedStatus,
      `${options.method || 'GET'} ${urlPath} expected HTTP ${options.expectedStatus} got ${res.status}: ${data.error || ''}`
    );
  } else {
    assert.ok(res.ok, `${options.method || 'GET'} ${urlPath} failed (${res.status}): ${data.error || ''}`);
  }
  return data;
}

async function run() {
  const app = createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Verification server listening on ${baseUrl}`);

  try {
    // 1. Health + Auth
    const health = await reqJson<{ ok: boolean }>(baseUrl, '/api/health');
    assert.equal(health.ok, true);

    const adminLogin = await reqJson<{ token: string; user: { role: string } }>(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { username: 'admin', password: 'admin123' },
    });
    const adminToken = adminLogin.token;
    assert.equal(adminLogin.user.role, 'admin');

    const cashierLogin = await reqJson<{ token: string; user: { role: string } }>(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { username: 'cashier', password: '1234' },
    });
    const cashierToken = cashierLogin.token;
    assert.equal(cashierLogin.user.role, 'cashier');

    // 2. RBAC Checks on Cashier
    await reqJson(baseUrl, '/api/reports/profit', { token: cashierToken, expectedStatus: 403 });
    await reqJson(baseUrl, '/api/settings', {
      method: 'PUT',
      token: cashierToken,
      body: { store_name: 'hack' },
      expectedStatus: 403,
    });
    await reqJson(baseUrl, '/api/backups', { token: cashierToken, expectedStatus: 403 });
    await reqJson(baseUrl, '/api/sales/1', { method: 'DELETE', token: cashierToken, expectedStatus: 403 });

    const cashierProds = await reqJson<{ products: Record<string, unknown>[] }>(baseUrl, '/api/products', {
      token: cashierToken,
    });
    for (const p of cashierProds.products) {
      assert.equal('last_purchase_cost' in p, false, 'Cashier must NOT see last_purchase_cost');
    }

    const cashierDash = await reqJson<Record<string, unknown>>(baseUrl, '/api/reports/dashboard', {
      token: cashierToken,
    });
    assert.equal('today_net_profit' in cashierDash, false, 'Cashier must NOT see today_net_profit');

    // Load master data as admin
    const adminProds = await reqJson<{ products: any[] }>(baseUrl, '/api/products', { token: adminToken });
    const whRes = await reqJson<{ warehouses: any[] }>(baseUrl, '/api/warehouses', { token: adminToken });
    const custRes = await reqJson<{ customers: any[] }>(baseUrl, '/api/customers', { token: adminToken });
    const plumRes = await reqJson<{ plumbers: any[] }>(baseUrl, '/api/plumbers', { token: adminToken });
    const supRes = await reqJson<{ suppliers: any[] }>(baseUrl, '/api/suppliers', { token: adminToken });
    const accRes = await reqJson<{ accounts: any[] }>(baseUrl, '/api/treasury/accounts', { token: adminToken });

    const mainWh = whRes.warehouses.find((w) => w.is_default === 1)!;
    const subWh = whRes.warehouses.find((w) => w.is_default === 0)!;
    const creditCust = custRes.customers.find((c) => c.is_walkin === 0)!;
    const walkinCust = custRes.customers.find((c) => c.is_walkin === 1)!;
    const plumber1 = plumRes.plumbers[0];
    const supplier1 = supRes.suppliers[0];
    const cashierSafe = accRes.accounts.find((a) => a.account_type === 'cashier_safe')!;
    const mainSafe = accRes.accounts.find((a) => a.account_type === 'main_safe')!;

    const pipeProd = adminProds.products.find((p) => p.sku === 'SKU-0006')!;
    const kitProd = adminProds.products.find((p) => p.sku === 'SKU-0009')!;
    const valveProd = adminProds.products.find((p) => p.sku === 'SKU-0004')!;
    const basinProd = adminProds.products.find((p) => p.sku === 'SKU-0002')!;

    const pipeMeterUnit = pipeProd.units.find((u: any) => u.conversion_factor === 1)!;
    const pipeRollUnit = pipeProd.units.find((u: any) => u.conversion_factor === 50)!;
    const kitUnit = kitProd.units[0];

    // 3. Barcode lookup
    const bcLookup = await reqJson<{ product: any; matched_unit_id: number }>(
      baseUrl,
      `/api/products/barcode/${pipeRollUnit.barcode}`,
      { token: cashierToken }
    );
    assert.equal(bcLookup.product.id, pipeProd.id);
    assert.equal(bcLookup.matched_unit_id, pipeRollUnit.id);

    // 4. Multi-UOM + Kit Sale linked to Plumber & Credit Customer
    const initialPipeMain = pipeProd.stock_by_warehouse[mainWh.id]; // 200
    const initialBasinMain = basinProd.stock_by_warehouse[mainWh.id]; // 10
    const initialCustBal = creditCust.balance;

    const saleRes = await reqJson<{ invoice: any }>(baseUrl, '/api/sales', {
      method: 'POST',
      token: cashierToken,
      body: {
        warehouse_id: mainWh.id,
        customer_id: creditCust.id,
        plumber_id: plumber1.id,
        price_tier: 'plumber',
        paid_amount: 1000,
        treasury_account_id: cashierSafe.id,
        items: [
          { product_id: pipeProd.id, unit_id: pipeRollUnit.id, quantity: 1 }, // 50m @ 1750
          { product_id: pipeProd.id, unit_id: pipeMeterUnit.id, quantity: 2.5 }, // 2.5m @ 36 = 90
          { product_id: kitProd.id, unit_id: kitUnit.id, quantity: 1 }, // 1 kit @ 4050
        ],
      },
    });
    const invId = saleRes.invoice.id;
    assert.equal(saleRes.invoice.total_amount, 1750 + 90 + 4050); // 5890
    assert.equal(saleRes.invoice.remaining_amount, 4890);

    // Verify cashier cannot see unit_cost_at_sale in detail
    const cashierInvDet = await reqJson<{ items: Record<string, unknown>[] }>(baseUrl, `/api/sales/${invId}`, {
      token: cashierToken,
    });
    for (const it of cashierInvDet.items) {
      assert.equal('unit_cost_at_sale' in it, false, 'Cashier must NOT see unit_cost_at_sale');
    }

    // Check stock deducted accurately
    const afterSaleProds = await reqJson<{ products: any[] }>(baseUrl, '/api/products', { token: adminToken });
    const pipeAfterSale = afterSaleProds.products.find((p) => p.id === pipeProd.id)!;
    const basinAfterSale = afterSaleProds.products.find((p) => p.id === basinProd.id)!;
    assert.equal(pipeAfterSale.stock_by_warehouse[mainWh.id], initialPipeMain - 52.5);
    assert.equal(basinAfterSale.stock_by_warehouse[mainWh.id], initialBasinMain - 1);

    // 5. Partial Sales Return (enforces old invoice price + blocks over-return)
    const adminInvDet = await reqJson<{ items: any[] }>(baseUrl, `/api/sales/${invId}`, { token: adminToken });
    const pipeMeterItem = adminInvDet.items.find(
      (i) => i.product_id === pipeProd.id && i.conversion_factor === 1
    )!;
    const kitItem = adminInvDet.items.find((i) => i.product_id === kitProd.id)!;

    // Over-return must fail 400
    await reqJson(baseUrl, `/api/sales/${invId}/returns`, {
      method: 'POST',
      token: cashierToken,
      body: {
        refund_method: 'credit_note',
        items: [{ original_item_id: pipeMeterItem.id, quantity: 10 }],
      },
      expectedStatus: 400,
    });

    // Return 2.5m pipe + 1 kit via credit_note
    const retRes = await reqJson<{ sales_return: any }>(baseUrl, `/api/sales/${invId}/returns`, {
      method: 'POST',
      token: cashierToken,
      body: {
        refund_method: 'credit_note',
        items: [
          { original_item_id: pipeMeterItem.id, quantity: 2.5 }, // 2.5 * 36 = 90
          { original_item_id: kitItem.id, quantity: 1 }, // 4050
        ],
      },
    });
    assert.equal(retRes.sales_return.total_return_amount, 4140);

    const custAfterRet = (
      await reqJson<{ customers: any[] }>(baseUrl, '/api/customers', { token: adminToken })
    ).customers.find((c) => c.id === creditCust.id)!;
    assert.equal(custAfterRet.balance, initialCustBal + 4890 - 4140);

    const afterRetProds = await reqJson<{ products: any[] }>(baseUrl, '/api/products', { token: adminToken });
    const pipeAfterRet = afterRetProds.products.find((p) => p.id === pipeProd.id)!;
    const basinAfterRet = afterRetProds.products.find((p) => p.id === basinProd.id)!;
    assert.equal(pipeAfterRet.stock_by_warehouse[mainWh.id], initialPipeMain - 50);
    assert.equal(basinAfterRet.stock_by_warehouse[mainWh.id], initialBasinMain); // kit component restored!

    // 6. Cash sale + Admin Void
    const voidSale = await reqJson<{ invoice: any }>(baseUrl, '/api/sales', {
      method: 'POST',
      token: cashierToken,
      body: {
        warehouse_id: mainWh.id,
        customer_id: walkinCust.id,
        price_tier: 'retail',
        treasury_account_id: cashierSafe.id,
        items: [{ product_id: valveProd.id, unit_id: valveProd.units[0].id, quantity: 4 }],
      },
    });
    await reqJson(baseUrl, `/api/sales/${voidSale.invoice.id}`, {
      method: 'DELETE',
      token: adminToken,
    });

    // 7. Purchase Invoice with Shipping Cost Allocation (external_cash from Main Safe)
    const valveCartonUnit = valveProd.units.find((u: any) => u.conversion_factor === 48)!;
    const supBalBefore = supplier1.balance;
    const mainSafeBefore = mainSafe.balance;

    await reqJson(baseUrl, '/api/purchases', {
      method: 'POST',
      token: adminToken,
      body: {
        supplier_id: supplier1.id,
        warehouse_id: mainWh.id,
        shipping_cost: 240,
        shipping_paid_to: 'external_cash',
        shipping_treasury_account_id: mainSafe.id,
        paid_amount: 0,
        items: [
          {
            product_id: valveProd.id,
            unit_id: valveCartonUnit.id,
            quantity: 1, // 48 base units
            unit_cost: 4800, // 100/base + (240/48=5) = 105/base!
          },
        ],
      },
    });

    const prodsAfterPur = await reqJson<{ products: any[] }>(baseUrl, '/api/products', { token: adminToken });
    const valveAfterPur = prodsAfterPur.products.find((p) => p.id === valveProd.id)!;
    assert.equal(valveAfterPur.last_purchase_cost, 105);

    const supAfterPur = (
      await reqJson<{ suppliers: any[] }>(baseUrl, '/api/suppliers', { token: adminToken })
    ).suppliers.find((s) => s.id === supplier1.id)!;
    assert.equal(supAfterPur.balance, supBalBefore + 4800);

    const mainSafeAfterPur = (
      await reqJson<{ accounts: any[] }>(baseUrl, '/api/treasury/accounts', { token: adminToken })
    ).accounts.find((a) => a.id === mainSafe.id)!;
    assert.equal(mainSafeAfterPur.balance, mainSafeBefore - 240);

    // 8. Damaged Purchase Return (credit_note)
    await reqJson(baseUrl, '/api/purchases/returns', {
      method: 'POST',
      token: adminToken,
      body: {
        supplier_id: supplier1.id,
        warehouse_id: mainWh.id,
        settlement_method: 'credit_note',
        reason: 'تالف أثناء النقل',
        items: [{ product_id: valveProd.id, unit_id: valveProd.units[0].id, quantity: 2, unit_cost: 105 }],
      },
    });

    // 9. Clear Supplier Check
    const checksRes = await reqJson<{ checks: any[] }>(baseUrl, '/api/treasury/checks?status=pending', {
      token: adminToken,
    });
    assert.ok(checksRes.checks.length >= 1);
    const chk = checksRes.checks[0];
    await reqJson(baseUrl, `/api/treasury/checks/${chk.id}/clear`, {
      method: 'POST',
      token: adminToken,
      body: { treasury_account_id: mainSafe.id },
    });

    // 10. Warehouse Transfer preserves total stock
    const totalBasinBefore = basinAfterRet.total_stock;
    await reqJson(baseUrl, '/api/warehouses/transfers', {
      method: 'POST',
      token: adminToken,
      body: {
        from_warehouse_id: subWh.id,
        to_warehouse_id: mainWh.id,
        items: [{ product_id: basinProd.id, unit_id: basinProd.units[0].id, quantity: 2 }],
      },
    });
    const basinAfterTrf = (
      await reqJson<{ products: any[] }>(baseUrl, '/api/products', { token: adminToken })
    ).products.find((p) => p.id === basinProd.id)!;
    assert.equal(basinAfterTrf.total_stock, totalBasinBefore);

    // 11. Net Profit Math Verification
    const profitRes = await reqJson<{ totals: any }>(baseUrl, '/api/reports/profit', { token: adminToken });
    const t = profitRes.totals;
    assert.equal(
      Math.round((t.net_sales_ex_vat - t.net_cogs - t.expenses) * 100) / 100,
      t.net_profit
    );
    // Expected net sales from the 1 roll of pipe kept = 1750, COGS = 50 * 28 = 1400, seeded expense = 150 -> Net profit = 200!
    assert.equal(t.net_sales, 1750);
    assert.equal(t.net_cogs, 1400);
    assert.equal(t.expenses, 150);
    assert.equal(t.net_profit, 200);

    // 12. VACUUM INTO Backup verification
    const backupRes = await reqJson<{ backup: { filename: string } }>(baseUrl, '/api/backups/now', {
      method: 'POST',
      token: adminToken,
    });
    const backupFile = path.join(process.env.BACKUPS_DIR!, backupRes.backup.filename);
    assert.ok(fs.existsSync(backupFile), 'Backup file must exist on disk');
    const hdr = fs.readFileSync(backupFile).subarray(0, 16).toString('utf8');
    assert.equal(hdr, 'SQLite format 3\0', 'Backup must be a valid SQLite 3 database');

    console.log('✅ ALL 12 VERIFICATION SUITES PASSED SUCCESSFULLY!');
  } finally {
    server.close();
    closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error('❌ VERIFICATION FAILED:', err);
  process.exit(1);
});
