import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

let dbInstance: DatabaseSync | null = null;
let inTransaction = false;

export function getDbPath(): string {
  return process.env.DB_PATH || path.join(process.cwd(), 'data', 'bahnasawy.db');
}

export function getBackupsDir(): string {
  return process.env.BACKUPS_DIR || path.join(path.dirname(getDbPath()), 'backups');
}

function initDatabase(db: DatabaseSync) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','cashier','warehouse')),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS warehouses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      location TEXT DEFAULT '',
      is_default INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT UNIQUE,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'عام',
      brand TEXT DEFAULT '',
      size TEXT DEFAULT '',
      color TEXT DEFAULT '',
      base_unit_name TEXT NOT NULL DEFAULT 'قطعة',
      is_kit INTEGER NOT NULL DEFAULT 0,
      last_purchase_cost REAL NOT NULL DEFAULT 0,
      min_stock REAL NOT NULL DEFAULT 5,
      vat_rate REAL,
      notes TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS product_units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      unit_name TEXT NOT NULL,
      conversion_factor REAL NOT NULL DEFAULT 1,
      barcode TEXT UNIQUE,
      retail_price REAL NOT NULL DEFAULT 0,
      plumber_price REAL NOT NULL DEFAULT 0,
      wholesale_price REAL NOT NULL DEFAULT 0,
      is_base INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS product_kit_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kit_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      component_product_id INTEGER NOT NULL REFERENCES products(id),
      quantity_base REAL NOT NULL DEFAULT 1,
      UNIQUE(kit_product_id, component_product_id)
    );

    CREATE TABLE IF NOT EXISTS warehouse_stock (
      warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity_base REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (warehouse_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      movement_type TEXT NOT NULL CHECK(movement_type IN ('opening','purchase','sale','sale_return','purchase_return','transfer_out','transfer_in','adjustment','sale_void')),
      quantity_delta REAL NOT NULL,
      unit_cost REAL NOT NULL DEFAULT 0,
      reference_type TEXT,
      reference_id INTEGER,
      notes TEXT DEFAULT '',
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stock_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transfer_no TEXT UNIQUE NOT NULL,
      transfer_date TEXT NOT NULL,
      from_warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
      to_warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
      notes TEXT DEFAULT '',
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stock_transfer_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transfer_id INTEGER NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      unit_name TEXT NOT NULL,
      conversion_factor REAL NOT NULL DEFAULT 1,
      quantity REAL NOT NULL,
      quantity_base REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      address TEXT DEFAULT '',
      price_tier TEXT NOT NULL DEFAULT 'retail' CHECK(price_tier IN ('retail','plumber','wholesale')),
      opening_balance REAL NOT NULL DEFAULT 0,
      balance REAL NOT NULL DEFAULT 0,
      is_walkin INTEGER NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plumbers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      area TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      company TEXT DEFAULT '',
      address TEXT DEFAULT '',
      opening_balance REAL NOT NULL DEFAULT 0,
      balance REAL NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS treasury_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      account_type TEXT NOT NULL CHECK(account_type IN ('cashier_safe','main_safe','bank','instapay','e_wallet')),
      balance REAL NOT NULL DEFAULT 0,
      is_default_pos INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sales_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no TEXT UNIQUE NOT NULL,
      invoice_date TEXT NOT NULL,
      warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      plumber_id INTEGER REFERENCES plumbers(id),
      price_tier TEXT NOT NULL DEFAULT 'retail',
      subtotal REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      vat_enabled INTEGER NOT NULL DEFAULT 0,
      vat_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      remaining_amount REAL NOT NULL DEFAULT 0,
      treasury_account_id INTEGER REFERENCES treasury_accounts(id),
      status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('completed','voided')),
      notes TEXT DEFAULT '',
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sales_invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      product_name TEXT NOT NULL,
      unit_id INTEGER,
      unit_name TEXT NOT NULL,
      conversion_factor REAL NOT NULL DEFAULT 1,
      quantity REAL NOT NULL,
      returned_qty REAL NOT NULL DEFAULT 0,
      unit_price REAL NOT NULL,
      discount_amount REAL NOT NULL DEFAULT 0,
      vat_rate REAL NOT NULL DEFAULT 0,
      vat_amount REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL,
      unit_cost_at_sale REAL NOT NULL DEFAULT 0,
      is_kit INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sales_returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_no TEXT UNIQUE NOT NULL,
      return_date TEXT NOT NULL,
      original_invoice_id INTEGER NOT NULL REFERENCES sales_invoices(id),
      warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      plumber_id INTEGER REFERENCES plumbers(id),
      total_return_amount REAL NOT NULL DEFAULT 0,
      refund_method TEXT NOT NULL CHECK(refund_method IN ('cash','credit_note')),
      treasury_account_id INTEGER REFERENCES treasury_accounts(id),
      notes TEXT DEFAULT '',
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sales_return_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_id INTEGER NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
      original_item_id INTEGER NOT NULL REFERENCES sales_invoice_items(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      product_name TEXT NOT NULL,
      unit_name TEXT NOT NULL,
      conversion_factor REAL NOT NULL DEFAULT 1,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      vat_amount REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL,
      unit_cost_at_sale REAL NOT NULL DEFAULT 0,
      is_kit INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS purchase_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no TEXT UNIQUE NOT NULL,
      supplier_invoice_no TEXT DEFAULT '',
      invoice_date TEXT NOT NULL,
      warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
      subtotal REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      shipping_cost REAL NOT NULL DEFAULT 0,
      shipping_paid_to TEXT NOT NULL DEFAULT 'supplier' CHECK(shipping_paid_to IN ('supplier','external_cash')),
      shipping_treasury_account_id INTEGER REFERENCES treasury_accounts(id),
      vat_amount REAL NOT NULL DEFAULT 0,
      total_supplier_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      remaining_amount REAL NOT NULL DEFAULT 0,
      treasury_account_id INTEGER REFERENCES treasury_accounts(id),
      notes TEXT DEFAULT '',
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS purchase_invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      product_name TEXT NOT NULL,
      unit_id INTEGER,
      unit_name TEXT NOT NULL,
      conversion_factor REAL NOT NULL DEFAULT 1,
      quantity REAL NOT NULL,
      quantity_base REAL NOT NULL,
      returned_qty REAL NOT NULL DEFAULT 0,
      unit_cost REAL NOT NULL,
      discount_amount REAL NOT NULL DEFAULT 0,
      net_line_total REAL NOT NULL,
      allocated_shipping_total REAL NOT NULL DEFAULT 0,
      effective_unit_cost_base REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS purchase_returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_no TEXT UNIQUE NOT NULL,
      return_date TEXT NOT NULL,
      warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
      purchase_invoice_id INTEGER REFERENCES purchase_invoices(id),
      total_amount REAL NOT NULL DEFAULT 0,
      settlement_method TEXT NOT NULL DEFAULT 'credit_note' CHECK(settlement_method IN ('credit_note','cash_refund')),
      treasury_account_id INTEGER REFERENCES treasury_accounts(id),
      reason TEXT DEFAULT 'تالف',
      notes TEXT DEFAULT '',
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS purchase_return_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_id INTEGER NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
      purchase_item_id INTEGER REFERENCES purchase_invoice_items(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      product_name TEXT NOT NULL,
      unit_name TEXT NOT NULL,
      conversion_factor REAL NOT NULL DEFAULT 1,
      quantity REAL NOT NULL,
      unit_cost REAL NOT NULL,
      line_total REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS treasury_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES treasury_accounts(id),
      tx_type TEXT NOT NULL CHECK(tx_type IN ('opening','sale_receipt','customer_payment','sale_refund','purchase_payment','shipping_payment','purchase_refund','supplier_payment','check_clear','expense','transfer_in','transfer_out','sale_void_reversal')),
      amount_delta REAL NOT NULL,
      tx_date TEXT NOT NULL,
      reference_type TEXT,
      reference_id INTEGER,
      description TEXT DEFAULT '',
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS supplier_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      check_no TEXT NOT NULL,
      bank_name TEXT NOT NULL,
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
      treasury_account_id INTEGER REFERENCES treasury_accounts(id),
      amount REAL NOT NULL,
      issue_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','cleared','bounced','cancelled')),
      cleared_at TEXT,
      notes TEXT DEFAULT '',
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_date TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      treasury_account_id INTEGER NOT NULL REFERENCES treasury_accounts(id),
      description TEXT DEFAULT '',
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_product_units_barcode ON product_units(barcode);
    CREATE INDEX IF NOT EXISTS idx_product_units_product ON product_units(product_id);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_prod_wh ON stock_movements(product_id, warehouse_id);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock_movements(created_at);
    CREATE INDEX IF NOT EXISTS idx_sales_invoices_date ON sales_invoices(invoice_date);
    CREATE INDEX IF NOT EXISTS idx_sales_invoices_customer ON sales_invoices(customer_id);
    CREATE INDEX IF NOT EXISTS idx_sales_invoices_plumber ON sales_invoices(plumber_id);
    CREATE INDEX IF NOT EXISTS idx_sales_returns_date ON sales_returns(return_date);
    CREATE INDEX IF NOT EXISTS idx_sales_returns_orig ON sales_returns(original_invoice_id);
    CREATE INDEX IF NOT EXISTS idx_purchase_invoices_date ON purchase_invoices(invoice_date);
    CREATE INDEX IF NOT EXISTS idx_purchase_invoices_supplier ON purchase_invoices(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_treasury_tx_date ON treasury_transactions(tx_date);
    CREATE INDEX IF NOT EXISTS idx_treasury_tx_account ON treasury_transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_supplier_checks_due ON supplier_checks(due_date, status);
    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
  `);
}

export function getDb(): DatabaseSync {
  if (!dbInstance) {
    const dbPath = getDbPath();
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.mkdirSync(getBackupsDir(), { recursive: true });
    dbInstance = new DatabaseSync(dbPath);
    initDatabase(dbInstance);
  }
  return dbInstance;
}

export function closeDb(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // ignore close errors
    }
    dbInstance = null;
    inTransaction = false;
  }
}

export function reopenDb(): DatabaseSync {
  closeDb();
  return getDb();
}

export function withTransaction<T>(fn: (db: DatabaseSync) => T): T {
  const db = getDb();
  if (inTransaction) {
    throw new Error('Nested transaction attempted');
  }
  inTransaction = true;
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn(db);
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    throw err;
  } finally {
    inTransaction = false;
  }
}

export function getSetting(db: DatabaseSync, key: string, fallback = ''): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row ? row.value : fallback;
}

export function setSetting(db: DatabaseSync, key: string, value: string): void {
  db.prepare(
    'INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}
