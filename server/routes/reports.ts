import { Router } from 'express';
import { getDb } from '../db.ts';
import { requireAuth, requireRole } from '../auth.ts';
import { addDays, roundMoney, todayStr } from '../utils.ts';

const router = Router();

router.get('/dashboard', requireAuth, (req, res) => {
  const db = getDb();
  const today = todayStr();
  const next7 = addDays(today, 7);

  const salesTodayRow = db
    .prepare(
      `SELECT COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS total, COALESCE(SUM(vat_amount), 0) AS vat_total
       FROM sales_invoices WHERE invoice_date = ? AND status = 'completed'`
    )
    .get(today) as { count: number; total: number; vat_total: number };

  const returnsTodayRow = db
    .prepare(
      `SELECT COALESCE(SUM(total_return_amount), 0) AS total
       FROM sales_returns WHERE return_date = ?`
    )
    .get(today) as { total: number };

  const returnsVatTodayRow = db
    .prepare(
      `SELECT COALESCE(SUM(sri.vat_amount), 0) AS vat_total
       FROM sales_return_items sri
       JOIN sales_returns sr ON sr.id = sri.return_id
       WHERE sr.return_date = ?`
    )
    .get(today) as { vat_total: number };

  const expensesTodayRow = db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE expense_date = ?')
    .get(today) as { total: number };

  const collectionsTodayRow = db
    .prepare(
      `SELECT COALESCE(SUM(amount_delta), 0) AS total
       FROM treasury_transactions
       WHERE tx_date = ? AND tx_type IN ('sale_receipt', 'customer_payment')`
    )
    .get(today) as { total: number };

  const accounts = db
    .prepare('SELECT * FROM treasury_accounts WHERE is_active = 1 ORDER BY is_default_pos DESC, id ASC')
    .all() as { id: number; name: string; account_type: string; balance: number }[];
  const totalTreasury = roundMoney(accounts.reduce((acc, a) => acc + Number(a.balance || 0), 0));

  const receivables = (
    db.prepare('SELECT COALESCE(SUM(balance), 0) AS total FROM customers WHERE is_active = 1 AND balance > 0').get() as {
      total: number;
    }
  ).total;
  const payables = (
    db.prepare('SELECT COALESCE(SUM(balance), 0) AS total FROM suppliers WHERE is_active = 1 AND balance > 0').get() as {
      total: number;
    }
  ).total;

  const lowStockItems = db
    .prepare(
      `SELECT p.id, p.sku, p.name, p.category, p.brand, p.size, p.base_unit_name, p.min_stock,
              COALESCE((SELECT SUM(ws.quantity_base) FROM warehouse_stock ws WHERE ws.product_id = p.id), 0) AS total_stock
       FROM products p
       WHERE p.is_active = 1 AND p.is_kit = 0
         AND COALESCE((SELECT SUM(ws.quantity_base) FROM warehouse_stock ws WHERE ws.product_id = p.id), 0) <= p.min_stock
       ORDER BY total_stock ASC, p.id ASC`
    )
    .all() as Record<string, unknown>[];

  const dueChecks = db
    .prepare(
      `SELECT sc.*, s.name AS supplier_name
       FROM supplier_checks sc
       JOIN suppliers s ON s.id = sc.supplier_id
       WHERE sc.status = 'pending' AND sc.due_date <= ?
       ORDER BY sc.due_date ASC`
    )
    .all(next7);

  const response: Record<string, unknown> = {
    today,
    today_sales_count: salesTodayRow.count,
    today_sales_total: roundMoney(salesTodayRow.total),
    today_returns_total: roundMoney(returnsTodayRow.total),
    today_net_sales: roundMoney(salesTodayRow.total - returnsTodayRow.total),
    today_collections: roundMoney(collectionsTodayRow.total),
    today_expenses: roundMoney(expensesTodayRow.total),
    total_treasury: totalTreasury,
    treasury_accounts: accounts,
    total_receivables: roundMoney(receivables),
    total_payables: roundMoney(payables),
    low_stock_count: lowStockItems.length,
    low_stock_items: lowStockItems.slice(0, 8),
    due_checks_count: dueChecks.length,
    due_checks: dueChecks,
  };

  if (req.user!.role === 'admin') {
    const grossCogs = (
      db
        .prepare(
          `SELECT COALESCE(SUM(sii.quantity * sii.unit_cost_at_sale), 0) AS cogs
           FROM sales_invoice_items sii
           JOIN sales_invoices si ON si.id = sii.invoice_id
           WHERE si.invoice_date = ? AND si.status = 'completed'`
        )
        .get(today) as { cogs: number }
    ).cogs;
    const retCogs = (
      db
        .prepare(
          `SELECT COALESCE(SUM(sri.quantity * sri.unit_cost_at_sale), 0) AS cogs
           FROM sales_return_items sri
           JOIN sales_returns sr ON sr.id = sri.return_id
           WHERE sr.return_date = ?`
        )
        .get(today) as { cogs: number }
    ).cogs;
    const netCogs = roundMoney(grossCogs - retCogs);
    const netSalesExVat = roundMoney(
      (salesTodayRow.total - salesTodayRow.vat_total) - (returnsTodayRow.total - returnsVatTodayRow.vat_total)
    );
    const grossProfit = roundMoney(netSalesExVat - netCogs);
    response.today_net_profit = roundMoney(grossProfit - expensesTodayRow.total);
  }

  res.json(response);
});

router.get('/profit', requireAuth, requireRole('admin'), (req, res) => {
  const db = getDb();
  const groupBy = req.query.group_by === 'month' ? 'month' : 'day';
  const today = todayStr();
  const from =
    typeof req.query.from === 'string' && req.query.from.trim()
      ? req.query.from.trim()
      : `${today.slice(0, 7)}-01`;
  const to = typeof req.query.to === 'string' && req.query.to.trim() ? req.query.to.trim() : today;
  const periodCol = (col: string) => (groupBy === 'month' ? `substr(${col}, 1, 7)` : col);

  const salesRows = db
    .prepare(
      `SELECT ${periodCol('si.invoice_date')} AS period,
              COUNT(*) AS invoices_count,
              COALESCE(SUM(si.total_amount), 0) AS gross_sales,
              COALESCE(SUM(si.vat_amount), 0) AS sales_vat
       FROM sales_invoices si
       WHERE si.status = 'completed' AND si.invoice_date >= ? AND si.invoice_date <= ?
       GROUP BY period`
    )
    .all(from, to) as { period: string; invoices_count: number; gross_sales: number; sales_vat: number }[];

  const cogsRows = db
    .prepare(
      `SELECT ${periodCol('si.invoice_date')} AS period,
              COALESCE(SUM(sii.quantity * sii.unit_cost_at_sale), 0) AS gross_cogs
       FROM sales_invoice_items sii
       JOIN sales_invoices si ON si.id = sii.invoice_id
       WHERE si.status = 'completed' AND si.invoice_date >= ? AND si.invoice_date <= ?
       GROUP BY period`
    )
    .all(from, to) as { period: string; gross_cogs: number }[];

  const returnsRows = db
    .prepare(
      `SELECT ${periodCol('sr.return_date')} AS period,
              COALESCE(SUM(sr.total_return_amount), 0) AS sales_returns
       FROM sales_returns sr
       WHERE sr.return_date >= ? AND sr.return_date <= ?
       GROUP BY period`
    )
    .all(from, to) as { period: string; sales_returns: number }[];

  const retDetailsRows = db
    .prepare(
      `SELECT ${periodCol('sr.return_date')} AS period,
              COALESCE(SUM(sri.quantity * sri.unit_cost_at_sale), 0) AS returns_cogs,
              COALESCE(SUM(sri.vat_amount), 0) AS returns_vat
       FROM sales_return_items sri
       JOIN sales_returns sr ON sr.id = sri.return_id
       WHERE sr.return_date >= ? AND sr.return_date <= ?
       GROUP BY period`
    )
    .all(from, to) as { period: string; returns_cogs: number; returns_vat: number }[];

  const expenseRows = db
    .prepare(
      `SELECT ${periodCol('e.expense_date')} AS period,
              COALESCE(SUM(e.amount), 0) AS expenses
       FROM expenses e
       WHERE e.expense_date >= ? AND e.expense_date <= ?
       GROUP BY period`
    )
    .all(from, to) as { period: string; expenses: number }[];

  const periodSet = new Set<string>();
  for (const r of salesRows) periodSet.add(r.period);
  for (const r of returnsRows) periodSet.add(r.period);
  for (const r of expenseRows) periodSet.add(r.period);

  const salesMap = new Map(salesRows.map((r) => [r.period, r]));
  const cogsMap = new Map(cogsRows.map((r) => [r.period, r]));
  const retMap = new Map(returnsRows.map((r) => [r.period, r]));
  const retDetMap = new Map(retDetailsRows.map((r) => [r.period, r]));
  const expMap = new Map(expenseRows.map((r) => [r.period, r]));

  const periods = Array.from(periodSet).sort((a, b) => b.localeCompare(a));

  const totals = {
    invoices_count: 0,
    gross_sales: 0,
    sales_returns: 0,
    net_sales: 0,
    net_vat: 0,
    net_sales_ex_vat: 0,
    net_cogs: 0,
    gross_profit: 0,
    expenses: 0,
    net_profit: 0,
  };

  const rows = periods.map((period) => {
    const s = salesMap.get(period);
    const c = cogsMap.get(period);
    const r = retMap.get(period);
    const rd = retDetMap.get(period);
    const e = expMap.get(period);

    const invoicesCount = s?.invoices_count ?? 0;
    const grossSales = roundMoney(s?.gross_sales ?? 0);
    const salesVat = roundMoney(s?.sales_vat ?? 0);
    const salesReturns = roundMoney(r?.sales_returns ?? 0);
    const returnsVat = roundMoney(rd?.returns_vat ?? 0);
    const netSales = roundMoney(grossSales - salesReturns);
    const netVat = roundMoney(salesVat - returnsVat);
    const netSalesExVat = roundMoney(netSales - netVat);

    const grossCogs = roundMoney(c?.gross_cogs ?? 0);
    const returnsCogs = roundMoney(rd?.returns_cogs ?? 0);
    const netCogs = roundMoney(grossCogs - returnsCogs);
    const grossProfit = roundMoney(netSalesExVat - netCogs);
    const expenses = roundMoney(e?.expenses ?? 0);
    const netProfit = roundMoney(grossProfit - expenses);
    const marginPct = netSalesExVat > 0 ? roundMoney((netProfit / netSalesExVat) * 100) : 0;

    totals.invoices_count += invoicesCount;
    totals.gross_sales = roundMoney(totals.gross_sales + grossSales);
    totals.sales_returns = roundMoney(totals.sales_returns + salesReturns);
    totals.net_sales = roundMoney(totals.net_sales + netSales);
    totals.net_vat = roundMoney(totals.net_vat + netVat);
    totals.net_sales_ex_vat = roundMoney(totals.net_sales_ex_vat + netSalesExVat);
    totals.net_cogs = roundMoney(totals.net_cogs + netCogs);
    totals.gross_profit = roundMoney(totals.gross_profit + grossProfit);
    totals.expenses = roundMoney(totals.expenses + expenses);
    totals.net_profit = roundMoney(totals.net_profit + netProfit);

    return {
      period,
      invoices_count: invoicesCount,
      gross_sales: grossSales,
      sales_returns: salesReturns,
      net_sales: netSales,
      net_vat: netVat,
      net_sales_ex_vat: netSalesExVat,
      net_cogs: netCogs,
      gross_profit: grossProfit,
      expenses,
      net_profit: netProfit,
      margin_pct: marginPct,
    };
  });

  res.json({ from, to, group_by: groupBy, rows, totals });
});

router.get('/inventory', requireAuth, (req, res) => {
  const db = getDb();
  const today = todayStr();
  const from =
    typeof req.query.from === 'string' && req.query.from.trim()
      ? req.query.from.trim()
      : addDays(today, -30);
  const to = typeof req.query.to === 'string' && req.query.to.trim() ? req.query.to.trim() : today;
  const stagnantDays = Math.max(1, Number(req.query.stagnant_days) || 30);
  const stagnantCutoff = addDays(today, -stagnantDays);

  const lowStock = db
    .prepare(
      `SELECT p.id, p.sku, p.name, p.category, p.brand, p.size, p.base_unit_name, p.min_stock,
              COALESCE((SELECT SUM(ws.quantity_base) FROM warehouse_stock ws WHERE ws.product_id = p.id), 0) AS total_stock
       FROM products p
       WHERE p.is_active = 1 AND p.is_kit = 0
         AND COALESCE((SELECT SUM(ws.quantity_base) FROM warehouse_stock ws WHERE ws.product_id = p.id), 0) <= p.min_stock
       ORDER BY (COALESCE((SELECT SUM(ws.quantity_base) FROM warehouse_stock ws WHERE ws.product_id = p.id), 0) - p.min_stock) ASC`
    )
    .all();

  const bestSellers = db
    .prepare(
      `SELECT p.id, p.sku, p.name, p.category, p.brand, p.size, p.base_unit_name,
              ROUND(SUM((sii.quantity - sii.returned_qty) * sii.conversion_factor), 4) AS net_qty_base,
              ROUND(SUM(sii.line_total * (CASE WHEN sii.quantity > 0 THEN (sii.quantity - sii.returned_qty) / sii.quantity ELSE 0 END)), 2) AS net_revenue
       FROM sales_invoice_items sii
       JOIN sales_invoices si ON si.id = sii.invoice_id
       JOIN products p ON p.id = sii.product_id
       WHERE si.status = 'completed' AND si.invoice_date >= ? AND si.invoice_date <= ?
       GROUP BY p.id
       HAVING net_qty_base > 0
       ORDER BY net_qty_base DESC
       LIMIT 30`
    )
    .all(from, to);

  const stagnant = db
    .prepare(
      `SELECT p.id, p.sku, p.name, p.category, p.brand, p.size, p.base_unit_name,
              COALESCE((SELECT SUM(ws.quantity_base) FROM warehouse_stock ws WHERE ws.product_id = p.id), 0) AS total_stock,
              (SELECT MAX(si.invoice_date)
               FROM sales_invoice_items sii
               JOIN sales_invoices si ON si.id = sii.invoice_id
               WHERE sii.product_id = p.id AND si.status = 'completed') AS last_sold_date
       FROM products p
       WHERE p.is_active = 1 AND p.is_kit = 0
         AND COALESCE((SELECT SUM(ws.quantity_base) FROM warehouse_stock ws WHERE ws.product_id = p.id), 0) > 0
         AND NOT EXISTS (
           SELECT 1 FROM sales_invoice_items sii
           JOIN sales_invoices si ON si.id = sii.invoice_id
           WHERE sii.product_id = p.id AND si.status = 'completed' AND si.invoice_date >= ?
         )
       ORDER BY total_stock DESC`
    )
    .all(stagnantCutoff);

  res.json({
    from,
    to,
    stagnant_days: stagnantDays,
    low_stock: lowStock,
    best_sellers: bestSellers,
    stagnant,
  });
});

router.get('/plumbers', requireAuth, (req, res) => {
  const db = getDb();
  const from = typeof req.query.from === 'string' ? req.query.from.trim() : '';
  const to = typeof req.query.to === 'string' ? req.query.to.trim() : '';

  const dateConds: string[] = ["si.status = 'completed'"];
  const params: string[] = [];
  if (from) {
    dateConds.push('si.invoice_date >= ?');
    params.push(from);
  }
  if (to) {
    dateConds.push('si.invoice_date <= ?');
    params.push(to);
  }

  const plumbers = db
    .prepare(
      `SELECT p.id, p.name, p.phone, p.area,
              COUNT(si.id) AS invoices_count,
              COUNT(DISTINCT si.customer_id) AS customers_count,
              COALESCE(SUM(si.total_amount), 0) AS gross_sales,
              COALESCE(SUM((SELECT COALESCE(SUM(sr.total_return_amount), 0) FROM sales_returns sr WHERE sr.original_invoice_id = si.id)), 0) AS returns_total
       FROM plumbers p
       LEFT JOIN sales_invoices si ON si.plumber_id = p.id AND ${dateConds.join(' AND ')}
       WHERE p.is_active = 1
       GROUP BY p.id
       ORDER BY gross_sales DESC, p.id ASC`
    )
    .all(...params) as {
    id: number;
    name: string;
    phone: string;
    area: string;
    invoices_count: number;
    customers_count: number;
    gross_sales: number;
    returns_total: number;
  }[];

  const rows = plumbers.map((p) => ({
    ...p,
    gross_sales: roundMoney(p.gross_sales),
    returns_total: roundMoney(p.returns_total),
    net_sales: roundMoney(p.gross_sales - p.returns_total),
  }));

  res.json({ plumbers: rows });
});

router.get('/vat', requireAuth, requireRole('admin', 'warehouse'), (req, res) => {
  const db = getDb();
  const today = todayStr();
  const from =
    typeof req.query.from === 'string' && req.query.from.trim()
      ? req.query.from.trim()
      : `${today.slice(0, 7)}-01`;
  const to = typeof req.query.to === 'string' && req.query.to.trim() ? req.query.to.trim() : today;

  const salesVat = db
    .prepare(
      `SELECT COUNT(*) AS invoices_count,
              COALESCE(SUM(subtotal - discount_amount), 0) AS taxable_sales,
              COALESCE(SUM(vat_amount), 0) AS output_vat
       FROM sales_invoices
       WHERE status = 'completed' AND vat_enabled = 1 AND invoice_date >= ? AND invoice_date <= ?`
    )
    .get(from, to) as { invoices_count: number; taxable_sales: number; output_vat: number };

  const returnsVat = db
    .prepare(
      `SELECT COALESCE(SUM(sri.vat_amount), 0) AS returned_vat
       FROM sales_return_items sri
       JOIN sales_returns sr ON sr.id = sri.return_id
       WHERE sr.return_date >= ? AND sr.return_date <= ?`
    )
    .get(from, to) as { returned_vat: number };

  const purchasesVat = db
    .prepare(
      `SELECT COUNT(*) AS purchases_count,
              COALESCE(SUM(vat_amount), 0) AS input_vat
       FROM purchase_invoices
       WHERE invoice_date >= ? AND invoice_date <= ?`
    )
    .get(from, to) as { purchases_count: number; input_vat: number };

  const netOutputVat = roundMoney(salesVat.output_vat - returnsVat.returned_vat);
  const netVatPayable = roundMoney(netOutputVat - purchasesVat.input_vat);

  res.json({
    from,
    to,
    sales_vat_invoices: salesVat.invoices_count,
    taxable_sales: roundMoney(salesVat.taxable_sales),
    output_vat: roundMoney(salesVat.output_vat),
    returned_vat: roundMoney(returnsVat.returned_vat),
    net_output_vat: netOutputVat,
    input_vat: roundMoney(purchasesVat.input_vat),
    net_vat_payable: netVatPayable,
  });
});

export default router;
