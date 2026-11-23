import { useCallback, useEffect, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { api } from '../api';
import type { AuthUser, PrintDocumentPayload } from '../types';
import { downloadCsv, formatMoney, formatQty, monthStartIso, todayIso } from '../utils/format';
import type { StatementPrintData } from '../components/PrintableRoot';

interface ReportsPageProps {
  user: AuthUser;
  onPrint: (payload: PrintDocumentPayload) => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

type ReportTab = 'profit' | 'inventory' | 'plumbers' | 'vat';

export function ReportsPage({ user, onPrint, onNotify }: ReportsPageProps) {
  const isAdmin = user.role === 'admin';
  const [tab, setTab] = useState<ReportTab>(isAdmin ? 'profit' : 'inventory');
  const [from, setFrom] = useState(monthStartIso());
  const [to, setTo] = useState(todayIso());
  const [groupBy, setGroupBy] = useState<'day' | 'month'>('day');
  const [stagnantDays, setStagnantDays] = useState(30);

  const [profitData, setProfitData] = useState<{
    rows: {
      period: string;
      invoices_count: number;
      gross_sales: number;
      sales_returns: number;
      net_sales: number;
      net_cogs: number;
      gross_profit: number;
      expenses: number;
      net_profit: number;
      margin_pct: number;
    }[];
    totals: {
      invoices_count: number;
      gross_sales: number;
      sales_returns: number;
      net_sales: number;
      net_cogs: number;
      gross_profit: number;
      expenses: number;
      net_profit: number;
    };
  } | null>(null);

  const [invData, setInvData] = useState<{
    low_stock: Record<string, unknown>[];
    best_sellers: Record<string, unknown>[];
    stagnant: Record<string, unknown>[];
  } | null>(null);

  const [plumberRows, setPlumberRows] = useState<
    {
      id: number;
      name: string;
      phone: string;
      area: string;
      invoices_count: number;
      customers_count: number;
      gross_sales: number;
      returns_total: number;
      net_sales: number;
    }[]
  >([]);

  const [vatData, setVatData] = useState<{
    sales_vat_invoices: number;
    taxable_sales: number;
    output_vat: number;
    returned_vat: number;
    net_output_vat: number;
    input_vat: number;
    net_vat_payable: number;
  } | null>(null);

  const loadReports = useCallback(async () => {
    try {
      const qs = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
      if (tab === 'profit' && isAdmin) {
        const res = await api.get<typeof profitData>(`/api/reports/profit?${qs}&group_by=${groupBy}`);
        setProfitData(res);
      } else if (tab === 'inventory') {
        const res = await api.get<typeof invData>(
          `/api/reports/inventory?${qs}&stagnant_days=${stagnantDays}`
        );
        setInvData(res);
      } else if (tab === 'plumbers') {
        const res = await api.get<{ plumbers: typeof plumberRows }>(`/api/reports/plumbers?${qs}`);
        setPlumberRows(res.plumbers);
      } else if (tab === 'vat') {
        const res = await api.get<typeof vatData>(`/api/reports/vat?${qs}`);
        setVatData(res);
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر تحميل التقرير', 'error');
    }
  }, [tab, from, to, groupBy, stagnantDays, isAdmin, onNotify]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  function printProfit() {
    if (!profitData) return;
    const payload: StatementPrintData = {
      title: `تقرير صافي الأرباح (${groupBy === 'day' ? 'يومي' : 'شهري'})`,
      partyName: `الفترة من ${from} إلى ${to}`,
      summaryCards: [
        { label: 'صافي المبيعات', value: formatMoney(profitData.totals.net_sales) },
        { label: 'تكلفة البضاعة', value: formatMoney(profitData.totals.net_cogs) },
        { label: 'المصروفات', value: formatMoney(profitData.totals.expenses) },
        { label: 'صافي الربح النهائي', value: formatMoney(profitData.totals.net_profit) },
      ],
      columns: [
        { label: 'الفترة', align: 'center' },
        { label: 'إجمالي المبيعات', align: 'center' },
        { label: 'المرتجعات', align: 'center' },
        { label: 'صافي المبيعات', align: 'center' },
        { label: 'تكلفة المبيعات', align: 'center' },
        { label: 'المصروفات', align: 'center' },
        { label: 'صافي الربح', align: 'left' },
      ],
      rows: profitData.rows.map((r) => [
        r.period,
        formatMoney(r.gross_sales),
        formatMoney(r.sales_returns),
        formatMoney(r.net_sales),
        formatMoney(r.net_cogs),
        formatMoney(r.expenses),
        formatMoney(r.net_profit),
      ]),
    };
    onPrint({ mode: 'a4', kind: 'statement', data: payload });
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={() => setTab('profit')}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold ${
                tab === 'profit' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              صافي الأرباح اليومي والشهري
            </button>
          )}
          <button
            type="button"
            onClick={() => setTab('inventory')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold ${
              tab === 'inventory' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            النواقص والأكثر مبيعاً والراكد
          </button>
          <button
            type="button"
            onClick={() => setTab('plumbers')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold ${
              tab === 'plumbers' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            تقرير مسحوبات السباكين
          </button>
          <button
            type="button"
            onClick={() => setTab('vat')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold ${
              tab === 'vat' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            ملخص ضريبة القيمة المضافة
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span>من:</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-xl border border-slate-300 px-2.5 py-1.5"
          />
          <span>إلى:</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-xl border border-slate-300 px-2.5 py-1.5"
          />
        </div>
      </div>

      {/* PROFIT REPORT (ADMIN ONLY) */}
      {tab === 'profit' && isAdmin && profitData && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="text-xs text-slate-500">صافي المبيعات</div>
              <div className="text-xl font-extrabold text-slate-900 mt-1">
                {formatMoney(profitData.totals.net_sales)}
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="text-xs text-slate-500">تكلفة البضاعة المباعة</div>
              <div className="text-xl font-extrabold text-amber-700 mt-1">
                {formatMoney(profitData.totals.net_cogs)}
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="text-xs text-slate-500">إجمالي المصروفات</div>
              <div className="text-xl font-extrabold text-rose-700 mt-1">
                {formatMoney(profitData.totals.expenses)}
              </div>
            </div>
            <div className="bg-emerald-700 text-white rounded-2xl p-4">
              <div className="text-xs text-emerald-100">صافي الربح النهائي</div>
              <div className="text-xl font-extrabold mt-1">{formatMoney(profitData.totals.net_profit)}</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setGroupBy('day')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                  groupBy === 'day' ? 'bg-slate-900 text-white' : 'bg-slate-100'
                }`}
              >
                يومي
              </button>
              <button
                type="button"
                onClick={() => setGroupBy('month')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                  groupBy === 'month' ? 'bg-slate-900 text-white' : 'bg-slate-100'
                }`}
              >
                شهري
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  downloadCsv(
                    `profit_${from}_${to}.csv`,
                    ['الفترة', 'الفواتير', 'المبيعات', 'المرتجعات', 'صافي المبيعات', 'التكلفة', 'مجمل الربح', 'المصروفات', 'صافي الربح'],
                    profitData.rows.map((r) => [
                      r.period,
                      r.invoices_count,
                      r.gross_sales,
                      r.sales_returns,
                      r.net_sales,
                      r.net_cogs,
                      r.gross_profit,
                      r.expenses,
                      r.net_profit,
                    ])
                  )
                }
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold"
              >
                <Download className="w-3.5 h-3.5" /> تصدير Excel
              </button>
              <button
                type="button"
                onClick={printProfit}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-bold"
              >
                <Printer className="w-3.5 h-3.5" /> طباعة A4
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-700">
                  <th className="p-3 text-center">الفترة</th>
                  <th className="p-3 text-center">الفواتير</th>
                  <th className="p-3 text-center">إجمالي المبيعات</th>
                  <th className="p-3 text-center">المرتجعات</th>
                  <th className="p-3 text-center">صافي المبيعات</th>
                  <th className="p-3 text-center">التكلفة</th>
                  <th className="p-3 text-center">المصروفات</th>
                  <th className="p-3 text-center">صافي الربح</th>
                  <th className="p-3 text-center">هامش الربح</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {profitData.rows.map((r) => (
                  <tr key={r.period}>
                    <td className="p-3 text-center font-bold">{r.period}</td>
                    <td className="p-3 text-center">{r.invoices_count}</td>
                    <td className="p-3 text-center">{formatMoney(r.gross_sales)}</td>
                    <td className="p-3 text-center text-rose-600">{formatMoney(r.sales_returns)}</td>
                    <td className="p-3 text-center font-bold">{formatMoney(r.net_sales)}</td>
                    <td className="p-3 text-center text-amber-700">{formatMoney(r.net_cogs)}</td>
                    <td className="p-3 text-center text-rose-700">{formatMoney(r.expenses)}</td>
                    <td
                      className={`p-3 text-center font-extrabold ${
                        r.net_profit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {formatMoney(r.net_profit)}
                    </td>
                    <td className="p-3 text-center text-xs font-bold">{r.margin_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* INVENTORY REPORT */}
      {tab === 'inventory' && invData && (
        <div className="space-y-5">
          {/* Low stock */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <h3 className="font-extrabold text-sm text-amber-800 mb-3">
              1. تقرير النواقص (أصناف أقل من أو تساوي الحد الأدنى): {invData.low_stock.length} صنف
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-amber-50 text-amber-900">
                    <th className="p-2 text-right">الصنف</th>
                    <th className="p-2 text-center">الماركة / المقاس</th>
                    <th className="p-2 text-center">الرصيد الحالي</th>
                    <th className="p-2 text-center">الحد الأدنى</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invData.low_stock.map((item) => (
                    <tr key={Number(item.id)}>
                      <td className="p-2 font-bold">{String(item.name)}</td>
                      <td className="p-2 text-center">
                        {[item.brand, item.size].filter(Boolean).join(' • ') || '—'}
                      </td>
                      <td className="p-2 text-center font-extrabold text-rose-600">
                        {formatQty(item.total_stock)} {String(item.base_unit_name)}
                      </td>
                      <td className="p-2 text-center">{formatQty(item.min_stock)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Best sellers */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <h3 className="font-extrabold text-sm text-emerald-800 mb-3">
                2. الأصناف الأكثر مبيعاً (خلال الفترة)
              </h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-emerald-50 text-emerald-900">
                    <th className="p-2 text-right">الصنف</th>
                    <th className="p-2 text-center">صافي الكمية</th>
                    <th className="p-2 text-left">صافي المبيعات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invData.best_sellers.map((item) => (
                    <tr key={Number(item.id)}>
                      <td className="p-2 font-bold">{String(item.name)}</td>
                      <td className="p-2 text-center font-bold">
                        {formatQty(item.net_qty_base)} {String(item.base_unit_name)}
                      </td>
                      <td className="p-2 text-left font-extrabold text-emerald-700">
                        {formatMoney(item.net_revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Stagnant */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-extrabold text-sm text-slate-800">
                  3. الأصناف الراكدة (لم تُبع خلال آخر {stagnantDays} يوماً)
                </h3>
                <select
                  value={stagnantDays}
                  onChange={(e) => setStagnantDays(Number(e.target.value))}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                >
                  <option value={15}>15 يوم</option>
                  <option value={30}>30 يوم</option>
                  <option value={60}>60 يوم</option>
                  <option value={90}>90 يوم</option>
                </select>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="p-2 text-right">الصنف</th>
                    <th className="p-2 text-center">الرصيد المتوفر</th>
                    <th className="p-2 text-center">آخر بيع</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invData.stagnant.map((item) => (
                    <tr key={Number(item.id)}>
                      <td className="p-2 font-bold">{String(item.name)}</td>
                      <td className="p-2 text-center font-bold">
                        {formatQty(item.total_stock)} {String(item.base_unit_name)}
                      </td>
                      <td className="p-2 text-center text-slate-500">
                        {item.last_sold_date ? String(item.last_sold_date) : 'لم يُبع بعد'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* PLUMBERS REPORT */}
      {tab === 'plumbers' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th className="p-3 text-right">السباك</th>
                <th className="p-3 text-center">الهاتف</th>
                <th className="p-3 text-center">عدد الفواتير</th>
                <th className="p-3 text-center">عدد العملاء</th>
                <th className="p-3 text-center">إجمالي المبيعات</th>
                <th className="p-3 text-center">المرتجعات</th>
                <th className="p-3 text-center">الصافي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {plumberRows.map((p) => (
                <tr key={p.id}>
                  <td className="p-3 font-extrabold">{p.name}</td>
                  <td className="p-3 text-center" dir="ltr">
                    {p.phone || '—'}
                  </td>
                  <td className="p-3 text-center font-bold">{p.invoices_count}</td>
                  <td className="p-3 text-center">{p.customers_count}</td>
                  <td className="p-3 text-center">{formatMoney(p.gross_sales)}</td>
                  <td className="p-3 text-center text-rose-600">{formatMoney(p.returns_total)}</td>
                  <td className="p-3 text-center font-extrabold text-sky-800">{formatMoney(p.net_sales)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* VAT REPORT */}
      {tab === 'vat' && vatData && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500">المبيعات الخاضعة للضريبة ({vatData.sales_vat_invoices} فاتورة)</div>
            <div className="text-xl font-extrabold mt-1">{formatMoney(vatData.taxable_sales)}</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500">صافي ضريبة المخرجات (المبيعات - المرتجعات)</div>
            <div className="text-xl font-extrabold text-sky-700 mt-1">{formatMoney(vatData.net_output_vat)}</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500">ضريبة المدخلات (المشتريات)</div>
            <div className="text-xl font-extrabold text-emerald-700 mt-1">{formatMoney(vatData.input_vat)}</div>
          </div>
          <div className="bg-slate-900 text-white rounded-2xl p-4">
            <div className="text-xs text-slate-300">صافي الضريبة المستحقة</div>
            <div className="text-xl font-extrabold mt-1">{formatMoney(vatData.net_vat_payable)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
