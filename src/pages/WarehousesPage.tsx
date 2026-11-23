import { useCallback, useEffect, useState } from 'react';
import { ArrowLeftRight, ClipboardCheck, History, Plus, Warehouse as WarehouseIcon } from 'lucide-react';
import { api } from '../api';
import type { Product, Warehouse } from '../types';
import { formatQty, movementTypeLabel, todayIso } from '../utils/format';
import { Modal } from '../components/Modal';

interface WarehousesPageProps {
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

export function WarehousesPage({ onNotify }: WarehousesPageProps) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Record<string, unknown>[]>([]);
  const [transfers, setTransfers] = useState<Record<string, unknown>[]>([]);
  const [activeTab, setActiveTab] = useState<'stock' | 'transfers' | 'movements'>('stock');

  // New warehouse modal
  const [whModalOpen, setWhModalOpen] = useState(false);
  const [whName, setWhName] = useState('');
  const [whLocation, setWhLocation] = useState('');

  // Transfer modal
  const [trModalOpen, setTrModalOpen] = useState(false);
  const [fromWhId, setFromWhId] = useState<number>(0);
  const [toWhId, setToWhId] = useState<number>(0);
  const [trNotes, setTrNotes] = useState('');
  const [trItems, setTrItems] = useState<{ product_id: number; unit_id: number; quantity: number }[]>([]);

  // Stock count / adjustment modal
  const [adjModalOpen, setAdjModalOpen] = useState(false);
  const [adjWhId, setAdjWhId] = useState<number>(0);
  const [adjCounts, setAdjCounts] = useState<Record<number, string>>({});
  const [adjNotes, setAdjNotes] = useState('جرد فعلي دوري');

  const loadAll = useCallback(async () => {
    try {
      const [whRes, prodRes, movRes, trRes] = await Promise.all([
        api.get<{ warehouses: Warehouse[] }>('/api/warehouses'),
        api.get<{ products: Product[] }>('/api/products'),
        api.get<{ movements: Record<string, unknown>[] }>('/api/warehouses/movements'),
        api.get<{ transfers: Record<string, unknown>[] }>('/api/warehouses/transfers'),
      ]);
      setWarehouses(whRes.warehouses);
      setProducts(prodRes.products);
      setMovements(movRes.movements);
      setTransfers(trRes.transfers);
      if (whRes.warehouses.length >= 1) {
        setFromWhId((prev) => prev || whRes.warehouses[0].id);
        setAdjWhId((prev) => prev || whRes.warehouses[0].id);
      }
      if (whRes.warehouses.length >= 2) {
        setToWhId((prev) => prev || whRes.warehouses[1].id);
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر تحميل بيانات المخازن', 'error');
    }
  }, [onNotify]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const normalProducts = products.filter((p) => !p.is_kit);

  async function saveWarehouse() {
    if (!whName.trim()) return;
    try {
      await api.post('/api/warehouses', { name: whName.trim(), location: whLocation.trim() });
      setWhModalOpen(false);
      setWhName('');
      setWhLocation('');
      onNotify('تمت إضافة المخزن');
      await loadAll();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر إضافة المخزن', 'error');
    }
  }

  function openTransferModal() {
    if (warehouses.length < 2) {
      onNotify('تحتاج لمخزنين على الأقل لتنفيذ التحويل', 'error');
      return;
    }
    const firstProd = normalProducts[0];
    setTrItems(
      firstProd
        ? [{ product_id: firstProd.id, unit_id: Number(firstProd.units[0]?.id || 0), quantity: 1 }]
        : []
    );
    setTrNotes('');
    setTrModalOpen(true);
  }

  async function submitTransfer() {
    if (trItems.length === 0) return;
    try {
      await api.post('/api/warehouses/transfers', {
        from_warehouse_id: fromWhId,
        to_warehouse_id: toWhId,
        transfer_date: todayIso(),
        notes: trNotes,
        items: trItems,
      });
      setTrModalOpen(false);
      onNotify('تم تنفيذ التحويل بين المخازن بنجاح');
      await loadAll();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر تنفيذ التحويل', 'error');
    }
  }

  function openAdjustmentModal() {
    const map: Record<number, string> = {};
    normalProducts.forEach((p) => {
      map[p.id] = String(p.stock_by_warehouse[adjWhId] ?? 0);
    });
    setAdjCounts(map);
    setAdjModalOpen(true);
  }

  async function submitAdjustment() {
    const changed = normalProducts
      .map((p) => ({
        product_id: p.id,
        counted_qty_base: Number(adjCounts[p.id] ?? p.stock_by_warehouse[adjWhId] ?? 0),
      }))
      .filter((item, idx) => item.counted_qty_base !== (normalProducts[idx].stock_by_warehouse[adjWhId] ?? 0));

    if (changed.length === 0) {
      onNotify('لم يتغير أي رصيد في الجرد');
      setAdjModalOpen(false);
      return;
    }

    try {
      const res = await api.post<{ adjusted_count: number }>('/api/warehouses/adjustments', {
        warehouse_id: adjWhId,
        items: changed,
        notes: adjNotes,
      });
      setAdjModalOpen(false);
      onNotify(`تم حفظ تسوية الجرد لعدد ${res.adjusted_count} صنف`);
      await loadAll();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر حفظ الجرد', 'error');
    }
  }

  return (
    <div className="space-y-4">
      {/* Warehouses Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {warehouses.map((w) => (
          <div key={w.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <WarehouseIcon className="w-5 h-5 text-sky-600" />
                <span className="font-extrabold text-slate-900">{w.name}</span>
              </div>
              {w.is_default === 1 && (
                <span className="text-[11px] font-bold bg-sky-50 text-sky-700 px-2 py-0.5 rounded-full">
                  افتراضي
                </span>
              )}
            </div>
            {w.location && <div className="text-xs text-slate-500 mt-1">{w.location}</div>}
            <div className="text-xs text-slate-700 mt-2 font-semibold">
              أصناف متوفرة: {w.active_items_count ?? 0} • إجمالي الوحدات: {formatQty(w.total_units_count ?? 0)}
            </div>
          </div>
        ))}
      </div>

      {/* Actions & Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('stock')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold ${
              activeTab === 'stock' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            أرصدة المخازن
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('transfers')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold ${
              activeTab === 'transfers' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            التحويلات ({transfers.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('movements')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold ${
              activeTab === 'movements' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            <History className="w-4 h-4" /> سجل الحركات
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openTransferModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold"
          >
            <ArrowLeftRight className="w-4 h-4" /> تحويل بين المخازن
          </button>
          <button
            type="button"
            onClick={openAdjustmentModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-bold"
          >
            <ClipboardCheck className="w-4 h-4" /> جرد وتسوية مخزون
          </button>
          <button
            type="button"
            onClick={() => setWhModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 text-white text-xs sm:text-sm font-bold"
          >
            <Plus className="w-4 h-4" /> مخزن جديد
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'stock' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th className="p-3 text-right">الصنف</th>
                <th className="p-3 text-center">الوحدة الأساسية</th>
                {warehouses.map((w) => (
                  <th key={w.id} className="p-3 text-center">
                    {w.name}
                  </th>
                ))}
                <th className="p-3 text-center">الإجمالي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {normalProducts.map((p) => (
                <tr key={p.id}>
                  <td className="p-3 font-bold">
                    {p.name}{' '}
                    <span className="text-[11px] font-normal text-slate-500">
                      {[p.brand, p.size].filter(Boolean).join(' • ')}
                    </span>
                  </td>
                  <td className="p-3 text-center">{p.base_unit_name}</td>
                  {warehouses.map((w) => (
                    <td key={w.id} className="p-3 text-center font-semibold">
                      {formatQty(p.stock_by_warehouse[w.id] ?? 0)}
                    </td>
                  ))}
                  <td className="p-3 text-center font-extrabold text-sky-700">{formatQty(p.total_stock)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'transfers' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th className="p-3 text-right">رقم التحويل</th>
                <th className="p-3 text-center">التاريخ</th>
                <th className="p-3 text-right">من مخزن</th>
                <th className="p-3 text-right">إلى مخزن</th>
                <th className="p-3 text-right">الأصناف المحولة</th>
                <th className="p-3 text-right">ملاحظات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transfers.map((t) => (
                <tr key={Number(t.id)}>
                  <td className="p-3 font-extrabold text-sky-700">{String(t.transfer_no)}</td>
                  <td className="p-3 text-center">{String(t.transfer_date)}</td>
                  <td className="p-3">{String(t.from_warehouse_name)}</td>
                  <td className="p-3 font-bold">{String(t.to_warehouse_name)}</td>
                  <td className="p-3 text-xs">
                    {((t.items as Record<string, unknown>[]) || [])
                      .map((i) => `${i.product_name} (${formatQty(i.quantity)} ${i.unit_name})`)
                      .join('، ')}
                  </td>
                  <td className="p-3 text-slate-500">{String(t.notes || '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'movements' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th className="p-3 text-right">التاريخ والوقت</th>
                <th className="p-3 text-right">المخزن</th>
                <th className="p-3 text-right">الصنف</th>
                <th className="p-3 text-center">نوع الحركة</th>
                <th className="p-3 text-center">التغير</th>
                <th className="p-3 text-right">البيان</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {movements.map((m) => {
                const delta = Number(m.quantity_delta);
                return (
                  <tr key={Number(m.id)}>
                    <td className="p-3 text-xs text-slate-500">{String(m.created_at)}</td>
                    <td className="p-3">{String(m.warehouse_name)}</td>
                    <td className="p-3 font-bold">{String(m.product_name)}</td>
                    <td className="p-3 text-center">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-[11px] font-bold">
                        {movementTypeLabel(String(m.movement_type))}
                      </span>
                    </td>
                    <td
                      className={`p-3 text-center font-extrabold ${
                        delta >= 0 ? 'text-emerald-700' : 'text-rose-600'
                      }`}
                    >
                      {delta >= 0 ? `+${formatQty(delta)}` : formatQty(delta)} {String(m.base_unit_name)}
                    </td>
                    <td className="p-3 text-xs text-slate-600">{String(m.notes || '—')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* New Warehouse Modal */}
      <Modal
        open={whModalOpen}
        title="إضافة مخزن جديد"
        onClose={() => setWhModalOpen(false)}
        maxWidthClass="max-w-md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setWhModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-bold"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={saveWarehouse}
              className="px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-bold"
            >
              حفظ المخزن
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">اسم المخزن</label>
            <input
              type="text"
              value={whName}
              onChange={(e) => setWhName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">الموقع / الوصف</label>
            <input
              type="text"
              value={whLocation}
              onChange={(e) => setWhLocation(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </Modal>

      {/* Transfer Modal */}
      <Modal
        open={trModalOpen}
        title="تحويل بضاعة بين المخازن"
        onClose={() => setTrModalOpen(false)}
        maxWidthClass="max-w-2xl"
        footer={
          <>
            <button
              type="button"
              onClick={() => setTrModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-bold"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={submitTransfer}
              className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold"
            >
              تأكيد التحويل
            </button>
          </>
        }
      >
        <div className="space-y-3 text-xs sm:text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">من مخزن</label>
              <select
                value={fromWhId}
                onChange={(e) => setFromWhId(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">إلى مخزن</label>
              <select
                value={toWhId}
                onChange={(e) => setToWhId(Number(e.target.value))}
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

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-bold text-slate-800">الأصناف المحولة</span>
              <button
                type="button"
                onClick={() => {
                  const p = normalProducts[0];
                  if (p)
                    setTrItems((prev) => [
                      ...prev,
                      { product_id: p.id, unit_id: Number(p.units[0]?.id || 0), quantity: 1 },
                    ]);
                }}
                className="px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 text-xs font-bold"
              >
                + إضافة صنف
              </button>
            </div>

            {trItems.map((it, idx) => {
              const p = normalProducts.find((x) => x.id === it.product_id);
              const avail = p ? p.stock_by_warehouse[fromWhId] ?? 0 : 0;
              return (
                <div key={idx} className="flex flex-wrap items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                  <select
                    value={it.product_id}
                    onChange={(e) => {
                      const pid = Number(e.target.value);
                      const np = normalProducts.find((x) => x.id === pid);
                      setTrItems((prev) =>
                        prev.map((x, i) =>
                          i === idx
                            ? { ...x, product_id: pid, unit_id: Number(np?.units[0]?.id || 0) }
                            : x
                        )
                      );
                    }}
                    className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs bg-white"
                  >
                    {normalProducts.map((np) => (
                      <option key={np.id} value={np.id}>
                        {np.name} (متاح: {formatQty(np.stock_by_warehouse[fromWhId] ?? 0)})
                      </option>
                    ))}
                  </select>
                  <select
                    value={it.unit_id}
                    onChange={(e) =>
                      setTrItems((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, unit_id: Number(e.target.value) } : x))
                      )
                    }
                    className="w-32 rounded-lg border border-slate-300 px-2 py-1.5 text-xs bg-white"
                  >
                    {(p?.units || []).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.unit_name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    value={it.quantity}
                    onChange={(e) =>
                      setTrItems((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, quantity: Number(e.target.value) || 0 } : x))
                      )
                    }
                    className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-center bg-white"
                  />
                  <span className="text-[11px] text-slate-500">متاح: {formatQty(avail)}</span>
                </div>
              );
            })}
          </div>

          <input
            type="text"
            value={trNotes}
            onChange={(e) => setTrNotes(e.target.value)}
            placeholder="ملاحظات التحويل..."
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
          />
        </div>
      </Modal>

      {/* Adjustment / Inventory Count Modal */}
      <Modal
        open={adjModalOpen}
        title="جرد وتسوية أرصدة المخزون"
        onClose={() => setAdjModalOpen(false)}
        maxWidthClass="max-w-3xl"
        footer={
          <>
            <button
              type="button"
              onClick={() => setAdjModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-bold"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={submitAdjustment}
              className="px-5 py-2 rounded-xl bg-amber-600 text-white text-sm font-bold"
            >
              اعتماد التسوية
            </button>
          </>
        }
      >
        <div className="space-y-3 text-xs sm:text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">المخزن المراد جرده</label>
              <select
                value={adjWhId}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setAdjWhId(id);
                  const map: Record<number, string> = {};
                  normalProducts.forEach((p) => {
                    map[p.id] = String(p.stock_by_warehouse[id] ?? 0);
                  });
                  setAdjCounts(map);
                }}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">سبب / ملاحظات الجرد</label>
              <input
                type="text"
                value={adjNotes}
                onChange={(e) => setAdjNotes(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto border border-slate-200 rounded-xl">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-100 sticky top-0">
                  <th className="p-2 text-right">الصنف</th>
                  <th className="p-2 text-center">الرصيد الدفتري</th>
                  <th className="p-2 text-center w-32">الجرد الفعلي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {normalProducts.map((p) => {
                  const sysQty = p.stock_by_warehouse[adjWhId] ?? 0;
                  return (
                    <tr key={p.id}>
                      <td className="p-2 font-bold">
                        {p.name} ({p.base_unit_name})
                      </td>
                      <td className="p-2 text-center">{formatQty(sysQty)}</td>
                      <td className="p-2 text-center">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={adjCounts[p.id] ?? sysQty}
                          onChange={(e) =>
                            setAdjCounts((prev) => ({ ...prev, [p.id]: e.target.value }))
                          }
                          className="w-24 text-center rounded-lg border border-slate-300 px-2 py-1 font-bold"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>
    </div>
  );
}
