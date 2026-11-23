import { getDb, setSetting, withTransaction } from './db.ts';
import { hashPassword } from './auth.ts';
import { addDays, nowSql, todayStr } from './utils.ts';

export function seedDatabase(): void {
  const db = getDb();
  const now = nowSql();
  const today = todayStr();

  // Settings
  const defaultSettings: Record<string, string> = {
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
    invoice_footer_note: 'شكراً لتعاملكم مع متجر البهنساوي — البضاعة المباعة ترد وتستبدل خلال 14 يوماً بحالتها الأصلية.',
  };

  for (const [k, v] of Object.entries(defaultSettings)) {
    const exists = db.prepare('SELECT 1 FROM settings WHERE key = ?').get(k);
    if (!exists) setSetting(db, k, v);
  }

  // Check if users already seeded
  const userCount = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
  if (userCount > 0) return;

  withTransaction((tx) => {
    // Users
    const insertUser = tx.prepare(
      'INSERT INTO users(username, password_hash, full_name, role, is_active, created_at) VALUES(?, ?, ?, ?, 1, ?)'
    );
    const adminRes = insertUser.run('admin', hashPassword('admin123'), 'إبراهيم البهنساوي (المدير)', 'admin', now);
    const adminId = Number(adminRes.lastInsertRowid);
    insertUser.run('cashier', hashPassword('1234'), 'كاشير المتجر', 'cashier', now);
    insertUser.run('warehouse', hashPassword('1234'), 'أمين المخزن', 'warehouse', now);

    // Warehouses
    const insertWh = tx.prepare(
      'INSERT INTO warehouses(name, location, is_default, is_active, created_at) VALUES(?, ?, ?, 1, ?)'
    );
    const whMainId = Number(insertWh.run('المخزن الرئيسي (المتجر)', 'صالة العرض والمحل', 1, now).lastInsertRowid);
    const whSubId = Number(insertWh.run('المخزن الفرعي', 'المخزن الخلفي / الجملة', 0, now).lastInsertRowid);

    // Treasury Accounts
    const insertAcc = tx.prepare(
      'INSERT INTO treasury_accounts(name, account_type, balance, is_default_pos, is_active, created_at) VALUES(?, ?, ?, ?, 1, ?)'
    );
    const cashierSafeId = Number(insertAcc.run('خزنة الكاشير اليومية', 'cashier_safe', 2500, 1, now).lastInsertRowid);
    const mainSafeId = Number(insertAcc.run('الخزنة الرئيسية', 'main_safe', 35000, 0, now).lastInsertRowid);
    insertAcc.run('الحساب البنكي / إنستاباي', 'instapay', 18000, 0, now);
    insertAcc.run('محفظة إلكترونية (فودافون كاش)', 'e_wallet', 4500, 0, now);

    // Opening treasury log
    const insertTx = tx.prepare(
      `INSERT INTO treasury_transactions(account_id, tx_type, amount_delta, tx_date, reference_type, reference_id, description, created_by, created_at)
       VALUES(?, 'opening', ?, ?, 'opening', NULL, ?, ?, ?)`
    );
    insertTx.run(cashierSafeId, 2500, today, 'رصيد افتتاحي — خزنة الكاشير', adminId, now);
    insertTx.run(mainSafeId, 35000, today, 'رصيد افتتاحي — الخزنة الرئيسية', adminId, now);

    // Customers
    const insertCust = tx.prepare(
      `INSERT INTO customers(name, phone, address, price_tier, opening_balance, balance, is_walkin, notes, is_active, created_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    );
    insertCust.run('عميل نقدي', '', '', 'retail', 0, 0, 1, 'العميل الافتراضي للبيع الفوري', now);
    insertCust.run('م. كريم عبد الله', '01011223344', 'مدينة نصر - عمارة 14', 'retail', 0, 0, 0, 'تشطيب شقتين', now);
    insertCust.run('شركة الفتح للمقاولات', '01122334455', 'التجمع الخامس', 'wholesale', 2400, 2400, 0, 'عميل جملة ومشاريع', now);

    // Plumbers
    const insertPlumber = tx.prepare(
      'INSERT INTO plumbers(name, phone, area, notes, is_active, created_at) VALUES(?, ?, ?, ?, 1, ?)'
    );
    insertPlumber.run('أحمد حسن (سباك)', '01099887766', 'الحي العاشر والمناطق المجاورة', 'تأسيس وتشطيب', now);
    insertPlumber.run('محمود السيد (فني صحي)', '01233445566', 'وسط البلد', 'فني سباكة معتمد', now);

    // Suppliers
    const insertSup = tx.prepare(
      `INSERT INTO suppliers(name, phone, company, address, opening_balance, balance, notes, is_active, created_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?)`
    );
    const sup1Id = Number(
      insertSup.run('الحاج طارق الشريف', '01055667788', 'الشريف للتجارة والتوريدات', 'السبتية - القاهرة', 5000, 5000, 'مورد مواسير ولوازم تأسيس', now).lastInsertRowid
    );
    insertSup.run('م. هشام كامل', '01144556677', 'المتحدة للأدوات الصحية', 'العاشر من رمضان', 0, 0, 'خلاطات وأطقم صيني', now);

    // Products + Units + Stock
    const insertProd = tx.prepare(
      `INSERT INTO products(sku, name, category, brand, size, color, base_unit_name, is_kit, last_purchase_cost, min_stock, vat_rate, notes, is_active, created_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 1, ?, ?)`
    );
    const insertUnit = tx.prepare(
      `INSERT INTO product_units(product_id, unit_name, conversion_factor, barcode, retail_price, plumber_price, wholesale_price, is_base)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertStock = tx.prepare(
      'INSERT INTO warehouse_stock(warehouse_id, product_id, quantity_base) VALUES(?, ?, ?)'
    );
    const insertMove = tx.prepare(
      `INSERT INTO stock_movements(warehouse_id, product_id, movement_type, quantity_delta, unit_cost, reference_type, reference_id, notes, created_by, created_at)
       VALUES(?, ?, 'opening', ?, ?, 'opening', NULL, 'رصيد افتتاحي', ?, ?)`
    );

    const addStock = (whId: number, prodId: number, qty: number, cost: number) => {
      if (qty <= 0) return;
      tx.prepare(
        `INSERT INTO warehouse_stock(warehouse_id, product_id, quantity_base) VALUES(?, ?, ?)
         ON CONFLICT(warehouse_id, product_id) DO UPDATE SET quantity_base = quantity_base + excluded.quantity_base`
      ).run(whId, prodId, qty);
      insertMove.run(whId, prodId, qty, cost, adminId, now);
    };

    // 1. Single Unit: Ideal Standard Mixer
    const p1 = Number(
      insertProd.run('SKU-0001', 'خلاط حوض مطبخ شجرة', 'خلاطات', 'أيديال ستاندرد', 'ستاندرد', 'كروم', 'قطعة', 0, 1450, 3, 'ضمان 5 سنوات من الوكيل', now, now).lastInsertRowid
    );
    insertUnit.run(p1, 'قطعة', 1, '622000000001', 1950, 1800, 1700, 1);
    addStock(whMainId, p1, 14, 1450);

    // 2. Single Unit: Duravit Basin
    const p2 = Number(
      insertProd.run('SKU-0002', 'حوض حمام بعمود 60 سم', 'أطقم صيني', 'ديورافيت', '60 سم', 'أبيض', 'قطعة', 0, 1800, 3, '', now, now).lastInsertRowid
    );
    insertUnit.run(p2, 'قطعة', 1, '622000000002', 2400, 2250, 2100, 1);
    addStock(whMainId, p2, 10, 1800);
    addStock(whSubId, p2, 6, 1800);

    // 3. Single Unit: Syphon
    const p3 = Number(
      insertProd.run('SKU-0003', 'سيفون حوض استانلس سوستة', 'لوازم سباكة', 'الشريف', '1.5 بوصة', 'فضي', 'قطعة', 0, 75, 10, '', now, now).lastInsertRowid
    );
    insertUnit.run(p3, 'قطعة', 1, '622000000003', 110, 95, 90, 1);
    addStock(whMainId, p3, 40, 75);

    // 4. Multi-UOM (قطعة / دستة / كرتونة): Grohe Angle Valve
    const p4 = Number(
      insertProd.run('SKU-0004', 'محبس زاوية كروم ثقيل', 'محابس', 'جروهي', '1/2 بوصة', 'كروم', 'قطعة', 0, 115, 24, 'قلب نحاس أصلي', now, now).lastInsertRowid
    );
    insertUnit.run(p4, 'قطعة', 1, '622000000004', 155, 140, 130, 1);
    insertUnit.run(p4, 'دستة (12)', 12, '622000000005', 1800, 1650, 1520, 0);
    insertUnit.run(p4, 'كرتونة (48)', 48, '622000000006', 7000, 6400, 5950, 0);
    addStock(whMainId, p4, 96, 115);
    addStock(whSubId, p4, 96, 115);

    // 5. Multi-UOM (قطعة / دستة): Flexible Hose
    const p5 = Number(
      insertProd.run('SKU-0005', 'وصلة مياه مرنة استانلس 50 سم', 'وصلات', 'المتحدة', '50 سم', 'فضي', 'قطعة', 0, 42, 20, '', now, now).lastInsertRowid
    );
    insertUnit.run(p5, 'قطعة', 1, '622000000007', 65, 55, 50, 1);
    insertUnit.run(p5, 'دستة (12)', 12, '622000000008', 720, 630, 580, 0);
    addStock(whMainId, p5, 60, 42);

    // 6. Meter & Roll: PPR Pipe BR
    const p6 = Number(
      insertProd.run('SKU-0006', 'ماسورة تغذية PPR بولي أخضر', 'مواسير تغذية', 'BR', '1/2 بوصة (20 مم)', 'أخضر', 'متر', 0, 28, 50, 'يباع بالمتر أو باللفة 50 متر', now, now).lastInsertRowid
    );
    insertUnit.run(p6, 'متر', 1, '622000000009', 40, 36, 33, 1);
    insertUnit.run(p6, 'لفة (50 متر)', 50, '622000000010', 1900, 1750, 1600, 0);
    addStock(whMainId, p6, 200, 28);
    addStock(whSubId, p6, 300, 28);

    // 7. Meter & 4m Stick: PVC Pipe
    const p7 = Number(
      insertProd.run('SKU-0007', 'ماسورة صرف PVC معتمد 4 بوصة', 'مواسير صرف', 'الشريف', '4 بوصة (110 مم)', 'رمادي', 'متر', 0, 85, 20, 'عود 4 متر', now, now).lastInsertRowid
    );
    insertUnit.run(p7, 'متر', 1, '622000000011', 115, 105, 98, 1);
    insertUnit.run(p7, 'عود (4 متر)', 4, '622000000012', 440, 405, 380, 0);
    addStock(whMainId, p7, 80, 85);

    // 8. Low Stock Item: PPR Elbow
    const p8 = Number(
      insertProd.run('SKU-0008', 'كوع لحام PPR بولي 90 درجة', 'وصلات', 'BR', '1/2 بوصة (20 مم)', 'أخضر', 'قطعة', 0, 7.5, 25, 'تحت الحد الأدنى للتنبيه', now, now).lastInsertRowid
    );
    insertUnit.run(p8, 'قطعة', 1, '622000000013', 12, 10, 9, 1);
    insertUnit.run(p8, 'كيس (25)', 25, '622000000014', 280, 240, 220, 0);
    addStock(whMainId, p8, 8, 7.5);

    // 9. Kit / Bundle: Full Bathroom Basin Kit
    const kitCost = 1800 + 1450 + 2 * 42 + 75;
    const p9 = Number(
      insertProd.run('SKU-0009', 'طقم حوض حمام كامل (حوض + خلاط + 2 وصلة + سيفون)', 'أطقم مجمعة', 'مجمع', '60 سم', 'أبيض/كروم', 'طقم', 1, kitCost, 0, 'طقم تجميعي يخصم مكوناته تلقائياً من المخزن', now, now).lastInsertRowid
    );
    insertUnit.run(p9, 'طقم', 1, '622000000015', 4350, 4050, 3850, 1);
    const insertKitItem = tx.prepare(
      'INSERT INTO product_kit_items(kit_product_id, component_product_id, quantity_base) VALUES(?, ?, ?)'
    );
    insertKitItem.run(p9, p2, 1);
    insertKitItem.run(p9, p1, 1);
    insertKitItem.run(p9, p5, 2);
    insertKitItem.run(p9, p3, 1);

    // Sample Supplier Check (due in 3 days)
    tx.prepare(
      `INSERT INTO supplier_checks(check_no, bank_name, supplier_id, treasury_account_id, amount, issue_date, due_date, status, notes, created_by, created_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
    ).run('CHK-8841', 'البنك الأهلي المصري', sup1Id, mainSafeId, 3000, today, addDays(today, 3), 'دفعة تحت حساب توريد مواسير BR', adminId, now);

    // Sample Daily Expense
    const expRes = tx.prepare(
      `INSERT INTO expenses(expense_date, category, amount, treasury_account_id, description, created_by, created_at)
       VALUES(?, 'نقل ومشال', 150, ?, 'نقل بضاعة من المخزن الفرعي للمحل', ?, ?)`
    ).run(today, cashierSafeId, adminId, now);
    const expId = Number(expRes.lastInsertRowid);
    tx.prepare('UPDATE treasury_accounts SET balance = balance - 150 WHERE id = ?').run(cashierSafeId);
    tx.prepare(
      `INSERT INTO treasury_transactions(account_id, tx_type, amount_delta, tx_date, reference_type, reference_id, description, created_by, created_at)
       VALUES(?, 'expense', -150, ?, 'expense', ?, 'مصروف نقل ومشال', ?, ?)`
    ).run(cashierSafeId, today, expId, adminId, now);
  });
}
