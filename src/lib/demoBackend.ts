import type {
  AuthUser,
  Customer,
  Plumber,
  PriceTier,
  Product,
  ProductKitItem,
  ProductUnit,
  SalesInvoice,
  SalesInvoiceItem,
  SalesReturn,
  Supplier,
  SupplierCheck,
  TreasuryAccount,
  UserRole,
  Warehouse,
} from '../types';
import { todayIso } from '../utils/format';

export const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';

const DEMO_STORAGE_KEY = 'bahnasawy_erp_web_demo_v1';

interface DemoUserRecord extends AuthUser {
  password: string;
  is_active: number;
  created_at: string;
}

interface DemoProductRecord {
  id: number;
  sku: string;
  name: string;
  category: string;
  brand: string;
  size: string;
  color: string;
  base_unit_name: string;
  is_kit: boolean;
  last_purchase_cost: number;
  min_stock: number;
  vat_rate: number | null;
  notes: string;
  is_active: boolean;
  units: (ProductUnit & { id: number; product_id: number })[];
  kit_items: ProductKitItem[];
}

interface DemoStockMovement {
  id: number;
  warehouse_id: number;
  product_id: number;
  movement_type: string;
  quantity_delta: number;
  unit_cost: number;
  reference_type: string | null;
  reference_id: number | null;
  notes: string;
  created_by: number;
  created_at: string;
}

interface DemoTransfer {
  id: number;
  transfer_no: string;
  transfer_date: string;
  from_warehouse_id: number;
  to_warehouse_id: number;
  notes: string;
  created_by: number;
  created_at: string;
  items: {
    product_id: number;
    product_name: string;
    unit_name: string;
    conversion_factor: number;
    quantity: number;
    quantity_base: number;
  }[];
}

interface DemoPurchaseInvoice {
  id: number;
  invoice_no: string;
  supplier_invoice_no: string;
  invoice_date: string;
  warehouse_id: number;
  supplier_id: number;
  subtotal: number;
  discount_amount: number;
  shipping_cost: number;
  shipping_paid_to: 'supplier' | 'external_cash';
  shipping_treasury_account_id: number | null;
  vat_amount: number;
  total_supplier_amount: number;
  paid_amount: number;
  remaining_amount: number;
  treasury_account_id: number | null;
  notes: string;
  created_by: number;
  created_at: string;
  items: {
    id: number;
    product_id: number;
    product_name: string;
    unit_id: number | null;
    unit_name: string;
    conversion_factor: number;
    quantity: number;
    quantity_base: number;
    returned_qty: number;
    unit_cost: number;
    discount_amount: number;
    net_line_total: number;
    allocated_shipping_total: number;
    effective_unit_cost_base: number;
  }[];
}

interface DemoPurchaseReturn {
  id: number;
  return_no: string;
  return_date: string;
  warehouse_id: number;
  supplier_id: number;
  purchase_invoice_id: number | null;
  total_amount: number;
  settlement_method: 'credit_note' | 'cash_refund';
  treasury_account_id: number | null;
  reason: string;
  notes: string;
  created_by: number;
  created_at: string;
  items: {
    product_id: number;
    product_name: string;
    unit_name: string;
    conversion_factor: number;
    quantity: number;
    unit_cost: number;
    line_total: number;
  }[];
}

interface DemoTreasuryTx {
  id: number;
  account_id: number;
  tx_type: string;
  amount_delta: number;
  tx_date: string;
  reference_type: string | null;
  reference_id: number | null;
  description: string;
  created_by: number;
  created_at: string;
}

interface DemoExpense {
  id: number;
  expense_date: string;
  category: string;
  amount: number;
  treasury_account_id: number;
  description: string;
  created_by: number;
  created_at: string;
}

interface DemoBackupEntry {
  filename: string;
  size: number;
  created_at: string;
  snapshot_json: string;
}

interface DemoSalesReturnRecord extends SalesReturn {
  treasury_account_id?: number | null;
  items: {
    id: number;
    return_id: number;
    original_item_id: number;
    product_id: number;
    product_name: string;
    unit_name: string;
    conversion_factor: number;
    quantity: number;
    unit_price: number;
    vat_amount: number;
    line_total: number;
    unit_cost_at_sale: number;
    is_kit: number;
  }[];
}

interface DemoDb {
  seq: number;
  settings: Record<string, string>;
  users: DemoUserRecord[];
  warehouses: Warehouse[];
  products: DemoProductRecord[];
  warehouse_stock: Record<string, number>;
  stock_movements: DemoStockMovement[];
  stock_transfers: DemoTransfer[];
  customers: Customer[];
  plumbers: Plumber[];
  suppliers: Supplier[];
  treasury_accounts: TreasuryAccount[];
  sales_invoices: (SalesInvoice & { created_by: number })[];
  sales_invoice_items: SalesInvoiceItem[];
  sales_returns: DemoSalesReturnRecord[];
  purchase_invoices: DemoPurchaseInvoice[];
  purchase_returns: DemoPurchaseReturn[];
  treasury_transactions: DemoTreasuryTx[];
  supplier_checks: (SupplierCheck & { created_by: number; created_at: string })[];
  expenses: DemoExpense[];
  backups: DemoBackupEntry[];
}

function roundMoney(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round((v + Number.EPSILON) * 100) / 100 : 0;
}

function roundQty(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round((v + Number.EPSILON) * 10000) / 10000 : 0;
}

function roundCost(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round((v + Number.EPSILON) * 10000) / 10000 : 0;
}

function nowSql(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

class DemoHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function createInitialDemoDb(): DemoDb {
  const today = todayIso();
  const now = nowSql();

  const db: DemoDb = {
    seq: 200,
    settings: {
      store_name: 'متجر البهنساوي للأدوات الصحية والسباكة',
      owner_name: 'إبراهيم البهنساوي',
      store_phone: '01020494954',
      store_address: 'مصر — أدوات صحية وسباكة وتأسيس وتشطيب',
      vat_enabled: 'false',
      default_vat_rate: '14',
      default_print_size: '80mm',
      auto_backup_enabled: 'true',
      secondary_backup_path: '',
      backup_retention_days: '30',
      invoice_footer_note:
        'شكراً لتعاملكم مع متجر البهنساوي — البضاعة المباعة ترد وتستبدل خلال 14 يوماً بحالتها الأصلية.',
      last_backup_at: '',
    },
    users: [
      {
        id: 1,
        username: 'admin',
        password: 'admin123',
        full_name: 'إبراهيم البهنساوي (المدير)',
        role: 'admin',
        is_active: 1,
        created_at: now,
      },
      {
        id: 2,
        username: 'cashier',
        password: '1234',
        full_name: 'كاشير المتجر',
        role: 'cashier',
        is_active: 1,
        created_at: now,
      },
      {
        id: 3,
        username: 'warehouse',
        password: '1234',
        full_name: 'أمين المخزن',
        role: 'warehouse',
        is_active: 1,
        created_at: now,
      },
    ],
    warehouses: [
      { id: 1, name: 'المخزن الرئيسي (المتجر)', location: 'صالة العرض والمحل', is_default: 1, is_active: 1 },
      { id: 2, name: 'المخزن الفرعي', location: 'المخزن الخلفي / الجملة', is_default: 0, is_active: 1 },
    ],
    treasury_accounts: [
      { id: 1, name: 'خزنة الكاشير اليومية', account_type: 'cashier_safe', balance: 2350, is_default_pos: 1 },
      { id: 2, name: 'الخزنة الرئيسية', account_type: 'main_safe', balance: 35000, is_default_pos: 0 },
      { id: 3, name: 'الحساب البنكي / إنستاباي', account_type: 'instapay', balance: 18000, is_default_pos: 0 },
      { id: 4, name: 'محفظة إلكترونية (فودافون كاش)', account_type: 'e_wallet', balance: 4500, is_default_pos: 0 },
    ],
    customers: [
      {
        id: 1,
        name: 'عميل نقدي',
        phone: '',
        address: '',
        price_tier: 'retail',
        opening_balance: 0,
        balance: 0,
        is_walkin: 1,
        notes: 'العميل الافتراضي للبيع الفوري',
        is_active: 1,
        created_at: now,
      },
      {
        id: 2,
        name: 'م. كريم عبد الله',
        phone: '01011223344',
        address: 'مدينة نصر - عمارة 14',
        price_tier: 'retail',
        opening_balance: 0,
        balance: 0,
        is_walkin: 0,
        notes: 'تشطيب شقتين',
        is_active: 1,
        created_at: now,
      },
      {
        id: 3,
        name: 'شركة الفتح للمقاولات',
        phone: '01122334455',
        address: 'التجمع الخامس',
        price_tier: 'wholesale',
        opening_balance: 2400,
        balance: 2400,
        is_walkin: 0,
        notes: 'عميل جملة ومشاريع',
        is_active: 1,
        created_at: now,
      },
    ],
    plumbers: [
      { id: 1, name: 'أحمد حسن (سباك)', phone: '01099887766', area: 'الحي العاشر والمناطق المجاورة', notes: 'تأسيس وتشطيب', is_active: 1 },
      { id: 2, name: 'محمود السيد (فني صحي)', phone: '01233445566', area: 'وسط البلد', notes: 'فني سباكة معتمد', is_active: 1 },
    ],
    suppliers: [
      {
        id: 1,
        name: 'الحاج طارق الشريف',
        phone: '01055667788',
        company: 'الشريف للتجارة والتوريدات',
        address: 'السبتية - القاهرة',
        opening_balance: 5000,
        balance: 5000,
        notes: 'مورد مواسير ولوازم تأسيس',
      },
      {
        id: 2,
        name: 'م. هشام كامل',
        phone: '01144556677',
        company: 'المتحدة للأدوات الصحية',
        address: 'العاشر من رمضان',
        opening_balance: 0,
        balance: 0,
        notes: 'خلاطات وأطقم صيني',
      },
    ],
    products: [
      {
        id: 1,
        sku: 'SKU-0001',
        name: 'خلاط حوض مطبخ شجرة',
        category: 'خلاطات',
        brand: 'أيديال ستاندرد',
        size: 'ستاندرد',
        color: 'كروم',
        base_unit_name: 'قطعة',
        is_kit: false,
        last_purchase_cost: 1450,
        min_stock: 3,
        vat_rate: null,
        notes: 'ضمان 5 سنوات من الوكيل',
        is_active: true,
        units: [{ id: 1, product_id: 1, unit_name: 'قطعة', conversion_factor: 1, barcode: '622000000001', retail_price: 1950, plumber_price: 1800, wholesale_price: 1700, is_base: 1 }],
        kit_items: [],
      },
      {
        id: 2,
        sku: 'SKU-0002',
        name: 'حوض حمام بعمود 60 سم',
        category: 'أطقم صيني',
        brand: 'ديورافيت',
        size: '60 سم',
        color: 'أبيض',
        base_unit_name: 'قطعة',
        is_kit: false,
        last_purchase_cost: 1800,
        min_stock: 3,
        vat_rate: null,
        notes: '',
        is_active: true,
        units: [{ id: 2, product_id: 2, unit_name: 'قطعة', conversion_factor: 1, barcode: '622000000002', retail_price: 2400, plumber_price: 2250, wholesale_price: 2100, is_base: 1 }],
        kit_items: [],
      },
      {
        id: 3,
        sku: 'SKU-0003',
        name: 'سيفون حوض استانلس سوستة',
        category: 'لوازم سباكة',
        brand: 'الشريف',
        size: '1.5 بوصة',
        color: 'فضي',
        base_unit_name: 'قطعة',
        is_kit: false,
        last_purchase_cost: 75,
        min_stock: 10,
        vat_rate: null,
        notes: '',
        is_active: true,
        units: [{ id: 3, product_id: 3, unit_name: 'قطعة', conversion_factor: 1, barcode: '622000000003', retail_price: 110, plumber_price: 95, wholesale_price: 90, is_base: 1 }],
        kit_items: [],
      },
      {
        id: 4,
        sku: 'SKU-0004',
        name: 'محبس زاوية كروم ثقيل',
        category: 'محابس',
        brand: 'جروهي',
        size: '1/2 بوصة',
        color: 'كروم',
        base_unit_name: 'قطعة',
        is_kit: false,
        last_purchase_cost: 115,
        min_stock: 24,
        vat_rate: null,
        notes: 'قلب نحاس أصلي',
        is_active: true,
        units: [
          { id: 4, product_id: 4, unit_name: 'قطعة', conversion_factor: 1, barcode: '622000000004', retail_price: 155, plumber_price: 140, wholesale_price: 130, is_base: 1 },
          { id: 5, product_id: 4, unit_name: 'دستة (12)', conversion_factor: 12, barcode: '622000000005', retail_price: 1800, plumber_price: 1650, wholesale_price: 1520, is_base: 0 },
          { id: 6, product_id: 4, unit_name: 'كرتونة (48)', conversion_factor: 48, barcode: '622000000006', retail_price: 7000, plumber_price: 6400, wholesale_price: 5950, is_base: 0 },
        ],
        kit_items: [],
      },
      {
        id: 5,
        sku: 'SKU-0005',
        name: 'وصلة مياه مرنة استانلس 50 سم',
        category: 'وصلات',
        brand: 'المتحدة',
        size: '50 سم',
        color: 'فضي',
        base_unit_name: 'قطعة',
        is_kit: false,
        last_purchase_cost: 42,
        min_stock: 20,
        vat_rate: null,
        notes: '',
        is_active: true,
        units: [
          { id: 7, product_id: 5, unit_name: 'قطعة', conversion_factor: 1, barcode: '622000000007', retail_price: 65, plumber_price: 55, wholesale_price: 50, is_base: 1 },
          { id: 8, product_id: 5, unit_name: 'دستة (12)', conversion_factor: 12, barcode: '622000000008', retail_price: 720, plumber_price: 630, wholesale_price: 580, is_base: 0 },
        ],
        kit_items: [],
      },
      {
        id: 6,
        sku: 'SKU-0006',
        name: 'ماسورة تغذية PPR بولي أخضر',
        category: 'مواسير تغذية',
        brand: 'BR',
        size: '1/2 بوصة (20 مم)',
        color: 'أخضر',
        base_unit_name: 'متر',
        is_kit: false,
        last_purchase_cost: 28,
        min_stock: 50,
        vat_rate: null,
        notes: 'يباع بالمتر أو باللفة 50 متر',
        is_active: true,
        units: [
          { id: 9, product_id: 6, unit_name: 'متر', conversion_factor: 1, barcode: '622000000009', retail_price: 40, plumber_price: 36, wholesale_price: 33, is_base: 1 },
          { id: 10, product_id: 6, unit_name: 'لفة (50 متر)', conversion_factor: 50, barcode: '622000000010', retail_price: 1900, plumber_price: 1750, wholesale_price: 1600, is_base: 0 },
        ],
        kit_items: [],
      },
      {
        id: 7,
        sku: 'SKU-0007',
        name: 'ماسورة صرف PVC معتمد 4 بوصة',
        category: 'مواسير صرف',
        brand: 'الشريف',
        size: '4 بوصة (110 مم)',
        color: 'رمادي',
        base_unit_name: 'متر',
        is_kit: false,
        last_purchase_cost: 85,
        min_stock: 20,
        vat_rate: null,
        notes: 'عود 4 متر',
        is_active: true,
        units: [
          { id: 11, product_id: 7, unit_name: 'متر', conversion_factor: 1, barcode: '622000000011', retail_price: 115, plumber_price: 105, wholesale_price: 98, is_base: 1 },
          { id: 12, product_id: 7, unit_name: 'عود (4 متر)', conversion_factor: 4, barcode: '622000000012', retail_price: 440, plumber_price: 405, wholesale_price: 380, is_base: 0 },
        ],
        kit_items: [],
      },
      {
        id: 8,
        sku: 'SKU-0008',
        name: 'كوع لحام PPR بولي 90 درجة',
        category: 'وصلات',
        brand: 'BR',
        size: '1/2 بوصة (20 مم)',
        color: 'أخضر',
        base_unit_name: 'قطعة',
        is_kit: false,
        last_purchase_cost: 7.5,
        min_stock: 25,
        vat_rate: null,
        notes: 'تحت الحد الأدنى للتنبيه',
        is_active: true,
        units: [
          { id: 13, product_id: 8, unit_name: 'قطعة', conversion_factor: 1, barcode: '622000000013', retail_price: 12, plumber_price: 10, wholesale_price: 9, is_base: 1 },
          { id: 14, product_id: 8, unit_name: 'كيس (25)', conversion_factor: 25, barcode: '622000000014', retail_price: 280, plumber_price: 240, wholesale_price: 220, is_base: 0 },
        ],
        kit_items: [],
      },
      {
        id: 9,
        sku: 'SKU-0009',
        name: 'طقم حوض حمام كامل (حوض + خلاط + 2 وصلة + سيفون)',
        category: 'أطقم مجمعة',
        brand: 'مجمع',
        size: '60 سم',
        color: 'أبيض/كروم',
        base_unit_name: 'طقم',
        is_kit: true,
        last_purchase_cost: 1800 + 1450 + 84 + 75,
        min_stock: 0,
        vat_rate: null,
        notes: 'طقم تجميعي يخصم مكوناته تلقائياً من المخزن',
        is_active: true,
        units: [{ id: 15, product_id: 9, unit_name: 'طقم', conversion_factor: 1, barcode: '622000000015', retail_price: 4350, plumber_price: 4050, wholesale_price: 3850, is_base: 1 }],
        kit_items: [
          { component_product_id: 2, quantity_base: 1 },
          { component_product_id: 1, quantity_base: 1 },
          { component_product_id: 5, quantity_base: 2 },
          { component_product_id: 3, quantity_base: 1 },
        ],
      },
    ],
    warehouse_stock: {
      '1:1': 14,
      '1:2': 10,
      '2:2': 6,
      '1:3': 40,
      '1:4': 96,
      '2:4': 96,
      '1:5': 60,
      '1:6': 200,
      '2:6': 300,
      '1:7': 80,
      '1:8': 8,
    },
    stock_movements: [],
    stock_transfers: [],
    sales_invoices: [],
    sales_invoice_items: [],
    sales_returns: [],
    purchase_invoices: [],
    purchase_returns: [],
    treasury_transactions: [
      {
        id: 1,
        account_id: 1,
        tx_type: 'opening',
        amount_delta: 2500,
        tx_date: today,
        reference_type: 'opening',
        reference_id: null,
        description: 'رصيد افتتاحي — خزنة الكاشير',
        created_by: 1,
        created_at: now,
      },
      {
        id: 2,
        account_id: 2,
        tx_type: 'opening',
        amount_delta: 35000,
        tx_date: today,
        reference_type: 'opening',
        reference_id: null,
        description: 'رصيد افتتاحي — الخزنة الرئيسية',
        created_by: 1,
        created_at: now,
      },
      {
        id: 3,
        account_id: 1,
        tx_type: 'expense',
        amount_delta: -150,
        tx_date: today,
        reference_type: 'expense',
        reference_id: 1,
        description: 'مصروف نقل ومشال',
        created_by: 1,
        created_at: now,
      },
    ],
    supplier_checks: [
      {
        id: 1,
        check_no: 'CHK-8841',
        bank_name: 'البنك الأهلي المصري',
        supplier_id: 1,
        treasury_account_id: 2,
        amount: 3000,
        issue_date: today,
        due_date: addDays(today, 3),
        status: 'pending',
        cleared_at: null,
        notes: 'دفعة تحت حساب توريد مواسير BR',
        created_by: 1,
        created_at: now,
      },
    ],
    expenses: [
      {
        id: 1,
        expense_date: today,
        category: 'نقل ومشال',
        amount: 150,
        treasury_account_id: 1,
        description: 'نقل بضاعة من المخزن الفرعي للمحل',
        created_by: 1,
        created_at: now,
      },
    ],
    backups: [],
  };

  return db;
}

function loadDemoDb(): DemoDb {
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as DemoDb;
    }
  } catch {
    // ignore corrupted storage
  }
  const initial = createInitialDemoDb();
  saveDemoDb(initial);
  return initial;
}

function saveDemoDb(db: DemoDb): void {
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(db));
}

export function resetDemoData(): void {
  const initial = createInitialDemoDb();
  saveDemoDb(initial);
}

export function downloadDemoBackup(filename: string): void {
  const db = loadDemoDb();
  const found = db.backups.find((b) => b.filename === filename);
  const content = found ? found.snapshot_json : JSON.stringify(db, null, 2);
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.replace(/\.db$/, '.json');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function restoreDemoBackup(text: string): void {
  const parsed = JSON.parse(text) as DemoDb;
  if (!parsed || !Array.isArray(parsed.products) || !Array.isArray(parsed.users)) {
    throw new Error('ملف النسخة الاحتياطية غير صالح للمعاينة');
  }
  saveDemoDb(parsed);
}

function nextId(db: DemoDb): number {
  db.seq += 1;
  return db.seq;
}

function nextCode(prefix: string, existing: string[]): string {
  let num = existing.length + 1;
  const set = new Set(existing);
  while (set.has(`${prefix}-${String(num).padStart(4, '0')}`)) {
    num += 1;
  }
  return `${prefix}-${String(num).padStart(4, '0')}`;
}

function signDemoToken(user: DemoUserRecord): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify({ uid: user.id, role: user.role }))));
}

function parseDemoUser(db: DemoDb, token: string): DemoUserRecord {
  if (!token) throw new DemoHttpError(401, 'يجب تسجيل الدخول أولاً');
  try {
    const payload = JSON.parse(decodeURIComponent(escape(atob(token)))) as { uid: number };
    const u = db.users.find((x) => x.id === payload.uid && x.is_active === 1);
    if (!u) throw new DemoHttpError(401, 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً');
    return u;
  } catch (err) {
    if (err instanceof DemoHttpError) throw err;
    throw new DemoHttpError(401, 'انتهت صلاحية الجلسة');
  }
}

function requireRoles(user: DemoUserRecord, ...roles: UserRole[]) {
  if (!roles.includes(user.role)) {
    throw new DemoHttpError(403, 'ليست لديك صلاحية لتنفيذ هذا الإجراء');
  }
}

function getStock(db: DemoDb, whId: number, prodId: number): number {
  return roundQty(db.warehouse_stock[`${whId}:${prodId}`] ?? 0);
}

function addStock(
  db: DemoDb,
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
) {
  const key = `${params.warehouseId}:${params.productId}`;
  db.warehouse_stock[key] = roundQty((db.warehouse_stock[key] ?? 0) + params.deltaBase);
  db.stock_movements.unshift({
    id: nextId(db),
    warehouse_id: params.warehouseId,
    product_id: params.productId,
    movement_type: params.movementType,
    quantity_delta: roundQty(params.deltaBase),
    unit_cost: roundCost(params.unitCost),
    reference_type: params.referenceType ?? null,
    reference_id: params.referenceId ?? null,
    notes: params.notes ?? '',
    created_by: params.userId,
    created_at: nowSql(),
  });
}

function hydrateProduct(db: DemoDb, p: DemoProductRecord, includeCost: boolean): Product {
  const activeWhs = db.warehouses.filter((w) => w.is_active === 1);
  const stockByWh: Record<number, number> = {};
  let total = 0;

  if (p.is_kit) {
    for (const wh of activeWhs) {
      if (p.kit_items.length === 0) {
        stockByWh[wh.id] = 0;
      } else {
        let minKits = Infinity;
        for (const ki of p.kit_items) {
          const avail = getStock(db, wh.id, ki.component_product_id);
          minKits = Math.min(minKits, Math.floor(avail / (ki.quantity_base || 1)));
        }
        const q = Number.isFinite(minKits) ? Math.max(0, minKits) : 0;
        stockByWh[wh.id] = q;
        total += q;
      }
    }
  } else {
    for (const wh of activeWhs) {
      const q = getStock(db, wh.id, p.id);
      stockByWh[wh.id] = q;
      total = roundQty(total + q);
    }
  }

  const kitItems = p.kit_items.map((ki) => {
    const comp = db.products.find((x) => x.id === ki.component_product_id);
    return {
      ...ki,
      component_name: comp?.name || '',
      component_unit: comp?.base_unit_name || '',
      ...(includeCost ? { component_cost: comp?.last_purchase_cost ?? 0 } : {}),
    };
  });

  const out: Product = {
    id: p.id,
    sku: p.sku,
    name: p.name,
    category: p.category,
    brand: p.brand,
    size: p.size,
    color: p.color,
    base_unit_name: p.base_unit_name,
    is_kit: p.is_kit,
    min_stock: p.min_stock,
    vat_rate: p.vat_rate,
    notes: p.notes,
    is_active: p.is_active,
    units: p.units,
    kit_items: kitItems,
    stock_by_warehouse: stockByWh,
    total_stock: total,
  };
  if (includeCost) out.last_purchase_cost = p.last_purchase_cost;
  return out;
}

export async function handleDemoRequest<T = unknown>(
  url: string,
  options: RequestInit,
  token: string
): Promise<T> {
  const db = loadDemoDb();
  const method = (options.method || 'GET').toUpperCase();
  const parsedUrl = new URL(url, 'http://demo.local');
  const pathname = parsedUrl.pathname;
  const qs = parsedUrl.searchParams;
  const body =
    typeof options.body === 'string' && options.body ? (JSON.parse(options.body) as Record<string, any>) : {};

  // Public auth login
  if (pathname === '/api/auth/login' && method === 'POST') {
    const uname = String(body.username || '').trim();
    const pwd = String(body.password || '');
    const u = db.users.find((x) => x.username === uname && x.password === pwd);
    if (!u) throw new DemoHttpError(401, 'اسم المستخدم أو كلمة المرور غير صحيحة');
    if (u.is_active !== 1) throw new DemoHttpError(403, 'تم تعطيل هذا الحساب، يرجى مراجعة المدير');
    const authUser: AuthUser = { id: u.id, username: u.username, full_name: u.full_name, role: u.role };
    return { token: signDemoToken(u), user: authUser } as T;
  }

  const user = parseDemoUser(db, token);
  const includeCost = user.role !== 'cashier';

  // AUTH
  if (pathname === '/api/auth/me' && method === 'GET') {
    return { user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role } } as T;
  }
  if (pathname === '/api/auth/users' && method === 'GET') {
    requireRoles(user, 'admin');
    return {
      users: db.users.map(({ password: _p, ...u }) => u),
    } as T;
  }
  if (pathname === '/api/auth/users' && method === 'POST') {
    requireRoles(user, 'admin');
    const uname = String(body.username || '').trim();
    if (!uname || String(body.password || '').length < 4 || !String(body.full_name || '').trim()) {
      throw new DemoHttpError(400, 'بيانات المستخدم غير مكتملة');
    }
    if (db.users.some((u) => u.username === uname)) {
      throw new DemoHttpError(409, 'اسم المستخدم مسجل بالفعل');
    }
    const created: DemoUserRecord = {
      id: nextId(db),
      username: uname,
      password: String(body.password),
      full_name: String(body.full_name).trim(),
      role: body.role || 'cashier',
      is_active: 1,
      created_at: nowSql(),
    };
    db.users.push(created);
    saveDemoDb(db);
    const { password: _p, ...safe } = created;
    return { user: safe } as T;
  }
  if (pathname.startsWith('/api/auth/users/') && method === 'PUT') {
    requireRoles(user, 'admin');
    const id = Number(pathname.split('/').pop());
    const target = db.users.find((u) => u.id === id);
    if (!target) throw new DemoHttpError(404, 'المستخدم غير موجود');
    if (typeof body.full_name === 'string' && body.full_name.trim()) target.full_name = body.full_name.trim();
    if (['admin', 'cashier', 'warehouse'].includes(body.role)) target.role = body.role;
    if (typeof body.is_active === 'boolean') target.is_active = body.is_active ? 1 : 0;
    if (typeof body.password === 'string' && body.password.length >= 4) target.password = body.password;
    saveDemoDb(db);
    const { password: _p, ...safe } = target;
    return { user: safe } as T;
  }

  // SETTINGS
  if (pathname === '/api/settings' && method === 'GET') {
    const out = { ...db.settings };
    if (user.role !== 'admin') {
      delete out.secondary_backup_path;
      delete out.backup_retention_days;
    }
    return { settings: out } as T;
  }
  if (pathname === '/api/settings' && method === 'PUT') {
    requireRoles(user, 'admin');
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined && v !== null) db.settings[k] = String(v);
    }
    saveDemoDb(db);
    return { settings: db.settings } as T;
  }

  // PRODUCTS
  if (pathname === '/api/products/filters' && method === 'GET') {
    const active = db.products.filter((p) => p.is_active);
    return {
      categories: Array.from(new Set(active.map((p) => p.category).filter(Boolean))).sort(),
      brands: Array.from(new Set(active.map((p) => p.brand).filter(Boolean))).sort(),
      sizes: Array.from(new Set(active.map((p) => p.size).filter(Boolean))).sort(),
    } as T;
  }
  if (pathname.startsWith('/api/products/barcode/') && method === 'GET') {
    const code = decodeURIComponent(pathname.replace('/api/products/barcode/', '')).trim();
    for (const p of db.products) {
      if (!p.is_active) continue;
      const unit = p.units.find((u) => u.barcode === code);
      if (unit) return { product: hydrateProduct(db, p, includeCost), matched_unit_id: unit.id } as T;
      if (p.sku === code) {
        const base = p.units.find((u) => Boolean(u.is_base)) || p.units[0];
        return { product: hydrateProduct(db, p, includeCost), matched_unit_id: base?.id ?? null } as T;
      }
    }
    throw new DemoHttpError(404, `لم يتم العثور على صنف بالباركود: ${code}`);
  }
  if (pathname === '/api/products' && method === 'GET') {
    const q = (qs.get('q') || '').trim().toLowerCase();
    const cat = (qs.get('category') || '').trim();
    const brand = (qs.get('brand') || '').trim();
    const size = (qs.get('size') || '').trim();
    const lowOnly = qs.get('low_stock_only') === 'true';

    let list = db.products.filter((p) => p.is_active);
    if (cat) list = list.filter((p) => p.category === cat);
    if (brand) list = list.filter((p) => p.brand === brand);
    if (size) list = list.filter((p) => p.size === size);
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          p.size.toLowerCase().includes(q) ||
          p.color.toLowerCase().includes(q) ||
          p.units.some((u) => u.barcode.toLowerCase().includes(q))
      );
    }
    let hydrated = list.map((p) => hydrateProduct(db, p, includeCost)).reverse();
    if (lowOnly) {
      hydrated = hydrated.filter((p) => !p.is_kit && p.total_stock <= p.min_stock);
    }
    return { products: hydrated } as T;
  }
  if (pathname === '/api/products' && method === 'POST') {
    requireRoles(user, 'admin', 'warehouse');
    const name = String(body.name || '').trim();
    if (!name) throw new DemoHttpError(400, 'يرجى إدخال اسم الصنف');
    const pid = nextId(db);
    const sku = String(body.sku || '').trim() || nextCode('SKU', db.products.map((x) => x.sku));
    const isKit = Boolean(body.is_kit);
    let lastCost = roundCost(body.last_purchase_cost ?? 0);
    const kitItems: ProductKitItem[] = Array.isArray(body.kit_items) ? body.kit_items : [];
    if (isKit) {
      lastCost = roundCost(
        kitItems.reduce((sum, ki) => {
          const comp = db.products.find((c) => c.id === Number(ki.component_product_id));
          return sum + (comp ? comp.last_purchase_cost * Number(ki.quantity_base || 1) : 0);
        }, 0)
      );
    }
    const rawUnits = Array.isArray(body.units) ? body.units : [];
    const units = rawUnits.map((u: any, idx: number) => ({
      id: nextId(db),
      product_id: pid,
      unit_name: String(u.unit_name || body.base_unit_name || 'قطعة'),
      conversion_factor: idx === 0 ? 1 : roundQty(u.conversion_factor || 1),
      barcode: String(u.barcode || '').trim() || `622000${String(nextId(db)).padStart(6, '0')}`,
      retail_price: roundMoney(u.retail_price),
      plumber_price: roundMoney(u.plumber_price),
      wholesale_price: roundMoney(u.wholesale_price),
      is_base: idx === 0 ? 1 : 0,
    }));

    const prod: DemoProductRecord = {
      id: pid,
      sku,
      name,
      category: String(body.category || 'عام'),
      brand: String(body.brand || ''),
      size: String(body.size || ''),
      color: String(body.color || ''),
      base_unit_name: String(body.base_unit_name || (isKit ? 'طقم' : 'قطعة')),
      is_kit: isKit,
      last_purchase_cost: lastCost,
      min_stock: roundQty(body.min_stock ?? 5),
      vat_rate: body.vat_rate !== undefined && body.vat_rate !== null && body.vat_rate !== '' ? Number(body.vat_rate) : null,
      notes: String(body.notes || ''),
      is_active: true,
      units,
      kit_items: isKit ? kitItems : [],
    };
    db.products.push(prod);
    const openQty = roundQty(body.opening_stock ?? 0);
    if (!isKit && openQty > 0) {
      addStock(db, {
        warehouseId: Number(body.opening_warehouse_id || 1),
        productId: pid,
        deltaBase: openQty,
        movementType: 'opening',
        unitCost: lastCost,
        referenceType: 'opening',
        referenceId: pid,
        notes: 'رصيد افتتاحي عند إضافة الصنف',
        userId: user.id,
      });
    }
    saveDemoDb(db);
    return { product: hydrateProduct(db, prod, true) } as T;
  }
  if (pathname.startsWith('/api/products/') && method === 'PUT') {
    requireRoles(user, 'admin', 'warehouse');
    const id = Number(pathname.split('/').pop());
    const prod = db.products.find((p) => p.id === id);
    if (!prod) throw new DemoHttpError(404, 'الصنف غير موجود');
    prod.name = String(body.name || prod.name).trim();
    if (body.sku) prod.sku = String(body.sku).trim();
    prod.category = String(body.category || prod.category);
    prod.brand = String(body.brand ?? prod.brand);
    prod.size = String(body.size ?? prod.size);
    prod.color = String(body.color ?? prod.color);
    prod.base_unit_name = String(body.base_unit_name || prod.base_unit_name);
    prod.is_kit = body.is_kit !== undefined ? Boolean(body.is_kit) : prod.is_kit;
    prod.min_stock = roundQty(body.min_stock ?? prod.min_stock);
    prod.notes = String(body.notes ?? prod.notes);
    if (Array.isArray(body.units)) {
      prod.units = body.units.map((u: any, idx: number) => ({
        id: u.id || nextId(db),
        product_id: prod.id,
        unit_name: String(u.unit_name || prod.base_unit_name),
        conversion_factor: idx === 0 ? 1 : roundQty(u.conversion_factor || 1),
        barcode: String(u.barcode || '').trim() || `622000${String(nextId(db)).padStart(6, '0')}`,
        retail_price: roundMoney(u.retail_price),
        plumber_price: roundMoney(u.plumber_price),
        wholesale_price: roundMoney(u.wholesale_price),
        is_base: idx === 0 ? 1 : 0,
      }));
    }
    if (prod.is_kit && Array.isArray(body.kit_items)) {
      prod.kit_items = body.kit_items;
      prod.last_purchase_cost = roundCost(
        prod.kit_items.reduce((sum, ki) => {
          const comp = db.products.find((c) => c.id === Number(ki.component_product_id));
          return sum + (comp ? comp.last_purchase_cost * Number(ki.quantity_base || 1) : 0);
        }, 0)
      );
    } else if (body.last_purchase_cost !== undefined) {
      prod.last_purchase_cost = roundCost(body.last_purchase_cost);
    }
    saveDemoDb(db);
    return { product: hydrateProduct(db, prod, true) } as T;
  }
  if (pathname.startsWith('/api/products/') && method === 'DELETE') {
    requireRoles(user, 'admin', 'warehouse');
    const id = Number(pathname.split('/').pop());
    const prod = db.products.find((p) => p.id === id);
    if (prod) prod.is_active = false;
    saveDemoDb(db);
    return { ok: true } as T;
  }

  // WAREHOUSES
  if (pathname === '/api/warehouses' && method === 'GET') {
    const warehouses = db.warehouses
      .filter((w) => w.is_active === 1)
      .map((w) => {
        let activeItems = 0;
        let totalUnits = 0;
        for (const p of db.products) {
          if (!p.is_active || p.is_kit) continue;
          const q = getStock(db, w.id, p.id);
          if (q > 0) activeItems += 1;
          totalUnits = roundQty(totalUnits + q);
        }
        return { ...w, active_items_count: activeItems, total_units_count: totalUnits };
      });
    return { warehouses } as T;
  }
  if (pathname === '/api/warehouses' && method === 'POST') {
    requireRoles(user, 'admin', 'warehouse');
    const name = String(body.name || '').trim();
    if (!name) throw new DemoHttpError(400, 'يرجى إدخال اسم المخزن');
    const wh: Warehouse = {
      id: nextId(db),
      name,
      location: String(body.location || ''),
      is_default: body.is_default ? 1 : 0,
      is_active: 1,
    };
    if (wh.is_default === 1) db.warehouses.forEach((w) => (w.is_default = 0));
    db.warehouses.push(wh);
    saveDemoDb(db);
    return { warehouse: wh } as T;
  }
  if (pathname === '/api/warehouses/movements' && method === 'GET') {
    const rows = db.stock_movements.slice(0, 120).map((m) => {
      const wh = db.warehouses.find((w) => w.id === m.warehouse_id);
      const p = db.products.find((pr) => pr.id === m.product_id);
      const u = db.users.find((usr) => usr.id === m.created_by);
      return {
        ...m,
        warehouse_name: wh?.name || '',
        product_name: p?.name || '',
        base_unit_name: p?.base_unit_name || '',
        user_name: u?.full_name || '',
      };
    });
    return { movements: rows } as T;
  }
  if (pathname === '/api/warehouses/transfers' && method === 'GET') {
    const transfers = db.stock_transfers.map((t) => ({
      ...t,
      from_warehouse_name: db.warehouses.find((w) => w.id === t.from_warehouse_id)?.name || '',
      to_warehouse_name: db.warehouses.find((w) => w.id === t.to_warehouse_id)?.name || '',
    }));
    return { transfers } as T;
  }
  if (pathname === '/api/warehouses/transfers' && method === 'POST') {
    requireRoles(user, 'admin', 'warehouse');
    const fromId = Number(body.from_warehouse_id);
    const toId = Number(body.to_warehouse_id);
    if (!fromId || !toId || fromId === toId) throw new DemoHttpError(400, 'اختر مخزنين مختلفين');
    const fromWh = db.warehouses.find((w) => w.id === fromId);
    const toWh = db.warehouses.find((w) => w.id === toId);
    if (!fromWh || !toWh) throw new DemoHttpError(404, 'المخزن غير موجود');

    const trNo = nextCode('TRF', db.stock_transfers.map((x) => x.transfer_no));
    const trId = nextId(db);
    const trItems: DemoTransfer['items'] = [];

    for (const item of body.items || []) {
      const p = db.products.find((pr) => pr.id === Number(item.product_id));
      if (!p || p.is_kit) throw new DemoHttpError(400, 'الصنف غير صالح للتحويل');
      const u = p.units.find((un) => un.id === Number(item.unit_id)) || p.units[0];
      const factor = Number(u?.conversion_factor || 1);
      const qty = roundQty(item.quantity);
      const qtyBase = roundQty(qty * factor);
      const avail = getStock(db, fromId, p.id);
      if (avail < qtyBase) throw new DemoHttpError(400, `الرصيد المتاح من ${p.name} غير كافٍ`);

      addStock(db, {
        warehouseId: fromId,
        productId: p.id,
        deltaBase: -qtyBase,
        movementType: 'transfer_out',
        unitCost: p.last_purchase_cost,
        referenceType: 'transfer',
        referenceId: trId,
        notes: `تحويل إلى ${toWh.name} (${trNo})`,
        userId: user.id,
      });
      addStock(db, {
        warehouseId: toId,
        productId: p.id,
        deltaBase: qtyBase,
        movementType: 'transfer_in',
        unitCost: p.last_purchase_cost,
        referenceType: 'transfer',
        referenceId: trId,
        notes: `استلام تحويل من ${fromWh.name} (${trNo})`,
        userId: user.id,
      });
      trItems.push({
        product_id: p.id,
        product_name: p.name,
        unit_name: u?.unit_name || p.base_unit_name,
        conversion_factor: factor,
        quantity: qty,
        quantity_base: qtyBase,
      });
    }
    const transfer: DemoTransfer = {
      id: trId,
      transfer_no: trNo,
      transfer_date: String(body.transfer_date || todayIso()),
      from_warehouse_id: fromId,
      to_warehouse_id: toId,
      notes: String(body.notes || ''),
      created_by: user.id,
      created_at: nowSql(),
      items: trItems,
    };
    db.stock_transfers.unshift(transfer);
    saveDemoDb(db);
    return { transfer } as T;
  }
  if (pathname === '/api/warehouses/adjustments' && method === 'POST') {
    requireRoles(user, 'admin', 'warehouse');
    const whId = Number(body.warehouse_id);
    let count = 0;
    for (const item of body.items || []) {
      const pid = Number(item.product_id);
      const prod = db.products.find((p) => p.id === pid);
      if (!prod || prod.is_kit) continue;
      const counted = roundQty(item.counted_qty_base);
      const current = getStock(db, whId, pid);
      const delta = roundQty(counted - current);
      if (delta !== 0) {
        addStock(db, {
          warehouseId: whId,
          productId: pid,
          deltaBase: delta,
          movementType: 'adjustment',
          unitCost: prod.last_purchase_cost,
          referenceType: 'adjustment',
          referenceId: whId,
          notes: String(body.notes || 'تسوية جرد'),
          userId: user.id,
        });
        count += 1;
      }
    }
    saveDemoDb(db);
    return { ok: true, adjusted_count: count } as T;
  }

  // CUSTOMERS
  if (pathname === '/api/customers' && method === 'GET') {
    const q = (qs.get('q') || '').trim().toLowerCase();
    let list = db.customers.filter((c) => c.is_active === 1);
    if (q) {
      list = list.filter(
        (c) => c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.address.toLowerCase().includes(q)
      );
    }
    return { customers: list } as T;
  }
  if (pathname === '/api/customers' && method === 'POST') {
    const name = String(body.name || '').trim();
    if (!name) throw new DemoHttpError(400, 'يرجى إدخال اسم العميل');
    const openBal = roundMoney(body.opening_balance ?? 0);
    const cust: Customer = {
      id: nextId(db),
      name,
      phone: String(body.phone || ''),
      address: String(body.address || ''),
      price_tier: (['retail', 'plumber', 'wholesale'].includes(body.price_tier) ? body.price_tier : 'retail') as PriceTier,
      opening_balance: openBal,
      balance: openBal,
      is_walkin: 0,
      notes: String(body.notes || ''),
      is_active: 1,
      created_at: nowSql(),
    };
    db.customers.splice(1, 0, cust);
    saveDemoDb(db);
    return { customer: cust } as T;
  }
  if (pathname.match(/^\/api\/customers\/\d+$/) && method === 'PUT') {
    const id = Number(pathname.split('/').pop());
    const c = db.customers.find((x) => x.id === id);
    if (!c) throw new DemoHttpError(404, 'العميل غير موجود');
    if (body.name) c.name = String(body.name).trim();
    c.phone = String(body.phone ?? c.phone);
    c.address = String(body.address ?? c.address);
    if (['retail', 'plumber', 'wholesale'].includes(body.price_tier)) c.price_tier = body.price_tier;
    c.notes = String(body.notes ?? c.notes);
    saveDemoDb(db);
    return { customer: c } as T;
  }
  if (pathname.match(/^\/api\/customers\/\d+\/statement$/) && method === 'GET') {
    const id = Number(pathname.split('/')[3]);
    const cust = db.customers.find((c) => c.id === id);
    if (!cust) throw new DemoHttpError(404, 'العميل غير موجود');
    const entries: any[] = [];
    if (cust.opening_balance !== 0) {
      entries.push({
        date: cust.created_at.slice(0, 10),
        sort_at: '0000-00-00 00:00:00',
        type: 'opening',
        ref_no: 'رصيد أول المدة',
        description: 'رصيد افتتاحي مسجل للعميل',
        debit: cust.opening_balance > 0 ? cust.opening_balance : 0,
        credit: cust.opening_balance < 0 ? -cust.opening_balance : 0,
      });
    }
    for (const inv of db.sales_invoices.filter((s) => s.customer_id === id && s.status === 'completed')) {
      const plum = db.plumbers.find((p) => p.id === inv.plumber_id);
      entries.push({
        date: inv.invoice_date,
        sort_at: inv.created_at,
        type: 'sale',
        ref_no: inv.invoice_no,
        description: plum ? `فاتورة مبيعات (السباك: ${plum.name})` : 'فاتورة مبيعات',
        debit: inv.total_amount,
        credit: inv.paid_amount,
      });
    }
    for (const ret of db.sales_returns.filter((r) => r.customer_id === id)) {
      entries.push({
        date: ret.return_date,
        sort_at: ret.created_at,
        type: 'return',
        ref_no: ret.return_no,
        description: ret.refund_method === 'credit_note' ? 'مرتجع مبيعات مخصوم من الحساب' : 'مرتجع مبيعات نقدي',
        debit: 0,
        credit: ret.refund_method === 'credit_note' ? ret.total_return_amount : 0,
      });
    }
    for (const tx of db.treasury_transactions.filter(
      (t) => t.tx_type === 'customer_payment' && t.reference_id === id
    )) {
      const acc = db.treasury_accounts.find((a) => a.id === tx.account_id);
      entries.push({
        date: tx.tx_date,
        sort_at: tx.created_at,
        type: 'payment',
        ref_no: 'سند قبض',
        description: `${tx.description} (${acc?.name || ''})`,
        debit: 0,
        credit: tx.amount_delta,
      });
    }
    entries.sort((a, b) => a.sort_at.localeCompare(b.sort_at));
    let running = 0;
    for (const e of entries) {
      running = roundMoney(running + e.debit - e.credit);
      e.running_balance = running;
    }
    return { customer: cust, entries, calculated_balance: running } as T;
  }
  if (pathname.match(/^\/api\/customers\/\d+\/payments$/) && method === 'POST') {
    const id = Number(pathname.split('/')[3]);
    const cust = db.customers.find((c) => c.id === id);
    const acc = db.treasury_accounts.find((a) => a.id === Number(body.treasury_account_id));
    const amt = roundMoney(body.amount);
    if (!cust || !acc || amt <= 0) throw new DemoHttpError(400, 'بيانات التحصيل غير صالحة');
    cust.balance = roundMoney(cust.balance - amt);
    acc.balance = roundMoney(acc.balance + amt);
    db.treasury_transactions.unshift({
      id: nextId(db),
      account_id: acc.id,
      tx_type: 'customer_payment',
      amount_delta: amt,
      tx_date: String(body.payment_date || todayIso()),
      reference_type: 'customer',
      reference_id: cust.id,
      description: `تحصيل دفعة من العميل ${cust.name}`,
      created_by: user.id,
      created_at: nowSql(),
    });
    saveDemoDb(db);
    return { customer: cust } as T;
  }

  // PLUMBERS
  if (pathname === '/api/plumbers' && method === 'GET') {
    const q = (qs.get('q') || '').trim().toLowerCase();
    let list = db.plumbers.filter((p) => p.is_active === 1);
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q) || p.phone.includes(q) || p.area.includes(q));
    return {
      plumbers: list.map((p) => {
        const invs = db.sales_invoices.filter((si) => si.plumber_id === p.id && si.status === 'completed');
        return {
          ...p,
          invoices_count: invs.length,
          total_sales: roundMoney(invs.reduce((s, i) => s + i.total_amount, 0)),
        };
      }),
    } as T;
  }
  if (pathname === '/api/plumbers' && method === 'POST') {
    const name = String(body.name || '').trim();
    if (!name) throw new DemoHttpError(400, 'يرجى إدخال اسم السباك');
    const plum: Plumber = {
      id: nextId(db),
      name,
      phone: String(body.phone || ''),
      area: String(body.area || ''),
      notes: String(body.notes || ''),
      is_active: 1,
    };
    db.plumbers.unshift(plum);
    saveDemoDb(db);
    return { plumber: plum } as T;
  }
  if (pathname.match(/^\/api\/plumbers\/\d+$/) && method === 'PUT') {
    const id = Number(pathname.split('/').pop());
    const p = db.plumbers.find((x) => x.id === id);
    if (!p) throw new DemoHttpError(404, 'السباك غير موجود');
    if (body.name) p.name = String(body.name).trim();
    p.phone = String(body.phone ?? p.phone);
    p.area = String(body.area ?? p.area);
    p.notes = String(body.notes ?? p.notes);
    saveDemoDb(db);
    return { plumber: p } as T;
  }
  if (pathname.match(/^\/api\/plumbers\/\d+\/report$/) && method === 'GET') {
    const id = Number(pathname.split('/')[3]);
    const plum = db.plumbers.find((x) => x.id === id);
    if (!plum) throw new DemoHttpError(404, 'السباك غير موجود');
    const invoices = db.sales_invoices
      .filter((si) => si.plumber_id === id && si.status === 'completed')
      .map((si) => {
        const c = db.customers.find((cu) => cu.id === si.customer_id);
        const retTot = db.sales_returns
          .filter((r) => r.original_invoice_id === si.id)
          .reduce((s, r) => s + r.total_return_amount, 0);
        return {
          ...si,
          customer_name: c?.name || '',
          customer_phone: c?.phone || '',
          returned_total: roundMoney(retTot),
        };
      });
    const gross = roundMoney(invoices.reduce((s, i) => s + i.total_amount, 0));
    const rets = roundMoney(invoices.reduce((s, i) => s + i.returned_total, 0));
    return {
      plumber: plum,
      invoices,
      summary: {
        invoices_count: invoices.length,
        gross_sales: gross,
        returns_total: rets,
        net_sales: roundMoney(gross - rets),
      },
    } as T;
  }

  // SUPPLIERS
  if (pathname === '/api/suppliers' && method === 'GET') {
    const q = (qs.get('q') || '').trim().toLowerCase();
    let list = db.suppliers;
    if (q) list = list.filter((s) => s.name.toLowerCase().includes(q) || s.company.toLowerCase().includes(q));
    return {
      suppliers: list.map((s) => ({
        ...s,
        pending_checks_total: roundMoney(
          db.supplier_checks
            .filter((c) => c.supplier_id === s.id && c.status === 'pending')
            .reduce((sum, c) => sum + c.amount, 0)
        ),
      })),
    } as T;
  }
  if (pathname === '/api/suppliers' && method === 'POST') {
    requireRoles(user, 'admin', 'warehouse');
    const name = String(body.name || '').trim();
    if (!name) throw new DemoHttpError(400, 'يرجى إدخال اسم المورد');
    const openBal = roundMoney(body.opening_balance ?? 0);
    const sup: Supplier = {
      id: nextId(db),
      name,
      phone: String(body.phone || ''),
      company: String(body.company || ''),
      address: String(body.address || ''),
      opening_balance: openBal,
      balance: openBal,
      notes: String(body.notes || ''),
    };
    db.suppliers.unshift(sup);
    saveDemoDb(db);
    return { supplier: sup } as T;
  }
  if (pathname.match(/^\/api\/suppliers\/\d+$/) && method === 'PUT') {
    requireRoles(user, 'admin', 'warehouse');
    const id = Number(pathname.split('/').pop());
    const sup = db.suppliers.find((s) => s.id === id);
    if (!sup) throw new DemoHttpError(404, 'المورد غير موجود');
    if (body.name) sup.name = String(body.name).trim();
    sup.phone = String(body.phone ?? sup.phone);
    sup.company = String(body.company ?? sup.company);
    sup.address = String(body.address ?? sup.address);
    sup.notes = String(body.notes ?? sup.notes);
    saveDemoDb(db);
    return { supplier: sup } as T;
  }
  if (pathname.match(/^\/api\/suppliers\/\d+\/statement$/) && method === 'GET') {
    requireRoles(user, 'admin', 'warehouse');
    const id = Number(pathname.split('/')[3]);
    const sup = db.suppliers.find((s) => s.id === id);
    if (!sup) throw new DemoHttpError(404, 'المورد غير موجود');
    const entries: any[] = [];
    if (sup.opening_balance !== 0) {
      entries.push({
        date: todayIso(),
        sort_at: '0000-00-00 00:00:00',
        type: 'opening',
        ref_no: 'رصيد أول المدة',
        description: 'رصيد افتتاحي مستحق للمورد',
        debit: sup.opening_balance < 0 ? -sup.opening_balance : 0,
        credit: sup.opening_balance > 0 ? sup.opening_balance : 0,
      });
    }
    for (const p of db.purchase_invoices.filter((x) => x.supplier_id === id)) {
      entries.push({
        date: p.invoice_date,
        sort_at: p.created_at,
        type: 'purchase',
        ref_no: p.invoice_no,
        description: 'فاتورة مشتريات',
        debit: p.paid_amount,
        credit: p.total_supplier_amount,
      });
    }
    for (const r of db.purchase_returns.filter((x) => x.supplier_id === id)) {
      entries.push({
        date: r.return_date,
        sort_at: r.created_at,
        type: 'purchase_return',
        ref_no: r.return_no,
        description: `مرتجع مشتريات (${r.reason})`,
        debit: r.settlement_method === 'credit_note' ? r.total_amount : 0,
        credit: 0,
      });
    }
    for (const tx of db.treasury_transactions.filter(
      (t) => t.tx_type === 'supplier_payment' && t.reference_id === id
    )) {
      entries.push({
        date: tx.tx_date,
        sort_at: tx.created_at,
        type: 'payment',
        ref_no: 'سند صرف',
        description: tx.description,
        debit: roundMoney(-tx.amount_delta),
        credit: 0,
      });
    }
    for (const chk of db.supplier_checks.filter((c) => c.supplier_id === id && c.status === 'cleared')) {
      const dt = chk.cleared_at || `${chk.due_date} 12:00:00`;
      entries.push({
        date: dt.slice(0, 10),
        sort_at: dt,
        type: 'check_cleared',
        ref_no: chk.check_no,
        description: `صرف شيك رقم ${chk.check_no}`,
        debit: chk.amount,
        credit: 0,
      });
    }
    entries.sort((a, b) => a.sort_at.localeCompare(b.sort_at));
    let running = 0;
    for (const e of entries) {
      running = roundMoney(running + e.credit - e.debit);
      e.running_balance = running;
    }
    return {
      supplier: sup,
      entries,
      pending_checks: db.supplier_checks.filter((c) => c.supplier_id === id && c.status === 'pending'),
      calculated_balance: running,
    } as T;
  }
  if (pathname.match(/^\/api\/suppliers\/\d+\/payments$/) && method === 'POST') {
    requireRoles(user, 'admin', 'warehouse');
    const id = Number(pathname.split('/')[3]);
    const sup = db.suppliers.find((s) => s.id === id);
    const acc = db.treasury_accounts.find((a) => a.id === Number(body.treasury_account_id));
    const amt = roundMoney(body.amount);
    if (!sup || !acc || amt <= 0) throw new DemoHttpError(400, 'بيانات السداد غير صالحة');
    sup.balance = roundMoney(sup.balance - amt);
    acc.balance = roundMoney(acc.balance - amt);
    db.treasury_transactions.unshift({
      id: nextId(db),
      account_id: acc.id,
      tx_type: 'supplier_payment',
      amount_delta: -amt,
      tx_date: String(body.payment_date || todayIso()),
      reference_type: 'supplier',
      reference_id: sup.id,
      description: `سداد دفعة للمورد ${sup.name}`,
      created_by: user.id,
      created_at: nowSql(),
    });
    saveDemoDb(db);
    return { supplier: sup } as T;
  }

  // SALES
  if (pathname === '/api/sales/returns/list' && method === 'GET') {
    const returns = db.sales_returns.map((r) => ({
      ...r,
      original_invoice_no: db.sales_invoices.find((i) => i.id === r.original_invoice_id)?.invoice_no || '',
      customer_name: db.customers.find((c) => c.id === r.customer_id)?.name || '',
      account_name: db.treasury_accounts.find((a) => a.id === r.treasury_account_id)?.name || '',
    }));
    return { returns } as T;
  }
  if (pathname === '/api/sales' && method === 'GET') {
    const q = (qs.get('q') || '').trim().toLowerCase();
    const from = (qs.get('from') || '').trim();
    const to = (qs.get('to') || '').trim();

    let list = db.sales_invoices.map((si) => {
      const cust = db.customers.find((c) => c.id === si.customer_id);
      const plum = db.plumbers.find((p) => p.id === si.plumber_id);
      const wh = db.warehouses.find((w) => w.id === si.warehouse_id);
      const retTotal = db.sales_returns
        .filter((r) => r.original_invoice_id === si.id)
        .reduce((s, r) => s + r.total_return_amount, 0);
      const out: Record<string, any> = {
        ...si,
        customer_name: cust?.name || '',
        customer_phone: cust?.phone || '',
        plumber_name: plum?.name || null,
        warehouse_name: wh?.name || '',
        returned_total: roundMoney(retTotal),
      };
      if (includeCost) {
        out.total_cost = roundMoney(
          db.sales_invoice_items
            .filter((it) => it.invoice_id === si.id)
            .reduce((s, it) => s + it.quantity * (it.unit_cost_at_sale || 0), 0)
        );
      }
      return out;
    });

    if (from) list = list.filter((i) => i.invoice_date >= from);
    if (to) list = list.filter((i) => i.invoice_date <= to);
    if (q) {
      list = list.filter(
        (i) =>
          i.invoice_no.toLowerCase().includes(q) ||
          (i.customer_name || '').toLowerCase().includes(q) ||
          (i.plumber_name || '').toLowerCase().includes(q)
      );
    }
    return { invoices: list } as T;
  }
  if (pathname.match(/^\/api\/sales\/\d+$/) && method === 'GET') {
    const id = Number(pathname.split('/').pop());
    const inv = db.sales_invoices.find((i) => i.id === id);
    if (!inv) throw new DemoHttpError(404, 'الفاتورة غير موجودة');
    const cust = db.customers.find((c) => c.id === inv.customer_id);
    const plum = db.plumbers.find((p) => p.id === inv.plumber_id);
    const wh = db.warehouses.find((w) => w.id === inv.warehouse_id);
    const u = db.users.find((x) => x.id === inv.created_by);

    const items = db.sales_invoice_items
      .filter((it) => it.invoice_id === id)
      .map((it) => {
        const prod = db.products.find((p) => p.id === it.product_id);
        const copy: any = { ...it, sku: prod?.sku, size: prod?.size, brand: prod?.brand };
        if (!includeCost) delete copy.unit_cost_at_sale;
        return copy;
      });
    const returns = db.sales_returns.filter((r) => r.original_invoice_id === id);

    return {
      invoice: {
        ...inv,
        customer_name: cust?.name || '',
        customer_phone: cust?.phone || '',
        customer_address: cust?.address || '',
        is_walkin: cust?.is_walkin ?? 0,
        plumber_name: plum?.name || null,
        warehouse_name: wh?.name || '',
        user_name: u?.full_name || '',
      },
      items,
      returns,
    } as T;
  }
  if (pathname === '/api/sales' && method === 'POST') {
    const warehouseId = Number(body.warehouse_id);
    const customerId = Number(body.customer_id);
    const plumberId = body.plumber_id ? Number(body.plumber_id) : null;
    const priceTier: PriceTier = ['retail', 'plumber', 'wholesale'].includes(body.price_tier) ? body.price_tier : 'retail';
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (!warehouseId || !customerId || rawItems.length === 0) {
      throw new DemoHttpError(400, 'يرجى تحديد المخزن والعميل وإضافة صنف واحد على الأقل');
    }
    const cust = db.customers.find((c) => c.id === customerId);
    if (!cust) throw new DemoHttpError(404, 'العميل غير موجود');

    const vatEnabled = body.vat_enabled !== undefined ? Boolean(body.vat_enabled) : db.settings.vat_enabled === 'true';
    const defaultVatRate = Number(db.settings.default_vat_rate || '14') || 14;
    const headerDiscount = Math.max(0, roundMoney(body.discount_amount ?? 0));

    let subtotal = 0;
    let totalVat = 0;
    const preparedItems: SalesInvoiceItem[] = [];
    const invoiceId = nextId(db);
    const invoiceNo = nextCode('INV', db.sales_invoices.map((i) => i.invoice_no));
    const invoiceDate = String(body.invoice_date || todayIso());

    for (const item of rawItems) {
      const prod = db.products.find((p) => p.id === Number(item.product_id) && p.is_active);
      if (!prod) throw new DemoHttpError(400, 'أحد الأصناف غير موجود');
      const unit = prod.units.find((u) => u.id === Number(item.unit_id)) || prod.units[0];
      const qty = roundQty(item.quantity);
      if (!unit || qty <= 0) throw new DemoHttpError(400, 'كمية غير صالحة');

      const factor = Number(unit.conversion_factor || 1);
      const tierPrice =
        priceTier === 'plumber' ? unit.plumber_price : priceTier === 'wholesale' ? unit.wholesale_price : unit.retail_price;
      const unitPrice = item.unit_price !== undefined ? roundMoney(item.unit_price) : roundMoney(tierPrice);
      const lineDisc = Math.max(0, roundMoney(item.discount_amount ?? 0));
      const lineNet = roundMoney(qty * unitPrice - lineDisc);
      const vatRate = vatEnabled ? (prod.vat_rate !== null ? prod.vat_rate : defaultVatRate) : 0;
      const lineVat = vatEnabled ? roundMoney(lineNet * (vatRate / 100)) : 0;
      const lineTotal = roundMoney(lineNet + lineVat);
      subtotal = roundMoney(subtotal + lineNet);
      totalVat = roundMoney(totalVat + lineVat);

      let unitCostAtSale = 0;
      if (prod.is_kit) {
        let singleCost = 0;
        for (const comp of prod.kit_items) {
          const cp = db.products.find((x) => x.id === comp.component_product_id)!;
          const need = roundQty(qty * factor * comp.quantity_base);
          if (getStock(db, warehouseId, cp.id) < need) {
            throw new DemoHttpError(400, `الرصيد المتاح من (${cp.name}) غير كافٍ`);
          }
          singleCost += cp.last_purchase_cost * comp.quantity_base;
        }
        unitCostAtSale = roundCost(singleCost * factor);
      } else {
        const need = roundQty(qty * factor);
        if (getStock(db, warehouseId, prod.id) < need) {
          throw new DemoHttpError(400, `الرصيد المتاح من (${prod.name}) غير كافٍ`);
        }
        unitCostAtSale = roundCost(prod.last_purchase_cost * factor);
      }

      preparedItems.push({
        id: nextId(db),
        invoice_id: invoiceId,
        product_id: prod.id,
        product_name: prod.name,
        unit_id: unit.id,
        unit_name: unit.unit_name,
        conversion_factor: factor,
        quantity: qty,
        returned_qty: 0,
        unit_price: unitPrice,
        discount_amount: lineDisc,
        vat_rate: vatRate,
        vat_amount: lineVat,
        line_total: lineTotal,
        unit_cost_at_sale: unitCostAtSale,
        is_kit: prod.is_kit ? 1 : 0,
      });
    }

    const totalAmount = roundMoney(subtotal + totalVat - headerDiscount);
    const paidAmount = body.paid_amount !== undefined ? roundMoney(body.paid_amount) : totalAmount;
    const remainingAmount = roundMoney(totalAmount - paidAmount);
    if (cust.is_walkin === 1 && remainingAmount > 0) {
      throw new DemoHttpError(400, 'العميل النقدي يجب سداد كامل الفاتورة — اختر عميلاً مسجلاً للبيع الآجل');
    }

    const acc =
      db.treasury_accounts.find((a) => a.id === Number(body.treasury_account_id)) || db.treasury_accounts[0];

    for (const line of preparedItems) {
      db.sales_invoice_items.push(line);
      if (line.is_kit === 1) {
        const prod = db.products.find((p) => p.id === line.product_id)!;
        for (const comp of prod.kit_items) {
          const cp = db.products.find((x) => x.id === comp.component_product_id)!;
          addStock(db, {
            warehouseId,
            productId: cp.id,
            deltaBase: -roundQty(line.quantity * line.conversion_factor * comp.quantity_base),
            movementType: 'sale',
            unitCost: cp.last_purchase_cost,
            referenceType: 'sales_invoice',
            referenceId: invoiceId,
            notes: `مبيعات طقم ${line.product_name} — ${invoiceNo}`,
            userId: user.id,
          });
        }
      } else {
        addStock(db, {
          warehouseId,
          productId: line.product_id,
          deltaBase: -roundQty(line.quantity * line.conversion_factor),
          movementType: 'sale',
          unitCost: roundCost((line.unit_cost_at_sale || 0) / line.conversion_factor),
          referenceType: 'sales_invoice',
          referenceId: invoiceId,
          notes: `مبيعات فاتورة ${invoiceNo}`,
          userId: user.id,
        });
      }
    }

    if (paidAmount > 0 && acc) {
      acc.balance = roundMoney(acc.balance + paidAmount);
      db.treasury_transactions.unshift({
        id: nextId(db),
        account_id: acc.id,
        tx_type: 'sale_receipt',
        amount_delta: paidAmount,
        tx_date: invoiceDate,
        reference_type: 'sales_invoice',
        reference_id: invoiceId,
        description: `تحصيل فاتورة مبيعات ${invoiceNo} (${cust.name})`,
        created_by: user.id,
        created_at: nowSql(),
      });
    }
    if (remainingAmount > 0) {
      cust.balance = roundMoney(cust.balance + remainingAmount);
    }

    const invoice: SalesInvoice & { created_by: number } = {
      id: invoiceId,
      invoice_no: invoiceNo,
      invoice_date: invoiceDate,
      warehouse_id: warehouseId,
      customer_id: customerId,
      plumber_id: plumberId,
      price_tier: priceTier,
      subtotal,
      discount_amount: headerDiscount,
      vat_enabled: vatEnabled ? 1 : 0,
      vat_amount: totalVat,
      total_amount: totalAmount,
      paid_amount: paidAmount,
      remaining_amount: remainingAmount,
      treasury_account_id: acc ? acc.id : null,
      status: 'completed',
      notes: String(body.notes || ''),
      created_by: user.id,
      created_at: nowSql(),
    };
    db.sales_invoices.unshift(invoice);
    saveDemoDb(db);
    return { invoice } as T;
  }
  if (pathname.match(/^\/api\/sales\/\d+\/returns$/) && method === 'POST') {
    const invId = Number(pathname.split('/')[3]);
    const inv = db.sales_invoices.find((i) => i.id === invId);
    if (!inv || inv.status !== 'completed') throw new DemoHttpError(400, 'الفاتورة غير متاحة للمرتجع');
    const cust = db.customers.find((c) => c.id === inv.customer_id)!;
    const refundMethod = body.refund_method === 'credit_note' ? 'credit_note' : 'cash';
    if (cust.is_walkin === 1 && refundMethod === 'credit_note') {
      throw new DemoHttpError(400, 'العميل النقدي يجب رد قيمة المرتجع نقداً');
    }

    const grossPlusVat = roundMoney(inv.subtotal + inv.vat_amount);
    const discRatio = grossPlusVat > 0 ? inv.discount_amount / grossPlusVat : 0;
    const returnId = nextId(db);
    const returnNo = nextCode('RET', db.sales_returns.map((r) => r.return_no));
    const retDate = String(body.return_date || todayIso());
    let totalReturn = 0;
    const retItems: DemoSalesReturnRecord['items'] = [];

    for (const ri of body.items || []) {
      const orig = db.sales_invoice_items.find(
        (x) => x.id === Number(ri.original_item_id) && x.invoice_id === invId
      );
      const qty = roundQty(ri.quantity);
      if (!orig || qty <= 0) throw new DemoHttpError(400, 'كمية مرتجع غير صالحة');
      const maxAllow = roundQty(orig.quantity - orig.returned_qty);
      if (qty > maxAllow) {
        throw new DemoHttpError(400, `الكمية المتبقية القابلة للإرجاع من (${orig.product_name}) هي ${maxAllow} فقط`);
      }
      const ratio = qty / orig.quantity;
      const lineTotal = roundMoney(orig.line_total * ratio * (1 - discRatio));
      totalReturn = roundMoney(totalReturn + lineTotal);
      retItems.push({
        id: nextId(db),
        return_id: returnId,
        original_item_id: orig.id,
        product_id: orig.product_id,
        product_name: orig.product_name,
        unit_name: orig.unit_name,
        conversion_factor: orig.conversion_factor,
        quantity: qty,
        unit_price: orig.unit_price,
        vat_amount: roundMoney(orig.vat_amount * ratio),
        line_total: lineTotal,
        unit_cost_at_sale: orig.unit_cost_at_sale || 0,
        is_kit: orig.is_kit,
      });
    }

    for (const line of retItems) {
      const orig = db.sales_invoice_items.find((x) => x.id === line.original_item_id)!;
      orig.returned_qty = roundQty(orig.returned_qty + line.quantity);
      if (line.is_kit === 1) {
        const prod = db.products.find((p) => p.id === line.product_id)!;
        for (const comp of prod.kit_items) {
          const cp = db.products.find((x) => x.id === comp.component_product_id)!;
          addStock(db, {
            warehouseId: inv.warehouse_id,
            productId: cp.id,
            deltaBase: roundQty(line.quantity * line.conversion_factor * comp.quantity_base),
            movementType: 'sale_return',
            unitCost: cp.last_purchase_cost,
            referenceType: 'sales_return',
            referenceId: returnId,
            notes: `مرتجع طقم ${returnNo}`,
            userId: user.id,
          });
        }
      } else {
        addStock(db, {
          warehouseId: inv.warehouse_id,
          productId: line.product_id,
          deltaBase: roundQty(line.quantity * line.conversion_factor),
          movementType: 'sale_return',
          unitCost: roundCost(line.unit_cost_at_sale / line.conversion_factor),
          referenceType: 'sales_return',
          referenceId: returnId,
          notes: `مرتجع مبيعات ${returnNo}`,
          userId: user.id,
        });
      }
    }

    const acc = db.treasury_accounts.find((a) => a.id === Number(body.treasury_account_id)) || db.treasury_accounts[0];
    if (refundMethod === 'cash' && acc) {
      acc.balance = roundMoney(acc.balance - totalReturn);
      db.treasury_transactions.unshift({
        id: nextId(db),
        account_id: acc.id,
        tx_type: 'sale_refund',
        amount_delta: -totalReturn,
        tx_date: retDate,
        reference_type: 'sales_return',
        reference_id: returnId,
        description: `رد نقدي لمرتجع ${returnNo}`,
        created_by: user.id,
        created_at: nowSql(),
      });
    } else {
      cust.balance = roundMoney(cust.balance - totalReturn);
    }

    const sr: DemoSalesReturnRecord = {
      id: returnId,
      return_no: returnNo,
      return_date: retDate,
      original_invoice_id: invId,
      warehouse_id: inv.warehouse_id,
      customer_id: inv.customer_id,
      plumber_id: inv.plumber_id,
      total_return_amount: totalReturn,
      refund_method: refundMethod,
      treasury_account_id: refundMethod === 'cash' ? (acc?.id ?? null) : null,
      notes: String(body.notes || ''),
      created_at: nowSql(),
      items: retItems,
    };
    db.sales_returns.unshift(sr);
    saveDemoDb(db);
    return { sales_return: sr } as T;
  }
  if (pathname.match(/^\/api\/sales\/\d+$/) && method === 'DELETE') {
    requireRoles(user, 'admin');
    const id = Number(pathname.split('/').pop());
    const inv = db.sales_invoices.find((i) => i.id === id);
    if (!inv || inv.status === 'voided') throw new DemoHttpError(400, 'الفاتورة غير متاحة للإلغاء');
    if (db.sales_returns.some((r) => r.original_invoice_id === id)) {
      throw new DemoHttpError(400, 'لا يمكن حذف فاتورة مرتبطة بمرتجعات');
    }
    for (const item of db.sales_invoice_items.filter((x) => x.invoice_id === id)) {
      if (item.is_kit === 1) {
        const prod = db.products.find((p) => p.id === item.product_id)!;
        for (const comp of prod.kit_items) {
          const cp = db.products.find((x) => x.id === comp.component_product_id)!;
          addStock(db, {
            warehouseId: inv.warehouse_id,
            productId: cp.id,
            deltaBase: roundQty(item.quantity * item.conversion_factor * comp.quantity_base),
            movementType: 'sale_void',
            unitCost: cp.last_purchase_cost,
            referenceType: 'sales_invoice',
            referenceId: id,
            notes: `إلغاء فاتورة ${inv.invoice_no}`,
            userId: user.id,
          });
        }
      } else {
        addStock(db, {
          warehouseId: inv.warehouse_id,
          productId: item.product_id,
          deltaBase: roundQty(item.quantity * item.conversion_factor),
          movementType: 'sale_void',
          unitCost: roundCost((item.unit_cost_at_sale || 0) / item.conversion_factor),
          referenceType: 'sales_invoice',
          referenceId: id,
          notes: `إلغاء فاتورة ${inv.invoice_no}`,
          userId: user.id,
        });
      }
    }
    if (inv.paid_amount > 0 && inv.treasury_account_id) {
      const acc = db.treasury_accounts.find((a) => a.id === inv.treasury_account_id);
      if (acc) {
        acc.balance = roundMoney(acc.balance - inv.paid_amount);
        db.treasury_transactions.unshift({
          id: nextId(db),
          account_id: acc.id,
          tx_type: 'sale_void_reversal',
          amount_delta: -inv.paid_amount,
          tx_date: todayIso(),
          reference_type: 'sales_invoice',
          reference_id: id,
          description: `عكس تحصيل فاتورة ملغاة ${inv.invoice_no}`,
          created_by: user.id,
          created_at: nowSql(),
        });
      }
    }
    if (inv.remaining_amount > 0) {
      const cust = db.customers.find((c) => c.id === inv.customer_id);
      if (cust) cust.balance = roundMoney(cust.balance - inv.remaining_amount);
    }
    inv.status = 'voided';
    saveDemoDb(db);
    return { ok: true } as T;
  }

  // PURCHASES
  if (pathname === '/api/purchases/returns/list' && method === 'GET') {
    requireRoles(user, 'admin', 'warehouse');
    return {
      returns: db.purchase_returns.map((r) => ({
        ...r,
        supplier_name: db.suppliers.find((s) => s.id === r.supplier_id)?.name || '',
        warehouse_name: db.warehouses.find((w) => w.id === r.warehouse_id)?.name || '',
      })),
    } as T;
  }
  if (pathname === '/api/purchases' && method === 'GET') {
    requireRoles(user, 'admin', 'warehouse');
    return {
      purchases: db.purchase_invoices.map((p) => ({
        ...p,
        supplier_name: db.suppliers.find((s) => s.id === p.supplier_id)?.name || '',
        warehouse_name: db.warehouses.find((w) => w.id === p.warehouse_id)?.name || '',
      })),
    } as T;
  }
  if (pathname === '/api/purchases' && method === 'POST') {
    requireRoles(user, 'admin', 'warehouse');
    const sup = db.suppliers.find((s) => s.id === Number(body.supplier_id));
    const wh = db.warehouses.find((w) => w.id === Number(body.warehouse_id));
    if (!sup || !wh || !Array.isArray(body.items) || body.items.length === 0) {
      throw new DemoHttpError(400, 'بيانات فاتورة الشراء غير مكتملة');
    }

    const shippingCost = Math.max(0, roundMoney(body.shipping_cost ?? 0));
    const shippingPaidTo = body.shipping_paid_to === 'external_cash' ? 'external_cash' : 'supplier';
    const headerDisc = Math.max(0, roundMoney(body.discount_amount ?? 0));
    const vatAmount = Math.max(0, roundMoney(body.vat_amount ?? 0));
    const paidAmount = Math.max(0, roundMoney(body.paid_amount ?? 0));

    const purId = nextId(db);
    const invNo = nextCode('PUR', db.purchase_invoices.map((x) => x.invoice_no));
    const invDate = String(body.invoice_date || todayIso());

    let subtotal = 0;
    let totalBase = 0;
    const draft = body.items.map((it: any) => {
      const prod = db.products.find((p) => p.id === Number(it.product_id));
      if (!prod || prod.is_kit) throw new DemoHttpError(400, 'الصنف غير صالح للشراء');
      const unit = prod.units.find((u) => u.id === Number(it.unit_id)) || prod.units[0];
      const factor = Number(unit?.conversion_factor || 1);
      const qty = roundQty(it.quantity);
      const qtyBase = roundQty(qty * factor);
      const netLine = roundMoney(qty * roundCost(it.unit_cost) - roundMoney(it.discount_amount ?? 0));
      subtotal = roundMoney(subtotal + netLine);
      totalBase = roundQty(totalBase + qtyBase);
      return { prod, unit, factor, qty, qtyBase, unitCost: roundCost(it.unit_cost), disc: roundMoney(it.discount_amount ?? 0), netLine };
    });

    const netAfterHeader = roundMoney(subtotal - headerDisc);
    const totalSupplier = roundMoney(netAfterHeader + vatAmount + (shippingPaidTo === 'supplier' ? shippingCost : 0));
    const remaining = roundMoney(totalSupplier - paidAmount);

    let allocSoFar = 0;
    const purItems: DemoPurchaseInvoice['items'] = draft.map((l: any, idx: number) => {
      let alloc = 0;
      if (shippingCost > 0) {
        if (idx === draft.length - 1) alloc = roundMoney(shippingCost - allocSoFar);
        else {
          const w = subtotal > 0 ? l.netLine / subtotal : l.qtyBase / Math.max(1, totalBase);
          alloc = roundMoney(shippingCost * w);
          allocSoFar = roundMoney(allocSoFar + alloc);
        }
      }
      const afterDisc = subtotal > 0 ? l.netLine * (netAfterHeader / subtotal) : l.netLine;
      const effCostBase = roundCost((afterDisc + alloc) / l.qtyBase);
      l.prod.last_purchase_cost = effCostBase;
      addStock(db, {
        warehouseId: wh.id,
        productId: l.prod.id,
        deltaBase: l.qtyBase,
        movementType: 'purchase',
        unitCost: effCostBase,
        referenceType: 'purchase_invoice',
        referenceId: purId,
        notes: `توريد مشتريات ${invNo} (${sup.name})`,
        userId: user.id,
      });
      return {
        id: nextId(db),
        product_id: l.prod.id,
        product_name: l.prod.name,
        unit_id: l.unit?.id || null,
        unit_name: l.unit?.unit_name || l.prod.base_unit_name,
        conversion_factor: l.factor,
        quantity: l.qty,
        quantity_base: l.qtyBase,
        returned_qty: 0,
        unit_cost: l.unitCost,
        discount_amount: l.disc,
        net_line_total: l.netLine,
        allocated_shipping_total: alloc,
        effective_unit_cost_base: effCostBase,
      };
    });

    const acc = db.treasury_accounts.find((a) => a.id === Number(body.treasury_account_id));
    if (paidAmount > 0 && acc) {
      acc.balance = roundMoney(acc.balance - paidAmount);
      db.treasury_transactions.unshift({
        id: nextId(db),
        account_id: acc.id,
        tx_type: 'purchase_payment',
        amount_delta: -paidAmount,
        tx_date: invDate,
        reference_type: 'purchase_invoice',
        reference_id: purId,
        description: `سداد فاتورة مشتريات ${invNo}`,
        created_by: user.id,
        created_at: nowSql(),
      });
    }
    const shipAcc = db.treasury_accounts.find((a) => a.id === Number(body.shipping_treasury_account_id)) || acc;
    if (shippingCost > 0 && shippingPaidTo === 'external_cash' && shipAcc) {
      shipAcc.balance = roundMoney(shipAcc.balance - shippingCost);
      db.treasury_transactions.unshift({
        id: nextId(db),
        account_id: shipAcc.id,
        tx_type: 'shipping_payment',
        amount_delta: -shippingCost,
        tx_date: invDate,
        reference_type: 'purchase_invoice',
        reference_id: purId,
        description: `مصاريف شحن ونقل ${invNo}`,
        created_by: user.id,
        created_at: nowSql(),
      });
    }
    if (remaining > 0) sup.balance = roundMoney(sup.balance + remaining);

    const pur: DemoPurchaseInvoice = {
      id: purId,
      invoice_no: invNo,
      supplier_invoice_no: String(body.supplier_invoice_no || ''),
      invoice_date: invDate,
      warehouse_id: wh.id,
      supplier_id: sup.id,
      subtotal,
      discount_amount: headerDisc,
      shipping_cost: shippingCost,
      shipping_paid_to: shippingPaidTo,
      shipping_treasury_account_id: shipAcc?.id || null,
      vat_amount: vatAmount,
      total_supplier_amount: totalSupplier,
      paid_amount: paidAmount,
      remaining_amount: remaining,
      treasury_account_id: acc?.id || null,
      notes: String(body.notes || ''),
      created_by: user.id,
      created_at: nowSql(),
      items: purItems,
    };
    db.purchase_invoices.unshift(pur);
    saveDemoDb(db);
    return { purchase: pur } as T;
  }
  if (pathname === '/api/purchases/returns' && method === 'POST') {
    requireRoles(user, 'admin', 'warehouse');
    const sup = db.suppliers.find((s) => s.id === Number(body.supplier_id));
    const wh = db.warehouses.find((w) => w.id === Number(body.warehouse_id));
    if (!sup || !wh) throw new DemoHttpError(400, 'بيانات غير مكتملة');
    const retNo = nextCode('PRET', db.purchase_returns.map((r) => r.return_no));
    const retId = nextId(db);
    let totalAmount = 0;
    const retItems: DemoPurchaseReturn['items'] = [];

    for (const item of body.items || []) {
      const prod = db.products.find((p) => p.id === Number(item.product_id));
      if (!prod || prod.is_kit) throw new DemoHttpError(400, 'الصنف غير صالح');
      const unit = prod.units.find((u) => u.id === Number(item.unit_id)) || prod.units[0];
      const factor = Number(unit?.conversion_factor || 1);
      const qty = roundQty(item.quantity);
      const qtyBase = roundQty(qty * factor);
      if (getStock(db, wh.id, prod.id) < qtyBase) throw new DemoHttpError(400, 'الرصيد المتاح لا يكفي للمرتجع');
      const lineTotal = roundMoney(qty * roundCost(item.unit_cost));
      totalAmount = roundMoney(totalAmount + lineTotal);
      addStock(db, {
        warehouseId: wh.id,
        productId: prod.id,
        deltaBase: -qtyBase,
        movementType: 'purchase_return',
        unitCost: roundCost(item.unit_cost / factor),
        referenceType: 'purchase_return',
        referenceId: retId,
        notes: `مرتجع توالف ${retNo}`,
        userId: user.id,
      });
      retItems.push({
        product_id: prod.id,
        product_name: prod.name,
        unit_name: unit?.unit_name || prod.base_unit_name,
        conversion_factor: factor,
        quantity: qty,
        unit_cost: roundCost(item.unit_cost),
        line_total: lineTotal,
      });
    }
    const methodSettle = body.settlement_method === 'cash_refund' ? 'cash_refund' : 'credit_note';
    if (methodSettle === 'credit_note') {
      sup.balance = roundMoney(sup.balance - totalAmount);
    } else {
      const acc = db.treasury_accounts.find((a) => a.id === Number(body.treasury_account_id));
      if (acc) {
        acc.balance = roundMoney(acc.balance + totalAmount);
        db.treasury_transactions.unshift({
          id: nextId(db),
          account_id: acc.id,
          tx_type: 'purchase_refund',
          amount_delta: totalAmount,
          tx_date: String(body.return_date || todayIso()),
          reference_type: 'purchase_return',
          reference_id: retId,
          description: `استرداد نقدي مرتجع مشتريات ${retNo}`,
          created_by: user.id,
          created_at: nowSql(),
        });
      }
    }
    const pr: DemoPurchaseReturn = {
      id: retId,
      return_no: retNo,
      return_date: String(body.return_date || todayIso()),
      warehouse_id: wh.id,
      supplier_id: sup.id,
      purchase_invoice_id: null,
      total_amount: totalAmount,
      settlement_method: methodSettle,
      treasury_account_id: null,
      reason: String(body.reason || 'تالف'),
      notes: String(body.notes || ''),
      created_by: user.id,
      created_at: nowSql(),
      items: retItems,
    };
    db.purchase_returns.unshift(pr);
    saveDemoDb(db);
    return { purchase_return: pr } as T;
  }

  // TREASURY, EXPENSES, CHECKS
  if (pathname === '/api/treasury/accounts' && method === 'GET') {
    return { accounts: db.treasury_accounts } as T;
  }
  if (pathname === '/api/treasury/accounts' && method === 'POST') {
    requireRoles(user, 'admin');
    const name = String(body.name || '').trim();
    if (!name) throw new DemoHttpError(400, 'يرجى إدخال اسم الحساب');
    const openBal = roundMoney(body.opening_balance ?? 0);
    const acc: TreasuryAccount = {
      id: nextId(db),
      name,
      account_type: body.account_type || 'bank',
      balance: openBal,
      is_default_pos: 0,
    };
    db.treasury_accounts.push(acc);
    saveDemoDb(db);
    return { account: acc } as T;
  }
  if (pathname === '/api/treasury/transactions' && method === 'GET') {
    return {
      transactions: db.treasury_transactions.slice(0, 120).map((t) => ({
        ...t,
        account_name: db.treasury_accounts.find((a) => a.id === t.account_id)?.name || '',
      })),
    } as T;
  }
  if (pathname === '/api/treasury/transfers' && method === 'POST') {
    const from = db.treasury_accounts.find((a) => a.id === Number(body.from_account_id));
    const to = db.treasury_accounts.find((a) => a.id === Number(body.to_account_id));
    const amt = roundMoney(body.amount);
    if (!from || !to || from.id === to.id || amt <= 0) throw new DemoHttpError(400, 'بيانات التحويل غير صالحة');
    if (from.balance < amt) throw new DemoHttpError(400, 'الرصيد لا يكفي للتحويل');
    from.balance = roundMoney(from.balance - amt);
    to.balance = roundMoney(to.balance + amt);
    const d = String(body.tx_date || todayIso());
    db.treasury_transactions.unshift(
      {
        id: nextId(db),
        account_id: to.id,
        tx_type: 'transfer_in',
        amount_delta: amt,
        tx_date: d,
        reference_type: 'treasury_transfer',
        reference_id: from.id,
        description: `استلام تحويل من ${from.name}`,
        created_by: user.id,
        created_at: nowSql(),
      },
      {
        id: nextId(db),
        account_id: from.id,
        tx_type: 'transfer_out',
        amount_delta: -amt,
        tx_date: d,
        reference_type: 'treasury_transfer',
        reference_id: to.id,
        description: `تحويل إلى ${to.name}`,
        created_by: user.id,
        created_at: nowSql(),
      }
    );
    saveDemoDb(db);
    return { ok: true } as T;
  }
  if (pathname === '/api/treasury/expenses' && method === 'GET') {
    return {
      expenses: db.expenses.map((e) => ({
        ...e,
        account_name: db.treasury_accounts.find((a) => a.id === e.treasury_account_id)?.name || '',
        user_name: db.users.find((u) => u.id === e.created_by)?.full_name || '',
      })),
    } as T;
  }
  if (pathname === '/api/treasury/expenses' && method === 'POST') {
    const acc = db.treasury_accounts.find((a) => a.id === Number(body.treasury_account_id));
    const amt = roundMoney(body.amount);
    if (!acc || amt <= 0 || !body.category) throw new DemoHttpError(400, 'بيانات المصروف غير مكتملة');
    const exp: DemoExpense = {
      id: nextId(db),
      expense_date: String(body.expense_date || todayIso()),
      category: String(body.category),
      amount: amt,
      treasury_account_id: acc.id,
      description: String(body.description || ''),
      created_by: user.id,
      created_at: nowSql(),
    };
    db.expenses.unshift(exp);
    acc.balance = roundMoney(acc.balance - amt);
    db.treasury_transactions.unshift({
      id: nextId(db),
      account_id: acc.id,
      tx_type: 'expense',
      amount_delta: -amt,
      tx_date: exp.expense_date,
      reference_type: 'expense',
      reference_id: exp.id,
      description: `مصروف: ${exp.category}`,
      created_by: user.id,
      created_at: nowSql(),
    });
    saveDemoDb(db);
    return { expense: exp } as T;
  }
  if (pathname.match(/^\/api\/treasury\/expenses\/\d+$/) && method === 'DELETE') {
    requireRoles(user, 'admin');
    const id = Number(pathname.split('/').pop());
    const idx = db.expenses.findIndex((e) => e.id === id);
    if (idx >= 0) {
      const exp = db.expenses[idx];
      const acc = db.treasury_accounts.find((a) => a.id === exp.treasury_account_id);
      if (acc) acc.balance = roundMoney(acc.balance + exp.amount);
      db.expenses.splice(idx, 1);
      saveDemoDb(db);
    }
    return { ok: true } as T;
  }
  if (pathname === '/api/treasury/checks' && method === 'GET') {
    requireRoles(user, 'admin', 'warehouse');
    const status = qs.get('status') || '';
    const list = (status ? db.supplier_checks.filter((c) => c.status === status) : db.supplier_checks).map((c) => ({
      ...c,
      supplier_name: db.suppliers.find((s) => s.id === c.supplier_id)?.name || '',
      account_name: db.treasury_accounts.find((a) => a.id === c.treasury_account_id)?.name || '',
    }));
    return { checks: list } as T;
  }
  if (pathname === '/api/treasury/checks' && method === 'POST') {
    requireRoles(user, 'admin', 'warehouse');
    const chk = {
      id: nextId(db),
      check_no: String(body.check_no || '').trim(),
      bank_name: String(body.bank_name || '').trim(),
      supplier_id: Number(body.supplier_id),
      treasury_account_id: body.treasury_account_id ? Number(body.treasury_account_id) : null,
      amount: roundMoney(body.amount),
      issue_date: String(body.issue_date || todayIso()),
      due_date: String(body.due_date || todayIso()),
      status: 'pending' as const,
      cleared_at: null,
      notes: String(body.notes || ''),
      created_by: user.id,
      created_at: nowSql(),
    };
    db.supplier_checks.unshift(chk);
    saveDemoDb(db);
    return { check: chk } as T;
  }
  if (pathname.match(/^\/api\/treasury\/checks\/\d+\/clear$/) && method === 'POST') {
    requireRoles(user, 'admin', 'warehouse');
    const id = Number(pathname.split('/')[4]);
    const chk = db.supplier_checks.find((c) => c.id === id);
    if (!chk || chk.status !== 'pending') throw new DemoHttpError(400, 'الشيك غير متاح للصرف');
    const acc = db.treasury_accounts.find(
      (a) => a.id === Number(body.treasury_account_id || chk.treasury_account_id)
    );
    const sup = db.suppliers.find((s) => s.id === chk.supplier_id);
    if (!acc) throw new DemoHttpError(400, 'حدد الحساب البنكي أو الخزنة');
    chk.status = 'cleared';
    chk.cleared_at = nowSql();
    chk.treasury_account_id = acc.id;
    acc.balance = roundMoney(acc.balance - chk.amount);
    if (sup) sup.balance = roundMoney(sup.balance - chk.amount);
    db.treasury_transactions.unshift({
      id: nextId(db),
      account_id: acc.id,
      tx_type: 'check_clear',
      amount_delta: -chk.amount,
      tx_date: todayIso(),
      reference_type: 'supplier_check',
      reference_id: chk.id,
      description: `صرف شيك رقم ${chk.check_no}`,
      created_by: user.id,
      created_at: nowSql(),
    });
    saveDemoDb(db);
    return { check: chk } as T;
  }
  if (pathname.match(/^\/api\/treasury\/checks\/\d+\/status$/) && method === 'POST') {
    requireRoles(user, 'admin', 'warehouse');
    const id = Number(pathname.split('/')[4]);
    const chk = db.supplier_checks.find((c) => c.id === id);
    if (chk && ['bounced', 'cancelled'].includes(body.status)) chk.status = body.status;
    saveDemoDb(db);
    return { check: chk } as T;
  }

  // REPORTS
  if (pathname === '/api/reports/dashboard' && method === 'GET') {
    const today = todayIso();
    const next7 = addDays(today, 7);
    const salesToday = db.sales_invoices.filter((i) => i.invoice_date === today && i.status === 'completed');
    const returnsToday = db.sales_returns.filter((r) => r.return_date === today);
    const expToday = db.expenses.filter((e) => e.expense_date === today).reduce((s, e) => s + e.amount, 0);
    const salesTot = roundMoney(salesToday.reduce((s, i) => s + i.total_amount, 0));
    const retTot = roundMoney(returnsToday.reduce((s, r) => s + r.total_return_amount, 0));
    const collections = roundMoney(
      db.treasury_transactions
        .filter((t) => t.tx_date === today && ['sale_receipt', 'customer_payment'].includes(t.tx_type))
        .reduce((s, t) => s + t.amount_delta, 0)
    );
    const lowStock = db.products
      .filter((p) => p.is_active && !p.is_kit)
      .map((p) => hydrateProduct(db, p, false))
      .filter((p) => p.total_stock <= p.min_stock);

    const dueChecks = db.supplier_checks
      .filter((c) => c.status === 'pending' && c.due_date <= next7)
      .map((c) => ({ ...c, supplier_name: db.suppliers.find((s) => s.id === c.supplier_id)?.name || '' }));

    const out: Record<string, any> = {
      today,
      today_sales_count: salesToday.length,
      today_sales_total: salesTot,
      today_returns_total: retTot,
      today_net_sales: roundMoney(salesTot - retTot),
      today_collections: collections,
      today_expenses: roundMoney(expToday),
      total_treasury: roundMoney(db.treasury_accounts.reduce((s, a) => s + a.balance, 0)),
      treasury_accounts: db.treasury_accounts,
      total_receivables: roundMoney(db.customers.filter((c) => c.balance > 0).reduce((s, c) => s + c.balance, 0)),
      total_payables: roundMoney(db.suppliers.filter((s) => s.balance > 0).reduce((sum, s) => sum + s.balance, 0)),
      low_stock_count: lowStock.length,
      low_stock_items: lowStock.slice(0, 8),
      due_checks_count: dueChecks.length,
      due_checks: dueChecks,
    };

    if (user.role === 'admin') {
      const invIds = new Set(salesToday.map((s) => s.id));
      const grossCogs = db.sales_invoice_items
        .filter((it) => invIds.has(it.invoice_id))
        .reduce((s, it) => s + it.quantity * (it.unit_cost_at_sale || 0), 0);
      const retCogs = returnsToday
        .flatMap((r) => r.items)
        .reduce((s, it) => s + it.quantity * it.unit_cost_at_sale, 0);
      const salesVat = salesToday.reduce((s, i) => s + i.vat_amount, 0);
      const retVat = returnsToday.flatMap((r) => r.items).reduce((s, it) => s + it.vat_amount, 0);
      out.today_net_profit = roundMoney((salesTot - salesVat - (retTot - retVat)) - (grossCogs - retCogs) - expToday);
    }
    return out as T;
  }

  if (pathname === '/api/reports/profit' && method === 'GET') {
    requireRoles(user, 'admin');
    const today = todayIso();
    const from = qs.get('from') || `${today.slice(0, 7)}-01`;
    const to = qs.get('to') || today;
    const groupBy = qs.get('group_by') === 'month' ? 'month' : 'day';
    const keyFn = (d: string) => (groupBy === 'month' ? d.slice(0, 7) : d);

    const periods = new Set<string>();
    const map = new Map<string, any>();
    const ensure = (p: string) => {
      periods.add(p);
      if (!map.has(p)) {
        map.set(p, { period: p, invoices_count: 0, gross_sales: 0, sales_vat: 0, sales_returns: 0, returns_vat: 0, gross_cogs: 0, returns_cogs: 0, expenses: 0 });
      }
      return map.get(p);
    };

    for (const si of db.sales_invoices) {
      if (si.status !== 'completed' || si.invoice_date < from || si.invoice_date > to) continue;
      const b = ensure(keyFn(si.invoice_date));
      b.invoices_count += 1;
      b.gross_sales = roundMoney(b.gross_sales + si.total_amount);
      b.sales_vat = roundMoney(b.sales_vat + si.vat_amount);
      const cogs = db.sales_invoice_items
        .filter((it) => it.invoice_id === si.id)
        .reduce((s, it) => s + it.quantity * (it.unit_cost_at_sale || 0), 0);
      b.gross_cogs = roundMoney(b.gross_cogs + cogs);
    }
    for (const sr of db.sales_returns) {
      if (sr.return_date < from || sr.return_date > to) continue;
      const b = ensure(keyFn(sr.return_date));
      b.sales_returns = roundMoney(b.sales_returns + sr.total_return_amount);
      b.returns_vat = roundMoney(b.returns_vat + sr.items.reduce((s, i) => s + i.vat_amount, 0));
      b.returns_cogs = roundMoney(b.returns_cogs + sr.items.reduce((s, i) => s + i.quantity * i.unit_cost_at_sale, 0));
    }
    for (const ex of db.expenses) {
      if (ex.expense_date < from || ex.expense_date > to) continue;
      const b = ensure(keyFn(ex.expense_date));
      b.expenses = roundMoney(b.expenses + ex.amount);
    }

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
    const rows = Array.from(periods)
      .sort((a, b) => b.localeCompare(a))
      .map((period) => {
        const b = map.get(period);
        const netSales = roundMoney(b.gross_sales - b.sales_returns);
        const netVat = roundMoney(b.sales_vat - b.returns_vat);
        const netSalesExVat = roundMoney(netSales - netVat);
        const netCogs = roundMoney(b.gross_cogs - b.returns_cogs);
        const grossProfit = roundMoney(netSalesExVat - netCogs);
        const netProfit = roundMoney(grossProfit - b.expenses);
        totals.invoices_count += b.invoices_count;
        totals.gross_sales = roundMoney(totals.gross_sales + b.gross_sales);
        totals.sales_returns = roundMoney(totals.sales_returns + b.sales_returns);
        totals.net_sales = roundMoney(totals.net_sales + netSales);
        totals.net_vat = roundMoney(totals.net_vat + netVat);
        totals.net_sales_ex_vat = roundMoney(totals.net_sales_ex_vat + netSalesExVat);
        totals.net_cogs = roundMoney(totals.net_cogs + netCogs);
        totals.gross_profit = roundMoney(totals.gross_profit + grossProfit);
        totals.expenses = roundMoney(totals.expenses + b.expenses);
        totals.net_profit = roundMoney(totals.net_profit + netProfit);
        return {
          period,
          invoices_count: b.invoices_count,
          gross_sales: b.gross_sales,
          sales_returns: b.sales_returns,
          net_sales: netSales,
          net_vat: netVat,
          net_sales_ex_vat: netSalesExVat,
          net_cogs: netCogs,
          gross_profit: grossProfit,
          expenses: b.expenses,
          net_profit: netProfit,
          margin_pct: netSalesExVat > 0 ? roundMoney((netProfit / netSalesExVat) * 100) : 0,
        };
      });

    return { from, to, group_by: groupBy, rows, totals } as T;
  }

  if (pathname === '/api/reports/inventory' && method === 'GET') {
    const today = todayIso();
    const from = qs.get('from') || addDays(today, -30);
    const to = qs.get('to') || today;
    const stagnantDays = Math.max(1, Number(qs.get('stagnant_days')) || 30);
    const cutoff = addDays(today, -stagnantDays);

    const hydrated = db.products.filter((p) => p.is_active && !p.is_kit).map((p) => hydrateProduct(db, p, false));
    const lowStock = hydrated.filter((p) => p.total_stock <= p.min_stock);

    const soldMap = new Map<number, { qty: number; rev: number; lastDate: string }>();
    for (const si of db.sales_invoices) {
      if (si.status !== 'completed') continue;
      for (const it of db.sales_invoice_items.filter((x) => x.invoice_id === si.id)) {
        const netQ = roundQty((it.quantity - it.returned_qty) * it.conversion_factor);
        const netRev = it.quantity > 0 ? roundMoney(it.line_total * ((it.quantity - it.returned_qty) / it.quantity)) : 0;
        const prev = soldMap.get(it.product_id) || { qty: 0, rev: 0, lastDate: '' };
        if (si.invoice_date > prev.lastDate) prev.lastDate = si.invoice_date;
        if (si.invoice_date >= from && si.invoice_date <= to) {
          prev.qty = roundQty(prev.qty + netQ);
          prev.rev = roundMoney(prev.rev + netRev);
        }
        soldMap.set(it.product_id, prev);
      }
    }

    const bestSellers = Array.from(soldMap.entries())
      .filter(([, v]) => v.qty > 0)
      .map(([pid, v]) => {
        const p = db.products.find((x) => x.id === pid)!;
        return { id: p.id, sku: p.sku, name: p.name, base_unit_name: p.base_unit_name, net_qty_base: v.qty, net_revenue: v.rev };
      })
      .sort((a, b) => b.net_qty_base - a.net_qty_base);

    const stagnant = hydrated
      .filter((p) => p.total_stock > 0 && (soldMap.get(p.id)?.lastDate || '') < cutoff)
      .map((p) => ({ ...p, last_sold_date: soldMap.get(p.id)?.lastDate || null }));

    return { from, to, stagnant_days: stagnantDays, low_stock: lowStock, best_sellers: bestSellers, stagnant } as T;
  }

  if (pathname === '/api/reports/plumbers' && method === 'GET') {
    return {
      plumbers: db.plumbers.map((p) => {
        const invs = db.sales_invoices.filter((si) => si.plumber_id === p.id && si.status === 'completed');
        const gross = roundMoney(invs.reduce((s, i) => s + i.total_amount, 0));
        const rets = roundMoney(
          invs.reduce(
            (s, i) => s + db.sales_returns.filter((r) => r.original_invoice_id === i.id).reduce((x, r) => x + r.total_return_amount, 0),
            0
          )
        );
        return {
          ...p,
          invoices_count: invs.length,
          customers_count: new Set(invs.map((i) => i.customer_id)).size,
          gross_sales: gross,
          returns_total: rets,
          net_sales: roundMoney(gross - rets),
        };
      }),
    } as T;
  }

  if (pathname === '/api/reports/vat' && method === 'GET') {
    requireRoles(user, 'admin', 'warehouse');
    const today = todayIso();
    const from = qs.get('from') || `${today.slice(0, 7)}-01`;
    const to = qs.get('to') || today;
    const vatInvs = db.sales_invoices.filter(
      (i) => i.status === 'completed' && i.vat_enabled === 1 && i.invoice_date >= from && i.invoice_date <= to
    );
    const outputVat = roundMoney(vatInvs.reduce((s, i) => s + i.vat_amount, 0));
    const retVat = roundMoney(
      db.sales_returns
        .filter((r) => r.return_date >= from && r.return_date <= to)
        .flatMap((r) => r.items)
        .reduce((s, i) => s + i.vat_amount, 0)
    );
    const inputVat = roundMoney(
      db.purchase_invoices.filter((p) => p.invoice_date >= from && p.invoice_date <= to).reduce((s, p) => s + p.vat_amount, 0)
    );
    return {
      from,
      to,
      sales_vat_invoices: vatInvs.length,
      taxable_sales: roundMoney(vatInvs.reduce((s, i) => s + (i.subtotal - i.discount_amount), 0)),
      output_vat: outputVat,
      returned_vat: retVat,
      net_output_vat: roundMoney(outputVat - retVat),
      input_vat: inputVat,
      net_vat_payable: roundMoney(outputVat - retVat - inputVat),
    } as T;
  }

  // BACKUPS
  if (pathname === '/api/backups' && method === 'GET') {
    requireRoles(user, 'admin');
    return {
      files: db.backups.map(({ filename, size, created_at }) => ({ filename, size, created_at })),
      backups_dir: 'تخزين المتصفح المحلي (نسخة المعاينة)',
      last_backup_at: db.settings.last_backup_at || '',
    } as T;
  }
  if (pathname === '/api/backups/now' && method === 'POST') {
    requireRoles(user, 'admin');
    const createdAt = nowSql();
    const filename = `bahnasawy_${createdAt.replace(' ', '_').replace(/:/g, '-')}_manual.json`;
    const snapshot = JSON.stringify(db, null, 2);
    db.settings.last_backup_at = createdAt;
    db.backups.unshift({
      filename,
      size: snapshot.length,
      created_at: createdAt,
      snapshot_json: snapshot,
    });
    saveDemoDb(db);
    return {
      backup: { filename, secondaryCopied: false, secondaryError: null },
    } as T;
  }

  throw new DemoHttpError(404, `المسار غير مدعوم في وضع المعاينة: ${pathname}`);
}
