import type { DatabaseSync } from 'node:sqlite';

export function roundMoney(val: unknown): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function roundQty(val: unknown): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

export function roundCost(val: unknown): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

export function todayStr(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function nowSql(date = new Date()): string {
  const d = todayStr(date);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${d} ${hh}:${mm}:${ss}`;
}

export function generateNextNumber(
  db: DatabaseSync,
  table: string,
  column: string,
  prefix: string,
  pad = 4
): string {
  const row = db
    .prepare(`SELECT COALESCE(MAX(id), 0) AS max_id FROM ${table}`)
    .get() as { max_id: number };
  let nextNum = Number(row?.max_id ?? 0) + 1;
  while (true) {
    const candidate = `${prefix}-${String(nextNum).padStart(pad, '0')}`;
    const exists = db
      .prepare(`SELECT 1 FROM ${table} WHERE ${column} = ?`)
      .get(candidate);
    if (!exists) return candidate;
    nextNum += 1;
  }
}

export function generateUniqueBarcode(db: DatabaseSync): string {
  const row = db
    .prepare(`SELECT COALESCE(MAX(id), 0) AS max_id FROM product_units`)
    .get() as { max_id: number };
  let seq = Number(row?.max_id ?? 0) + 1;
  while (true) {
    const candidate = `622000${String(seq).padStart(6, '0')}`;
    const inUnits = db
      .prepare(`SELECT 1 FROM product_units WHERE barcode = ?`)
      .get(candidate);
    const inProducts = db
      .prepare(`SELECT 1 FROM products WHERE sku = ?`)
      .get(candidate);
    if (!inUnits && !inProducts) return candidate;
    seq += 1;
  }
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return todayStr(d);
}
