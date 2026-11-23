import { Router } from 'express';
import { getDb, withTransaction } from '../db.ts';
import { requireAuth, requireRole } from '../auth.ts';
import { nowSql, roundMoney, todayStr } from '../utils.ts';

const router = Router();

// ==================== TREASURY ACCOUNTS & TRANSFERS ====================

router.get('/accounts', requireAuth, (_req, res) => {
  const db = getDb();
  const accounts = db
    .prepare('SELECT * FROM treasury_accounts WHERE is_active = 1 ORDER BY is_default_pos DESC, id ASC')
    .all();
  res.json({ accounts });
});

router.post('/accounts', requireAuth, requireRole('admin'), (req, res) => {
  const { name, account_type, opening_balance, is_default_pos } = req.body ?? {};
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    !['cashier_safe', 'main_safe', 'bank', 'instapay', 'e_wallet'].includes(account_type)
  ) {
    res.status(400).json({ error: 'بيانات الخزنة / الحساب غير صالحة' });
    return;
  }

  try {
    const account = withTransaction((tx) => {
      const dup = tx.prepare('SELECT 1 FROM treasury_accounts WHERE name = ?').get(name.trim());
      if (dup) throw new Error('اسم الحساب موجود بالفعل');

      if (is_default_pos) {
        tx.prepare('UPDATE treasury_accounts SET is_default_pos = 0').run();
      }
      const openBal = roundMoney(opening_balance ?? 0);
      const now = nowSql();
      const r = tx
        .prepare(
          'INSERT INTO treasury_accounts(name, account_type, balance, is_default_pos, is_active, created_at) VALUES(?, ?, ?, ?, 1, ?)'
        )
        .run(name.trim(), account_type, openBal, is_default_pos ? 1 : 0, now);
      const accId = Number(r.lastInsertRowid);
      if (openBal !== 0) {
        tx.prepare(
          `INSERT INTO treasury_transactions(account_id, tx_type, amount_delta, tx_date, reference_type, reference_id, description, created_by, created_at)
           VALUES(?, 'opening', ?, ?, 'opening', ?, 'رصيد افتتاحي', ?, ?)`
        ).run(accId, openBal, todayStr(), accId, req.user!.id, now);
      }
      return tx.prepare('SELECT * FROM treasury_accounts WHERE id = ?').get(accId);
    });
    res.status(201).json({ account });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'تعذر إضافة الحساب' });
  }
});

router.get('/transactions', requireAuth, (req, res) => {
  const db = getDb();
  const accountId = req.query.account_id ? Number(req.query.account_id) : null;
  const from = typeof req.query.from === 'string' ? req.query.from.trim() : '';
  const to = typeof req.query.to === 'string' ? req.query.to.trim() : '';
  const txType = typeof req.query.tx_type === 'string' ? req.query.tx_type.trim() : '';
  const limit = Math.min(300, Math.max(20, Number(req.query.limit) || 120));

  const conditions: string[] = [];
  const params: (string | number)[] = [];
  if (accountId) {
    conditions.push('tt.account_id = ?');
    params.push(accountId);
  }
  if (from) {
    conditions.push('tt.tx_date >= ?');
    params.push(from);
  }
  if (to) {
    conditions.push('tt.tx_date <= ?');
    params.push(to);
  }
  if (txType) {
    conditions.push('tt.tx_type = ?');
    params.push(txType);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const transactions = db
    .prepare(
      `SELECT tt.*, ta.name AS account_name, u.full_name AS user_name
       FROM treasury_transactions tt
       JOIN treasury_accounts ta ON ta.id = tt.account_id
       LEFT JOIN users u ON u.id = tt.created_by
       ${whereSql}
       ORDER BY tt.id DESC
       LIMIT ?`
    )
    .all(...params, limit);
  res.json({ transactions });
});

router.post('/transfers', requireAuth, (req, res) => {
  const { from_account_id, to_account_id, amount, tx_date, notes } = req.body ?? {};
  const fromId = Number(from_account_id);
  const toId = Number(to_account_id);
  const transferAmount = roundMoney(amount);

  if (!Number.isInteger(fromId) || !Number.isInteger(toId) || fromId === toId || transferAmount <= 0) {
    res.status(400).json({ error: 'يرجى اختيار حسابين مختلفين وإدخال مبلغ صحيح' });
    return;
  }

  try {
    withTransaction((tx) => {
      const fromAcc = tx
        .prepare('SELECT id, name, balance FROM treasury_accounts WHERE id = ? AND is_active = 1')
        .get(fromId) as { id: number; name: string; balance: number } | undefined;
      const toAcc = tx
        .prepare('SELECT id, name, balance FROM treasury_accounts WHERE id = ? AND is_active = 1')
        .get(toId) as { id: number; name: string; balance: number } | undefined;

      if (!fromAcc || !toAcc) throw new Error('أحد الحسابات المحددة غير موجود');
      if (roundMoney(fromAcc.balance) < transferAmount) {
        throw new Error(`الرصيد في ${fromAcc.name} (${fromAcc.balance}) لا يكفي للتحويل`);
      }

      const d = typeof tx_date === 'string' && tx_date.trim() ? tx_date.trim() : todayStr();
      const now = nowSql();
      const noteText = typeof notes === 'string' && notes.trim() ? ` — ${notes.trim()}` : '';

      tx.prepare('UPDATE treasury_accounts SET balance = ROUND(balance - ?, 2) WHERE id = ?').run(transferAmount, fromId);
      tx.prepare('UPDATE treasury_accounts SET balance = ROUND(balance + ?, 2) WHERE id = ?').run(transferAmount, toId);

      tx.prepare(
        `INSERT INTO treasury_transactions(account_id, tx_type, amount_delta, tx_date, reference_type, reference_id, description, created_by, created_at)
         VALUES(?, 'transfer_out', ?, ?, 'treasury_transfer', ?, ?, ?, ?)`
      ).run(fromId, -transferAmount, d, toId, `تحويل إلى ${toAcc.name}${noteText}`, req.user!.id, now);

      tx.prepare(
        `INSERT INTO treasury_transactions(account_id, tx_type, amount_delta, tx_date, reference_type, reference_id, description, created_by, created_at)
         VALUES(?, 'transfer_in', ?, ?, 'treasury_transfer', ?, ?, ?, ?)`
      ).run(toId, transferAmount, d, fromId, `استلام تحويل من ${fromAcc.name}${noteText}`, req.user!.id, now);
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'تعذر تنفيذ التحويل' });
  }
});

// ==================== DAILY EXPENSES ====================

router.get('/expenses', requireAuth, (req, res) => {
  const db = getDb();
  const from = typeof req.query.from === 'string' ? req.query.from.trim() : '';
  const to = typeof req.query.to === 'string' ? req.query.to.trim() : '';
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';

  const conditions: string[] = [];
  const params: (string | number)[] = [];
  if (from) {
    conditions.push('e.expense_date >= ?');
    params.push(from);
  }
  if (to) {
    conditions.push('e.expense_date <= ?');
    params.push(to);
  }
  if (category) {
    conditions.push('e.category = ?');
    params.push(category);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const expenses = db
    .prepare(
      `SELECT e.*, ta.name AS account_name, u.full_name AS user_name
       FROM expenses e
       JOIN treasury_accounts ta ON ta.id = e.treasury_account_id
       LEFT JOIN users u ON u.id = e.created_by
       ${whereSql}
       ORDER BY e.expense_date DESC, e.id DESC
       LIMIT 200`
    )
    .all(...params);
  res.json({ expenses });
});

router.post('/expenses', requireAuth, (req, res) => {
  const { expense_date, category, amount, treasury_account_id, description } = req.body ?? {};
  const expAmount = roundMoney(amount);
  const accountId = Number(treasury_account_id);
  const cat = typeof category === 'string' && category.trim() ? category.trim() : '';

  if (!cat || expAmount <= 0 || !Number.isInteger(accountId)) {
    res.status(400).json({ error: 'يرجى تحديد البند والمبلغ والخزنة' });
    return;
  }

  try {
    const expense = withTransaction((tx) => {
      const acc = tx.prepare('SELECT id, name FROM treasury_accounts WHERE id = ? AND is_active = 1').get(accountId);
      if (!acc) throw new Error('الخزنة / الحساب غير موجود');

      const d = typeof expense_date === 'string' && expense_date.trim() ? expense_date.trim() : todayStr();
      const now = nowSql();
      const desc = typeof description === 'string' ? description.trim() : '';

      const r = tx
        .prepare(
          `INSERT INTO expenses(expense_date, category, amount, treasury_account_id, description, created_by, created_at)
           VALUES(?, ?, ?, ?, ?, ?, ?)`
        )
        .run(d, cat, expAmount, accountId, desc, req.user!.id, now);
      const expId = Number(r.lastInsertRowid);

      tx.prepare('UPDATE treasury_accounts SET balance = ROUND(balance - ?, 2) WHERE id = ?').run(expAmount, accountId);
      tx.prepare(
        `INSERT INTO treasury_transactions(account_id, tx_type, amount_delta, tx_date, reference_type, reference_id, description, created_by, created_at)
         VALUES(?, 'expense', ?, ?, 'expense', ?, ?, ?, ?)`
      ).run(accountId, -expAmount, d, expId, desc ? `مصروف (${cat}): ${desc}` : `مصروف: ${cat}`, req.user!.id, now);

      return tx.prepare('SELECT * FROM expenses WHERE id = ?').get(expId);
    });
    res.status(201).json({ expense });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'تعذر تسجيل المصروف' });
  }
});

router.delete('/expenses/:id', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  try {
    withTransaction((tx) => {
      const exp = tx.prepare('SELECT * FROM expenses WHERE id = ?').get(id) as
        | { id: number; amount: number; treasury_account_id: number; category: string }
        | undefined;
      if (!exp) throw new Error('المصروف غير موجود');

      tx.prepare('UPDATE treasury_accounts SET balance = ROUND(balance + ?, 2) WHERE id = ?').run(
        exp.amount,
        exp.treasury_account_id
      );
      tx.prepare("DELETE FROM treasury_transactions WHERE reference_type = 'expense' AND reference_id = ?").run(id);
      tx.prepare('DELETE FROM expenses WHERE id = ?').run(id);
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'تعذر حذف المصروف' });
  }
});

// ==================== SUPPLIER CHECKS ====================

router.get('/checks', requireAuth, requireRole('admin', 'warehouse'), (req, res) => {
  const db = getDb();
  const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
  const whereSql = status ? 'WHERE sc.status = ?' : '';
  const params = status ? [status] : [];

  const checks = db
    .prepare(
      `SELECT sc.*, s.name AS supplier_name, s.company AS supplier_company, ta.name AS account_name
       FROM supplier_checks sc
       JOIN suppliers s ON s.id = sc.supplier_id
       LEFT JOIN treasury_accounts ta ON ta.id = sc.treasury_account_id
       ${whereSql}
       ORDER BY CASE WHEN sc.status = 'pending' THEN 0 ELSE 1 END, sc.due_date ASC, sc.id DESC`
    )
    .all(...params);
  res.json({ checks });
});

router.post('/checks', requireAuth, requireRole('admin', 'warehouse'), (req, res) => {
  const { check_no, bank_name, supplier_id, treasury_account_id, amount, issue_date, due_date, notes } = req.body ?? {};
  const supId = Number(supplier_id);
  const chkAmount = roundMoney(amount);
  const accId = treasury_account_id ? Number(treasury_account_id) : null;

  if (
    typeof check_no !== 'string' ||
    !check_no.trim() ||
    typeof bank_name !== 'string' ||
    !bank_name.trim() ||
    !Number.isInteger(supId) ||
    chkAmount <= 0 ||
    typeof due_date !== 'string' ||
    !due_date.trim()
  ) {
    res.status(400).json({ error: 'يرجى استكمال بيانات الشيك (الرقم، البنك، المورد، المبلغ، تاريخ الاستحقاق)' });
    return;
  }

  const db = getDb();
  const sup = db.prepare('SELECT id FROM suppliers WHERE id = ?').get(supId);
  if (!sup) {
    res.status(400).json({ error: 'المورد غير موجود' });
    return;
  }

  const r = db
    .prepare(
      `INSERT INTO supplier_checks(check_no, bank_name, supplier_id, treasury_account_id, amount, issue_date, due_date, status, notes, created_by, created_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
    )
    .run(
      check_no.trim(),
      bank_name.trim(),
      supId,
      accId,
      chkAmount,
      typeof issue_date === 'string' && issue_date.trim() ? issue_date.trim() : todayStr(),
      due_date.trim(),
      typeof notes === 'string' ? notes.trim() : '',
      req.user!.id,
      nowSql()
    );
  const check = db.prepare('SELECT * FROM supplier_checks WHERE id = ?').get(Number(r.lastInsertRowid));
  res.status(201).json({ check });
});

router.post('/checks/:id/clear', requireAuth, requireRole('admin', 'warehouse'), (req, res) => {
  const id = Number(req.params.id);
  const bodyAccId = req.body?.treasury_account_id ? Number(req.body.treasury_account_id) : null;
  const clearedDate = typeof req.body?.cleared_date === 'string' && req.body.cleared_date.trim() ? req.body.cleared_date.trim() : todayStr();

  try {
    const updated = withTransaction((tx) => {
      const chk = tx
        .prepare('SELECT * FROM supplier_checks WHERE id = ?')
        .get(id) as
        | {
            id: number;
            check_no: string;
            bank_name: string;
            supplier_id: number;
            treasury_account_id: number | null;
            amount: number;
            status: string;
          }
        | undefined;
      if (!chk) throw new Error('الشيك غير موجود');
      if (chk.status !== 'pending') throw new Error('الشيك ليس في حالة انتظار الصرف');

      const accId = bodyAccId || chk.treasury_account_id;
      if (!accId) throw new Error('يرجى تحديد الحساب البنكي أو الخزنة التي تم الصرف منها');

      const acc = tx.prepare('SELECT id FROM treasury_accounts WHERE id = ? AND is_active = 1').get(accId);
      if (!acc) throw new Error('الحساب المحدد غير موجود');

      const sup = tx.prepare('SELECT name FROM suppliers WHERE id = ?').get(chk.supplier_id) as { name: string };
      const now = nowSql();

      tx.prepare(
        "UPDATE supplier_checks SET status = 'cleared', treasury_account_id = ?, cleared_at = ? WHERE id = ?"
      ).run(accId, `${clearedDate} ${now.slice(11)}`, id);

      tx.prepare('UPDATE suppliers SET balance = ROUND(balance - ?, 2) WHERE id = ?').run(chk.amount, chk.supplier_id);
      tx.prepare('UPDATE treasury_accounts SET balance = ROUND(balance - ?, 2) WHERE id = ?').run(chk.amount, accId);

      tx.prepare(
        `INSERT INTO treasury_transactions(account_id, tx_type, amount_delta, tx_date, reference_type, reference_id, description, created_by, created_at)
         VALUES(?, 'check_clear', ?, ?, 'supplier_check', ?, ?, ?, ?)`
      ).run(
        accId,
        -chk.amount,
        clearedDate,
        id,
        `صرف شيك رقم ${chk.check_no} (${chk.bank_name}) للمورد ${sup.name}`,
        req.user!.id,
        now
      );

      return tx.prepare('SELECT * FROM supplier_checks WHERE id = ?').get(id);
    });
    res.json({ check: updated });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'تعذر تحصيل/صرف الشيك' });
  }
});

router.post('/checks/:id/status', requireAuth, requireRole('admin', 'warehouse'), (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body ?? {};
  if (!['bounced', 'cancelled'].includes(status)) {
    res.status(400).json({ error: 'حالة الشيك غير صالحة' });
    return;
  }
  const db = getDb();
  const chk = db.prepare('SELECT id, status FROM supplier_checks WHERE id = ?').get(id) as
    | { id: number; status: string }
    | undefined;
  if (!chk) {
    res.status(404).json({ error: 'الشيك غير موجود' });
    return;
  }
  if (chk.status !== 'pending') {
    res.status(400).json({ error: 'يمكن تغيير حالة الشيكات قيد الانتظار فقط' });
    return;
  }
  db.prepare('UPDATE supplier_checks SET status = ? WHERE id = ?').run(status, id);
  const updated = db.prepare('SELECT * FROM supplier_checks WHERE id = ?').get(id);
  res.json({ check: updated });
});

export default router;
