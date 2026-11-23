import { useCallback, useEffect, useState } from 'react';
import { FileText, Plus, Printer, Search, Wrench } from 'lucide-react';
import { api } from '../api';
import type { Plumber, PrintDocumentPayload } from '../types';
import { formatMoney } from '../utils/format';
import { Modal } from '../components/Modal';
import type { StatementPrintData } from '../components/PrintableRoot';

interface PlumbersPageProps {
  onPrint: (payload: PrintDocumentPayload) => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

export function PlumbersPage({ onPrint, onNotify }: PlumbersPageProps) {
  const [plumbers, setPlumbers] = useState<Plumber[]>([]);
  const [q, setQ] = useState('');

  // Add/Edit modal
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Plumber | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [area, setArea] = useState('');
  const [notes, setNotes] = useState('');

  // Report modal
  const [reportOpen, setReportOpen] = useState(false);
  const [reportData, setReportData] = useState<{
    plumber: Plumber;
    invoices: {
      id: number;
      invoice_no: string;
      invoice_date: string;
      customer_name: string;
      total_amount: number;
      returned_total: number;
    }[];
    summary: {
      invoices_count: number;
      gross_sales: number;
      returns_total: number;
      net_sales: number;
    };
  } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await api.get<{ plumbers: Plumber[] }>(`/api/plumbers?q=${encodeURIComponent(q.trim())}`);
      setPlumbers(res.plumbers);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر تحميل قائمة السباكين', 'error');
    }
  }, [q, onNotify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function savePlumber() {
    if (!name.trim()) {
      onNotify('يرجى إدخال اسم السباك', 'error');
      return;
    }
    try {
      if (editing) {
        await api.put(`/api/plumbers/${editing.id}`, { name: name.trim(), phone, area, notes });
        onNotify('تم تحديث بيانات السباك');
      } else {
        await api.post('/api/plumbers', { name: name.trim(), phone, area, notes });
        onNotify('تمت إضافة السباك');
      }
      setFormOpen(false);
      await loadData();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر الحفظ', 'error');
    }
  }

  async function openReport(p: Plumber) {
    try {
      const res = await api.get<typeof reportData>(`/api/plumbers/${p.id}/report`);
      setReportData(res);
      setReportOpen(true);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر تحميل تقرير السباك', 'error');
    }
  }

  function printPlumberReport() {
    if (!reportData) return;
    const payload: StatementPrintData = {
      title: 'تقرير فواتير ومسحوبات السباك',
      partyName: reportData.plumber.name,
      partyPhone: reportData.plumber.phone,
      partyMeta: reportData.plumber.area,
      summaryCards: [
        { label: 'عدد الفواتير', value: String(reportData.summary.invoices_count) },
        { label: 'إجمالي المبيعات', value: formatMoney(reportData.summary.gross_sales) },
        { label: 'المرتجعات', value: formatMoney(reportData.summary.returns_total) },
        { label: 'صافي المسحوبات', value: formatMoney(reportData.summary.net_sales) },
      ],
      columns: [
        { label: 'رقم الفاتورة', align: 'center' },
        { label: 'التاريخ', align: 'center' },
        { label: 'اسم العميل / صاحب الشقة', align: 'right' },
        { label: 'قيمة الفاتورة', align: 'center' },
        { label: 'المرتجع', align: 'center' },
        { label: 'الصافي', align: 'left' },
      ],
      rows: reportData.invoices.map((inv) => [
        inv.invoice_no,
        inv.invoice_date,
        inv.customer_name,
        formatMoney(inv.total_amount),
        formatMoney(inv.returned_total),
        formatMoney(inv.total_amount - inv.returned_total),
      ]),
    };
    onPrint({ mode: 'a4', kind: 'statement', data: payload });
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="بحث باسم السباك، الهاتف، المنطقة..."
            className="w-full rounded-xl border border-slate-300 pr-9 pl-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setName('');
            setPhone('');
            setArea('');
            setNotes('');
            setFormOpen(true);
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold"
        >
          <Plus className="w-4 h-4" /> إضافة سباك / فني
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {plumbers.map((p) => (
          <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center shrink-0">
                  <Wrench className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">{p.name}</h3>
                  <div className="text-xs text-slate-500">{p.phone || 'بدون هاتف'} • {p.area || 'عام'}</div>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200 flex justify-between text-xs">
              <span>الفواتير المرتبطة: <strong>{p.invoices_count ?? 0}</strong></span>
              <span>الإجمالي: <strong className="text-sky-800">{formatMoney(p.total_sales ?? 0)}</strong></span>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditing(p);
                  setName(p.name);
                  setPhone(p.phone);
                  setArea(p.area);
                  setNotes(p.notes);
                  setFormOpen(true);
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold"
              >
                تعديل
              </button>
              <button
                type="button"
                onClick={() => openReport(p)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold"
              >
                <FileText className="w-3.5 h-3.5" /> تقرير الفواتير
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add/Edit Plumber */}
      <Modal
        open={formOpen}
        title={editing ? `تعديل السباك: ${editing.name}` : 'إضافة سباك / فني صحي'}
        onClose={() => setFormOpen(false)}
        maxWidthClass="max-w-md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-bold"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={savePlumber}
              className="px-5 py-2 rounded-xl bg-sky-600 text-white text-sm font-bold"
            >
              حفظ
            </button>
          </>
        }
      >
        <div className="space-y-3 text-xs sm:text-sm">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">الاسم *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">المنطقة</label>
            <input
              type="text"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </div>
        </div>
      </Modal>

      {/* Report Modal */}
      <Modal
        open={reportOpen && Boolean(reportData)}
        title={reportData ? `تقرير مسحوبات السباك: ${reportData.plumber.name}` : ''}
        subtitle="فواتير أصحاب الشقق والعملاء المرتبطة باسم السباك للتقارير والمتابعة"
        onClose={() => setReportOpen(false)}
        maxWidthClass="max-w-3xl"
        footer={
          <button
            type="button"
            onClick={printPlumberReport}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-bold"
          >
            <Printer className="w-4 h-4" /> طباعة التقرير (A4)
          </button>
        }
      >
        {reportData && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-center">
                <div className="text-slate-500">عدد الفواتير</div>
                <div className="font-extrabold text-base">{reportData.summary.invoices_count}</div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-center">
                <div className="text-slate-500">إجمالي المبيعات</div>
                <div className="font-extrabold text-base">{formatMoney(reportData.summary.gross_sales)}</div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-center">
                <div className="text-slate-500">المرتجعات</div>
                <div className="font-extrabold text-base text-rose-600">{formatMoney(reportData.summary.returns_total)}</div>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-center">
                <div className="text-emerald-700">الصافي بعد المرتجع</div>
                <div className="font-extrabold text-base text-emerald-800">{formatMoney(reportData.summary.net_sales)}</div>
              </div>
            </div>

            <table className="w-full border-collapse border border-slate-200">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-200 p-2 text-center">رقم الفاتورة</th>
                  <th className="border border-slate-200 p-2 text-center">التاريخ</th>
                  <th className="border border-slate-200 p-2 text-right">اسم العميل</th>
                  <th className="border border-slate-200 p-2 text-center">الإجمالي</th>
                  <th className="border border-slate-200 p-2 text-center">المرتجع</th>
                  <th className="border border-slate-200 p-2 text-left">الصافي</th>
                </tr>
              </thead>
              <tbody>
                {reportData.invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="border border-slate-200 p-2 text-center font-bold text-sky-700">{inv.invoice_no}</td>
                    <td className="border border-slate-200 p-2 text-center">{inv.invoice_date}</td>
                    <td className="border border-slate-200 p-2 font-bold">{inv.customer_name}</td>
                    <td className="border border-slate-200 p-2 text-center">{formatMoney(inv.total_amount)}</td>
                    <td className="border border-slate-200 p-2 text-center text-rose-600">
                      {inv.returned_total > 0 ? formatMoney(inv.returned_total) : '—'}
                    </td>
                    <td className="border border-slate-200 p-2 text-left font-extrabold">
                      {formatMoney(inv.total_amount - inv.returned_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}
