import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RotateCcw, Trash2, Truck } from 'lucide-react';
import { api } from '../api';
import type { Product, Supplier, TreasuryAccount, Warehouse } from '../types';
import { formatMoney, formatQty, todayIso } from '../utils/format';
import { Modal } from '../components/Modal';

interface PurchaseDraftItem {
  key: string;
  product_id: number;
  unit_id: number;
  quantity: number;
  unit_cost: number;
  discount_amount: number;
}

interface PurchasesPageProps {
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

export function PurchasesPage({ onNotify }: PurchasesPageProps) {
  const [purchases, setPurchases] = useState<Record<string, unknown>[]>([]);
  const [returnsList, setReturnsList] = useState<Record<string, unknown>[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeTab, setActiveTab] = useState<'new' | 'history' | 'returns'>('new');

  // New purchase form
  const [supplierId, setSupplierId] = useState<number>(0);
  const [warehouseId, setWarehouseId] = useState<number>(0);
  const [supplierInvNo, setSupplierInvNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [items, setItems] = useState<PurchaseDraftItem[]>([]);
  const [headerDiscount, setHeaderDiscount] = useState(0);
  const [shippingCost, setShippingCost] = useState(0);
  const [shippingPaidTo, setShippingPaidTo] = useState<'supplier' | 'external_cash'>('supplier');
  const [shippingAccId, setShippingAccId] = useState<number>(0);
  const [vatAmount, setVatAmount] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [treasuryId, setTreasuryId] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Damaged return modal
  const [retModalOpen, setRetModalOpen] = useState(false);
  const [retSupId, setRetSupId] = useState<number>(0);
  const [retWhId, setRetWhId] = useState<number>(0);
  const [retProdId, setRetProdId] = useState<number>(0);
  const [retUnitId, setRetUnitId] = useState<number>(0);
  const [retQty, setRetQty] = useState<number>(1);
  const [retUnitCost, setRetUnitCost] = useState<number>(0);
  const [retMethod, setRetMethod] = useState<'credit_note' | 'cash_refund'>('credit_note');
  const [retAccId, setRetAccId] = useState<number>(0);
  const [retReason, setRetReason] = useState('بضاعة تالفة / غير مطابقة');

  const nonKitProducts = useMemo(() => products.filter((p) => !p.is_kit), [products]);

  const loadAll = useCallback(async () => {
    try {
      const [purRes, retRes, supRes, whRes, accRes, prodRes] = await Promise.all([
        api.get<{ purchases: Record<string, unknown>[] }>('/api/purchases'),
        api.get<{ returns: Record<string, unknown>[] }>('/api/purchases/returns/list'),
        api.get<{ suppliers: Supplier[] }>('/api/suppliers'),
        api.get<{ warehouses: Warehouse[] }>('/api/warehouses'),
        api.get<{ accounts: TreasuryAccount[] }>('/api/treasury/accounts'),
        api.get<{ products: Product[] }>('/api/products'),
      ]);
      setPurchases(purRes.purchases);
      setReturnsList(retRes.returns);
      setSuppliers(supRes.suppliers);
      setWarehouses(whRes.warehouses);
      setAccounts(accRes.accounts);
      setProducts(prodRes.products);

      if (supRes.suppliers.length > 0) {
        setSupplierId((p) => p || supRes.suppliers[0].id);
        setRetSupId((p) => p || supRes.suppliers[0].id);
      }
      if (whRes.warehouses.length > 0) {
        const defWh = whRes.warehouses.find((w) => w.is_default === 1) || whRes.warehouses[0];
        setWarehouseId((p) => p || defWh.id);
        setRetWhId((p) => p || defWh.id);
      }
      if (accRes.accounts.length > 0) {
        const defAcc = accRes.accounts.find((a) => a.is_default_pos === 1) || accRes.accounts[0];
        setTreasuryId((p) => p || defAcc.id);
        setShippingAccId((p) => p || defAcc.id);
        setRetAccId((p) => p || defAcc.id);
      }
      const firstNormal = prodRes.products.find((p) => !p.is_kit);
      if (firstNormal) {
        setRetProdId((p) => p || firstNormal.id);
        setRetUnitId((p) => p || Number(firstNormal.units[0]?.id || 0));
        setRetUnitCost((p) => p || Number(firstNormal.last_purchase_cost || 0));
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر تحميل المشتريات', 'error');
    }
  }, [onNotify]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  function addPurchaseLine() {
    const p = nonKitProducts[0];
    if (!p) return;
    const u = p.units[0];
    const factor = Number(u?.conversion_factor || 1);
    setItems((prev) => [
      ...prev,
      {
        key: `${Date.now()}-${Math.random()}`,
        product_id: p.id,
        unit_id: Number(u?.id || 0),
        quantity: 1,
        unit_cost: Math.round(Number(p.last_purchase_cost || 0) * factor * 100) / 100,
        discount_amount: 0,
      },
    ]);
  }

  // Live Landed Cost Allocation Preview
  const preview = useMemo(() => {
    const lines = items.map((it) => {
      const p = nonKitProducts.find((x) => x.id === it.product_id);
      const u = p?.units.find((x) => Number(x.id) === it.unit_id) || p?.units[0];
      const factor = Number(u?.conversion_factor || 1);
      const qtyBase = it.quantity * factor;
      const netLine = Math.round((it.quantity * it.unit_cost - it.discount_amount) * 100) / 100;
      return { ...it, p, u, factor, qtyBase, netLine };
    });

    const subtotal = Math.round(lines.reduce((s, l) => s + l.netLine, 0) * 100) / 100;
    const totalBaseQty = lines.reduce((s, l) => s + l.qtyBase, 0);
    const netAfterHeaderDisc = Math.round((subtotal - headerDiscount) * 100) / 100;
    const totalSupplierBill = Math.round(
      (netAfterHeaderDisc + vatAmount + (shippingPaidTo === 'supplier' ? shippingCost : 0)) * 100
    ) / 100;

    let allocSoFar = 0;
    const enriched = lines.map((l, idx) => {
      let allocShip = 0;
      if (shippingCost > 0) {
        if (idx === lines.length - 1) {
          allocShip = Math.round((shippingCost - allocSoFar) * 100) / 100;
        } else {
          const w = subtotal > 0 ? l.netLine / subtotal : l.qtyBase / Math.max(1, totalBaseQty);
          allocShip = Math.round(shippingCost * w * 100) / 100;
          allocSoFar = Math.round((allocSoFar + allocShip) * 100) / 100;
        }
      }
      const afterDisc = subtotal > 0 ? l.netLine * (netAfterHeaderDisc / subtotal) : l.netLine;
      const landedPerBase = l.qtyBase > 0 ? Math.round(((afterDisc + allocShip) / l.qtyBase) * 10000) / 10000 : 0;
      return { ...l, allocShip, landedPerBase };
    });

    return { enriched, subtotal, totalSupplierBill, remaining: Math.round((totalSupplierBill - paidAmount) * 100) / 100 };
  }, [items, nonKitProducts, headerDiscount, shippingCost, shippingPaidTo, vatAmount, paidAmount]);

  async function submitPurchase() {
    if (items.length === 0) {
      onNotify('أضف صنفاً واحداً على الأقل لفاتورة الشراء', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post<{ purchase: { invoice_no: string } }>('/api/purchases', {
        supplier_id: supplierId,
        warehouse_id: warehouseId,
        supplier_invoice_no: supplierInvNo,
        invoice_date: invoiceDate,
        discount_amount: headerDiscount,
        shipping_cost: shippingCost,
        shipping_paid_to: shippingPaidTo,
        shipping_treasury_account_id: shippingAccId,
        vat_amount: vatAmount,
        paid_amount: paidAmount,
        treasury_account_id: treasuryId,
        notes,
        items: items.map((l) => ({
          product_id: l.product_id,
          unit_id: l.unit_id,
          quantity: l.quantity,
          unit_cost: l.unit_cost,
          discount_amount: l.discount_amount,
        })),
      });
      onNotify(`تم حفظ فاتورة الشراء ${res.purchase.invoice_no} وتحديث تكلفة الأصناف بمصاريف الشحن`);
      setItems([]);
      setSupplierInvNo('');
      setHeaderDiscount(0);
      setShippingCost(0);
      setVatAmount(0);
      setPaidAmount(0);
      setNotes('');
      await loadAll();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر حفظ فاتورة الشراء', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function submitDamagedReturn() {
    try {
      const res = await api.post<{ purchase_return: { return_no: string } }>('/api/purchases/returns', {
        supplier_id: retSupId,
        warehouse_id: retWhId,
        return_date: todayIso(),
        settlement_method: retMethod,
        treasury_account_id: retAccId,
        reason: retReason,
        items: [
          {
            product_id: retProdId,
            unit_id: retUnitId,
            quantity: retQty,
            unit_cost: retUnitCost,
          },
        ],
      });
      onNotify(`تم تسجيل مرتجع التوالف ${res.purchase_return.return_no}`);
      setRetModalOpen(false);
      await loadAll();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر تسجيل المرتجع', 'error');
    }
  }

  const retProd = nonKitProducts.find((p) => p.id === retProdId);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('new')}
            className={`px-4 py-2 rounded-xl text-sm font-bold ${
              activeTab === 'new' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            + فاتورة شراء جديدة
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-xl text-sm font-bold ${
              activeTab === 'history' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            سجل فواتير المشتريات ({purchases.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('returns')}
            className={`px-4 py-2 rounded-xl text-sm font-bold ${
              activeTab === 'returns' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            مرتجعات التوالف للموردين ({returnsList.length})
          </button>
        </div>

        <button
          type="button"
          onClick={() => setRetModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold"
        >
          <RotateCcw className="w-4 h-4" /> تسجيل مرتجع توالف لمورد
        </button>
      </div>

      {activeTab === 'new' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">المورد</label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.company ? `(${s.company})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">المخزن المستلم</label>
              <select
                value={warehouseId}
                onChange={(e) => setWarehouseId(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">رقم فاتورة المورد</label>
              <input
                type="text"
                value={supplierInvNo}
                onChange={(e) => setSupplierInvNo(e.target.value)}
                placeholder="اختياري"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">التاريخ</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-sm">أصناف فاتورة الشراء</h3>
            <button
              type="button"
              onClick={addPurchaseLine}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-sky-600 text-white text-xs font-bold"
            >
              <Plus className="w-4 h-4" /> إضافة صنف
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse border border-slate-200">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-200 p-2 text-right">الصنف</th>
                  <th className="border border-slate-200 p-2 text-center">الوحدة</th>
                  <th className="border border-slate-200 p-2 text-center">الكمية</th>
                  <th className="border border-slate-200 p-2 text-center">سعر شراء الوحدة</th>
                  <th className="border border-slate-200 p-2 text-center">خصم</th>
                  <th className="border border-slate-200 p-2 text-center">نصيب الشحن</th>
                  <th className="border border-slate-200 p-2 text-center text-sky-800">التكلفة الصافية للوحدة الأساسية</th>
                  <th className="border border-slate-200 p-2 text-left">صافي السطر</th>
                  <th className="border border-slate-200 p-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {preview.enriched.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-400">
                      اضغط «إضافة صنف» لبدء تسجيل فاتورة المشتريات
                    </td>
                  </tr>
                ) : (
                  preview.enriched.map((l) => (
                    <tr key={l.key}>
                      <td className="border border-slate-200 p-1.5">
                        <select
                          value={l.product_id}
                          onChange={(e) => {
                            const pid = Number(e.target.value);
                            const np = nonKitProducts.find((x) => x.id === pid);
                            const u = np?.units[0];
                            const f = Number(u?.conversion_factor || 1);
                            setItems((prev) =>
                              prev.map((x) =>
                                x.key === l.key
                                  ? {
                                      ...x,
                                      product_id: pid,
                                      unit_id: Number(u?.id || 0),
                                      unit_cost: Math.round(Number(np?.last_purchase_cost || 0) * f * 100) / 100,
                                    }
                                  : x
                              )
                            );
                          }}
                          className="w-48 rounded-lg border border-slate-300 px-2 py-1 bg-white"
                        >
                          {nonKitProducts.map((np) => (
                            <option key={np.id} value={np.id}>
                              {np.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="border border-slate-200 p-1.5">
                        <select
                          value={l.unit_id}
                          onChange={(e) => {
                            const uid = Number(e.target.value);
                            const u = l.p?.units.find((x) => Number(x.id) === uid);
                            const f = Number(u?.conversion_factor || 1);
                            setItems((prev) =>
                              prev.map((x) =>
                                x.key === l.key
                                  ? {
                                      ...x,
                                      unit_id: uid,
                                      unit_cost: Math.round(Number(l.p?.last_purchase_cost || 0) * f * 100) / 100,
                                    }
                                  : x
                              )
                            );
                          }}
                          className="w-28 rounded-lg border border-slate-300 px-2 py-1 bg-white"
                        >
                          {(l.p?.units || []).map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.unit_name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="border border-slate-200 p-1.5 text-center">
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          value={l.quantity}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((x) =>
                                x.key === l.key ? { ...x, quantity: Number(e.target.value) || 0 } : x
                              )
                            )
                          }
                          className="w-20 text-center rounded-lg border border-slate-300 px-2 py-1 font-bold"
                        />
                      </td>
                      <td className="border border-slate-200 p-1.5 text-center">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={l.unit_cost}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((x) =>
                                x.key === l.key ? { ...x, unit_cost: Number(e.target.value) || 0 } : x
                              )
                            )
                          }
                          className="w-24 text-center rounded-lg border border-slate-300 px-2 py-1 font-bold"
                        />
                      </td>
                      <td className="border border-slate-200 p-1.5 text-center">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={l.discount_amount}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((x) =>
                                x.key === l.key ? { ...x, discount_amount: Number(e.target.value) || 0 } : x
                              )
                            )
                          }
                          className="w-16 text-center rounded-lg border border-slate-300 px-1.5 py-1"
                        />
                      </td>
                      <td className="border border-slate-200 p-1.5 text-center text-amber-700 font-semibold">
                        {formatMoney(l.allocShip)}
                      </td>
                      <td className="border border-slate-200 p-1.5 text-center font-extrabold text-sky-800 bg-sky-50/60">
                        {formatMoney(l.landedPerBase)} / {l.p?.base_unit_name}
                      </td>
                      <td className="border border-slate-200 p-1.5 text-left font-bold">
                        {formatMoney(l.netLine)}
                      </td>
                      <td className="border border-slate-200 p-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => setItems((prev) => prev.filter((x) => x.key !== l.key))}
                          className="p-1 text-rose-600 hover:bg-rose-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Shipping & Payment Box */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">مصاريف الشحن والنقل (توزع على التكلفة)</label>
              <input
                type="number"
                min="0"
                step="any"
                value={shippingCost}
                onChange={(e) => setShippingCost(Math.max(0, Number(e.target.value) || 0))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">جهة دفع الشحن</label>
              <select
                value={shippingPaidTo}
                onChange={(e) => setShippingPaidTo(e.target.value as 'supplier' | 'external_cash')}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                <option value="supplier">مضاف على فاتورة المورد</option>
                <option value="external_cash">مدفوع نقداً لسائق / شركة شحن</option>
              </select>
            </div>

            {shippingPaidTo === 'external_cash' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">خزنة دفع الشحن</label>
                <select
                  value={shippingAccId}
                  onChange={(e) => setShippingAccId(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">خصم إضافي على الفاتورة</label>
              <input
                type="number"
                min="0"
                step="any"
                value={headerDiscount}
                onChange={(e) => setHeaderDiscount(Math.max(0, Number(e.target.value) || 0))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">المدفوع للمورد الآن</label>
              <input
                type="number"
                min="0"
                step="any"
                value={paidAmount}
                onChange={(e) => setPaidAmount(Math.max(0, Number(e.target.value) || 0))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">خزنة / حساب السداد للمورد</label>
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

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <div className="flex flex-wrap gap-5 text-sm">
              <span>إجمالي الأصناف: <strong>{formatMoney(preview.subtotal)}</strong></span>
              <span>إجمالي فاتورة المورد: <strong className="text-sky-800">{formatMoney(preview.totalSupplierBill)}</strong></span>
              <span>المتبقي للمورد (آجل): <strong className="text-rose-700">{formatMoney(preview.remaining)}</strong></span>
            </div>

            <button
              type="button"
              disabled={saving || items.length === 0}
              onClick={submitPurchase}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm"
            >
              <Truck className="w-4 h-4" />
              <span>{saving ? 'جاري الحفظ...' : 'حفظ فاتورة المشتريات وتحديث التكلفة'}</span>
            </button>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th className="p-3 text-right">رقم الفاتورة</th>
                <th className="p-3 text-center">التاريخ</th>
                <th className="p-3 text-right">المورد</th>
                <th className="p-3 text-right">المخزن</th>
                <th className="p-3 text-center">الشحن</th>
                <th className="p-3 text-center">إجمالي المورد</th>
                <th className="p-3 text-center">المدفوع</th>
                <th className="p-3 text-center">المتبقي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {purchases.map((p) => (
                <tr key={Number(p.id)}>
                  <td className="p-3 font-extrabold text-sky-800">{String(p.invoice_no)}</td>
                  <td className="p-3 text-center">{String(p.invoice_date)}</td>
                  <td className="p-3 font-bold">{String(p.supplier_name)}</td>
                  <td className="p-3">{String(p.warehouse_name)}</td>
                  <td className="p-3 text-center text-amber-700 font-semibold">{formatMoney(p.shipping_cost)}</td>
                  <td className="p-3 text-center font-bold">{formatMoney(p.total_supplier_amount)}</td>
                  <td className="p-3 text-center text-emerald-700">{formatMoney(p.paid_amount)}</td>
                  <td className="p-3 text-center text-rose-700 font-bold">{formatMoney(p.remaining_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'returns' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th className="p-3 text-right">رقم المرتجع</th>
                <th className="p-3 text-center">التاريخ</th>
                <th className="p-3 text-right">المورد</th>
                <th className="p-3 text-right">المخزن</th>
                <th className="p-3 text-right">السبب</th>
                <th className="p-3 text-center">التسوية</th>
                <th className="p-3 text-center">القيمة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {returnsList.map((r) => (
                <tr key={Number(r.id)}>
                  <td className="p-3 font-extrabold text-rose-700">{String(r.return_no)}</td>
                  <td className="p-3 text-center">{String(r.return_date)}</td>
                  <td className="p-3 font-bold">{String(r.supplier_name)}</td>
                  <td className="p-3">{String(r.warehouse_name)}</td>
                  <td className="p-3">{String(r.reason)}</td>
                  <td className="p-3 text-center">
                    {r.settlement_method === 'credit_note' ? 'خصم من حساب المورد' : 'استرداد نقدي'}
                  </td>
                  <td className="p-3 text-center font-extrabold">{formatMoney(r.total_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Damaged Goods Return Modal */}
      <Modal
        open={retModalOpen}
        title="تسجيل مرتجع مشتريات (توالف) للمورد"
        onClose={() => setRetModalOpen(false)}
        maxWidthClass="max-w-lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => setRetModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-bold"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={submitDamagedReturn}
              className="px-5 py-2 rounded-xl bg-rose-600 text-white text-sm font-bold"
            >
              تأكيد المرتجع وخصمه من المخزن
            </button>
          </>
        }
      >
        <div className="space-y-3 text-xs sm:text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">المورد</label>
              <select
                value={retSupId}
                onChange={(e) => setRetSupId(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">من مخزن</label>
              <select
                value={retWhId}
                onChange={(e) => setRetWhId(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">الصنف التالف</label>
            <select
              value={retProdId}
              onChange={(e) => {
                const pid = Number(e.target.value);
                setRetProdId(pid);
                const np = nonKitProducts.find((x) => x.id === pid);
                if (np) {
                  setRetUnitId(Number(np.units[0]?.id || 0));
                  setRetUnitCost(Number(np.last_purchase_cost || 0));
                }
              }}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
            >
              {nonKitProducts.map((np) => (
                <option key={np.id} value={np.id}>
                  {np.name} (متاح: {formatQty(np.stock_by_warehouse[retWhId] ?? 0)} {np.base_unit_name})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الوحدة</label>
              <select
                value={retUnitId}
                onChange={(e) => setRetUnitId(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 px-2 py-2 bg-white"
              >
                {(retProd?.units || []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.unit_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الكمية</label>
              <input
                type="number"
                min="0.01"
                step="any"
                value={retQty}
                onChange={(e) => setRetQty(Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-center font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">سعر الوحدة</label>
              <input
                type="number"
                min="0"
                step="any"
                value={retUnitCost}
                onChange={(e) => setRetUnitCost(Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-center font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">طريقة التسوية</label>
              <select
                value={retMethod}
                onChange={(e) => setRetMethod(e.target.value as 'credit_note' | 'cash_refund')}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
              >
                <option value="credit_note">خصم من رصيد المورد المستحق</option>
                <option value="cash_refund">استرداد نقدي إلى الخزنة</option>
              </select>
            </div>
            {retMethod === 'cash_refund' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الخزنة</label>
                <select
                  value={retAccId}
                  onChange={(e) => setRetAccId(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">سبب المرتجع</label>
            <input
              type="text"
              value={retReason}
              onChange={(e) => setRetReason(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
