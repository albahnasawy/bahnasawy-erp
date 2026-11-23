import { Router } from 'express';
import { getDb, withTransaction } from '../db.ts';
import { requireAuth, requireRole } from '../auth.ts';
import { generateNextNumber, nowSql, roundCost, roundMoney, roundQty, todayStr } from '../utils.ts';
import { adjustStockBase, getWarehouseStockBase } from './products.ts';

const router = Router();

router.get('/', requireAuth, requireRole('admin', 'warehouse'), (req, res) => {
  const db = getDb();
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const supplierId = req.query.supplier_id ? Number(req.query.supplier_id) : null;

  const conditions: string[] = [];
  const params: (string | number)[] = [];
  if (q) {
    const like = `%${q}%`;
    conditions.push('(pi.invoice_no LIKE ? OR pi.supplier_invoice_no LIKE ? OR s.name LIKE ?)');
    params.push(like, like, like);
  }
  if (supplierId) {
    conditions.push('pi.supplier_id = ?');
    params.push(supplierId);
  }
  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const purchases = db
    .prepare(
      `SELECT pi.*, s.name AS supplier_name, s.company AS supplier_company,
              w.name AS warehouse_name, ta.name AS account_name, u.full_name AS user_name
       FROM purchase_invoices pi
       JOIN suppliers s ON s.id = pi.supplier_id
       JOIN warehouses w ON w.id = pi.warehouse_id
       LEFT JOIN treasury_accounts ta ON ta.id = pi.treasury_account_id
       LEFT JOIN users u ON u.id = pi.created_by
       ${whereSql}
       ORDER BY pi.id DESC
       LIMIT 150`
    )
    .all(...params);
  res.json({ purchases });
});

router.get('/returns/list', requireAuth, requireRole('admin', 'warehouse'), (_req, res) => {
  const db = getDb();
  const returns = db
    .prepare(
      `SELECT pr.*, s.name AS supplier_name, w.name AS warehouse_name,
              pi.invoice_no AS purchase_invoice_no, ta.name AS account_name, u.full_name AS user_name
       FROM purchase_returns pr
       JOIN suppliers s ON s.id = pr.supplier_id
       JOIN warehouses w ON w.id = pr.warehouse_id
       LEFT JOIN purchase_invoices pi ON pi.id = pr.purchase_invoice_id
       LEFT JOIN treasury_accounts ta ON ta.id = pr.treasury_account_id
       LEFT JOIN users u ON u.id = pr.created_by
       ORDER BY pr.id DESC
       LIMIT 150`
    )
    .all();
  res.json({ returns });
});

router.get('/:id', requireAuth, requireRole('admin', 'warehouse'), (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const purchase = db
    .prepare(
      `SELECT pi.*, s.name AS supplier_name, s.company AS supplier_company, w.name AS warehouse_name, ta.name AS account_name
       FROM purchase_invoices pi
       JOIN suppliers s ON s.id = pi.supplier_id
       JOIN warehouses w ON w.id = pi.warehouse_id
       LEFT JOIN treasury_accounts ta ON ta.id = pi.treasury_account_id
       WHERE pi.id = ?`
    )
    .get(id);
  if (!purchase) {
    res.status(404).json({ error: 'فاتورة الشراء غير موجودة' });
    return;
  }
  const items = db
    .prepare(
      `SELECT pii.*, p.sku, p.base_unit_name
       FROM purchase_invoice_items pii
       JOIN products p ON p.id = pii.product_id
       WHERE pii.purchase_id = ?
       ORDER BY pii.id ASC`
    )
    .all(id);
  res.json({ purchase, items });
});

router.post('/', requireAuth, requireRole('admin', 'warehouse'), (req, res) => {
  const body = req.body ?? {};
  const warehouseId = Number(body.warehouse_id);
  const supplierId = Number(body.supplier_id);
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const shippingCost = Math.max(0, roundMoney(body.shipping_cost ?? 0));
  const shippingPaidTo = body.shipping_paid_to === 'external_cash' ? 'external_cash' : 'supplier';
  const headerDiscount = Math.max(0, roundMoney(body.discount_amount ?? 0));
  const vatAmount = Math.max(0, roundMoney(body.vat_amount ?? 0));

  if (!Number.isInteger(warehouseId) || !Number.isInteger(supplierId) || rawItems.length === 0) {
    res.status(400).json({ error: 'يرجى تحديد المخزن والمورد وإضافة صنف واحد على الأقل' });
    return;
  }

  try {
    const purchaseId = withTransaction((tx) => {
      const wh = tx.prepare('SELECT id FROM warehouses WHERE id = ? AND is_active = 1').get(warehouseId);
      if (!wh) throw new Error('المخزن المحدد غير موجود');

      const sup = tx.prepare('SELECT id, name FROM suppliers WHERE id = ? AND is_active = 1').get(supplierId) as
        | { id: number; name: string }
        | undefined;
      if (!sup) throw new Error('المورد المحدد غير موجود');

      interface DraftLine {
        productId: number;
        productName: string;
        unitId: number | null;
        unitName: string;
        factor: number;
        qty: number;
        qtyBase: number;
        unitCost: number;
        lineDiscount: number;
        netLineTotal: number;
      }

      const draftLines: DraftLine[] = [];
      let subtotal = 0;
      let totalQtyBase = 0;

      for (const item of rawItems) {
        const productId = Number(item.product_id);
        const qty = roundQty(item.quantity);
        const unitCost = roundCost(item.unit_cost);
        const lineDiscount = Math.max(0, roundMoney(item.discount_amount ?? 0));

        if (!Number.isInteger(productId) || qty <= 0 || unitCost < 0) {
          throw new Error('تأكد من صحة الكميات وأسعار الشراء لجميع الأصناف');
        }

        const prod = tx
          .prepare('SELECT id, name, base_unit_name, is_kit FROM products WHERE id = ? AND is_active = 1')
          .get(productId) as { id: number; name: string; base_unit_name: string; is_kit: number } | undefined;
        if (!prod) throw new Error('أحد الأصناف غير موجود');
        if (prod.is_kit === 1) {
          throw new Error(`الصنف (${prod.name}) طقم مجمع — يتم شراء مكوناته الفردية وليس الطقم مباشرة`);
        }

        let unitName = prod.base_unit_name;
        let factor = 1;
        let unitId: number | null = null;
        if (item.unit_id) {
          const u = tx
            .prepare('SELECT id, unit_name, conversion_factor FROM product_units WHERE id = ? AND product_id = ?')
            .get(Number(item.unit_id), productId) as
            | { id: number; unit_name: string; conversion_factor: number }
            | undefined;
          if (!u) throw new Error(`وحدة القياس غير تابعة للصنف (${prod.name})`);
          unitId = u.id;
          unitName = u.unit_name;
          factor = roundQty(u.conversion_factor);
        }

        const qtyBase = roundQty(qty * factor);
        const netLineTotal = roundMoney(qty * unitCost - lineDiscount);
        if (netLineTotal < 0) throw new Error(`الخصم على الصنف (${prod.name}) أكبر من قيمته`);

        subtotal = roundMoney(subtotal + netLineTotal);
        totalQtyBase = roundQty(totalQtyBase + qtyBase);

        draftLines.push({
          productId,
          productName: prod.name,
          unitId,
          unitName,
          factor,
          qty,
          qtyBase,
          unitCost,
          lineDiscount,
          netLineTotal,
        });
      }

      if (headerDiscount > subtotal) {
        throw new Error('الخصم الإجمالي على الفاتورة أكبر من المجموع الفرعي');
      }

      const netAfterHeaderDisc = roundMoney(subtotal - headerDiscount);
      const totalSupplierAmount = roundMoney(
        netAfterHeaderDisc + vatAmount + (shippingPaidTo === 'supplier' ? shippingCost : 0)
      );

      const paidAmount =
        body.paid_amount !== undefined && body.paid_amount !== null ? roundMoney(body.paid_amount) : 0;
      if (paidAmount < 0 || paidAmount > totalSupplierAmount) {
        throw new Error('المبلغ المدفوع للمورد يجب أن يكون بين 0 وإجمالي فاتورة المورد');
      }
      const remainingAmount = roundMoney(totalSupplierAmount - paidAmount);

      const accountId = body.treasury_account_id ? Number(body.treasury_account_id) : null;
      if (paidAmount > 0 && !accountId) {
        throw new Error('يرجى تحديد الخزنة / الحساب البنكي المسدد منه للمورد');
      }
      if (accountId) {
        const acc = tx.prepare('SELECT 1 FROM treasury_accounts WHERE id = ? AND is_active = 1').get(accountId);
        if (!acc) throw new Error('حساب الخزنة المحدد غير موجود');
      }

      let shippingAccId = body.shipping_treasury_account_id
        ? Number(body.shipping_treasury_account_id)
        : accountId;
      if (shippingCost > 0 && shippingPaidTo === 'external_cash') {
        if (!shippingAccId) {
          const defAcc = tx
            .prepare('SELECT id FROM treasury_accounts WHERE is_active = 1 ORDER BY is_default_pos DESC, id ASC LIMIT 1')
            .get() as { id: number } | undefined;
          shippingAccId = defAcc ? defAcc.id : null;
        }
        if (!shippingAccId) throw new Error('يرجى تحديد الخزنة المدفوع منها مصاريف الشحن والنقل');
      }

      const now = nowSql();
      const invDate =
        typeof body.invoice_date === 'string' && body.invoice_date.trim() ? body.invoice_date.trim() : todayStr();
      const invoiceNo = generateNextNumber(tx, 'purchase_invoices', 'invoice_no', 'PUR');

      const purRes = tx
        .prepare(
          `INSERT INTO purchase_invoices(
             invoice_no, supplier_invoice_no, invoice_date, warehouse_id, supplier_id,
             subtotal, discount_amount, shipping_cost, shipping_paid_to, shipping_treasury_account_id,
             vat_amount, total_supplier_amount, paid_amount, remaining_amount, treasury_account_id,
             notes, created_by, created_at
           ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          invoiceNo,
          typeof body.supplier_invoice_no === 'string' ? body.supplier_invoice_no.trim() : '',
          invDate,
          warehouseId,
          supplierId,
          subtotal,
          headerDiscount,
          shippingCost,
          shippingPaidTo,
          shippingPaidTo === 'external_cash' ? shippingAccId : null,
          vatAmount,
          totalSupplierAmount,
          paidAmount,
          remainingAmount,
          accountId,
          typeof body.notes === 'string' ? body.notes.trim() : '',
          req.user!.id,
          now
        );
      const pId = Number(purRes.lastInsertRowid);

      const insertItem = tx.prepare(
        `INSERT INTO purchase_invoice_items(
           purchase_id, product_id, product_name, unit_id, unit_name, conversion_factor,
           quantity, quantity_base, returned_qty, unit_cost, discount_amount, net_line_total,
           allocated_shipping_total, effective_unit_cost_base
         ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`
      );

      let allocatedShippingSoFar = 0;
      draftLines.forEach((line, idx) => {
        let allocatedShip = 0;
        if (shippingCost > 0) {
          if (idx === draftLines.length - 1) {
            allocatedShip = roundMoney(shippingCost - allocatedShippingSoFar);
          } else {
            const weight =
              subtotal > 0 ? line.netLineTotal / subtotal : line.qtyBase / Math.max(1, totalQtyBase);
            allocatedShip = roundMoney(shippingCost * weight);
            allocatedShippingSoFar = roundMoney(allocatedShippingSoFar + allocatedShip);
          }
        }

        const lineCostAfterHeaderDisc =
          subtotal > 0 ? line.netLineTotal * (netAfterHeaderDisc / subtotal) : line.netLineTotal;
        const effectiveUnitCostBase = roundCost((lineCostAfterHeaderDisc + allocatedShip) / line.qtyBase);

        insertItem.run(
          pId,
          line.productId,
          line.productName,
          line.unitId,
          line.unitName,
          line.factor,
          line.qty,
          line.qtyBase,
          line.unitCost,
          line.lineDiscount,
          line.netLineTotal,
          allocatedShip,
          effectiveUnitCostBase
        );

        // Update product last_purchase_cost to exact landed cost per base unit!
        tx.prepare('UPDATE products SET last_purchase_cost = ?, updated_at = ? WHERE id = ?').run(
          effectiveUnitCostBase,
          now,
          line.productId
        );

        // Recompute any active kits containing this component so kit cost reflects updated component cost
        const parentKits = tx
          .prepare('SELECT DISTINCT kit_product_id FROM product_kit_items WHERE component_product_id = ?')
          .all(line.productId) as { kit_product_id: number }[];
        for (const pk of parentKits) {
          const kitCostRow = tx
            .prepare(
              `SELECT COALESCE(SUM(ki.quantity_base * cp.last_purchase_cost), 0) AS kit_cost
               FROM product_kit_items ki
               JOIN products cp ON cp.id = ki.component_product_id
               WHERE ki.kit_product_id = ?`
            )
            .get(pk.kit_product_id) as { kit_cost: number };
          tx.prepare('UPDATE products SET last_purchase_cost = ?, updated_at = ? WHERE id = ?').run(
            roundCost(kitCostRow.kit_cost),
            now,
            pk.kit_product_id
          );
        }

        adjustStockBase(tx, {
          warehouseId,
          productId: line.productId,
          deltaBase: line.qtyBase,
          movementType: 'purchase',
          unitCost: effectiveUnitCostBase,
          referenceType: 'purchase_invoice',
          referenceId: pId,
          notes: `توريد مشتريات ${invoiceNo} (${sup.name})`,
          userId: req.user!.id,
        });
      });

      if (paidAmount > 0 && accountId) {
        tx.prepare('UPDATE treasury_accounts SET balance = ROUND(balance - ?, 2) WHERE id = ?').run(
          paidAmount,
          accountId
        );
        tx.prepare(
          `INSERT INTO treasury_transactions(account_id, tx_type, amount_delta, tx_date, reference_type, reference_id, description, created_by, created_at)
           VALUES(?, 'purchase_payment', ?, ?, 'purchase_invoice', ?, ?, ?, ?)`
        ).run(accountId, -paidAmount, invDate, pId, `سداد فاتورة مشتريات ${invoiceNo} (${sup.name})`, req.user!.id, now);
      }

      if (shippingCost > 0 && shippingPaidTo === 'external_cash' && shippingAccId) {
        tx.prepare('UPDATE treasury_accounts SET balance = ROUND(balance - ?, 2) WHERE id = ?').run(
          shippingCost,
          shippingAccId
        );
        tx.prepare(
          `INSERT INTO treasury_transactions(account_id, tx_type, amount_delta, tx_date, reference_type, reference_id, description, created_by, created_at)
           VALUES(?, 'shipping_payment', ?, ?, 'purchase_invoice', ?, ?, ?, ?)`
        ).run(
          shippingAccId,
          -shippingCost,
          invDate,
          pId,
          `مصاريف شحن ونقل فاتورة مشتريات ${invoiceNo}`,
          req.user!.id,
          now
        );
      }

      if (remainingAmount > 0) {
        tx.prepare('UPDATE suppliers SET balance = ROUND(balance + ?, 2) WHERE id = ?').run(
          remainingAmount,
          supplierId
        );
      }

      return pId;
    });

    const db = getDb();
    const purchase = db.prepare('SELECT * FROM purchase_invoices WHERE id = ?').get(purchaseId);
    res.status(201).json({ purchase });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'تعذر حفظ فاتورة المشتريات' });
  }
});

router.post('/returns', requireAuth, requireRole('admin', 'warehouse'), (req, res) => {
  const body = req.body ?? {};
  const warehouseId = Number(body.warehouse_id);
  const supplierId = Number(body.supplier_id);
  const purchaseInvoiceId = body.purchase_invoice_id ? Number(body.purchase_invoice_id) : null;
  const settlementMethod = body.settlement_method === 'cash_refund' ? 'cash_refund' : 'credit_note';
  const rawItems = Array.isArray(body.items) ? body.items : [];

  if (!Number.isInteger(warehouseId) || !Number.isInteger(supplierId) || rawItems.length === 0) {
    res.status(400).json({ error: 'يرجى تحديد المخزن والمورد وإضافة صنف واحد على الأقل للمرتجع' });
    return;
  }

  try {
    const returnId = withTransaction((tx) => {
      const wh = tx.prepare('SELECT id, name FROM warehouses WHERE id = ? AND is_active = 1').get(warehouseId) as
        | { id: number; name: string }
        | undefined;
      if (!wh) throw new Error('المخزن المحدد غير موجود');

      const sup = tx.prepare('SELECT id, name FROM suppliers WHERE id = ? AND is_active = 1').get(supplierId) as
        | { id: number; name: string }
        | undefined;
      if (!sup) throw new Error('المورد المحدد غير موجود');

      let accountId: number | null = null;
      if (settlementMethod === 'cash_refund') {
        accountId = body.treasury_account_id ? Number(body.treasury_account_id) : null;
        if (!accountId) throw new Error('يرجى تحديد الخزنة التي تم استرداد النقدية إليها');
        const acc = tx.prepare('SELECT 1 FROM treasury_accounts WHERE id = ? AND is_active = 1').get(accountId);
        if (!acc) throw new Error('حساب الخزنة غير موجود');
      }

      const now = nowSql();
      const rDate = typeof body.return_date === 'string' && body.return_date.trim() ? body.return_date.trim() : todayStr();
      const returnNo = generateNextNumber(tx, 'purchase_returns', 'return_no', 'PRET');
      const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'تالف / غير مطابق';

      let totalAmount = 0;
      const prepared: {
        purchaseItemId: number | null;
        productId: number;
        productName: string;
        unitName: string;
        factor: number;
        qty: number;
        qtyBase: number;
        unitCost: number;
        lineTotal: number;
      }[] = [];

      for (const item of rawItems) {
        const productId = Number(item.product_id);
        const qty = roundQty(item.quantity);
        const unitCost = roundCost(item.unit_cost);
        if (!Number.isInteger(productId) || qty <= 0 || unitCost < 0) {
          throw new Error('بيانات الصنف المرتجع غير صالحة');
        }

        const prod = tx
          .prepare('SELECT id, name, base_unit_name, is_kit FROM products WHERE id = ?')
          .get(productId) as { id: number; name: string; base_unit_name: string; is_kit: number } | undefined;
        if (!prod) throw new Error('الصنف غير موجود');
        if (prod.is_kit === 1) throw new Error(`لا يمكن إرجاع طقم مجمع (${prod.name}) للمورد مباشرة`);

        let unitName = prod.base_unit_name;
        let factor = 1;
        if (item.unit_id) {
          const u = tx
            .prepare('SELECT unit_name, conversion_factor FROM product_units WHERE id = ? AND product_id = ?')
            .get(Number(item.unit_id), productId) as { unit_name: string; conversion_factor: number } | undefined;
          if (u) {
            unitName = u.unit_name;
            factor = roundQty(u.conversion_factor);
          }
        }

        const qtyBase = roundQty(qty * factor);
        const avail = getWarehouseStockBase(tx, warehouseId, productId);
        if (avail < qtyBase) {
          throw new Error(
            `الرصيد المتاح من (${prod.name}) في ${wh.name} هو ${avail} ${prod.base_unit_name} ولا يكفي للمرتجع`
          );
        }

        const lineTotal = roundMoney(qty * unitCost);
        totalAmount = roundMoney(totalAmount + lineTotal);

        prepared.push({
          purchaseItemId: item.purchase_item_id ? Number(item.purchase_item_id) : null,
          productId,
          productName: prod.name,
          unitName,
          factor,
          qty,
          qtyBase,
          unitCost,
          lineTotal,
        });
      }

      const prRes = tx
        .prepare(
          `INSERT INTO purchase_returns(
             return_no, return_date, warehouse_id, supplier_id, purchase_invoice_id,
             total_amount, settlement_method, treasury_account_id, reason, notes, created_by, created_at
           ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          returnNo,
          rDate,
          warehouseId,
          supplierId,
          purchaseInvoiceId,
          totalAmount,
          settlementMethod,
          accountId,
          reason,
          typeof body.notes === 'string' ? body.notes.trim() : '',
          req.user!.id,
          now
        );
      const prId = Number(prRes.lastInsertRowid);

      const insertPrItem = tx.prepare(
        `INSERT INTO purchase_return_items(
           return_id, purchase_item_id, product_id, product_name, unit_name, conversion_factor, quantity, unit_cost, line_total
         ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      for (const line of prepared) {
        insertPrItem.run(
          prId,
          line.purchaseItemId,
          line.productId,
          line.productName,
          line.unitName,
          line.factor,
          line.qty,
          line.unitCost,
          line.lineTotal
        );

        if (line.purchaseItemId) {
          tx.prepare('UPDATE purchase_invoice_items SET returned_qty = ROUND(returned_qty + ?, 4) WHERE id = ?').run(
            line.qty,
            line.purchaseItemId
          );
        }

        adjustStockBase(tx, {
          warehouseId,
          productId: line.productId,
          deltaBase: -line.qtyBase,
          movementType: 'purchase_return',
          unitCost: roundCost(line.unitCost / line.factor),
          referenceType: 'purchase_return',
          referenceId: prId,
          notes: `مرتجع مشتريات (${reason}) ${returnNo} — ${sup.name}`,
          userId: req.user!.id,
        });
      }

      if (settlementMethod === 'credit_note') {
        tx.prepare('UPDATE suppliers SET balance = ROUND(balance - ?, 2) WHERE id = ?').run(totalAmount, supplierId);
      } else if (accountId) {
        tx.prepare('UPDATE treasury_accounts SET balance = ROUND(balance + ?, 2) WHERE id = ?').run(
          totalAmount,
          accountId
        );
        tx.prepare(
          `INSERT INTO treasury_transactions(account_id, tx_type, amount_delta, tx_date, reference_type, reference_id, description, created_by, created_at)
           VALUES(?, 'purchase_refund', ?, ?, 'purchase_return', ?, ?, ?, ?)`
        ).run(
          accountId,
          totalAmount,
          rDate,
          prId,
          `استرداد نقدي لمرتجع مشتريات ${returnNo} (${sup.name})`,
          req.user!.id,
          now
        );
      }

      return prId;
    });

    const db = getDb();
    const purchaseReturn = db.prepare('SELECT * FROM purchase_returns WHERE id = ?').get(returnId);
    res.status(201).json({ purchase_return: purchaseReturn });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'تعذر تسجيل مرتجع المشتريات' });
  }
});

export default router;
