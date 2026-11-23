import { useCallback, useEffect, useState } from 'react';
import { Eye, Printer, RotateCcw, Search, Trash2 } from 'lucide-react';
import { api } from '../api';
import type {
  AuthUser,
  PrintDocumentPayload,
  PrintMode,
  SalesInvoice,
  SalesInvoiceItem,
  SalesReturn,
  TreasuryAccount,
} from '../types';
import { formatMoney, formatQty, priceTierLabel, todayIso } from '../utils/format';
import { Modal } from '../components/Modal';

interface SalesHistoryPageProps {
  user: AuthUser;
  onPrint: (payload: PrintDocumentPayload) => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

export function SalesHistoryPage({ user, onPrint, onNotify }: SalesHistoryPageProps) {
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [returnsList, setReturnsList] = useState<SalesReturn[]>([]);
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([]);
  const [activeTab, setActiveTab] = useState<'invoices' | 'returns'>('invoices');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // Detail modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<{
    invoice: SalesInvoice;
    items: SalesInvoiceItem[];
    returns: SalesReturn[];
  } | null>(null);

  // Return modal
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnQtyMap, setReturnQtyMap] = useState<Record<number, number>>({});
  const [refundMethod, setRefundMethod] = useState<'cash' | 'credit_note'>('cash');
  const [refundAccountId, setRefundAccountId] = useState<number>(0);
  const [returnNotes, setReturnNotes] = useState('');
  const [submittingReturn, setSubmittingReturn] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (from) params.set('from', from);
      if (to) params.set('to', to);

      const [invRes, retRes, accRes] = await Promise.all([
        api.get<{ invoices: SalesInvoice[] }>(`/api/sales?${params.toString()}`),
        api.get<{ returns: SalesReturn[] }>('/api/sales/returns/list'),
        api.get<{ accounts: TreasuryAccount[] }>('/api/treasury/accounts'),
      ]);
      setInvoices(invRes.invoices);
      setReturnsList(retRes.returns);
      setAccounts(accRes.accounts);
      const def = accRes.accounts.find((a) => a.is_default_pos === 1) || accRes.accounts[0];
      if (def) setRefundAccountId(def.id);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر تحميل الفواتير', 'error');
    }
  }, [q, from, to, onNotify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function openInvoiceDetail(id: number, forReturn = false) {
    try {
      const res = await api.get<{
        invoice: SalesInvoice;
        items: SalesInvoiceItem[];
        returns: SalesReturn[];
      }>(`/api/sales/${id}`);
      setSelectedDetail(res);
      if (forReturn) {
        const initMap: Record<number, number> = {};
        res.items.forEach((it) => {
          initMap[it.id] = 0;
        });
        setReturnQtyMap(initMap);
        setRefundMethod(res.invoice.is_walkin === 1 ? 'cash' : res.invoice.remaining_amount > 0 ? 'credit_note' : 'cash');
        setReturnNotes('');
        setReturnModalOpen(true);
      } else {
        setDetailOpen(true);
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر فتح الفاتورة', 'error');
    }
  }

  async function quickPrint(id: number, mode: PrintMode) {
    try {
      const res = await api.get<{ invoice: SalesInvoice; items: SalesInvoiceItem[] }>(`/api/sales/${id}`);
      onPrint({ mode, kind: 'sales_invoice', data: res });
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر التحضير للطباعة', 'error');
    }
  }

  async function handleVoidInvoice(inv: SalesInvoice) {
    if (!confirm(`هل أنت متأكد من إلغاء/حذف الفاتورة ${inv.invoice_no}؟ سيتم إرجاع البضاعة للمخزن وعكس الحركة المالية.`)) {
      return;
    }
    try {
      await api.del(`/api/sales/${inv.id}`);
      onNotify(`تم إلغاء الفاتورة ${inv.invoice_no}`);
      await loadData();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر إلغاء الفاتورة', 'error');
    }
  }

  async function submitReturn() {
    if (!selectedDetail) return;
    const chosenItems = selectedDetail.items
      .filter((it) => Number(returnQtyMap[it.id] || 0) > 0)
      .map((it) => ({
        original_item_id: it.id,
        quantity: Number(returnQtyMap[it.id]),
      }));

    if (chosenItems.length === 0) {
      onNotify('حدد كمية واحدة على الأقل للإرجاع', 'error');
      return;
    }

    setSubmittingReturn(true);
    try {
      const res = await api.post<{ sales_return: SalesReturn }>(
        `/api/sales/${selectedDetail.invoice.id}/returns`,
        {
          items: chosenItems,
          refund_method: refundMethod,
          treasury_account_id: refundAccountId,
          return_date: todayIso(),
          notes: returnNotes,
        }
      );
      onNotify(`تم تسجيل المرتجع رقم ${res.sales_return.return_no} بسعر الفاتورة القديمة`);
      setReturnModalOpen(false);
      await loadData();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر تسجيل المرتجع', 'error');
    } finally {
      setSubmittingReturn(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('invoices')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition ${
              activeTab === 'invoices' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            فواتير المبيعات ({invoices.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('returns')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition ${
              activeTab === 'returns' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            سجل المرتجعات ({returnsList.length})
          </button>
        </div>

        {activeTab === 'invoices' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="رقم الفاتورة، العميل، السباك..."
                className="rounded-xl border border-slate-300 pr-9 pl-3 py-1.5 text-sm w-56"
              />
            </div>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs"
            />
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs"
            />
          </div>
        )}
      </div>

      {activeTab === 'invoices' ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th className="p-3 text-right">رقم الفاتورة</th>
                <th className="p-3 text-center">التاريخ</th>
                <th className="p-3 text-right">العميل</th>
                <th className="p-3 text-right">السباك</th>
                <th className="p-3 text-center">الإجمالي</th>
                <th className="p-3 text-center">المدفوع</th>
                <th className="p-3 text-center">المتبقي</th>
                <th className="p-3 text-center">المرتجع</th>
                <th className="p-3 text-center">الحالة</th>
                <th className="p-3 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map((inv) => (
                <tr key={inv.id} className={inv.status === 'voided' ? 'bg-rose-50/40 opacity-75' : 'hover:bg-slate-50'}>
                  <td className="p-3 font-extrabold text-sky-800">{inv.invoice_no}</td>
                  <td className="p-3 text-center text-slate-600">{inv.invoice_date}</td>
                  <td className="p-3 font-semibold">{inv.customer_name}</td>
                  <td className="p-3 text-slate-600">{inv.plumber_name || '—'}</td>
                  <td className="p-3 text-center font-bold">{formatMoney(inv.total_amount)}</td>
                  <td className="p-3 text-center text-emerald-700 font-semibold">{formatMoney(inv.paid_amount)}</td>
                  <td className="p-3 text-center text-amber-700 font-bold">{formatMoney(inv.remaining_amount)}</td>
                  <td className="p-3 text-center text-rose-600 font-semibold">
                    {Number(inv.returned_total || 0) > 0 ? formatMoney(inv.returned_total) : '—'}
                  </td>
                  <td className="p-3 text-center">
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        inv.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {inv.status === 'completed' ? 'مكتملة' : 'ملغاة'}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openInvoiceDetail(inv.id, false)}
                        title="عرض التفاصيل"
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => quickPrint(inv.id, '80mm')}
                        title="طباعة 80mm"
                        className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-bold"
                      >
                        80mm
                      </button>
                      <button
                        type="button"
                        onClick={() => quickPrint(inv.id, 'a4')}
                        title="طباعة A4"
                        className="px-2 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 text-[11px] font-bold"
                      >
                        A4
                      </button>
                      {inv.status === 'completed' && (
                        <button
                          type="button"
                          onClick={() => openInvoiceDetail(inv.id, true)}
                          title="مرتجع جزئي بعد التشطيب"
                          className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                      {user.role === 'admin' && inv.status === 'completed' && (
                        <button
                          type="button"
                          onClick={() => handleVoidInvoice(inv)}
                          title="إلغاء وحذف الفاتورة (للمدير فقط)"
                          className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th className="p-3 text-right">رقم المرتجع</th>
                <th className="p-3 text-center">التاريخ</th>
                <th className="p-3 text-center">الفاتورة الأصلية</th>
                <th className="p-3 text-right">العميل</th>
                <th className="p-3 text-center">طريقة التسوية</th>
                <th className="p-3 text-center">قيمة المرتجع</th>
                <th className="p-3 text-right">ملاحظات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {returnsList.map((r) => (
                <tr key={r.id}>
                  <td className="p-3 font-extrabold text-amber-700">{r.return_no}</td>
                  <td className="p-3 text-center">{r.return_date}</td>
                  <td className="p-3 text-center font-bold text-sky-700">{r.original_invoice_no}</td>
                  <td className="p-3 font-semibold">{r.customer_name}</td>
                  <td className="p-3 text-center">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100">
                      {r.refund_method === 'cash' ? `رد نقدي (${r.account_name || ''})` : 'خصم من الرصيد الآجل'}
                    </span>
                  </td>
                  <td className="p-3 text-center font-extrabold text-rose-700">
                    {formatMoney(r.total_return_amount)}
                  </td>
                  <td className="p-3 text-slate-600">{r.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Invoice Detail Modal */}
      <Modal
        open={detailOpen && Boolean(selectedDetail)}
        title={selectedDetail ? `تفاصيل الفاتورة ${selectedDetail.invoice.invoice_no}` : ''}
        onClose={() => setDetailOpen(false)}
        maxWidthClass="max-w-3xl"
        footer={
          selectedDetail && (
            <>
              <button
                type="button"
                onClick={() => onPrint({ mode: '80mm', kind: 'sales_invoice', data: selectedDetail })}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold"
              >
                <Printer className="w-4 h-4" /> طباعة 80mm
              </button>
              <button
                type="button"
                onClick={() => onPrint({ mode: 'a4', kind: 'sales_invoice', data: selectedDetail })}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-600 text-white text-xs font-bold"
              >
                <Printer className="w-4 h-4" /> طباعة A4
              </button>
              <button
                type="button"
                onClick={() => onPrint({ mode: 'a5', kind: 'sales_invoice', data: selectedDetail })}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-600 text-white text-xs font-bold"
              >
                <Printer className="w-4 h-4" /> طباعة A5
              </button>
            </>
          )
        }
      >
        {selectedDetail && (
          <div className="space-y-4 text-xs sm:text-sm">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-slate-50 rounded-xl p-3 border border-slate-200">
              <div>العميل: <strong>{selectedDetail.invoice.customer_name}</strong></div>
              <div>السباك: <strong>{selectedDetail.invoice.plumber_name || '—'}</strong></div>
              <div>التسعير: <strong>{priceTierLabel(selectedDetail.invoice.price_tier)}</strong></div>
              <div>التاريخ: <strong>{selectedDetail.invoice.invoice_date}</strong></div>
              <div>المخزن: <strong>{selectedDetail.invoice.warehouse_name}</strong></div>
              <div>البائع: <strong>{selectedDetail.invoice.user_name}</strong></div>
            </div>

            <table className="w-full border-collapse border border-slate-200 text-xs">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-200 p-2 text-right">الصنف</th>
                  <th className="border border-slate-200 p-2 text-center">الوحدة</th>
                  <th className="border border-slate-200 p-2 text-center">الكمية</th>
                  <th className="border border-slate-200 p-2 text-center">المرتجع</th>
                  <th className="border border-slate-200 p-2 text-center">السعر</th>
                  <th className="border border-slate-200 p-2 text-left">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {selectedDetail.items.map((it) => (
                  <tr key={it.id}>
                    <td className="border border-slate-200 p-2 font-bold">{it.product_name}</td>
                    <td className="border border-slate-200 p-2 text-center">{it.unit_name}</td>
                    <td className="border border-slate-200 p-2 text-center">{formatQty(it.quantity)}</td>
                    <td className="border border-slate-200 p-2 text-center text-rose-600">
                      {it.returned_qty > 0 ? formatQty(it.returned_qty) : '0'}
                    </td>
                    <td className="border border-slate-200 p-2 text-center">{formatMoney(it.unit_price)}</td>
                    <td className="border border-slate-200 p-2 text-left font-bold">{formatMoney(it.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex flex-wrap justify-between items-center bg-slate-50 rounded-xl p-3 border border-slate-200 font-bold">
              <span>الإجمالي: {formatMoney(selectedDetail.invoice.total_amount)}</span>
              <span className="text-emerald-700">المدفوع: {formatMoney(selectedDetail.invoice.paid_amount)}</span>
              <span className="text-amber-700">المتبقي: {formatMoney(selectedDetail.invoice.remaining_amount)}</span>
            </div>
          </div>
        )}
      </Modal>

      {/* Partial Return Modal */}
      <Modal
        open={returnModalOpen && Boolean(selectedDetail)}
        title={selectedDetail ? `مرتجع جزئي — فاتورة ${selectedDetail.invoice.invoice_no}` : ''}
        subtitle="يتم حساب قيمة المرتجع تلقائياً بسعر الفاتورة القديمة مع استرجاع الكميات للمخزن"
        onClose={() => setReturnModalOpen(false)}
        maxWidthClass="max-w-3xl"
        footer={
          <>
            <button
              type="button"
              onClick={() => setReturnModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-bold"
            >
              إلغاء
            </button>
            <button
              type="button"
              disabled={submittingReturn}
              onClick={submitReturn}
              className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold"
            >
              {submittingReturn ? 'جاري التسجيل...' : 'تأكيد وحفظ المرتجع'}
            </button>
          </>
        }
      >
        {selectedDetail && (
          <div className="space-y-4">
            <table className="w-full border-collapse border border-slate-200 text-xs">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-200 p-2 text-right">الصنف</th>
                  <th className="border border-slate-200 p-2 text-center">المباع</th>
                  <th className="border border-slate-200 p-2 text-center">مرتجع سابق</th>
                  <th className="border border-slate-200 p-2 text-center">المتاح للإرجاع</th>
                  <th className="border border-slate-200 p-2 text-center">سعر الفاتورة</th>
                  <th className="border border-slate-200 p-2 text-center w-28">كمية المرتجع</th>
                </tr>
              </thead>
              <tbody>
                {selectedDetail.items.map((it) => {
                  const maxRet = Math.max(0, Math.round((it.quantity - it.returned_qty) * 10000) / 10000);
                  return (
                    <tr key={it.id}>
                      <td className="border border-slate-200 p-2 font-bold">
                        {it.product_name} ({it.unit_name})
                      </td>
                      <td className="border border-slate-200 p-2 text-center">{formatQty(it.quantity)}</td>
                      <td className="border border-slate-200 p-2 text-center text-slate-500">
                        {formatQty(it.returned_qty)}
                      </td>
                      <td className="border border-slate-200 p-2 text-center font-bold text-sky-700">
                        {formatQty(maxRet)}
                      </td>
                      <td className="border border-slate-200 p-2 text-center font-bold">
                        {formatMoney(it.unit_price)}
                      </td>
                      <td className="border border-slate-200 p-2 text-center">
                        <input
                          type="number"
                          min="0"
                          max={maxRet}
                          step="any"
                          disabled={maxRet <= 0}
                          value={returnQtyMap[it.id] ?? 0}
                          onChange={(e) => {
                            const val = Math.max(0, Math.min(maxRet, Number(e.target.value) || 0));
                            setReturnQtyMap((prev) => ({ ...prev, [it.id]: val }));
                          }}
                          className="w-24 text-center rounded-lg border border-slate-300 px-2 py-1 font-bold"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">طريقة تسوية قيمة المرتجع</label>
                <select
                  value={refundMethod}
                  onChange={(e) => setRefundMethod(e.target.value as 'cash' | 'credit_note')}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  <option value="cash">رد المبلغ نقداً من الخزنة</option>
                  {selectedDetail.invoice.is_walkin !== 1 && (
                    <option value="credit_note">خصم من الرصيد الآجل للعميل</option>
                  )}
                </select>
              </div>

              {refundMethod === 'cash' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الخزنة المصروف منها</label>
                  <select
                    value={refundAccountId}
                    onChange={(e) => setRefundAccountId(Number(e.target.value))}
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

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">سبب / ملاحظات المرتجع</label>
                <input
                  type="text"
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  placeholder="مثال: مواسير ووصلات زائدة بعد انتهاء التشطيب"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
                />
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
