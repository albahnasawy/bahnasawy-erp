import { Router } from 'express';
import { getDb, getSetting, withTransaction } from '../db.ts';
import { requireAuth, requireRole } from '../auth.ts';
import { generateNextNumber, nowSql, roundCost, roundMoney, roundQty, todayStr } from '../utils.ts';
import { adjustStockBase, getWarehouseStockBase } from './products.ts';

const router = Router();

router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const from = typeof req.query.from === 'string' ? req.query.from.trim() : '';
  const to = typeof req.query.to === 'string' ? req.query.to.trim() : '';
  const customerId = req.query.customer_id ? Number(req.query.customer_id) : null;
  const plumberId = req.query.plumber_id ? Number(req.query.plumber_id) : null;
  const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
  const limit = Math.min(300, Math.max(20, Number(req.query.limit) || 100));

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (q) {
    const like = `%${q}%`;
    conditions.push('(si.invoice_no LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR COALESCE(p.name, \'\') LIKE ?)');
    params.push(like, like, like, like);
  }
  if (from) {
    conditions.push('si.invoice_date >= ?');
    params.push(from);
  }
  if (to) {
    conditions.push('si.invoice_date <= ?');
    params.push(to);
  }
  if (customerId) {
    conditions.push('si.customer_id = ?');
    params.push(customerId);
  }
  if (plumberId) {
    conditions.push('si.plumber_id = ?');
    params.push(plumberId);
  }
  if (status) {
    conditions.push('si.status = ?');
    params.push(status);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const includeProfit = req.user!.role !== 'cashier';

  const invoices = db
    .prepare(
      `SELECT si.*, c.name AS customer_name, c.phone AS customer_phone,
              p.name AS plumber_name, w.name AS warehouse_name, ta.name AS account_name,
              u.full_name AS user_name,
              COALESCE((SELECT SUM(sr.total_return_amount) FROM sales_returns sr WHERE sr.original_invoice_id = si.id), 0) AS returned_total
              ${
                includeProfit
                  ? `, COALESCE((SELECT SUM(sii.quantity * sii.unit_cost_at_sale) FROM sales_invoice_items sii WHERE sii.invoice_id = si.id), 0) AS total_cost`
                  : ''
              }
       FROM sales_invoices si
       JOIN customers c ON c.id = si.customer_id
       LEFT JOIN plumbers p ON p.id = si.plumber_id
       JOIN warehouses w ON w.id = si.warehouse_id
       LEFT JOIN treasury_accounts ta ON ta.id = si.treasury_account_id
       LEFT JOIN users u ON u.id = si.created_by
       ${whereSql}
       ORDER BY si.id DESC
       LIMIT ?`
    )
    .all(...params, limit);

  res.json({ invoices });
});

router.get('/returns/list', requireAuth, (req, res) => {
  const db = getDb();
  const limit = Math.min(200, Math.max(20, Number(req.query.limit) || 100));
  const returns = db
    .prepare(
      `SELECT sr.*, si.invoice_no AS original_invoice_no, c.name AS customer_name,
              p.name AS plumber_name, w.name AS warehouse_name, ta.name AS account_name, u.full_name AS user_name
       FROM sales_returns sr
       JOIN sales_invoices si ON si.id = sr.original_invoice_id
       JOIN customers c ON c.id = sr.customer_id
       LEFT JOIN plumbers p ON p.id = sr.plumber_id
       JOIN warehouses w ON w.id = sr.warehouse_id
       LEFT JOIN treasury_accounts ta ON ta.id = sr.treasury_account_id
       LEFT JOIN users u ON u.id = sr.created_by
       ORDER BY sr.id DESC
       LIMIT ?`
    )
    .all(limit);
  res.json({ returns });
});

router.get('/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'معرف الفاتورة غير صالح' });
    return;
  }

  const db = getDb();
  const invoice = db
    .prepare(
      `SELECT si.*, c.name AS customer_name, c.phone AS customer_phone, c.address AS customer_address, c.is_walkin,
              p.name AS plumber_name, p.phone AS plumber_phone, w.name AS warehouse_name, ta.name AS account_name,
              u.full_name AS user_name
       FROM sales_invoices si
       JOIN customers c ON c.id = si.customer_id
       LEFT JOIN plumbers p ON p.id = si.plumber_id
       JOIN warehouses w ON w.id = si.warehouse_id
       LEFT JOIN treasury_accounts ta ON ta.id = si.treasury_account_id
       LEFT JOIN users u ON u.id = si.created_by
       WHERE si.id = ?`
    )
    .get(id) as Record<string, unknown> | undefined;

  if (!invoice) {
    res.status(404).json({ error: 'الفاتورة غير موجودة' });
    return;
  }

  const includeCost = req.user!.role !== 'cashier';
  const itemCols = includeCost
    ? 'sii.*, pr.sku, pr.size, pr.brand'
    : 'sii.id, sii.invoice_id, sii.product_id, sii.product_name, sii.unit_id, sii.unit_name, sii.conversion_factor, sii.quantity, sii.returned_qty, sii.unit_price, sii.discount_amount, sii.vat_rate, sii.vat_amount, sii.line_total, sii.is_kit, pr.sku, pr.size, pr.brand';

  const items = db
    .prepare(
      `SELECT ${itemCols}
       FROM sales_invoice_items sii
       JOIN products pr ON pr.id = sii.product_id
       WHERE sii.invoice_id = ?
       ORDER BY sii.id ASC`
    )
    .all(id);

  const returns = db
    .prepare(
      `SELECT sr.*, ta.name AS account_name
       FROM sales_returns sr
       LEFT JOIN treasury_accounts ta ON ta.id = sr.treasury_account_id
       WHERE sr.original_invoice_id = ?
       ORDER BY sr.id DESC`
    )
    .all(id) as Record<string, unknown>[];

  const retItemCols = includeCost
    ? '*'
    : 'id, return_id, original_item_id, product_id, product_name, unit_name, conversion_factor, quantity, unit_price, vat_amount, line_total, is_kit';
  const retItemStmt = db.prepare(`SELECT ${retItemCols} FROM sales_return_items WHERE return_id = ?`);
  for (const r of returns) {
    r.items = retItemStmt.all(Number(r.id));
  }

  res.json({ invoice, items, returns });
});

router.post('/', requireAuth, (req, res) => {
  const body = req.body ?? {};
  const warehouseId = Number(body.warehouse_id);
  const customerId = Number(body.customer_id);
  const plumberId = body.plumber_id ? Number(body.plumber_id) : null;
  const priceTier = ['retail', 'plumber', 'wholesale'].includes(body.price_tier) ? body.price_tier : 'retail';
  const rawItems = Array.isArray(body.items) ? body.items : [];

  if (!Number.isInteger(warehouseId) || !Number.isInteger(customerId) || rawItems.length === 0) {
    res.status(400).json({ error: 'يرجى تحديد المخزن والعميل وإضافة صنف واحد على الأقل' });
    return;
  }

  try {
    const createdId = withTransaction((tx) => {
      const wh = tx.prepare('SELECT id, name FROM warehouses WHERE id = ? AND is_active = 1').get(warehouseId) as
        | { id: number; name: string }
        | undefined;
      if (!wh) throw new Error('المخزن المحدد غير موجود');

      const cust = tx
        .prepare('SELECT id, name, is_walkin FROM customers WHERE id = ? AND is_active = 1')
        .get(customerId) as { id: number; name: string; is_walkin: number } | undefined;
      if (!cust) throw new Error('العميل المحدد غير موجود');

      if (plumberId) {
        const plum = tx.prepare('SELECT id FROM plumbers WHERE id = ? AND is_active = 1').get(plumberId);
        if (!plum) throw new Error('السباك المحدد غير موجود');
      }

      const globalVatEnabled = getSetting(tx, 'vat_enabled', 'false') === 'true';
      const defaultVatRate = Number(getSetting(tx, 'default_vat_rate', '14')) || 14;
      const vatEnabled = body.vat_enabled !== undefined ? Boolean(body.vat_enabled) : globalVatEnabled;

      const now = nowSql();
      const invoiceDate =
        typeof body.invoice_date === 'string' && body.invoice_date.trim() ? body.invoice_date.trim() : todayStr();
      const invoiceNo = generateNextNumber(tx, 'sales_invoices', 'invoice_no', 'INV');
      const headerDiscount = Math.max(0, roundMoney(body.discount_amount ?? 0));

      interface PreparedLine {
        productId: number;
        productName: string;
        unitId: number | null;
        unitName: string;
        factor: number;
        qty: number;
        unitPrice: number;
        discount: number;
        vatRate: number;
        vatAmount: number;
        lineTotal: number;
        unitCostAtSale: number;
        isKit: boolean;
      }

      const lines: PreparedLine[] = [];
      let subtotal = 0;
      let totalVat = 0;

      for (const item of rawItems) {
        const productId = Number(item.product_id);
        const qty = roundQty(item.quantity);
        if (!Number.isInteger(productId) || qty <= 0) {
          throw new Error('جميع كميات الأصناف يجب أن تكون أكبر من صفر');
        }

        const prod = tx
          .prepare(
            'SELECT id, name, base_unit_name, is_kit, last_purchase_cost, vat_rate FROM products WHERE id = ? AND is_active = 1'
          )
          .get(productId) as
          | {
              id: number;
              name: string;
              base_unit_name: string;
              is_kit: number;
              last_purchase_cost: number;
              vat_rate: number | null;
            }
          | undefined;
        if (!prod) throw new Error('أحد الأصناف المضافة غير موجود أو تم تعطيله');

        let unitRow:
          | {
              id: number;
              unit_name: string;
              conversion_factor: number;
              retail_price: number;
              plumber_price: number;
              wholesale_price: number;
            }
          | undefined;

        if (item.unit_id) {
          unitRow = tx
            .prepare('SELECT * FROM product_units WHERE id = ? AND product_id = ?')
            .get(Number(item.unit_id), productId) as typeof unitRow;
        } else {
          unitRow = tx
            .prepare('SELECT * FROM product_units WHERE product_id = ? ORDER BY is_base DESC, id ASC LIMIT 1')
            .get(productId) as typeof unitRow;
        }
        if (!unitRow) throw new Error(`لم يتم العثور على وحدة قياس للصنف (${prod.name})`);

        const factor = roundQty(unitRow.conversion_factor);
        const defaultPrice =
          priceTier === 'plumber'
            ? unitRow.plumber_price
            : priceTier === 'wholesale'
              ? unitRow.wholesale_price
              : unitRow.retail_price;
        const unitPrice =
          item.unit_price !== undefined && item.unit_price !== null
            ? roundMoney(item.unit_price)
            : roundMoney(defaultPrice);

        if (unitPrice < 0) throw new Error(`سعر الصنف (${prod.name}) غير صالح`);

        const lineDiscount = Math.max(0, roundMoney(item.discount_amount ?? 0));
        const lineNet = roundMoney(qty * unitPrice - lineDiscount);
        if (lineNet < 0) throw new Error(`خصم الصنف (${prod.name}) أكبر من قيمته`);

        const itemVatRate = vatEnabled
          ? prod.vat_rate !== null && prod.vat_rate !== undefined
            ? Number(prod.vat_rate)
            : defaultVatRate
          : 0;
        const lineVat = vatEnabled ? roundMoney(lineNet * (itemVatRate / 100)) : 0;
        const lineTotal = roundMoney(lineNet + lineVat);

        subtotal = roundMoney(subtotal + lineNet);
        totalVat = roundMoney(totalVat + lineVat);

        let unitCostAtSale = 0;
        const isKit = prod.is_kit === 1;

        if (isKit) {
          const kitComps = tx
            .prepare(
              `SELECT ki.component_product_id, ki.quantity_base, cp.name AS comp_name, cp.base_unit_name, cp.last_purchase_cost
               FROM product_kit_items ki
               JOIN products cp ON cp.id = ki.component_product_id
               WHERE ki.kit_product_id = ?`
            )
            .all(productId) as {
            component_product_id: number;
            quantity_base: number;
            comp_name: string;
            base_unit_name: string;
            last_purchase_cost: number;
          }[];
          if (kitComps.length === 0) throw new Error(`الطقم (${prod.name}) لا يحتوي على مكونات`);

          let singleKitCost = 0;
          for (const comp of kitComps) {
            const needBase = roundQty(qty * factor * comp.quantity_base);
            const avail = getWarehouseStockBase(tx, warehouseId, comp.component_product_id);
            if (avail < needBase) {
              throw new Error(
                `الرصيد المتاح من مكون الطقم (${comp.comp_name}) في ${wh.name} هو ${avail} ${comp.base_unit_name} والمطلوب ${needBase}`
              );
            }
            singleKitCost += comp.last_purchase_cost * comp.quantity_base;
          }
          unitCostAtSale = roundCost(singleKitCost * factor);
        } else {
          const needBase = roundQty(qty * factor);
          const avail = getWarehouseStockBase(tx, warehouseId, productId);
          if (avail < needBase) {
            throw new Error(
              `الرصيد المتاح من (${prod.name}) في ${wh.name} هو ${avail} ${prod.base_unit_name} والمطلوب ${needBase}`
            );
          }
          unitCostAtSale = roundCost(prod.last_purchase_cost * factor);
        }

        lines.push({
          productId,
          productName: prod.name,
          unitId: unitRow.id,
          unitName: unitRow.unit_name,
          factor,
          qty,
          unitPrice,
          discount: lineDiscount,
          vatRate: itemVatRate,
          vatAmount: lineVat,
          lineTotal,
          unitCostAtSale,
          isKit,
        });
      }

      if (headerDiscount > roundMoney(subtotal + totalVat)) {
        throw new Error('الخصم الإجمالي أكبر من قيمة الفاتورة');
      }

      const totalAmount = roundMoney(subtotal + totalVat - headerDiscount);
      let paidAmount =
        body.paid_amount !== undefined && body.paid_amount !== null
          ? roundMoney(body.paid_amount)
          : totalAmount;

      if (paidAmount < 0 || paidAmount > totalAmount) {
        throw new Error('المبلغ المدفوع يجب أن يكون بين 0 وإجمالي الفاتورة');
      }

      const remainingAmount = roundMoney(totalAmount - paidAmount);
      if (cust.is_walkin === 1 && remainingAmount > 0) {
        throw new Error('العميل النقدي يجب سداد كامل الفاتورة — اختر عميلاً مسجلاً للبيع الآجل');
      }

      let accountId = body.treasury_account_id ? Number(body.treasury_account_id) : null;
      if (paidAmount > 0) {
        if (!accountId) {
          const defAcc = tx
            .prepare('SELECT id FROM treasury_accounts WHERE is_active = 1 ORDER BY is_default_pos DESC, id ASC LIMIT 1')
            .get() as { id: number } | undefined;
          accountId = defAcc ? defAcc.id : null;
        }
        if (!accountId) throw new Error('يرجى تحديد خزنة / حساب لاستلام المبلغ المدفوع');
        const accExists = tx.prepare('SELECT 1 FROM treasury_accounts WHERE id = ? AND is_active = 1').get(accountId);
        if (!accExists) throw new Error('حساب الخزنة المحدد غير موجود');
      }

      const invRes = tx
        .prepare(
          `INSERT INTO sales_invoices(
             invoice_no, invoice_date, warehouse_id, customer_id, plumber_id, price_tier,
             subtotal, discount_amount, vat_enabled, vat_amount, total_amount, paid_amount, remaining_amount,
             treasury_account_id, status, notes, created_by, created_at
           ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?)`
        )
        .run(
          invoiceNo,
          invoiceDate,
          warehouseId,
          customerId,
          plumberId,
          priceTier,
          subtotal,
          headerDiscount,
          vatEnabled ? 1 : 0,
          totalVat,
          totalAmount,
          paidAmount,
          remainingAmount,
          accountId,
          typeof body.notes === 'string' ? body.notes.trim() : '',
          req.user!.id,
          now
        );
      const invoiceId = Number(invRes.lastInsertRowid);

      const insertItem = tx.prepare(
        `INSERT INTO sales_invoice_items(
           invoice_id, product_id, product_name, unit_id, unit_name, conversion_factor,
           quantity, returned_qty, unit_price, discount_amount, vat_rate, vat_amount, line_total, unit_cost_at_sale, is_kit
         ) VALUES(?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`
      );

      for (const line of lines) {
        insertItem.run(
          invoiceId,
          line.productId,
          line.productName,
          line.unitId,
          line.unitName,
          line.factor,
          line.qty,
          line.unitPrice,
          line.discount,
          line.vatRate,
          line.vatAmount,
          line.lineTotal,
          line.unitCostAtSale,
          line.isKit ? 1 : 0
        );

        if (line.isKit) {
          const kitComps = tx
            .prepare(
              `SELECT ki.component_product_id, ki.quantity_base, cp.last_purchase_cost
               FROM product_kit_items ki
               JOIN products cp ON cp.id = ki.component_product_id
               WHERE ki.kit_product_id = ?`
            )
            .all(line.productId) as {
            component_product_id: number;
            quantity_base: number;
            last_purchase_cost: number;
          }[];
          for (const comp of kitComps) {
            const deductBase = roundQty(line.qty * line.factor * comp.quantity_base);
            adjustStockBase(tx, {
              warehouseId,
              productId: comp.component_product_id,
              deltaBase: -deductBase,
              movementType: 'sale',
              unitCost: comp.last_purchase_cost,
              referenceType: 'sales_invoice',
              referenceId: invoiceId,
              notes: `صرف مكون طقم (${line.productName}) — فاتورة ${invoiceNo}`,
              userId: req.user!.id,
            });
          }
        } else {
          const deductBase = roundQty(line.qty * line.factor);
          adjustStockBase(tx, {
            warehouseId,
            productId: line.productId,
            deltaBase: -deductBase,
            movementType: 'sale',
            unitCost: roundCost(line.unitCostAtSale / line.factor),
            referenceType: 'sales_invoice',
            referenceId: invoiceId,
            notes: `مبيعات فاتورة ${invoiceNo}`,
            userId: req.user!.id,
          });
        }
      }

      if (paidAmount > 0 && accountId) {
        tx.prepare('UPDATE treasury_accounts SET balance = ROUND(balance + ?, 2) WHERE id = ?').run(
          paidAmount,
          accountId
        );
        tx.prepare(
          `INSERT INTO treasury_transactions(account_id, tx_type, amount_delta, tx_date, reference_type, reference_id, description, created_by, created_at)
           VALUES(?, 'sale_receipt', ?, ?, 'sales_invoice', ?, ?, ?, ?)`
        ).run(accountId, paidAmount, invoiceDate, invoiceId, `تحصيل فاتورة مبيعات ${invoiceNo} (${cust.name})`, req.user!.id, now);
      }

      if (remainingAmount > 0) {
        tx.prepare('UPDATE customers SET balance = ROUND(balance + ?, 2) WHERE id = ?').run(
          remainingAmount,
          customerId
        );
      }

      return invoiceId;
    });

    const db = getDb();
    const invoice = db.prepare('SELECT * FROM sales_invoices WHERE id = ?').get(createdId);
    res.status(201).json({ invoice });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'تعذر حفظ فاتورة المبيعات' });
  }
});

router.post('/:id/returns', requireAuth, (req, res) => {
  const originalInvoiceId = Number(req.params.id);
  const { items, refund_method, treasury_account_id, return_date, notes } = req.body ?? {};

  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'يرجى تحديد صنف واحد على الأقل للمرتجع' });
    return;
  }
  if (!['cash', 'credit_note'].includes(refund_method)) {
    res.status(400).json({ error: 'طريقة تسوية المرتجع غير صالحة' });
    return;
  }

  try {
    const returnId = withTransaction((tx) => {
      const inv = tx
        .prepare(
          `SELECT si.*, c.name AS customer_name, c.is_walkin
           FROM sales_invoices si
           JOIN customers c ON c.id = si.customer_id
           WHERE si.id = ?`
        )
        .get(originalInvoiceId) as
        | {
            id: number;
            invoice_no: string;
            warehouse_id: number;
            customer_id: number;
            plumber_id: number | null;
            subtotal: number;
            discount_amount: number;
            vat_amount: number;
            status: string;
            customer_name: string;
            is_walkin: number;
          }
        | undefined;

      if (!inv) throw new Error('الفاتورة الأصلية غير موجودة');
      if (inv.status !== 'completed') throw new Error('لا يمكن عمل مرتجع لفاتورة ملغاة');
      if (inv.is_walkin === 1 && refund_method === 'credit_note') {
        throw new Error('العميل النقدي يجب رد قيمة المرتجع نقداً من الخزنة');
      }

      const grossPlusVat = roundMoney(inv.subtotal + inv.vat_amount);
      const discountRatio = grossPlusVat > 0 ? inv.discount_amount / grossPlusVat : 0;

      const now = nowSql();
      const rDate = typeof return_date === 'string' && return_date.trim() ? return_date.trim() : todayStr();
      const returnNo = generateNextNumber(tx, 'sales_returns', 'return_no', 'RET');

      interface PreparedRetLine {
        origItemId: number;
        productId: number;
        productName: string;
        unitName: string;
        factor: number;
        qty: number;
        unitPrice: number;
        vatAmount: number;
        lineTotal: number;
        unitCostAtSale: number;
        isKit: boolean;
      }

      const prepared: PreparedRetLine[] = [];
      let totalReturnAmount = 0;

      for (const reqItem of items) {
        const origItemId = Number(reqItem.original_item_id);
        const retQty = roundQty(reqItem.quantity);
        if (!Number.isInteger(origItemId) || retQty <= 0) {
          throw new Error('كمية المرتجع يجب أن تكون أكبر من صفر');
        }

        const orig = tx
          .prepare('SELECT * FROM sales_invoice_items WHERE id = ? AND invoice_id = ?')
          .get(origItemId, originalInvoiceId) as
          | {
              id: number;
              product_id: number;
              product_name: string;
              unit_name: string;
              conversion_factor: number;
              quantity: number;
              returned_qty: number;
              unit_price: number;
              discount_amount: number;
              vat_amount: number;
              line_total: number;
              unit_cost_at_sale: number;
              is_kit: number;
            }
          | undefined;
        if (!orig) throw new Error('أحد بنود الفاتورة غير موجود');

        const remainingAllowed = roundQty(orig.quantity - orig.returned_qty);
        if (retQty > remainingAllowed) {
          throw new Error(
            `الكمية المتبقية القابلة للإرجاع من (${orig.product_name}) هي ${remainingAllowed} ${orig.unit_name} فقط`
          );
        }

        const ratio = retQty / orig.quantity;
        const propVat = roundMoney(orig.vat_amount * ratio);
        const rawLineTotal = orig.line_total * ratio;
        const lineTotal = roundMoney(rawLineTotal * (1 - discountRatio));

        totalReturnAmount = roundMoney(totalReturnAmount + lineTotal);

        prepared.push({
          origItemId: orig.id,
          productId: orig.product_id,
          productName: orig.product_name,
          unitName: orig.unit_name,
          factor: orig.conversion_factor,
          qty: retQty,
          unitPrice: orig.unit_price,
          vatAmount: propVat,
          lineTotal,
          unitCostAtSale: orig.unit_cost_at_sale,
          isKit: orig.is_kit === 1,
        });
      }

      let accountId: number | null = null;
      if (refund_method === 'cash') {
        accountId = treasury_account_id ? Number(treasury_account_id) : null;
        if (!accountId) {
          const defAcc = tx
            .prepare('SELECT id FROM treasury_accounts WHERE is_active = 1 ORDER BY is_default_pos DESC, id ASC LIMIT 1')
            .get() as { id: number } | undefined;
          accountId = defAcc ? defAcc.id : null;
        }
        if (!accountId) throw new Error('يرجى تحديد الخزنة التي سيتم صرف قيمة المرتجع منها');
        const acc = tx.prepare('SELECT 1 FROM treasury_accounts WHERE id = ? AND is_active = 1').get(accountId);
        if (!acc) throw new Error('حساب الخزنة المحدد غير موجود');
      }

      const srRes = tx
        .prepare(
          `INSERT INTO sales_returns(
             return_no, return_date, original_invoice_id, warehouse_id, customer_id, plumber_id,
             total_return_amount, refund_method, treasury_account_id, notes, created_by, created_at
           ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          returnNo,
          rDate,
          originalInvoiceId,
          inv.warehouse_id,
          inv.customer_id,
          inv.plumber_id,
          totalReturnAmount,
          refund_method,
          accountId,
          typeof notes === 'string' ? notes.trim() : '',
          req.user!.id,
          now
        );
      const rId = Number(srRes.lastInsertRowid);

      const insertRetItem = tx.prepare(
        `INSERT INTO sales_return_items(
           return_id, original_item_id, product_id, product_name, unit_name, conversion_factor,
           quantity, unit_price, vat_amount, line_total, unit_cost_at_sale, is_kit
         ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      for (const line of prepared) {
        insertRetItem.run(
          rId,
          line.origItemId,
          line.productId,
          line.productName,
          line.unitName,
          line.factor,
          line.qty,
          line.unitPrice,
          line.vatAmount,
          line.lineTotal,
          line.unitCostAtSale,
          line.isKit ? 1 : 0
        );

        tx.prepare('UPDATE sales_invoice_items SET returned_qty = ROUND(returned_qty + ?, 4) WHERE id = ?').run(
          line.qty,
          line.origItemId
        );

        if (line.isKit) {
          const kitComps = tx
            .prepare(
              `SELECT ki.component_product_id, ki.quantity_base, cp.last_purchase_cost
               FROM product_kit_items ki
               JOIN products cp ON cp.id = ki.component_product_id
               WHERE ki.kit_product_id = ?`
            )
            .all(line.productId) as {
            component_product_id: number;
            quantity_base: number;
            last_purchase_cost: number;
          }[];
          for (const comp of kitComps) {
            const restoreBase = roundQty(line.qty * line.factor * comp.quantity_base);
            adjustStockBase(tx, {
              warehouseId: inv.warehouse_id,
              productId: comp.component_product_id,
              deltaBase: restoreBase,
              movementType: 'sale_return',
              unitCost: comp.last_purchase_cost,
              referenceType: 'sales_return',
              referenceId: rId,
              notes: `مرتجع طقم (${line.productName}) — ${returnNo} / فاتورة ${inv.invoice_no}`,
              userId: req.user!.id,
            });
          }
        } else {
          const restoreBase = roundQty(line.qty * line.factor);
          adjustStockBase(tx, {
            warehouseId: inv.warehouse_id,
            productId: line.productId,
            deltaBase: restoreBase,
            movementType: 'sale_return',
            unitCost: roundCost(line.unitCostAtSale / line.factor),
            referenceType: 'sales_return',
            referenceId: rId,
            notes: `مرتجع مبيعات ${returnNo} (فاتورة ${inv.invoice_no})`,
            userId: req.user!.id,
          });
        }
      }

      if (refund_method === 'cash' && accountId) {
        tx.prepare('UPDATE treasury_accounts SET balance = ROUND(balance - ?, 2) WHERE id = ?').run(
          totalReturnAmount,
          accountId
        );
        tx.prepare(
          `INSERT INTO treasury_transactions(account_id, tx_type, amount_delta, tx_date, reference_type, reference_id, description, created_by, created_at)
           VALUES(?, 'sale_refund', ?, ?, 'sales_return', ?, ?, ?, ?)`
        ).run(
          accountId,
          -totalReturnAmount,
          rDate,
          rId,
          `رد نقدي لمرتجع ${returnNo} (فاتورة ${inv.invoice_no} — ${inv.customer_name})`,
          req.user!.id,
          now
        );
      } else {
        tx.prepare('UPDATE customers SET balance = ROUND(balance - ?, 2) WHERE id = ?').run(
          totalReturnAmount,
          inv.customer_id
        );
      }

      return rId;
    });

    const db = getDb();
    const salesReturn = db.prepare('SELECT * FROM sales_returns WHERE id = ?').get(returnId);
    res.status(201).json({ sales_return: salesReturn });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'تعذر تسجيل المرتجع' });
  }
});

router.delete('/:id', requireAuth, requireRole('admin'), (req, res) => {
  const invoiceId = Number(req.params.id);
  if (!Number.isInteger(invoiceId)) {
    res.status(400).json({ error: 'معرف الفاتورة غير صالح' });
    return;
  }

  try {
    withTransaction((tx) => {
      const inv = tx
        .prepare('SELECT * FROM sales_invoices WHERE id = ?')
        .get(invoiceId) as
        | {
            id: number;
            invoice_no: string;
            warehouse_id: number;
            customer_id: number;
            paid_amount: number;
            remaining_amount: number;
            treasury_account_id: number | null;
            status: string;
          }
        | undefined;
      if (!inv) throw new Error('الفاتورة غير موجودة');
      if (inv.status === 'voided') throw new Error('الفاتورة ملغاة بالفعل');

      const hasReturns = tx
        .prepare('SELECT 1 FROM sales_returns WHERE original_invoice_id = ? LIMIT 1')
        .get(invoiceId);
      if (hasReturns) {
        throw new Error('لا يمكن حذف أو إلغاء فاتورة مسجل عليها مرتجعات مبيعات');
      }

      const items = tx
        .prepare('SELECT * FROM sales_invoice_items WHERE invoice_id = ?')
        .all(invoiceId) as {
        product_id: number;
        product_name: string;
        conversion_factor: number;
        quantity: number;
        unit_cost_at_sale: number;
        is_kit: number;
      }[];

      for (const item of items) {
        if (item.is_kit === 1) {
          const kitComps = tx
            .prepare(
              `SELECT ki.component_product_id, ki.quantity_base, cp.last_purchase_cost
               FROM product_kit_items ki
               JOIN products cp ON cp.id = ki.component_product_id
               WHERE ki.kit_product_id = ?`
            )
            .all(item.product_id) as {
            component_product_id: number;
            quantity_base: number;
            last_purchase_cost: number;
          }[];
          for (const comp of kitComps) {
            adjustStockBase(tx, {
              warehouseId: inv.warehouse_id,
              productId: comp.component_product_id,
              deltaBase: roundQty(item.quantity * item.conversion_factor * comp.quantity_base),
              movementType: 'sale_void',
              unitCost: comp.last_purchase_cost,
              referenceType: 'sales_invoice',
              referenceId: invoiceId,
              notes: `إلغاء فاتورة ${inv.invoice_no} (مكون طقم ${item.product_name})`,
              userId: req.user!.id,
            });
          }
        } else {
          adjustStockBase(tx, {
            warehouseId: inv.warehouse_id,
            productId: item.product_id,
            deltaBase: roundQty(item.quantity * item.conversion_factor),
            movementType: 'sale_void',
            unitCost: roundCost(item.unit_cost_at_sale / item.conversion_factor),
            referenceType: 'sales_invoice',
            referenceId: invoiceId,
            notes: `إلغاء فاتورة مبيعات ${inv.invoice_no}`,
            userId: req.user!.id,
          });
        }
      }

      if (inv.paid_amount > 0 && inv.treasury_account_id) {
        tx.prepare('UPDATE treasury_accounts SET balance = ROUND(balance - ?, 2) WHERE id = ?').run(
          inv.paid_amount,
          inv.treasury_account_id
        );
        tx.prepare(
          `INSERT INTO treasury_transactions(account_id, tx_type, amount_delta, tx_date, reference_type, reference_id, description, created_by, created_at)
           VALUES(?, 'sale_void_reversal', ?, ?, 'sales_invoice', ?, ?, ?, ?)`
        ).run(
          inv.treasury_account_id,
          -inv.paid_amount,
          todayStr(),
          invoiceId,
          `عكس تحصيل فاتورة ملغاة ${inv.invoice_no}`,
          req.user!.id,
          nowSql()
        );
      }

      if (inv.remaining_amount > 0) {
        tx.prepare('UPDATE customers SET balance = ROUND(balance - ?, 2) WHERE id = ?').run(
          inv.remaining_amount,
          inv.customer_id
        );
      }

      tx.prepare("UPDATE sales_invoices SET status = 'voided' WHERE id = ?").run(invoiceId);
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'تعذر إلغاء الفاتورة' });
  }
});

export default router;
