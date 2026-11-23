import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Barcode,
  Edit3,
  Layers,
  Plus,
  Printer,
  Search,
  Trash2,
} from 'lucide-react';
import { api } from '../api';
import type {
  AuthUser,
  PriceTier,
  PrintDocumentPayload,
  Product,
  ProductKitItem,
  ProductUnit,
  Warehouse,
} from '../types';
import { formatMoney, formatQty, priceTierLabel } from '../utils/format';
import { Modal } from '../components/Modal';
import { BarcodeSvg } from '../components/BarcodeSvg';
import type { LabelPrintItem } from '../components/PrintableRoot';

interface ProductsPageProps {
  user: AuthUser;
  onPrint: (payload: PrintDocumentPayload) => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

const emptyUnit = (isBase = false, unitName = 'قطعة'): ProductUnit => ({
  unit_name: unitName,
  conversion_factor: 1,
  barcode: '',
  retail_price: 0,
  plumber_price: 0,
  wholesale_price: 0,
  is_base: isBase,
});

export function ProductsPage({ user, onPrint, onNotify }: ProductsPageProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [filters, setFilters] = useState<{ categories: string[]; brands: string[]; sizes: string[] }>({
    categories: [],
    brands: [],
    sizes: [],
  });

  const [q, setQ] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);

  // Add/Edit Product Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formName, setFormName] = useState('');
  const [formSku, setFormSku] = useState('');
  const [formCategory, setFormCategory] = useState('لوازم سباكة');
  const [formBrand, setFormBrand] = useState('');
  const [formSize, setFormSize] = useState('');
  const [formColor, setFormColor] = useState('');
  const [formBaseUnit, setFormBaseUnit] = useState('قطعة');
  const [formIsKit, setFormIsKit] = useState(false);
  const [formCost, setFormCost] = useState(0);
  const [formMinStock, setFormMinStock] = useState(5);
  const [formVatRate, setFormVatRate] = useState('');
  const [formOpeningStock, setFormOpeningStock] = useState(0);
  const [formOpeningWh, setFormOpeningWh] = useState<number>(0);
  const [formNotes, setFormNotes] = useState('');
  const [formUnits, setFormUnits] = useState<ProductUnit[]>([emptyUnit(true, 'قطعة')]);
  const [formKitItems, setFormKitItems] = useState<ProductKitItem[]>([]);
  const [saving, setSaving] = useState(false);

  // Barcode Studio Modal
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);
  const [labelLayout, setLabelLayout] = useState<'labels-50x25' | 'labels-a4'>('labels-a4');
  const [labelTier, setLabelTier] = useState<PriceTier>('retail');
  const [labelQueue, setLabelQueue] = useState<LabelPrintItem[]>([]);
  const [pickProdId, setPickProdId] = useState<number>(0);
  const [pickUnitId, setPickUnitId] = useState<number>(0);
  const [pickCopies, setPickCopies] = useState<number>(6);

  const canEdit = user.role !== 'cashier';

  const loadData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (catFilter) params.set('category', catFilter);
      if (brandFilter) params.set('brand', brandFilter);
      if (sizeFilter) params.set('size', sizeFilter);
      if (lowStockOnly) params.set('low_stock_only', 'true');

      const [prodRes, whRes, fRes] = await Promise.all([
        api.get<{ products: Product[] }>(`/api/products?${params.toString()}`),
        api.get<{ warehouses: Warehouse[] }>('/api/warehouses'),
        api.get<{ categories: string[]; brands: string[]; sizes: string[] }>('/api/products/filters'),
      ]);
      setProducts(prodRes.products);
      setWarehouses(whRes.warehouses);
      setFilters(fRes);
      if (!formOpeningWh && whRes.warehouses.length > 0) {
        const def = whRes.warehouses.find((w) => w.is_default === 1) || whRes.warehouses[0];
        setFormOpeningWh(def.id);
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر تحميل الأصناف', 'error');
    }
  }, [q, catFilter, brandFilter, sizeFilter, lowStockOnly, formOpeningWh, onNotify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function openNewProduct() {
    setEditingId(null);
    setFormName('');
    setFormSku('');
    setFormCategory('لوازم سباكة');
    setFormBrand('');
    setFormSize('');
    setFormColor('');
    setFormBaseUnit('قطعة');
    setFormIsKit(false);
    setFormCost(0);
    setFormMinStock(5);
    setFormVatRate('');
    setFormOpeningStock(0);
    setFormNotes('');
    setFormUnits([emptyUnit(true, 'قطعة')]);
    setFormKitItems([]);
    setModalOpen(true);
  }

  function openEditProduct(p: Product) {
    setEditingId(p.id);
    setFormName(p.name);
    setFormSku(p.sku);
    setFormCategory(p.category || 'عام');
    setFormBrand(p.brand || '');
    setFormSize(p.size || '');
    setFormColor(p.color || '');
    setFormBaseUnit(p.base_unit_name || 'قطعة');
    setFormIsKit(p.is_kit);
    setFormCost(Number(p.last_purchase_cost ?? 0));
    setFormMinStock(Number(p.min_stock ?? 5));
    setFormVatRate(p.vat_rate !== null && p.vat_rate !== undefined ? String(p.vat_rate) : '');
    setFormOpeningStock(0);
    setFormNotes(p.notes || '');
    setFormUnits(
      p.units.length > 0
        ? p.units.map((u) => ({
            ...u,
            is_base: Boolean(u.is_base),
          }))
        : [emptyUnit(true, p.base_unit_name)]
    );
    setFormKitItems(p.kit_items || []);
    setModalOpen(true);
  }

  async function saveProduct() {
    if (!formName.trim()) {
      onNotify('يرجى إدخال اسم الصنف', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: formName.trim(),
        sku: formSku.trim() || undefined,
        category: formCategory.trim() || 'عام',
        brand: formBrand.trim(),
        size: formSize.trim(),
        color: formColor.trim(),
        base_unit_name: formBaseUnit.trim() || (formIsKit ? 'طقم' : 'قطعة'),
        is_kit: formIsKit,
        last_purchase_cost: formCost,
        min_stock: formMinStock,
        vat_rate: formVatRate === '' ? null : Number(formVatRate),
        opening_stock: editingId ? 0 : formOpeningStock,
        opening_warehouse_id: formOpeningWh,
        notes: formNotes.trim(),
        units: formUnits,
        kit_items: formIsKit ? formKitItems : [],
      };

      if (editingId) {
        await api.put(`/api/products/${editingId}`, payload);
        onNotify('تم تحديث بيانات الصنف بنجاح');
      } else {
        await api.post('/api/products', payload);
        onNotify('تمت إضافة الصنف بنجاح');
      }
      setModalOpen(false);
      await loadData();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر حفظ الصنف', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct(p: Product) {
    if (!confirm(`هل تريد حذف/أرشفة الصنف "${p.name}"؟`)) return;
    try {
      await api.del(`/api/products/${p.id}`);
      onNotify('تم حذف الصنف');
      await loadData();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر الحذف', 'error');
    }
  }

  function openBarcodeStudio(initialProduct?: Product) {
    const target = initialProduct || products[0];
    if (target) {
      setPickProdId(target.id);
      const u = target.units[0];
      setPickUnitId(Number(u?.id || 0));
      if (initialProduct && u) {
        const price =
          labelTier === 'plumber'
            ? u.plumber_price
            : labelTier === 'wholesale'
              ? u.wholesale_price
              : u.retail_price;
        setLabelQueue([
          {
            productName: target.name,
            brand: target.brand,
            size: target.size,
            unitName: u.unit_name,
            barcode: u.barcode || target.sku,
            price,
            copies: 6,
          },
        ]);
      } else {
        setLabelQueue([]);
      }
    }
    setBarcodeModalOpen(true);
  }

  function addLabelToQueue() {
    const p = products.find((x) => x.id === pickProdId);
    if (!p) return;
    const u = p.units.find((x) => Number(x.id) === pickUnitId) || p.units[0];
    if (!u) return;
    const price =
      labelTier === 'plumber'
        ? u.plumber_price
        : labelTier === 'wholesale'
          ? u.wholesale_price
          : u.retail_price;
    setLabelQueue((prev) => [
      ...prev,
      {
        productName: p.name,
        brand: p.brand,
        size: p.size,
        unitName: u.unit_name,
        barcode: u.barcode || p.sku,
        price,
        copies: Math.max(1, pickCopies),
      },
    ]);
  }

  const nonKitProducts = products.filter((p) => !p.is_kit && p.id !== editingId);
  const pickedProd = products.find((p) => p.id === pickProdId);

  return (
    <div className="space-y-4">
      {/* Toolbar & Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="بحث بالاسم، الكود، الباركود، المقاس..."
                className="w-full rounded-xl border border-slate-300 pr-9 pl-3 py-2 text-sm"
              />
            </div>

            <select
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-xs bg-white"
            >
              <option value="">كل التصنيفات</option>
              {filters.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-xs bg-white"
            >
              <option value="">كل الماركات</option>
              {filters.brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>

            <select
              value={sizeFilter}
              onChange={(e) => setSizeFilter(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-xs bg-white"
            >
              <option value="">كل المقاسات</option>
              {filters.sizes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <label className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={lowStockOnly}
                onChange={(e) => setLowStockOnly(e.target.checked)}
              />
              <span>النواقص فقط</span>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openBarcodeStudio()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs sm:text-sm font-bold transition"
            >
              <Barcode className="w-4 h-4" />
              <span>طباعة ملصقات باركود</span>
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={openNewProduct}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs sm:text-sm font-bold transition"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة صنف جديد</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="bg-slate-100 text-slate-700">
              <th className="p-3 text-right">الكود / الصنف</th>
              <th className="p-3 text-right">الماركة / المقاس / اللون</th>
              <th className="p-3 text-right">وحدات البيع والأسعار</th>
              {canEdit && <th className="p-3 text-center">آخر تكلفة</th>}
              <th className="p-3 text-center">الرصيد الكلي</th>
              <th className="p-3 text-center">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products.map((p) => {
              const isLow = !p.is_kit && p.total_stock <= p.min_stock;
              return (
                <tr key={p.id} className="hover:bg-slate-50/70">
                  <td className="p-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold text-slate-900">{p.name}</span>
                      {p.is_kit && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded">
                          <Layers className="w-3 h-3" /> طقم مجمع
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {p.sku} • {p.category}
                    </div>
                  </td>
                  <td className="p-3 text-xs text-slate-600">
                    {[p.brand, p.size, p.color].filter(Boolean).join(' • ') || '—'}
                  </td>
                  <td className="p-3">
                    <div className="space-y-1">
                      {p.units.map((u, idx) => (
                        <div key={idx} className="text-[11px] bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 flex flex-wrap gap-2">
                          <span className="font-bold text-slate-800">
                            {u.unit_name} ({formatQty(u.conversion_factor)} {p.base_unit_name})
                          </span>
                          <span className="text-sky-700">قطاعي: {formatMoney(u.retail_price)}</span>
                          <span className="text-emerald-700">سباك: {formatMoney(u.plumber_price)}</span>
                          <span className="text-purple-700">جملة: {formatMoney(u.wholesale_price)}</span>
                          <span className="text-slate-400" dir="ltr">
                            [{u.barcode}]
                          </span>
                        </div>
                      ))}
                    </div>
                  </td>
                  {canEdit && (
                    <td className="p-3 text-center font-bold text-slate-700">
                      {formatMoney(p.last_purchase_cost ?? 0)}
                    </td>
                  )}
                  <td className="p-3 text-center">
                    <div
                      className={`inline-flex items-center gap-1 font-extrabold px-2.5 py-1 rounded-full text-xs ${
                        isLow ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {isLow && <AlertTriangle className="w-3.5 h-3.5" />}
                      <span>
                        {formatQty(p.total_stock)} {p.base_unit_name}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      {warehouses
                        .map((w) => `${w.name.replace(/^المخزن\s+/, '')}: ${formatQty(p.stock_by_warehouse[w.id] ?? 0)}`)
                        .join(' | ')}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openBarcodeStudio(p)}
                        title="طباعة باركود لهذا الصنف"
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
                      >
                        <Barcode className="w-4 h-4" />
                      </button>
                      {canEdit && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditProduct(p)}
                            title="تعديل"
                            className="p-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteProduct(p)}
                            title="حذف"
                            className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Product Modal */}
      <Modal
        open={modalOpen}
        title={editingId ? `تعديل الصنف: ${formName}` : 'إضافة صنف جديد'}
        onClose={() => setModalOpen(false)}
        maxWidthClass="max-w-4xl"
        footer={
          <>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-bold"
            >
              إلغاء
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={saveProduct}
              className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold"
            >
              {saving ? 'جاري الحفظ...' : 'حفظ الصنف'}
            </button>
          </>
        }
      >
        <div className="space-y-5 text-xs sm:text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">اسم الصنف *</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="مثال: محبس زاوية كروم 1/2 بوصة"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">كود الصنف (SKU)</label>
              <input
                type="text"
                value={formSku}
                onChange={(e) => setFormSku(e.target.value)}
                placeholder="يُولّد تلقائياً إذا تُرك فارغاً"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">التصنيف</label>
              <input
                type="text"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                placeholder="خلاطات / مواسير تغذية / محابس..."
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الماركة</label>
              <input
                type="text"
                value={formBrand}
                onChange={(e) => setFormBrand(e.target.value)}
                placeholder="جروهي / BR / أيديال ستاندرد..."
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المقاس (بوصة/مم)</label>
                <input
                  type="text"
                  value={formSize}
                  onChange={(e) => setFormSize(e.target.value)}
                  placeholder="1/2 بوصة"
                  className="w-full rounded-xl border border-slate-300 px-2.5 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اللون</label>
                <input
                  type="text"
                  value={formColor}
                  onChange={(e) => setFormColor(e.target.value)}
                  placeholder="كروم / أبيض"
                  className="w-full rounded-xl border border-slate-300 px-2.5 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الوحدة الأساسية</label>
              <input
                type="text"
                value={formBaseUnit}
                onChange={(e) => setFormBaseUnit(e.target.value)}
                placeholder="قطعة / متر / طقم"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">آخر سعر شراء (تكلفة الوحدة الأساسية)</label>
              <input
                type="number"
                step="any"
                min="0"
                disabled={formIsKit}
                value={formCost}
                onChange={(e) => setFormCost(Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الحد الأدنى للتنبيه</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={formMinStock}
                  onChange={(e) => setFormMinStock(Number(e.target.value) || 0)}
                  className="w-full rounded-xl border border-slate-300 px-2.5 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ضريبة الصنف %</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="افتراضي"
                  value={formVatRate}
                  onChange={(e) => setFormVatRate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-2.5 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Kit Toggle & Opening Stock */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
            <label className="inline-flex items-center gap-2 font-bold text-purple-800 cursor-pointer">
              <input
                type="checkbox"
                checked={formIsKit}
                onChange={(e) => {
                  setFormIsKit(e.target.checked);
                  if (e.target.checked) setFormBaseUnit('طقم');
                }}
              />
              <span>هذا الصنف «طقم مجمع» (يُخصم تلقائياً من مكوناته عند البيع)</span>
            </label>

            {!editingId && !formIsKit && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700">رصيد افتتاحي:</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={formOpeningStock}
                  onChange={(e) => setFormOpeningStock(Number(e.target.value) || 0)}
                  className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-xs bg-white"
                />
                <select
                  value={formOpeningWh}
                  onChange={(e) => setFormOpeningWh(Number(e.target.value))}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs bg-white"
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Kit Components Editor */}
          {formIsKit && (
            <div className="border border-purple-200 bg-purple-50/40 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-purple-900">مكونات الطقم المجمع</span>
                <button
                  type="button"
                  onClick={() => {
                    const first = nonKitProducts[0];
                    if (!first) return;
                    setFormKitItems((prev) => [
                      ...prev,
                      { component_product_id: first.id, quantity_base: 1 },
                    ]);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-purple-600 text-white text-xs font-bold"
                >
                  + إضافة مكون
                </button>
              </div>
              {formKitItems.map((ki, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={ki.component_product_id}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setFormKitItems((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, component_product_id: val } : x))
                      );
                    }}
                    className="flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                  >
                    {nonKitProducts.map((np) => (
                      <option key={np.id} value={np.id}>
                        {np.name} ({np.base_unit_name})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    value={ki.quantity_base}
                    onChange={(e) => {
                      const val = Math.max(0.01, Number(e.target.value) || 1);
                      setFormKitItems((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, quantity_base: val } : x))
                      );
                    }}
                    className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-center bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setFormKitItems((prev) => prev.filter((_, i) => i !== idx))}
                    className="p-1.5 text-rose-600 hover:bg-rose-100 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Multi-UOM Editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-900">وحدات القياس والأسعار (قطعة / دستة / كرتونة / متر / لفة)</h4>
                <p className="text-[11px] text-slate-500">
                  الوحدة الأولى هي الأساسية (معامل 1) — أي وحدة إضافية تحدد كم قطعة/متر تحتوي، ويُولد لها باركود خاص.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFormUnits((prev) => [...prev, emptyUnit(false, 'كرتونة')])}
                className="px-3 py-1.5 rounded-xl bg-sky-50 text-sky-700 border border-sky-200 text-xs font-bold"
              >
                + إضافة وحدة كبرى
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-slate-200 text-xs">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-200 p-2">اسم الوحدة</th>
                    <th className="border border-slate-200 p-2">المعامل</th>
                    <th className="border border-slate-200 p-2">الباركود</th>
                    <th className="border border-slate-200 p-2">سعر قطاعي</th>
                    <th className="border border-slate-200 p-2">سعر سباك</th>
                    <th className="border border-slate-200 p-2">سعر جملة</th>
                    <th className="border border-slate-200 p-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {formUnits.map((u, idx) => (
                    <tr key={idx}>
                      <td className="border border-slate-200 p-1.5">
                        <input
                          type="text"
                          value={u.unit_name}
                          onChange={(e) =>
                            setFormUnits((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, unit_name: e.target.value } : x))
                            )
                          }
                          className="w-28 rounded-lg border border-slate-300 px-2 py-1"
                        />
                      </td>
                      <td className="border border-slate-200 p-1.5">
                        <input
                          type="number"
                          step="any"
                          min="0.01"
                          disabled={idx === 0}
                          value={idx === 0 ? 1 : u.conversion_factor}
                          onChange={(e) =>
                            setFormUnits((prev) =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, conversion_factor: Number(e.target.value) || 1 } : x
                              )
                            )
                          }
                          className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-center disabled:bg-slate-100"
                        />
                      </td>
                      <td className="border border-slate-200 p-1.5">
                        <input
                          type="text"
                          value={u.barcode || ''}
                          onChange={(e) =>
                            setFormUnits((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, barcode: e.target.value } : x))
                            )
                          }
                          placeholder="تلقائي"
                          className="w-32 rounded-lg border border-slate-300 px-2 py-1"
                        />
                      </td>
                      <td className="border border-slate-200 p-1.5">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={u.retail_price}
                          onChange={(e) =>
                            setFormUnits((prev) =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, retail_price: Number(e.target.value) || 0 } : x
                              )
                            )
                          }
                          className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-center"
                        />
                      </td>
                      <td className="border border-slate-200 p-1.5">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={u.plumber_price}
                          onChange={(e) =>
                            setFormUnits((prev) =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, plumber_price: Number(e.target.value) || 0 } : x
                              )
                            )
                          }
                          className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-center"
                        />
                      </td>
                      <td className="border border-slate-200 p-1.5">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={u.wholesale_price}
                          onChange={(e) =>
                            setFormUnits((prev) =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, wholesale_price: Number(e.target.value) || 0 } : x
                              )
                            )
                          }
                          className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-center"
                        />
                      </td>
                      <td className="border border-slate-200 p-1.5 text-center">
                        {idx > 0 && (
                          <button
                            type="button"
                            onClick={() => setFormUnits((prev) => prev.filter((_, i) => i !== idx))}
                            className="p-1 text-rose-600 hover:bg-rose-50 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Modal>

      {/* Barcode Print Studio Modal */}
      <Modal
        open={barcodeModalOpen}
        title="استوديو طباعة ملصقات الباركود"
        subtitle="اختر الأصناف وعدد الملصقات ومقاس الورق (ملصقات A4 أو طابعة ملصقات حرارية 50×25mm)"
        onClose={() => setBarcodeModalOpen(false)}
        maxWidthClass="max-w-3xl"
        footer={
          <>
            <button
              type="button"
              onClick={() => setBarcodeModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-bold"
            >
              إغلاق
            </button>
            <button
              type="button"
              disabled={labelQueue.length === 0}
              onClick={() => onPrint({ mode: labelLayout, kind: 'labels', data: labelQueue })}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold"
            >
              <Printer className="w-4 h-4" /> طباعة الملصقات الآن
            </button>
          </>
        }
      >
        <div className="space-y-4 text-xs sm:text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">مقاس الطباعة</label>
              <select
                value={labelLayout}
                onChange={(e) => setLabelLayout(e.target.value as 'labels-50x25' | 'labels-a4')}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs bg-white"
              >
                <option value="labels-a4">ورق لاصق عادي A4 (شبكة 3 أعمدة)</option>
                <option value="labels-50x25">طابعة ملصقات حرارية 50×25 mm</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">السعر المطبوع على الملصق</label>
              <select
                value={labelTier}
                onChange={(e) => setLabelTier(e.target.value as PriceTier)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs bg-white"
              >
                <option value="retail">{priceTierLabel('retail')}</option>
                <option value="plumber">{priceTierLabel('plumber')}</option>
                <option value="wholesale">{priceTierLabel('wholesale')}</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs font-bold text-slate-700 mb-1">الصنف</label>
              <select
                value={pickProdId}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setPickProdId(id);
                  const found = products.find((p) => p.id === id);
                  if (found && found.units[0]) setPickUnitId(Number(found.units[0].id || 0));
                }}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs bg-white"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-36">
              <label className="block text-xs font-bold text-slate-700 mb-1">الوحدة</label>
              <select
                value={pickUnitId}
                onChange={(e) => setPickUnitId(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 px-2.5 py-2 text-xs bg-white"
              >
                {(pickedProd?.units || []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.unit_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-24">
              <label className="block text-xs font-bold text-slate-700 mb-1">العدد</label>
              <input
                type="number"
                min="1"
                max="200"
                value={pickCopies}
                onChange={(e) => setPickCopies(Math.max(1, Number(e.target.value) || 1))}
                className="w-full rounded-xl border border-slate-300 px-2.5 py-2 text-xs text-center"
              />
            </div>

            <button
              type="button"
              onClick={addLabelToQueue}
              className="px-4 py-2 rounded-xl bg-sky-600 text-white text-xs font-bold"
            >
              + إضافة للطباعة
            </button>
          </div>

          {labelQueue.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-700">قائمة الملصقات المجهزة للطباعة ({labelQueue.length}):</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {labelQueue.map((lbl, idx) => (
                  <div
                    key={idx}
                    className="border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-2 bg-white"
                  >
                    <div className="flex flex-col items-center border border-dashed border-slate-300 rounded-lg p-2 bg-slate-50/50">
                      <div className="text-[10px] font-extrabold">{lbl.productName}</div>
                      <BarcodeSvg value={lbl.barcode} height={28} width={1.2} fontSize={9} />
                      <div className="text-[10px] font-bold">{formatMoney(lbl.price)}</div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="text-xs font-bold">النسخ: {lbl.copies}</div>
                      <button
                        type="button"
                        onClick={() => setLabelQueue((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-xs text-rose-600 hover:underline font-semibold"
                      >
                        حذف
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
