import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Barcode, Layers, Plus, Printer, Search, Trash2, UserPlus } from 'lucide-react';
import { api } from '../api';
import type {
  Customer,
  Plumber,
  PriceTier,
  PrintDocumentPayload,
  PrintMode,
  Product,
  ProductUnit,
  SalesInvoice,
  SalesInvoiceItem,
  TreasuryAccount,
  Warehouse,
} from '../types';
import { formatMoney, formatQty, priceTierLabel, todayIso } from '../utils/format';
import { GlobalBarcodeListener } from '../components/GlobalBarcodeListener';
import { Modal } from '../components/Modal';

interface CartLine {
  key: string;
  product: Product;
  unitId: number;
  unitName: string;
  conversionFactor: number;
  quantity: number;
  unitPrice: number;
  discount: number;
}

interface PosPageProps {
  settings: Record<string, string>;
  onPrint: (payload: PrintDocumentPayload) => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

function unitPriceForTier(u: ProductUnit, tier: PriceTier): number {
  if (tier === 'plumber') return Number(u.plumber_price);
  if (tier === 'wholesale') return Number(u.wholesale_price);
  return Number(u.retail_price);
}

export function PosPage({ settings, onPrint, onNotify }: PosPageProps) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plumbers, setPlumbers] = useState<Plumber[]>([]);
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [warehouseId, setWarehouseId] = useState<number>(0);
  const [customerId, setCustomerId] = useState<number>(0);
  const [plumberId, setPlumberId] = useState<number | ''>('');
  const [priceTier, setPriceTier] = useState<PriceTier>('retail');
  const [invoiceDate, setInvoiceDate] = useState<string>(todayIso());
  const [treasuryId, setTreasuryId] = useState<number>(0);

  const [barcodeInput, setBarcodeInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [invoiceDiscount, setInvoiceDiscount] = useState<number>(0);
  const [vatEnabled, setVatEnabled] = useState<boolean>(settings.vat_enabled === 'true');
  const [paidAmount, setPaidAmount] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Quick add customer modal
  const [quickCustOpen, setQuickCustOpen] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustTier, setNewCustTier] = useState<PriceTier>('retail');

  const barcodeRef = useRef<HTMLInputElement | null>(null);
  const defaultVatRate = Number(settings.default_vat_rate || '14') || 14;

  const loadMasterData = useCallback(async () => {
    try {
      const [whRes, custRes, plumRes, accRes, prodRes] = await Promise.all([
        api.get<{ warehouses: Warehouse[] }>('/api/warehouses'),
        api.get<{ customers: Customer[] }>('/api/customers'),
        api.get<{ plumbers: Plumber[] }>('/api/plumbers'),
        api.get<{ accounts: TreasuryAccount[] }>('/api/treasury/accounts'),
        api.get<{ products: Product[] }>('/api/products'),
      ]);
      setWarehouses(whRes.warehouses);
      setCustomers(custRes.customers);
      setPlumbers(plumRes.plumbers);
      setAccounts(accRes.accounts);
      setProducts(prodRes.products);

      setWarehouseId((prev) => {
        if (prev) return prev;
        const def = whRes.warehouses.find((w) => w.is_default === 1) || whRes.warehouses[0];
        return def ? def.id : 0;
      });
      setCustomerId((prev) => {
        if (prev) return prev;
        const walkin = custRes.customers.find((c) => c.is_walkin === 1) || custRes.customers[0];
        return walkin ? walkin.id : 0;
      });
      setTreasuryId((prev) => {
        if (prev) return prev;
        const def = accRes.accounts.find((a) => a.is_default_pos === 1) || accRes.accounts[0];
        return def ? def.id : 0;
      });
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر تحميل البيانات', 'error');
    }
  }, [onNotify]);

  useEffect(() => {
    loadMasterData();
  }, [loadMasterData]);

  useEffect(() => {
    setVatEnabled(settings.vat_enabled === 'true');
  }, [settings.vat_enabled]);

  const addProductToCart = useCallback(
    (product: Product, unitId?: number) => {
      const unit =
        product.units.find((u) => Number(u.id) === Number(unitId)) ||
        product.units.find((u) => Boolean(u.is_base)) ||
        product.units[0];
      if (!unit || !unit.id) {
        onNotify('الصنف لا يحتوي على وحدة بيع معرفة', 'error');
        return;
      }
      const price = unitPriceForTier(unit, priceTier);
      setCart((prev) => {
        const existingIdx = prev.findIndex(
          (l) => l.product.id === product.id && l.unitId === unit.id
        );
        if (existingIdx >= 0) {
          const updated = [...prev];
          updated[existingIdx] = {
            ...updated[existingIdx],
            quantity: Math.round((updated[existingIdx].quantity + 1) * 10000) / 10000,
          };
          return updated;
        }
        return [
          ...prev,
          {
            key: `${product.id}-${unit.id}-${Date.now()}`,
            product,
            unitId: unit.id!,
            unitName: unit.unit_name,
            conversionFactor: Number(unit.conversion_factor),
            quantity: 1,
            unitPrice: price,
            discount: 0,
          },
        ];
      });
    },
    [priceTier, onNotify]
  );

  const handleBarcodeLookup = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim();
      if (!code) return;
      try {
        const res = await api.get<{ product: Product; matched_unit_id: number }>(
          `/api/products/barcode/${encodeURIComponent(code)}`
        );
        addProductToCart(res.product, res.matched_unit_id);
        setBarcodeInput('');
        onNotify(`تمت إضافة: ${res.product.name}`);
      } catch (err) {
        onNotify(err instanceof Error ? err.message : 'الباركود غير مسجل', 'error');
      }
    },
    [addProductToCart, onNotify]
  );

  function handleCustomerChange(nextCustId: number) {
    setCustomerId(nextCustId);
    const cust = customers.find((c) => c.id === nextCustId);
    if (cust) {
      handleTierChange(cust.price_tier);
    }
  }

  function handleTierChange(nextTier: PriceTier) {
    setPriceTier(nextTier);
    setCart((prev) =>
      prev.map((line) => {
        const u = line.product.units.find((x) => x.id === line.unitId);
        if (!u) return line;
        return { ...line, unitPrice: unitPriceForTier(u, nextTier) };
      })
    );
  }

  function handleUnitChange(lineKey: string, newUnitId: number) {
    setCart((prev) =>
      prev.map((line) => {
        if (line.key !== lineKey) return line;
        const u = line.product.units.find((x) => x.id === newUnitId);
        if (!u) return line;
        return {
          ...line,
          unitId: newUnitId,
          unitName: u.unit_name,
          conversionFactor: Number(u.conversion_factor),
          unitPrice: unitPriceForTier(u, priceTier),
        };
      })
    );
  }

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = q
      ? products.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.sku || '').toLowerCase().includes(q) ||
            (p.brand || '').toLowerCase().includes(q) ||
            (p.size || '').toLowerCase().includes(q) ||
            (p.category || '').toLowerCase().includes(q) ||
            p.units.some((u) => (u.barcode || '').toLowerCase().includes(q))
        )
      : products;
    return list.slice(0, 24);
  }, [products, searchQuery]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let vatTotal = 0;
    for (const line of cart) {
      const lineNet = Math.round((line.quantity * line.unitPrice - line.discount) * 100) / 100;
      const vatRate = vatEnabled
        ? line.product.vat_rate !== null && line.product.vat_rate !== undefined
          ? Number(line.product.vat_rate)
          : defaultVatRate
        : 0;
      const lineVat = vatEnabled ? Math.round(lineNet * (vatRate / 100) * 100) / 100 : 0;
      subtotal = Math.round((subtotal + lineNet) * 100) / 100;
      vatTotal = Math.round((vatTotal + lineVat) * 100) / 100;
    }
    const total = Math.max(0, Math.round((subtotal + vatTotal - invoiceDiscount) * 100) / 100);
    const paid = paidAmount === '' ? total : Math.max(0, Math.min(total, Number(paidAmount) || 0));
    const remaining = Math.round((total - paid) * 100) / 100;
    return { subtotal, vatTotal, total, paid, remaining };
  }, [cart, vatEnabled, defaultVatRate, invoiceDiscount, paidAmount]);

  const selectedCustomer = customers.find((c) => c.id === customerId);

  async function submitInvoice(printMode?: PrintMode) {
    if (cart.length === 0) {
      onNotify('أضف صنفاً واحداً على الأقل للفاتورة', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        warehouse_id: warehouseId,
        customer_id: customerId,
        plumber_id: plumberId || null,
        price_tier: priceTier,
        invoice_date: invoiceDate,
        discount_amount: invoiceDiscount,
        vat_enabled: vatEnabled,
        paid_amount: totals.paid,
        treasury_account_id: treasuryId,
        notes,
        items: cart.map((l) => ({
          product_id: l.product.id,
          unit_id: l.unitId,
          quantity: l.quantity,
          unit_price: l.unitPrice,
          discount_amount: l.discount,
        })),
      };
      const res = await api.post<{ invoice: SalesInvoice }>('/api/sales', payload);
      onNotify(`تم حفظ الفاتورة رقم ${res.invoice.invoice_no} بنجاح`);

      if (printMode) {
        const detail = await api.get<{ invoice: SalesInvoice; items: SalesInvoiceItem[] }>(
          `/api/sales/${res.invoice.id}`
        );
        onPrint({ mode: printMode, kind: 'sales_invoice', data: detail });
      }

      setCart([]);
      setInvoiceDiscount(0);
      setPaidAmount('');
      setNotes('');
      await loadMasterData();
      barcodeRef.current?.focus();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر حفظ الفاتورة', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleQuickAddCustomer() {
    if (!newCustName.trim()) return;
    try {
      const res = await api.post<{ customer: Customer }>('/api/customers', {
        name: newCustName.trim(),
        phone: newCustPhone.trim(),
        price_tier: newCustTier,
      });
      setCustomers((prev) => [res.customer, ...prev]);
      setCustomerId(res.customer.id);
      handleTierChange(res.customer.price_tier);
      setQuickCustOpen(false);
      setNewCustName('');
      setNewCustPhone('');
      onNotify(`تمت إضافة العميل: ${res.customer.name}`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر إضافة العميل', 'error');
    }
  }

  return (
    <div className="space-y-4">
      <GlobalBarcodeListener enabled={!quickCustOpen} onScan={handleBarcodeLookup} />

      {/* Header Controls */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div>
          <label className="block text-[11px] font-bold text-slate-600 mb-1">المخزن</label>
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(Number(e.target.value))}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white focus:border-sky-600 outline-none"
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-600 mb-1">العميل</label>
          <div className="flex gap-1.5">
            <select
              value={customerId}
              onChange={(e) => handleCustomerChange(Number(e.target.value))}
              className="flex-1 min-w-0 rounded-xl border border-slate-300 px-2.5 py-2 text-sm bg-white focus:border-sky-600 outline-none"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.balance > 0 ? `(عليه ${formatQty(c.balance)})` : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setQuickCustOpen(true)}
              title="إضافة عميل سريع"
              className="px-2.5 rounded-xl bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100"
            >
              <UserPlus className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-600 mb-1">ربط باسم السباك (للتقارير)</label>
          <select
            value={plumberId}
            onChange={(e) => setPlumberId(e.target.value ? Number(e.target.value) : '')}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white focus:border-sky-600 outline-none"
          >
            <option value="">بدون سباك</option>
            {plumbers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-600 mb-1">مستوى التسعير</label>
          <select
            value={priceTier}
            onChange={(e) => handleTierChange(e.target.value as PriceTier)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-sky-50 font-bold text-sky-900 focus:border-sky-600 outline-none"
          >
            <option value="retail">{priceTierLabel('retail')}</option>
            <option value="plumber">{priceTierLabel('plumber')}</option>
            <option value="wholesale">{priceTierLabel('wholesale')}</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-600 mb-1">تاريخ الفاتورة</label>
          <input
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white focus:border-sky-600 outline-none"
          />
        </div>
      </div>

      {/* Main Split: Search/Catalog + Cart */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Left: Barcode & Product Picker */}
        <div className="xl:col-span-5 bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="relative">
              <Barcode className="w-4 h-4 text-sky-600 absolute right-3 top-3" />
              <input
                ref={barcodeRef}
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleBarcodeLookup(barcodeInput);
                  }
                }}
                placeholder="امسح الباركود + Enter"
                className="w-full rounded-xl border border-sky-300 bg-sky-50/40 pr-9 pl-3 py-2 text-sm focus:border-sky-600 focus:bg-white outline-none"
              />
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث بالاسم، المقاس، الماركة..."
                className="w-full rounded-xl border border-slate-300 pr-9 pl-3 py-2 text-sm focus:border-sky-600 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[520px] overflow-y-auto pr-0.5">
            {filteredProducts.map((p) => {
              const baseUnit = p.units.find((u) => Boolean(u.is_base)) || p.units[0];
              const price = baseUnit ? unitPriceForTier(baseUnit, priceTier) : 0;
              const whStock = Number(p.stock_by_warehouse[warehouseId] ?? 0);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addProductToCart(p, baseUnit?.id)}
                  className="text-right rounded-xl border border-slate-200 hover:border-sky-500 hover:bg-sky-50/50 p-3 transition flex flex-col justify-between gap-1.5"
                >
                  <div>
                    <div className="flex items-start justify-between gap-1.5">
                      <span className="text-xs font-extrabold text-slate-900 leading-snug">{p.name}</span>
                      {p.is_kit && (
                        <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-bold bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded">
                          <Layers className="w-3 h-3" /> طقم
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {[p.brand, p.size, p.color].filter(Boolean).join(' • ') || p.category}
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                    <span className="font-extrabold text-sky-700">
                      {formatMoney(price)} / {baseUnit?.unit_name || p.base_unit_name}
                    </span>
                    <span
                      className={`font-bold text-[11px] ${
                        whStock <= 0 ? 'text-rose-600' : whStock <= p.min_stock ? 'text-amber-600' : 'text-emerald-700'
                      }`}
                    >
                      متاح: {formatQty(whStock)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Invoice Cart & Checkout */}
        <div className="xl:col-span-7 bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between gap-4">
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-700">
                  <th className="p-2 text-right rounded-r-lg">الصنف</th>
                  <th className="p-2 text-center">الوحدة</th>
                  <th className="p-2 text-center w-24">الكمية</th>
                  <th className="p-2 text-center w-24">السعر</th>
                  <th className="p-2 text-center w-20">خصم</th>
                  <th className="p-2 text-left">الإجمالي</th>
                  <th className="p-2 text-center rounded-l-lg w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cart.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400 text-sm">
                      امسح باركود الصنف أو اضغط على أي صنف من القائمة لإضافته للفاتورة
                    </td>
                  </tr>
                ) : (
                  cart.map((line) => {
                    const whBaseStock = Number(line.product.stock_by_warehouse[warehouseId] ?? 0);
                    const maxInUnit = Math.round((whBaseStock / line.conversionFactor) * 1000) / 1000;
                    const lineNet = Math.round((line.quantity * line.unitPrice - line.discount) * 100) / 100;
                    const overStock = line.quantity > maxInUnit;
                    return (
                      <tr key={line.key} className="hover:bg-slate-50/70">
                        <td className="p-2">
                          <div className="font-bold text-slate-900">{line.product.name}</div>
                          <div className={`text-[11px] ${overStock ? 'text-rose-600 font-bold' : 'text-slate-500'}`}>
                            متاح: {formatQty(maxInUnit)} {line.unitName}
                            {line.product.is_kit ? ' (طقم مجمع)' : ''}
                          </div>
                        </td>
                        <td className="p-2 text-center">
                          <select
                            value={line.unitId}
                            onChange={(e) => handleUnitChange(line.key, Number(e.target.value))}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs bg-white"
                          >
                            {line.product.units.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.unit_name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2 text-center">
                          <input
                            type="number"
                            step="any"
                            min="0.01"
                            value={line.quantity}
                            onChange={(e) => {
                              const val = Math.max(0.01, Number(e.target.value) || 0);
                              setCart((prev) =>
                                prev.map((x) => (x.key === line.key ? { ...x, quantity: val } : x))
                              );
                            }}
                            className="w-20 text-center rounded-lg border border-slate-300 px-2 py-1 text-xs font-bold"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={line.unitPrice}
                            onChange={(e) => {
                              const val = Math.max(0, Number(e.target.value) || 0);
                              setCart((prev) =>
                                prev.map((x) => (x.key === line.key ? { ...x, unitPrice: val } : x))
                              );
                            }}
                            className="w-22 text-center rounded-lg border border-slate-300 px-2 py-1 text-xs font-bold"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={line.discount}
                            onChange={(e) => {
                              const val = Math.max(0, Number(e.target.value) || 0);
                              setCart((prev) =>
                                prev.map((x) => (x.key === line.key ? { ...x, discount: val } : x))
                              );
                            }}
                            className="w-16 text-center rounded-lg border border-slate-300 px-1.5 py-1 text-xs"
                          />
                        </td>
                        <td className="p-2 text-left font-extrabold text-slate-900">{formatMoney(lineNet)}</td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => setCart((prev) => prev.filter((x) => x.key !== line.key))}
                            className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Totals & Payment */}
          <div className="border-t border-slate-200 pt-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">خصم إضافي على الفاتورة</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={invoiceDiscount}
                  onChange={(e) => setInvoiceDiscount(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">خزنة / وسيلة الاستلام</label>
                <select
                  value={treasuryId}
                  onChange={(e) => setTreasuryId(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-600">المدفوع الآن</label>
                  {selectedCustomer && selectedCustomer.is_walkin === 0 && (
                    <button
                      type="button"
                      onClick={() => setPaidAmount('0')}
                      className="text-[11px] font-bold text-amber-700 hover:underline"
                    >
                      آجل بالكامل
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  placeholder={`${totals.total} (مدفوع بالكامل)`}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 rounded-xl p-3 border border-slate-200">
              <div className="flex items-center gap-4 flex-wrap text-xs">
                <label className="inline-flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={vatEnabled}
                    onChange={(e) => setVatEnabled(e.target.checked)}
                    className="rounded border-slate-300 text-sky-600"
                  />
                  <span>تفعيل ضريبة القيمة المضافة ({defaultVatRate}%)</span>
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="ملاحظات الفاتورة (اختياري)..."
                  className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs bg-white w-56"
                />
              </div>

              <div className="flex items-center gap-5 text-sm">
                {vatEnabled && (
                  <div>
                    <span className="text-slate-500 text-xs">الضريبة: </span>
                    <span className="font-bold">{formatMoney(totals.vatTotal)}</span>
                  </div>
                )}
                {totals.remaining > 0 && (
                  <div>
                    <span className="text-amber-700 text-xs font-bold">آجل متبقي: </span>
                    <span className="font-extrabold text-amber-700">{formatMoney(totals.remaining)}</span>
                  </div>
                )}
                <div className="text-lg font-extrabold text-emerald-700">
                  الإجمالي: {formatMoney(totals.total)}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                disabled={saving || cart.length === 0}
                onClick={() => submitInvoice()}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-sm font-bold transition"
              >
                حفظ الفاتورة فقط
              </button>
              <button
                type="button"
                disabled={saving || cart.length === 0}
                onClick={() => submitInvoice('80mm')}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold transition"
              >
                <Printer className="w-4 h-4" />
                <span>حفظ وطباعة 80mm</span>
              </button>
              <button
                type="button"
                disabled={saving || cart.length === 0}
                onClick={() => submitInvoice('a4')}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-bold transition"
              >
                <Printer className="w-4 h-4" />
                <span>حفظ وطباعة A4</span>
              </button>
              <button
                type="button"
                disabled={saving || cart.length === 0}
                onClick={() => submitInvoice('a5')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm font-bold transition"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة A5</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Customer Modal */}
      <Modal
        open={quickCustOpen}
        title="إضافة عميل جديد سريعاً"
        onClose={() => setQuickCustOpen(false)}
        maxWidthClass="max-w-md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setQuickCustOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-bold"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleQuickAddCustomer}
              className="px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-bold inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> حفظ العميل
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">اسم العميل / صاحب الشقة</label>
            <input
              type="text"
              value={newCustName}
              onChange={(e) => setNewCustName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">رقم الموبايل</label>
            <input
              type="tel"
              value={newCustPhone}
              onChange={(e) => setNewCustPhone(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">فئة التسعير الافتراضية</label>
            <select
              value={newCustTier}
              onChange={(e) => setNewCustTier(e.target.value as PriceTier)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
            >
              <option value="retail">{priceTierLabel('retail')}</option>
              <option value="plumber">{priceTierLabel('plumber')}</option>
              <option value="wholesale">{priceTierLabel('wholesale')}</option>
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
