import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { getDb, withTransaction } from '../db.ts';
import { requireAuth, requireRole } from '../auth.ts';
import { generateNextNumber, generateUniqueBarcode, nowSql, roundCost, roundMoney, roundQty } from '../utils.ts';

const router = Router();

export interface UnitInput {
  id?: number;
  unit_name: string;
  conversion_factor: number;
  barcode?: string;
  retail_price: number;
  plumber_price: number;
  wholesale_price: number;
  is_base?: boolean;
}

export function getWarehouseStockBase(db: DatabaseSync, warehouseId: number, productId: number): number {
  const row = db
    .prepare('SELECT quantity_base FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?')
    .get(warehouseId, productId) as { quantity_base: number } | undefined;
  return row ? roundQty(row.quantity_base) : 0;
}

export function adjustStockBase(
  db: DatabaseSync,
  params: {
    warehouseId: number;
    productId: number;
    deltaBase: number;
    movementType: string;
    unitCost: number;
    referenceType?: string | null;
    referenceId?: number | null;
    notes?: string;
    userId: number;
  }
): void {
  const delta = roundQty(params.deltaBase);
  if (delta === 0) return;
  db.prepare(
    `INSERT INTO warehouse_stock(warehouse_id, product_id, quantity_base) VALUES(?, ?, ?)
     ON CONFLICT(warehouse_id, product_id) DO UPDATE SET quantity_base = ROUND(quantity_base + excluded.quantity_base, 4)`
  ).run(params.warehouseId, params.productId, delta);

  db.prepare(
    `INSERT INTO stock_movements(warehouse_id, product_id, movement_type, quantity_delta, unit_cost, reference_type, reference_id, notes, created_by, created_at)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    params.warehouseId,
    params.productId,
    params.movementType,
    delta,
    roundCost(params.unitCost),
    params.referenceType ?? null,
    params.referenceId ?? null,
    params.notes ?? '',
    params.userId,
    nowSql()
  );
}

export function hydrateProducts(db: DatabaseSync, productIds: number[], includeCost: boolean) {
  if (productIds.length === 0) return [];
  const placeholders = productIds.map(() => '?').join(',');

  const products = db
    .prepare(`SELECT * FROM products WHERE id IN (${placeholders}) ORDER BY id DESC`)
    .all(...productIds) as Record<string, unknown>[];

  const units = db
    .prepare(`SELECT * FROM product_units WHERE product_id IN (${placeholders}) ORDER BY is_base DESC, conversion_factor ASC, id ASC`)
    .all(...productIds) as Record<string, unknown>[];

  const kitItems = db
    .prepare(
      `SELECT ki.*, cp.name AS component_name, cp.base_unit_name AS component_unit, cp.last_purchase_cost AS component_cost
       FROM product_kit_items ki
       JOIN products cp ON cp.id = ki.component_product_id
       WHERE ki.kit_product_id IN (${placeholders})`
    )
    .all(...productIds) as Record<string, unknown>[];

  const warehouses = db
    .prepare('SELECT id FROM warehouses WHERE is_active = 1')
    .all() as { id: number }[];

  const stockRows = db
    .prepare('SELECT warehouse_id, product_id, quantity_base FROM warehouse_stock')
    .all() as { warehouse_id: number; product_id: number; quantity_base: number }[];

  const stockMap = new Map<string, number>();
  for (const s of stockRows) {
    stockMap.set(`${s.warehouse_id}:${s.product_id}`, roundQty(s.quantity_base));
  }

  const unitsByProd = new Map<number, Record<string, unknown>[]>();
  for (const u of units) {
    const pid = Number(u.product_id);
    if (!unitsByProd.has(pid)) unitsByProd.set(pid, []);
    unitsByProd.get(pid)!.push(u);
  }

  const kitsByProd = new Map<number, Record<string, unknown>[]>();
  for (const k of kitItems) {
    const pid = Number(k.kit_product_id);
    if (!kitsByProd.has(pid)) kitsByProd.set(pid, []);
    kitsByProd.get(pid)!.push(
      includeCost
        ? k
        : {
            id: k.id,
            kit_product_id: k.kit_product_id,
            component_product_id: k.component_product_id,
            quantity_base: k.quantity_base,
            component_name: k.component_name,
            component_unit: k.component_unit,
          }
    );
  }

  return products.map((p) => {
    const pid = Number(p.id);
    const isKit = Number(p.is_kit) === 1;
    const stockByWarehouse: Record<number, number> = {};
    let totalStock = 0;

    if (isKit) {
      const comps = kitsByProd.get(pid) || [];
      for (const wh of warehouses) {
        if (comps.length === 0) {
          stockByWarehouse[wh.id] = 0;
        } else {
          let minKits = Infinity;
          for (const c of comps) {
            const compId = Number(c.component_product_id);
            const need = Number(c.quantity_base) || 1;
            const avail = stockMap.get(`${wh.id}:${compId}`) ?? 0;
            minKits = Math.min(minKits, Math.floor(avail / need));
          }
          const qty = Number.isFinite(minKits) ? Math.max(0, minKits) : 0;
          stockByWarehouse[wh.id] = qty;
          totalStock += qty;
        }
      }
    } else {
      for (const wh of warehouses) {
        const qty = stockMap.get(`${wh.id}:${pid}`) ?? 0;
        stockByWarehouse[wh.id] = qty;
        totalStock = roundQty(totalStock + qty);
      }
    }

    const baseObj: Record<string, unknown> = {
      ...p,
      is_kit: isKit,
      is_active: Number(p.is_active) === 1,
      units: unitsByProd.get(pid) || [],
      kit_items: kitsByProd.get(pid) || [],
      stock_by_warehouse: stockByWarehouse,
      total_stock: totalStock,
    };

    if (!includeCost) {
      delete baseObj.last_purchase_cost;
    }
    return baseObj;
  });
}

router.get('/filters', requireAuth, (_req, res) => {
  const db = getDb();
  const categories = (
    db.prepare("SELECT DISTINCT category FROM products WHERE is_active = 1 AND category != '' ORDER BY category").all() as {
      category: string;
    }[]
  ).map((r) => r.category);
  const brands = (
    db.prepare("SELECT DISTINCT brand FROM products WHERE is_active = 1 AND brand != '' ORDER BY brand").all() as {
      brand: string;
    }[]
  ).map((r) => r.brand);
  const sizes = (
    db.prepare("SELECT DISTINCT size FROM products WHERE is_active = 1 AND size != '' ORDER BY size").all() as {
      size: string;
    }[]
  ).map((r) => r.size);
  res.json({ categories, brands, sizes });
});

router.get('/barcode/:code', requireAuth, (req, res) => {
  const code = String(req.params.code || '').trim();
  if (!code) {
    res.status(400).json({ error: 'يرجى إدخال كود الباركود' });
    return;
  }

  const db = getDb();
  const includeCost = req.user!.role !== 'cashier';

  const unitMatch = db
    .prepare(
      `SELECT u.*, p.id AS p_id
       FROM product_units u
       JOIN products p ON p.id = u.product_id
       WHERE u.barcode = ? AND p.is_active = 1`
    )
    .get(code) as (Record<string, unknown> & { p_id: number }) | undefined;

  if (unitMatch) {
    const [product] = hydrateProducts(db, [unitMatch.p_id], includeCost);
    res.json({ product, matched_unit_id: Number(unitMatch.id) });
    return;
  }

  const skuMatch = db
    .prepare('SELECT id FROM products WHERE sku = ? AND is_active = 1')
    .get(code) as { id: number } | undefined;

  if (skuMatch) {
    const [product] = hydrateProducts(db, [skuMatch.id], includeCost);
    const units = (product.units as Record<string, unknown>[]) || [];
    const baseUnit = units.find((u) => Number(u.is_base) === 1) || units[0];
    res.json({ product, matched_unit_id: baseUnit ? Number(baseUnit.id) : null });
    return;
  }

  res.status(404).json({ error: `لم يتم العثور على صنف بالباركود: ${code}` });
});

router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
  const brand = typeof req.query.brand === 'string' ? req.query.brand.trim() : '';
  const size = typeof req.query.size === 'string' ? req.query.size.trim() : '';
  const warehouseId = req.query.warehouse_id ? Number(req.query.warehouse_id) : null;
  const lowStockOnly = req.query.low_stock_only === 'true';
  const includeInactive = req.query.include_inactive === 'true';

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (!includeInactive) {
    conditions.push('p.is_active = 1');
  }
  if (category) {
    conditions.push('p.category = ?');
    params.push(category);
  }
  if (brand) {
    conditions.push('p.brand = ?');
    params.push(brand);
  }
  if (size) {
    conditions.push('p.size = ?');
    params.push(size);
  }
  if (q) {
    const like = `%${q}%`;
    conditions.push(
      `(p.name LIKE ? OR p.sku LIKE ? OR p.brand LIKE ? OR p.size LIKE ? OR p.color LIKE ? OR p.category LIKE ?
        OR EXISTS (SELECT 1 FROM product_units u WHERE u.product_id = p.id AND u.barcode LIKE ?))`
    );
    params.push(like, like, like, like, like, like, like);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const idRows = db.prepare(`SELECT p.id FROM products p ${whereSql} ORDER BY p.id DESC`).all(...params) as {
    id: number;
  }[];

  const includeCost = req.user!.role !== 'cashier';
  let hydrated = hydrateProducts(
    db,
    idRows.map((r) => r.id),
    includeCost
  );

  if (lowStockOnly) {
    hydrated = hydrated.filter((p) => {
      if (p.is_kit) return false;
      const stock = warehouseId
        ? Number((p.stock_by_warehouse as Record<number, number>)[warehouseId] ?? 0)
        : Number(p.total_stock ?? 0);
      return stock <= Number(p.min_stock ?? 0);
    });
  }

  res.json({ products: hydrated });
});

router.post('/', requireAuth, requireRole('admin', 'warehouse'), (req, res) => {
  const body = req.body ?? {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    res.status(400).json({ error: 'يرجى إدخال اسم الصنف' });
    return;
  }

  const isKit = Boolean(body.is_kit);
  const baseUnitName =
    typeof body.base_unit_name === 'string' && body.base_unit_name.trim()
      ? body.base_unit_name.trim()
      : isKit
        ? 'طقم'
        : 'قطعة';

  const rawUnits: UnitInput[] = Array.isArray(body.units) && body.units.length > 0 ? body.units : [];
  if (rawUnits.length === 0) {
    res.status(400).json({ error: 'يجب تحديد وحدة قياس وأسعار بيع للصنف' });
    return;
  }

  const kitItems: { component_product_id: number; quantity_base: number }[] = Array.isArray(body.kit_items)
    ? body.kit_items
    : [];
  if (isKit && kitItems.length === 0) {
    res.status(400).json({ error: 'الطقم المجمع يجب أن يحتوي على صنف مكون واحد على الأقل' });
    return;
  }

  try {
    const createdId = withTransaction((tx) => {
      const now = nowSql();
      const sku =
        typeof body.sku === 'string' && body.sku.trim()
          ? body.sku.trim()
          : generateNextNumber(tx, 'products', 'sku', 'SKU');

      const skuExists = tx.prepare('SELECT 1 FROM products WHERE sku = ?').get(sku);
      if (skuExists) {
        throw new Error(`كود الصنف (${sku}) مسجل بالفعل`);
      }

      let lastCost = roundCost(body.last_purchase_cost ?? 0);
      if (isKit) {
        lastCost = 0;
        for (const ki of kitItems) {
          const comp = tx
            .prepare('SELECT id, is_kit, last_purchase_cost FROM products WHERE id = ? AND is_active = 1')
            .get(Number(ki.component_product_id)) as
            | { id: number; is_kit: number; last_purchase_cost: number }
            | undefined;
          if (!comp) throw new Error('أحد مكونات الطقم غير موجود');
          if (comp.is_kit === 1) throw new Error('لا يمكن إضافة طقم مجمع داخل طقم آخر');
          const qty = roundQty(ki.quantity_base);
          if (qty <= 0) throw new Error('كمية المكون داخل الطقم يجب أن تكون أكبر من صفر');
          lastCost = roundCost(lastCost + comp.last_purchase_cost * qty);
        }
      }

      const vatRate =
        body.vat_rate !== undefined && body.vat_rate !== null && body.vat_rate !== ''
          ? roundMoney(body.vat_rate)
          : null;

      const prodRes = tx
        .prepare(
          `INSERT INTO products(sku, name, category, brand, size, color, base_unit_name, is_kit, last_purchase_cost, min_stock, vat_rate, notes, is_active, created_at, updated_at)
           VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
        )
        .run(
          sku,
          name,
          typeof body.category === 'string' && body.category.trim() ? body.category.trim() : 'عام',
          typeof body.brand === 'string' ? body.brand.trim() : '',
          typeof body.size === 'string' ? body.size.trim() : '',
          typeof body.color === 'string' ? body.color.trim() : '',
          baseUnitName,
          isKit ? 1 : 0,
          lastCost,
          roundQty(body.min_stock ?? 5),
          vatRate,
          typeof body.notes === 'string' ? body.notes.trim() : '',
          now,
          now
        );
      const productId = Number(prodRes.lastInsertRowid);

      const seenBarcodes = new Set<string>();
      const insertUnit = tx.prepare(
        `INSERT INTO product_units(product_id, unit_name, conversion_factor, barcode, retail_price, plumber_price, wholesale_price, is_base)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?)`
      );

      let hasBase = false;
      rawUnits.forEach((u, idx) => {
        const factor = roundQty(u.conversion_factor || 1);
        if (factor <= 0) throw new Error('معامل التحويل للوحدة يجب أن يكون أكبر من صفر');
        const isBase = u.is_base || (!hasBase && factor === 1) || (!hasBase && idx === 0);
        if (isBase) hasBase = true;
        const unitName =
          typeof u.unit_name === 'string' && u.unit_name.trim() ? u.unit_name.trim() : baseUnitName;

        let barcode = typeof u.barcode === 'string' && u.barcode.trim() ? u.barcode.trim() : generateUniqueBarcode(tx);
        if (seenBarcodes.has(barcode)) {
          throw new Error(`الباركود (${barcode}) مكرر داخل نفس الصنف`);
        }
        const bcExists = tx.prepare('SELECT 1 FROM product_units WHERE barcode = ?').get(barcode);
        if (bcExists) {
          throw new Error(`الباركود (${barcode}) مسجل لصنف آخر`);
        }
        seenBarcodes.add(barcode);

        insertUnit.run(
          productId,
          unitName,
          isBase ? 1 : factor,
          barcode,
          roundMoney(u.retail_price),
          roundMoney(u.plumber_price),
          roundMoney(u.wholesale_price),
          isBase ? 1 : 0
        );
      });

      if (isKit) {
        const insertKi = tx.prepare(
          'INSERT INTO product_kit_items(kit_product_id, component_product_id, quantity_base) VALUES(?, ?, ?)'
        );
        for (const ki of kitItems) {
          insertKi.run(productId, Number(ki.component_product_id), roundQty(ki.quantity_base));
        }
      } else {
        const openingQty = roundQty(body.opening_stock ?? 0);
        if (openingQty > 0) {
          let whId = Number(body.opening_warehouse_id || 0);
          if (!whId) {
            const defWh = tx
              .prepare('SELECT id FROM warehouses WHERE is_active = 1 ORDER BY is_default DESC, id ASC LIMIT 1')
              .get() as { id: number } | undefined;
            whId = defWh ? defWh.id : 1;
          }
          adjustStockBase(tx, {
            warehouseId: whId,
            productId,
            deltaBase: openingQty,
            movementType: 'opening',
            unitCost: lastCost,
            referenceType: 'opening',
            referenceId: productId,
            notes: 'رصيد افتتاحي عند إضافة الصنف',
            userId: req.user!.id,
          });
        }
      }

      return productId;
    });

    const db = getDb();
    const [product] = hydrateProducts(db, [createdId], true);
    res.status(201).json({ product });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'تعذر حفظ الصنف' });
  }
});

router.put('/:id', requireAuth, requireRole('admin', 'warehouse'), (req, res) => {
  const productId = Number(req.params.id);
  if (!Number.isInteger(productId)) {
    res.status(400).json({ error: 'معرف الصنف غير صالح' });
    return;
  }

  const body = req.body ?? {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    res.status(400).json({ error: 'يرجى إدخال اسم الصنف' });
    return;
  }

  const rawUnits: UnitInput[] = Array.isArray(body.units) && body.units.length > 0 ? body.units : [];
  if (rawUnits.length === 0) {
    res.status(400).json({ error: 'يجب تحديد وحدة قياس واحدة على الأقل' });
    return;
  }

  try {
    withTransaction((tx) => {
      const existing = tx
        .prepare('SELECT id, is_kit FROM products WHERE id = ?')
        .get(productId) as { id: number; is_kit: number } | undefined;
      if (!existing) throw new Error('الصنف غير موجود');

      const isKit = body.is_kit !== undefined ? Boolean(body.is_kit) : existing.is_kit === 1;
      const baseUnitName =
        typeof body.base_unit_name === 'string' && body.base_unit_name.trim()
          ? body.base_unit_name.trim()
          : isKit
            ? 'طقم'
            : 'قطعة';

      const kitItems: { component_product_id: number; quantity_base: number }[] = Array.isArray(body.kit_items)
        ? body.kit_items
        : [];
      if (isKit && kitItems.length === 0) {
        throw new Error('الطقم المجمع يجب أن يحتوي على مكون واحد على الأقل');
      }

      const sku = typeof body.sku === 'string' && body.sku.trim() ? body.sku.trim() : null;
      if (sku) {
        const dup = tx.prepare('SELECT 1 FROM products WHERE sku = ? AND id != ?').get(sku, productId);
        if (dup) throw new Error(`كود الصنف (${sku}) مستخدم لصنف آخر`);
      }

      let lastCost = roundCost(body.last_purchase_cost ?? 0);
      if (isKit) {
        lastCost = 0;
        for (const ki of kitItems) {
          const cid = Number(ki.component_product_id);
          if (cid === productId) throw new Error('لا يمكن إضافة الطقم كمكون لنفسه');
          const comp = tx
            .prepare('SELECT id, is_kit, last_purchase_cost FROM products WHERE id = ? AND is_active = 1')
            .get(cid) as { id: number; is_kit: number; last_purchase_cost: number } | undefined;
          if (!comp) throw new Error('أحد مكونات الطقم غير موجود');
          if (comp.is_kit === 1) throw new Error('لا يمكن إضافة طقم مجمع داخل طقم آخر');
          const qty = roundQty(ki.quantity_base);
          if (qty <= 0) throw new Error('كمية المكون يجب أن تكون أكبر من صفر');
          lastCost = roundCost(lastCost + comp.last_purchase_cost * qty);
        }
      }

      const vatRate =
        body.vat_rate !== undefined && body.vat_rate !== null && body.vat_rate !== ''
          ? roundMoney(body.vat_rate)
          : null;

      tx.prepare(
        `UPDATE products
         SET sku = COALESCE(?, sku), name = ?, category = ?, brand = ?, size = ?, color = ?, base_unit_name = ?,
             is_kit = ?, last_purchase_cost = ?, min_stock = ?, vat_rate = ?, notes = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        sku,
        name,
        typeof body.category === 'string' && body.category.trim() ? body.category.trim() : 'عام',
        typeof body.brand === 'string' ? body.brand.trim() : '',
        typeof body.size === 'string' ? body.size.trim() : '',
        typeof body.color === 'string' ? body.color.trim() : '',
        baseUnitName,
        isKit ? 1 : 0,
        lastCost,
        roundQty(body.min_stock ?? 5),
        vatRate,
        typeof body.notes === 'string' ? body.notes.trim() : '',
        nowSql(),
        productId
      );

      tx.prepare('DELETE FROM product_units WHERE product_id = ?').run(productId);
      const seenBarcodes = new Set<string>();
      const insertUnit = tx.prepare(
        `INSERT INTO product_units(product_id, unit_name, conversion_factor, barcode, retail_price, plumber_price, wholesale_price, is_base)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?)`
      );

      let hasBase = false;
      rawUnits.forEach((u, idx) => {
        const factor = roundQty(u.conversion_factor || 1);
        if (factor <= 0) throw new Error('معامل التحويل يجب أن يكون أكبر من صفر');
        const isBase = u.is_base || (!hasBase && factor === 1) || (!hasBase && idx === 0);
        if (isBase) hasBase = true;
        const unitName =
          typeof u.unit_name === 'string' && u.unit_name.trim() ? u.unit_name.trim() : baseUnitName;

        let barcode = typeof u.barcode === 'string' && u.barcode.trim() ? u.barcode.trim() : generateUniqueBarcode(tx);
        if (seenBarcodes.has(barcode)) {
          throw new Error(`الباركود (${barcode}) مكرر`);
        }
        const dupBc = tx.prepare('SELECT 1 FROM product_units WHERE barcode = ?').get(barcode);
        if (dupBc) {
          throw new Error(`الباركود (${barcode}) مسجل لصنف آخر`);
        }
        seenBarcodes.add(barcode);

        insertUnit.run(
          productId,
          unitName,
          isBase ? 1 : factor,
          barcode,
          roundMoney(u.retail_price),
          roundMoney(u.plumber_price),
          roundMoney(u.wholesale_price),
          isBase ? 1 : 0
        );
      });

      tx.prepare('DELETE FROM product_kit_items WHERE kit_product_id = ?').run(productId);
      if (isKit) {
        const insertKi = tx.prepare(
          'INSERT INTO product_kit_items(kit_product_id, component_product_id, quantity_base) VALUES(?, ?, ?)'
        );
        for (const ki of kitItems) {
          insertKi.run(productId, Number(ki.component_product_id), roundQty(ki.quantity_base));
        }
      }
    });

    const db = getDb();
    const [product] = hydrateProducts(db, [productId], true);
    res.json({ product });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'تعذر تعديل الصنف' });
  }
});

router.delete('/:id', requireAuth, requireRole('admin', 'warehouse'), (req, res) => {
  const productId = Number(req.params.id);
  if (!Number.isInteger(productId)) {
    res.status(400).json({ error: 'معرف الصنف غير صالح' });
    return;
  }

  const db = getDb();
  const inKit = db
    .prepare(
      `SELECT p.name FROM product_kit_items ki
       JOIN products p ON p.id = ki.kit_product_id
       WHERE ki.component_product_id = ? AND p.is_active = 1 LIMIT 1`
    )
    .get(productId) as { name: string } | undefined;

  if (inKit) {
    res.status(400).json({ error: `لا يمكن حذف هذا الصنف لأنه مكون داخل طقم نشط (${inKit.name})` });
    return;
  }

  db.prepare('UPDATE products SET is_active = 0, updated_at = ? WHERE id = ?').run(nowSql(), productId);
  res.json({ ok: true });
});

export default router;
