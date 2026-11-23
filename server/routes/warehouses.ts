import { Router } from 'express';
import { getDb, withTransaction } from '../db.ts';
import { requireAuth, requireRole } from '../auth.ts';
import { generateNextNumber, nowSql, roundQty } from '../utils.ts';
import { adjustStockBase, getWarehouseStockBase } from './products.ts';

const router = Router();

router.get('/', requireAuth, (_req, res) => {
  const db = getDb();
  const warehouses = db
    .prepare(
      `SELECT w.*,
        (SELECT COUNT(*) FROM warehouse_stock ws JOIN products p ON p.id = ws.product_id WHERE ws.warehouse_id = w.id AND p.is_active = 1 AND ws.quantity_base > 0) AS active_items_count,
        (SELECT COALESCE(SUM(ws.quantity_base), 0) FROM warehouse_stock ws JOIN products p ON p.id = ws.product_id WHERE ws.warehouse_id = w.id AND p.is_active = 1) AS total_units_count
       FROM warehouses w
       WHERE w.is_active = 1
       ORDER BY w.is_default DESC, w.id ASC`
    )
    .all();
  res.json({ warehouses });
});

router.post('/', requireAuth, requireRole('admin', 'warehouse'), (req, res) => {
  const { name, location, is_default } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'يرجى إدخال اسم المخزن' });
    return;
  }

  try {
    const created = withTransaction((tx) => {
      const exists = tx.prepare('SELECT 1 FROM warehouses WHERE name = ?').get(name.trim());
      if (exists) throw new Error('اسم المخزن موجود بالفعل');
      if (is_default) {
        tx.prepare('UPDATE warehouses SET is_default = 0').run();
      }
      const r = tx
        .prepare('INSERT INTO warehouses(name, location, is_default, is_active, created_at) VALUES(?, ?, ?, 1, ?)')
        .run(name.trim(), typeof location === 'string' ? location.trim() : '', is_default ? 1 : 0, nowSql());
      return tx.prepare('SELECT * FROM warehouses WHERE id = ?').get(Number(r.lastInsertRowid));
    });
    res.status(201).json({ warehouse: created });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'تعذر إضافة المخزن' });
  }
});

router.put('/:id', requireAuth, requireRole('admin', 'warehouse'), (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'معرف المخزن غير صالح' });
    return;
  }

  const { name, location, is_default } = req.body ?? {};
  try {
    const updated = withTransaction((tx) => {
      const existing = tx.prepare('SELECT * FROM warehouses WHERE id = ?').get(id) as
        | { id: number; name: string; location: string; is_default: number }
        | undefined;
      if (!existing) throw new Error('المخزن غير موجود');

      const nextName = typeof name === 'string' && name.trim() ? name.trim() : existing.name;
      const dup = tx.prepare('SELECT 1 FROM warehouses WHERE name = ? AND id != ?').get(nextName, id);
      if (dup) throw new Error('اسم المخزن مستخدم لمخزن آخر');

      if (is_default === true) {
        tx.prepare('UPDATE warehouses SET is_default = 0').run();
      }
      const nextDefault = is_default !== undefined ? (is_default ? 1 : 0) : existing.is_default;
      const nextLoc = typeof location === 'string' ? location.trim() : existing.location;

      tx.prepare('UPDATE warehouses SET name = ?, location = ?, is_default = ? WHERE id = ?').run(
        nextName,
        nextLoc,
        nextDefault,
        id
      );
      return tx.prepare('SELECT * FROM warehouses WHERE id = ?').get(id);
    });
    res.json({ warehouse: updated });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'تعذر تحديث المخزن' });
  }
});

router.get('/movements', requireAuth, (req, res) => {
  const db = getDb();
  const warehouseId = req.query.warehouse_id ? Number(req.query.warehouse_id) : null;
  const productId = req.query.product_id ? Number(req.query.product_id) : null;
  const movementType = typeof req.query.movement_type === 'string' ? req.query.movement_type.trim() : '';
  const limit = Math.min(300, Math.max(20, Number(req.query.limit) || 100));

  const conditions: string[] = [];
  const params: (string | number)[] = [];
  if (warehouseId) {
    conditions.push('sm.warehouse_id = ?');
    params.push(warehouseId);
  }
  if (productId) {
    conditions.push('sm.product_id = ?');
    params.push(productId);
  }
  if (movementType) {
    conditions.push('sm.movement_type = ?');
    params.push(movementType);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const includeCost = req.user!.role !== 'cashier';

  const rows = db
    .prepare(
      `SELECT sm.id, sm.warehouse_id, w.name AS warehouse_name, sm.product_id, p.name AS product_name, p.base_unit_name,
              sm.movement_type, sm.quantity_delta, ${includeCost ? 'sm.unit_cost,' : ''}
              sm.reference_type, sm.reference_id, sm.notes, sm.created_at, u.full_name AS user_name
       FROM stock_movements sm
       JOIN warehouses w ON w.id = sm.warehouse_id
       JOIN products p ON p.id = sm.product_id
       LEFT JOIN users u ON u.id = sm.created_by
       ${whereSql}
       ORDER BY sm.id DESC
       LIMIT ?`
    )
    .all(...params, limit);

  res.json({ movements: rows });
});

router.get('/transfers', requireAuth, (_req, res) => {
  const db = getDb();
  const transfers = db
    .prepare(
      `SELECT st.*, fw.name AS from_warehouse_name, tw.name AS to_warehouse_name, u.full_name AS user_name
       FROM stock_transfers st
       JOIN warehouses fw ON fw.id = st.from_warehouse_id
       JOIN warehouses tw ON tw.id = st.to_warehouse_id
       LEFT JOIN users u ON u.id = st.created_by
       ORDER BY st.id DESC
       LIMIT 100`
    )
    .all() as Record<string, unknown>[];

  const itemsStmt = db.prepare(
    `SELECT sti.*, p.name AS product_name, p.base_unit_name
     FROM stock_transfer_items sti
     JOIN products p ON p.id = sti.product_id
     WHERE sti.transfer_id = ?`
  );
  for (const t of transfers) {
    t.items = itemsStmt.all(Number(t.id));
  }

  res.json({ transfers });
});

router.post('/transfers', requireAuth, requireRole('admin', 'warehouse'), (req, res) => {
  const { from_warehouse_id, to_warehouse_id, transfer_date, notes, items } = req.body ?? {};
  const fromId = Number(from_warehouse_id);
  const toId = Number(to_warehouse_id);
  if (!Number.isInteger(fromId) || !Number.isInteger(toId) || fromId === toId) {
    res.status(400).json({ error: 'يرجى اختيار مخزن مصدر ومخزن وجهة مختلفين' });
    return;
  }
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'يرجى إضافة صنف واحد على الأقل للتحويل' });
    return;
  }

  try {
    const result = withTransaction((tx) => {
      const fromWh = tx.prepare('SELECT id, name FROM warehouses WHERE id = ? AND is_active = 1').get(fromId) as
        | { id: number; name: string }
        | undefined;
      const toWh = tx.prepare('SELECT id, name FROM warehouses WHERE id = ? AND is_active = 1').get(toId) as
        | { id: number; name: string }
        | undefined;
      if (!fromWh || !toWh) throw new Error('أحد المخازن المحددة غير موجود');

      const transferNo = generateNextNumber(tx, 'stock_transfers', 'transfer_no', 'TRF');
      const now = nowSql();
      const tDate = typeof transfer_date === 'string' && transfer_date.trim() ? transfer_date.trim() : now.slice(0, 10);

      const trRes = tx
        .prepare(
          `INSERT INTO stock_transfers(transfer_no, transfer_date, from_warehouse_id, to_warehouse_id, notes, created_by, created_at)
           VALUES(?, ?, ?, ?, ?, ?, ?)`
        )
        .run(transferNo, tDate, fromId, toId, typeof notes === 'string' ? notes.trim() : '', req.user!.id, now);
      const transferId = Number(trRes.lastInsertRowid);

      const insertItem = tx.prepare(
        `INSERT INTO stock_transfer_items(transfer_id, product_id, unit_name, conversion_factor, quantity, quantity_base)
         VALUES(?, ?, ?, ?, ?, ?)`
      );

      for (const item of items) {
        const productId = Number(item.product_id);
        const qty = roundQty(item.quantity);
        if (qty <= 0) throw new Error('الكمية المحولة يجب أن تكون أكبر من صفر');

        const prod = tx
          .prepare('SELECT id, name, base_unit_name, is_kit, last_purchase_cost FROM products WHERE id = ? AND is_active = 1')
          .get(productId) as
          | { id: number; name: string; base_unit_name: string; is_kit: number; last_purchase_cost: number }
          | undefined;
        if (!prod) throw new Error('أحد الأصناف غير موجود');
        if (prod.is_kit === 1) throw new Error(`الصنف (${prod.name}) طقم مجمع — يتم تحويل مكوناته الفردية فقط`);

        let unitName = prod.base_unit_name;
        let factor = 1;
        if (item.unit_id) {
          const u = tx
            .prepare('SELECT unit_name, conversion_factor FROM product_units WHERE id = ? AND product_id = ?')
            .get(Number(item.unit_id), productId) as { unit_name: string; conversion_factor: number } | undefined;
          if (!u) throw new Error(`وحدة القياس غير تابعة للصنف (${prod.name})`);
          unitName = u.unit_name;
          factor = roundQty(u.conversion_factor);
        }

        const qtyBase = roundQty(qty * factor);
        const avail = getWarehouseStockBase(tx, fromId, productId);
        if (avail < qtyBase) {
          throw new Error(`الرصيد المتاح من (${prod.name}) في ${fromWh.name} هو ${avail} ${prod.base_unit_name} فقط`);
        }

        insertItem.run(transferId, productId, unitName, factor, qty, qtyBase);

        adjustStockBase(tx, {
          warehouseId: fromId,
          productId,
          deltaBase: -qtyBase,
          movementType: 'transfer_out',
          unitCost: prod.last_purchase_cost,
          referenceType: 'transfer',
          referenceId: transferId,
          notes: `تحويل إلى ${toWh.name} (${transferNo})`,
          userId: req.user!.id,
        });

        adjustStockBase(tx, {
          warehouseId: toId,
          productId,
          deltaBase: qtyBase,
          movementType: 'transfer_in',
          unitCost: prod.last_purchase_cost,
          referenceType: 'transfer',
          referenceId: transferId,
          notes: `استلام تحويل من ${fromWh.name} (${transferNo})`,
          userId: req.user!.id,
        });
      }

      return tx.prepare('SELECT * FROM stock_transfers WHERE id = ?').get(transferId);
    });

    res.status(201).json({ transfer: result });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'تعذر تنفيذ التحويل' });
  }
});

router.post('/adjustments', requireAuth, requireRole('admin', 'warehouse'), (req, res) => {
  const { warehouse_id, items, notes } = req.body ?? {};
  const whId = Number(warehouse_id);
  if (!Number.isInteger(whId) || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'بيانات الجرد غير مكتملة' });
    return;
  }

  try {
    const adjustedCount = withTransaction((tx) => {
      const wh = tx.prepare('SELECT id, name FROM warehouses WHERE id = ? AND is_active = 1').get(whId);
      if (!wh) throw new Error('المخزن غير موجود');

      let count = 0;
      for (const item of items) {
        const productId = Number(item.product_id);
        const counted = roundQty(item.counted_qty_base);
        if (counted < 0) throw new Error('الكمية الفعلية لا يمكن أن تكون سالبة');

        const prod = tx
          .prepare('SELECT id, name, is_kit, last_purchase_cost FROM products WHERE id = ? AND is_active = 1')
          .get(productId) as
          | { id: number; name: string; is_kit: number; last_purchase_cost: number }
          | undefined;
        if (!prod) throw new Error('أحد الأصناف غير موجود');
        if (prod.is_kit === 1) throw new Error(`لا يمكن جرد الطقم المجمع (${prod.name}) مباشرة`);

        const current = getWarehouseStockBase(tx, whId, productId);
        const delta = roundQty(counted - current);
        if (delta !== 0) {
          adjustStockBase(tx, {
            warehouseId: whId,
            productId,
            deltaBase: delta,
            movementType: 'adjustment',
            unitCost: prod.last_purchase_cost,
            referenceType: 'adjustment',
            referenceId: whId,
            notes:
              (typeof item.notes === 'string' && item.notes.trim()) ||
              (typeof notes === 'string' && notes.trim()) ||
              `تسوية جرد (من ${current} إلى ${counted})`,
            userId: req.user!.id,
          });
          count += 1;
        }
      }
      return count;
    });

    res.json({ ok: true, adjusted_count: adjustedCount });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'تعذر حفظ تسوية الجرد' });
  }
});

export default router;
