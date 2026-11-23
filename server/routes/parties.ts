import { Router } from 'express';
import { getDb, withTransaction } from '../db.ts';
import { requireAuth, requireRole } from '../auth.ts';
import { nowSql, roundMoney, todayStr } from '../utils.ts';

export const customersRouter = Router();
export const plumbersRouter = Router();
export const suppliersRouter = Router();

// ==================== CUSTOMERS ====================

customersRouter.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const where = q
    ? 'WHERE is_active = 1 AND (name LIKE ? OR phone LIKE ? OR address LIKE ?)'
    : 'WHERE is_active = 1';
  const params = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [];
  const customers = db
    .prepare(`SELECT * FROM customers ${where} ORDER BY is_walkin DESC, id DESC`)
    .all(...params);
  res.json({ customers });
});

customersRouter.post('/', requireAuth, (req, res) => {
  const { name, phone, address, price_tier, opening_balance, notes } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'يرجى إدخال اسم العميل' });
    return;
  }
  const tier = ['retail', 'plumber', 'wholesale'].includes(price_tier) ? price_tier : 'retail';
  const openBal = roundMoney(opening_balance ?? 0);

  const db = getDb();
  const resIns = db
    .prepare(
      `INSERT INTO customers(name, phone, address, price_tier, opening_balance, balance, is_walkin, notes, is_active, created_at)
       VALUES(?, ?, ?, ?, ?, ?, 0, ?, 1, ?)`
    )
    .run(
      name.trim(),
      typeof phone === 'string' ? phone.trim() : '',
      typeof address === 'string' ? address.trim() : '',
      tier,
      openBal,
      openBal,
      typeof notes === 'string' ? notes.trim() : '',
      nowSql()
    );
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(Number(resIns.lastInsertRowid));
  res.status(201).json({ customer });
});

customersRouter.put('/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'العميل غير موجود' });
    return;
  }

  const { name, phone, address, price_tier, notes, is_active } = req.body ?? {};
  const nextName = typeof name === 'string' && name.trim() ? name.trim() : String(existing.name);
  const nextTier = ['retail', 'plumber', 'wholesale'].includes(price_tier)
    ? price_tier
    : String(existing.price_tier);

  db.prepare(
    `UPDATE customers SET name = ?, phone = ?, address = ?, price_tier = ?, notes = ?, is_active = ? WHERE id = ?`
  ).run(
    nextName,
    typeof phone === 'string' ? phone.trim() : String(existing.phone ?? ''),
    typeof address === 'string' ? address.trim() : String(existing.address ?? ''),
    nextTier,
    typeof notes === 'string' ? notes.trim() : String(existing.notes ?? ''),
    typeof is_active === 'boolean' ? (is_active ? 1 : 0) : Number(existing.is_active),
    id
  );
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  res.json({ customer });
});

customersRouter.get('/:id/statement', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!customer) {
    res.status(404).json({ error: 'العميل غير موجود' });
    return;
  }

  type Entry = {
    date: string;
    sort_at: string;
    type: string;
    ref_no: string;
    description: string;
    debit: number;
    credit: number;
    running_balance?: number;
  };
  const entries: Entry[] = [];

  const opening = roundMoney(customer.opening_balance);
  if (opening !== 0) {
    entries.push({
      date: String(customer.created_at).slice(0, 10),
      sort_at: '0000-00-00 00:00:00',
      type: 'opening',
      ref_no: 'رصيد أول المدة',
      description: 'رصيد افتتاحي مسجل للعميل',
      debit: opening > 0 ? opening : 0,
      credit: opening < 0 ? -opening : 0,
    });
  }

  const invoices = db
    .prepare(
      `SELECT si.id, si.invoice_no, si.invoice_date, si.created_at, si.total_amount, si.paid_amount, p.name AS plumber_name
       FROM sales_invoices si
       LEFT JOIN plumbers p ON p.id = si.plumber_id
       WHERE si.customer_id = ? AND si.status = 'completed'`
    )
    .all(id) as {
    id: number;
    invoice_no: string;
    invoice_date: string;
    created_at: string;
    total_amount: number;
    paid_amount: number;
    plumber_name: string | null;
  }[];

  for (const inv of invoices) {
    entries.push({
      date: inv.invoice_date,
      sort_at: inv.created_at,
      type: 'sale',
      ref_no: inv.invoice_no,
      description: inv.plumber_name ? `فاتورة مبيعات (السباك: ${inv.plumber_name})` : 'فاتورة مبيعات',
      debit: roundMoney(inv.total_amount),
      credit: roundMoney(inv.paid_amount),
    });
  }

  const returns = db
    .prepare(
      `SELECT sr.return_no, sr.return_date, sr.created_at, sr.total_return_amount, sr.refund_method, si.invoice_no
       FROM sales_returns sr
       JOIN sales_invoices si ON si.id = sr.original_invoice_id
       WHERE sr.customer_id = ?`
    )
    .all(id) as {
    return_no: string;
    return_date: string;
    created_at: string;
    total_return_amount: number;
    refund_method: string;
    invoice_no: string;
  }[];

  for (const ret of returns) {
    entries.push({
      date: ret.return_date,
      sort_at: ret.created_at,
      type: 'return',
      ref_no: ret.return_no,
      description:
        ret.refund_method === 'credit_note'
          ? `مرتجع مبيعات مخصوم من الحساب (فاتورة ${ret.invoice_no})`
          : `مرتجع مبيعات مسترد نقداً (فاتورة ${ret.invoice_no} — لا يؤثر على الرصيد الآجل)`,
      debit: 0,
      credit: ret.refund_method === 'credit_note' ? roundMoney(ret.total_return_amount) : 0,
    });
  }

  const payments = db
    .prepare(
      `SELECT tt.amount_delta, tt.tx_date, tt.created_at, tt.description, ta.name AS account_name
       FROM treasury_transactions tt
       JOIN treasury_accounts ta ON ta.id = tt.account_id
       WHERE tt.tx_type = 'customer_payment' AND tt.reference_type = 'customer' AND tt.reference_id = ?`
    )
    .all(id) as {
    amount_delta: number;
    tx_date: string;
    created_at: string;
    description: string;
    account_name: string;
  }[];

  for (const pay of payments) {
    entries.push({
      date: pay.tx_date,
      sort_at: pay.created_at,
      type: 'payment',
      ref_no: 'سند قبض',
      description: pay.description ? `${pay.description} (${pay.account_name})` : `تحصيل دفعة (${pay.account_name})`,
      debit: 0,
      credit: roundMoney(pay.amount_delta),
    });
  }

  entries.sort((a, b) => a.sort_at.localeCompare(b.sort_at));
  let running = 0;
  for (const e of entries) {
    running = roundMoney(running + e.debit - e.credit);
    e.running_balance = running;
  }

  res.json({ customer, entries, calculated_balance: running });
});

customersRouter.post('/:id/payments', requireAuth, (req, res) => {
  const customerId = Number(req.params.id);
  const { amount, treasury_account_id, payment_date, notes } = req.body ?? {};
  const payAmount = roundMoney(amount);
  const accountId = Number(treasury_account_id);

  if (payAmount <= 0 || !Number.isInteger(accountId)) {
    res.status(400).json({ error: 'يرجى إدخال مبلغ صحيح واختيار الخزنة/الحساب' });
    return;
  }

  try {
    const updatedCustomer = withTransaction((tx) => {
      const cust = tx.prepare('SELECT id, name, is_walkin, balance FROM customers WHERE id = ?').get(customerId) as
        | { id: number; name: string; is_walkin: number; balance: number }
        | undefined;
      if (!cust) throw new Error('العميل غير موجود');
      if (cust.is_walkin === 1) throw new Error('لا يمكن تسجيل تحصيل آجل للعميل النقدي');

      const acc = tx.prepare('SELECT id, name FROM treasury_accounts WHERE id = ? AND is_active = 1').get(accountId) as
        | { id: number; name: string }
        | undefined;
      if (!acc) throw new Error('حساب الخزنة المحدد غير موجود');

      const txDate = typeof payment_date === 'string' && payment_date.trim() ? payment_date.trim() : todayStr();
      const now = nowSql();
      const desc =
        typeof notes === 'string' && notes.trim()
          ? `تحصيل من العميل ${cust.name}: ${notes.trim()}`
          : `تحصيل دفعة من العميل ${cust.name}`;

      tx.prepare('UPDATE customers SET balance = ROUND(balance - ?, 2) WHERE id = ?').run(payAmount, customerId);
      tx.prepare('UPDATE treasury_accounts SET balance = ROUND(balance + ?, 2) WHERE id = ?').run(payAmount, accountId);
      tx.prepare(
        `INSERT INTO treasury_transactions(account_id, tx_type, amount_delta, tx_date, reference_type, reference_id, description, created_by, created_at)
         VALUES(?, 'customer_payment', ?, ?, 'customer', ?, ?, ?, ?)`
      ).run(accountId, payAmount, txDate, customerId, desc, req.user!.id, now);

      return tx.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
    });

    res.json({ customer: updatedCustomer });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'تعذر تسجيل الدفعة' });
  }
});

// ==================== PLUMBERS ====================

plumbersRouter.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const where = q ? 'WHERE p.is_active = 1 AND (p.name LIKE ? OR p.phone LIKE ? OR p.area LIKE ?)' : 'WHERE p.is_active = 1';
  const params = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [];
  const plumbers = db
    .prepare(
      `SELECT p.*,
        (SELECT COUNT(*) FROM sales_invoices si WHERE si.plumber_id = p.id AND si.status = 'completed') AS invoices_count,
        (SELECT COALESCE(SUM(si.total_amount), 0) FROM sales_invoices si WHERE si.plumber_id = p.id AND si.status = 'completed') AS total_sales
       FROM plumbers p
       ${where}
       ORDER BY p.id DESC`
    )
    .all(...params);
  res.json({ plumbers });
});

plumbersRouter.post('/', requireAuth, (req, res) => {
  const { name, phone, area, notes } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'يرجى إدخال اسم السباك' });
    return;
  }
  const db = getDb();
  const r = db
    .prepare('INSERT INTO plumbers(name, phone, area, notes, is_active, created_at) VALUES(?, ?, ?, ?, 1, ?)')
    .run(
      name.trim(),
      typeof phone === 'string' ? phone.trim() : '',
      typeof area === 'string' ? area.trim() : '',
      typeof notes === 'string' ? notes.trim() : '',
      nowSql()
    );
  const plumber = db.prepare('SELECT * FROM plumbers WHERE id = ?').get(Number(r.lastInsertRowid));
  res.status(201).json({ plumber });
});

plumbersRouter.put('/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const existing = db.prepare('SELECT * FROM plumbers WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'السباك غير موجود' });
    return;
  }
  const { name, phone, area, notes, is_active } = req.body ?? {};
  db.prepare('UPDATE plumbers SET name = ?, phone = ?, area = ?, notes = ?, is_active = ? WHERE id = ?').run(
    typeof name === 'string' && name.trim() ? name.trim() : String(existing.name),
    typeof phone === 'string' ? phone.trim() : String(existing.phone ?? ''),
    typeof area === 'string' ? area.trim() : String(existing.area ?? ''),
    typeof notes === 'string' ? notes.trim() : String(existing.notes ?? ''),
    typeof is_active === 'boolean' ? (is_active ? 1 : 0) : Number(existing.is_active),
    id
  );
  const plumber = db.prepare('SELECT * FROM plumbers WHERE id = ?').get(id);
  res.json({ plumber });
});

plumbersRouter.get('/:id/report', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const from = typeof req.query.from === 'string' ? req.query.from.trim() : '';
  const to = typeof req.query.to === 'string' ? req.query.to.trim() : '';

  const db = getDb();
  const plumber = db.prepare('SELECT * FROM plumbers WHERE id = ?').get(id);
  if (!plumber) {
    res.status(404).json({ error: 'السباك غير موجود' });
    return;
  }

  const conditions = ["si.plumber_id = ? AND si.status = 'completed'"];
  const params: (string | number)[] = [id];
  if (from) {
    conditions.push('si.invoice_date >= ?');
    params.push(from);
  }
  if (to) {
    conditions.push('si.invoice_date <= ?');
    params.push(to);
  }

  const invoices = db
    .prepare(
      `SELECT si.id, si.invoice_no, si.invoice_date, si.total_amount, si.paid_amount, si.remaining_amount,
              c.name AS customer_name, c.phone AS customer_phone,
              COALESCE((SELECT SUM(sr.total_return_amount) FROM sales_returns sr WHERE sr.original_invoice_id = si.id), 0) AS returned_total
       FROM sales_invoices si
       JOIN customers c ON c.id = si.customer_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY si.invoice_date DESC, si.id DESC`
    )
    .all(...params) as {
    id: number;
    invoice_no: string;
    invoice_date: string;
    total_amount: number;
    paid_amount: number;
    remaining_amount: number;
    customer_name: string;
    customer_phone: string;
    returned_total: number;
  }[];

  let grossTotal = 0;
  let returnsTotal = 0;
  for (const inv of invoices) {
    grossTotal = roundMoney(grossTotal + inv.total_amount);
    returnsTotal = roundMoney(returnsTotal + inv.returned_total);
  }
  const netTotal = roundMoney(grossTotal - returnsTotal);

  res.json({
    plumber,
    invoices,
    summary: {
      invoices_count: invoices.length,
      gross_sales: grossTotal,
      returns_total: returnsTotal,
      net_sales: netTotal,
    },
  });
});

// ==================== SUPPLIERS ====================

suppliersRouter.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const where = q
    ? 'WHERE s.is_active = 1 AND (s.name LIKE ? OR s.phone LIKE ? OR s.company LIKE ?)'
    : 'WHERE s.is_active = 1';
  const params = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [];
  const suppliers = db
    .prepare(
      `SELECT s.*,
        (SELECT COALESCE(SUM(sc.amount), 0) FROM supplier_checks sc WHERE sc.supplier_id = s.id AND sc.status = 'pending') AS pending_checks_total
       FROM suppliers s
       ${where}
       ORDER BY s.id DESC`
    )
    .all(...params);
  res.json({ suppliers });
});

suppliersRouter.post('/', requireAuth, requireRole('admin', 'warehouse'), (req, res) => {
  const { name, phone, company, address, opening_balance, notes } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'يرجى إدخال اسم المورد' });
    return;
  }
  const openBal = roundMoney(opening_balance ?? 0);
  const db = getDb();
  const r = db
    .prepare(
      `INSERT INTO suppliers(name, phone, company, address, opening_balance, balance, notes, is_active, created_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?)`
    )
    .run(
      name.trim(),
      typeof phone === 'string' ? phone.trim() : '',
      typeof company === 'string' ? company.trim() : '',
      typeof address === 'string' ? address.trim() : '',
      openBal,
      openBal,
      typeof notes === 'string' ? notes.trim() : '',
      nowSql()
    );
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(Number(r.lastInsertRowid));
  res.status(201).json({ supplier });
});

suppliersRouter.put('/:id', requireAuth, requireRole('admin', 'warehouse'), (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const existing = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'المورد غير موجود' });
    return;
  }
  const { name, phone, company, address, notes, is_active } = req.body ?? {};
  db.prepare(
    `UPDATE suppliers SET name = ?, phone = ?, company = ?, address = ?, notes = ?, is_active = ? WHERE id = ?`
  ).run(
    typeof name === 'string' && name.trim() ? name.trim() : String(existing.name),
    typeof phone === 'string' ? phone.trim() : String(existing.phone ?? ''),
    typeof company === 'string' ? company.trim() : String(existing.company ?? ''),
    typeof address === 'string' ? address.trim() : String(existing.address ?? ''),
    typeof notes === 'string' ? notes.trim() : String(existing.notes ?? ''),
    typeof is_active === 'boolean' ? (is_active ? 1 : 0) : Number(existing.is_active),
    id
  );
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
  res.json({ supplier });
});

suppliersRouter.get('/:id/statement', requireAuth, requireRole('admin', 'warehouse'), (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!supplier) {
    res.status(404).json({ error: 'المورد غير موجود' });
    return;
  }

  type Entry = {
    date: string;
    sort_at: string;
    type: string;
    ref_no: string;
    description: string;
    debit: number;
    credit: number;
    running_balance?: number;
  };
  const entries: Entry[] = [];

  const opening = roundMoney(supplier.opening_balance);
  if (opening !== 0) {
    entries.push({
      date: String(supplier.created_at).slice(0, 10),
      sort_at: '0000-00-00 00:00:00',
      type: 'opening',
      ref_no: 'رصيد أول المدة',
      description: 'رصيد افتتاحي مستحق للمورد',
      debit: opening < 0 ? -opening : 0,
      credit: opening > 0 ? opening : 0,
    });
  }

  const purchases = db
    .prepare(
      `SELECT invoice_no, supplier_invoice_no, invoice_date, created_at, total_supplier_amount, paid_amount
       FROM purchase_invoices WHERE supplier_id = ?`
    )
    .all(id) as {
    invoice_no: string;
    supplier_invoice_no: string;
    invoice_date: string;
    created_at: string;
    total_supplier_amount: number;
    paid_amount: number;
  }[];

  for (const pur of purchases) {
    entries.push({
      date: pur.invoice_date,
      sort_at: pur.created_at,
      type: 'purchase',
      ref_no: pur.invoice_no,
      description: pur.supplier_invoice_no
        ? `فاتورة مشتريات (فاتورة المورد: ${pur.supplier_invoice_no})`
        : 'فاتورة مشتريات',
      debit: roundMoney(pur.paid_amount),
      credit: roundMoney(pur.total_supplier_amount),
    });
  }

  const returns = db
    .prepare(
      `SELECT return_no, return_date, created_at, total_amount, settlement_method, reason
       FROM purchase_returns WHERE supplier_id = ?`
    )
    .all(id) as {
    return_no: string;
    return_date: string;
    created_at: string;
    total_amount: number;
    settlement_method: string;
    reason: string;
  }[];

  for (const ret of returns) {
    entries.push({
      date: ret.return_date,
      sort_at: ret.created_at,
      type: 'purchase_return',
      ref_no: ret.return_no,
      description:
        ret.settlement_method === 'credit_note'
          ? `مرتجع مشتريات (${ret.reason}) مخصوم من حساب المورد`
          : `مرتجع مشتريات (${ret.reason}) مسترد نقداً`,
      debit: ret.settlement_method === 'credit_note' ? roundMoney(ret.total_amount) : 0,
      credit: 0,
    });
  }

  const payments = db
    .prepare(
      `SELECT tt.amount_delta, tt.tx_date, tt.created_at, tt.description, ta.name AS account_name
       FROM treasury_transactions tt
       JOIN treasury_accounts ta ON ta.id = tt.account_id
       WHERE tt.tx_type = 'supplier_payment' AND tt.reference_type = 'supplier' AND tt.reference_id = ?`
    )
    .all(id) as {
    amount_delta: number;
    tx_date: string;
    created_at: string;
    description: string;
    account_name: string;
  }[];

  for (const pay of payments) {
    entries.push({
      date: pay.tx_date,
      sort_at: pay.created_at,
      type: 'payment',
      ref_no: 'سند صرف',
      description: pay.description ? `${pay.description} (${pay.account_name})` : `سداد للمورد (${pay.account_name})`,
      debit: roundMoney(-pay.amount_delta),
      credit: 0,
    });
  }

  const clearedChecks = db
    .prepare(
      `SELECT check_no, bank_name, amount, cleared_at, due_date
       FROM supplier_checks
       WHERE supplier_id = ? AND status = 'cleared'`
    )
    .all(id) as {
    check_no: string;
    bank_name: string;
    amount: number;
    cleared_at: string | null;
    due_date: string;
  }[];

  for (const chk of clearedChecks) {
    const dt = chk.cleared_at || `${chk.due_date} 12:00:00`;
    entries.push({
      date: dt.slice(0, 10),
      sort_at: dt,
      type: 'check_cleared',
      ref_no: chk.check_no,
      description: `صرف شيك رقم ${chk.check_no} (${chk.bank_name})`,
      debit: roundMoney(chk.amount),
      credit: 0,
    });
  }

  entries.sort((a, b) => a.sort_at.localeCompare(b.sort_at));
  let running = 0;
  for (const e of entries) {
    running = roundMoney(running + e.credit - e.debit);
    e.running_balance = running;
  }

  const pendingChecks = db
    .prepare("SELECT * FROM supplier_checks WHERE supplier_id = ? AND status = 'pending' ORDER BY due_date ASC")
    .all(id);

  res.json({ supplier, entries, pending_checks: pendingChecks, calculated_balance: running });
});

suppliersRouter.post('/:id/payments', requireAuth, requireRole('admin', 'warehouse'), (req, res) => {
  const supplierId = Number(req.params.id);
  const { amount, treasury_account_id, payment_date, notes } = req.body ?? {};
  const payAmount = roundMoney(amount);
  const accountId = Number(treasury_account_id);

  if (payAmount <= 0 || !Number.isInteger(accountId)) {
    res.status(400).json({ error: 'يرجى إدخال مبلغ صحيح واختيار الحساب/الخزنة' });
    return;
  }

  try {
    const updatedSupplier = withTransaction((tx) => {
      const sup = tx.prepare('SELECT id, name FROM suppliers WHERE id = ?').get(supplierId) as
        | { id: number; name: string }
        | undefined;
      if (!sup) throw new Error('المورد غير موجود');

      const acc = tx.prepare('SELECT id, name FROM treasury_accounts WHERE id = ? AND is_active = 1').get(accountId) as
        | { id: number; name: string }
        | undefined;
      if (!acc) throw new Error('حساب الخزنة المحدد غير موجود');

      const txDate = typeof payment_date === 'string' && payment_date.trim() ? payment_date.trim() : todayStr();
      const now = nowSql();
      const desc =
        typeof notes === 'string' && notes.trim()
          ? `سداد للمورد ${sup.name}: ${notes.trim()}`
          : `سداد دفعة للمورد ${sup.name}`;

      tx.prepare('UPDATE suppliers SET balance = ROUND(balance - ?, 2) WHERE id = ?').run(payAmount, supplierId);
      tx.prepare('UPDATE treasury_accounts SET balance = ROUND(balance - ?, 2) WHERE id = ?').run(payAmount, accountId);
      tx.prepare(
        `INSERT INTO treasury_transactions(account_id, tx_type, amount_delta, tx_date, reference_type, reference_id, description, created_by, created_at)
         VALUES(?, 'supplier_payment', ?, ?, 'supplier', ?, ?, ?, ?)`
      ).run(accountId, -payAmount, txDate, supplierId, desc, req.user!.id, now);

      return tx.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplierId);
    });

    res.json({ supplier: updatedSupplier });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'تعذر تسجيل السداد' });
  }
});
