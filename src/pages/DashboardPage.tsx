import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  ShoppingCart,
  TrendingUp,
  Truck,
  Users,
  Vault,
  Wallet,
} from 'lucide-react';
import { api } from '../api';
import type { AuthUser, SupplierCheck, TreasuryAccount } from '../types';
import { formatMoney, formatQty } from '../utils/format';
import type { PageKey } from '../components/Sidebar';

interface DashboardData {
  today: string;
  today_sales_count: number;
  today_sales_total: number;
  today_returns_total: number;
  today_net_sales: number;
  today_collections: number;
  today_expenses: number;
  today_net_profit?: number;
  total_treasury: number;
  treasury_accounts: TreasuryAccount[];
  total_receivables: number;
  total_payables: number;
  low_stock_count: number;
  low_stock_items: {
    id: number;
    sku: string;
    name: string;
    brand: string;
    size: string;
    base_unit_name: string;
    min_stock: number;
    total_stock: number;
  }[];
  due_checks_count: number;
  due_checks: SupplierCheck[];
}

interface DashboardPageProps {
  user: AuthUser;
  onNavigate: (page: PageKey) => void;
}

export function DashboardPage({ user, onNavigate }: DashboardPageProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const res = await api.get<DashboardData>('/api/reports/dashboard');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل لوحة التحكم');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">جاري تحميل ملخص المتجر...</div>;
  }
  if (error || !data) {
    return <div className="p-6 text-sm text-rose-600 font-semibold">{error || 'تعذر التحميل'}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => onNavigate('pos')}
          className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm shadow-sm transition"
        >
          <ShoppingCart className="w-4 h-4" />
          <span>فاتورة بيع جديدة</span>
        </button>
        {user.role !== 'cashier' && (
          <button
            type="button"
            onClick={() => onNavigate('purchases')}
            className="inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm shadow-sm transition"
          >
            <Truck className="w-4 h-4" />
            <span>تسجيل فاتورة شراء</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => onNavigate('customers')}
          className="inline-flex items-center gap-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-bold px-4 py-2.5 rounded-xl text-sm transition"
        >
          <Users className="w-4 h-4 text-sky-600" />
          <span>تحصيل دفعة عميل</span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('treasury')}
          className="inline-flex items-center gap-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-bold px-4 py-2.5 rounded-xl text-sm transition"
        >
          <Wallet className="w-4 h-4 text-rose-600" />
          <span>تسجيل مصروف يومي</span>
        </button>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>صافي مبيعات اليوم ({data.today_sales_count} فاتورة)</span>
            <ShoppingCart className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-2">{formatMoney(data.today_net_sales)}</div>
          <div className="text-xs text-slate-500 mt-1">
            مبيعات: {formatMoney(data.today_sales_total)} • مرتجع: {formatMoney(data.today_returns_total)}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>إجمالي الخزائن والحسابات</span>
            <Vault className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-2xl font-extrabold text-sky-800 mt-2">{formatMoney(data.total_treasury)}</div>
          <div className="text-xs text-slate-500 mt-1">
            تحصيلات اليوم: {formatMoney(data.today_collections)} • مصروفات: {formatMoney(data.today_expenses)}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>الآجل عند العملاء / مستحق للموردين</span>
            <ArrowDownLeft className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">لنا عند العملاء:</span>
              <span className="font-extrabold text-emerald-700">{formatMoney(data.total_receivables)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">علينا للموردين:</span>
              <span className="font-extrabold text-rose-700">{formatMoney(data.total_payables)}</span>
            </div>
          </div>
        </div>

        {user.role === 'admin' && data.today_net_profit !== undefined ? (
          <div className="bg-gradient-to-l from-emerald-700 to-teal-700 text-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-100">
              <span>صافي ربح اليوم (خاص بالمدير)</span>
              <TrendingUp className="w-4 h-4 text-emerald-200" />
            </div>
            <div className="text-2xl font-extrabold mt-2">{formatMoney(data.today_net_profit)}</div>
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="text-xs text-emerald-100 hover:text-white underline mt-1 inline-flex items-center gap-1"
            >
              <span>عرض تقرير الأرباح التفصيلي</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs font-bold text-slate-500">
              <span>تنبيهات المخزون</span>
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-extrabold text-amber-700 mt-2">{data.low_stock_count} صنف</div>
            <div className="text-xs text-slate-500 mt-1">أصناف وصلت للحد الأدنى أو نفدت</div>
          </div>
        )}
      </div>

      {/* Safes Breakdown */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <h2 className="text-sm font-extrabold text-slate-900 mb-3">أرصدة الخزائن ووسائل الدفع الحالية</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {data.treasury_accounts.map((acc) => (
            <div key={acc.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="text-xs font-semibold text-slate-600">{acc.name}</div>
              <div className="text-lg font-extrabold text-slate-900 mt-1">{formatMoney(acc.balance)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Alerts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Low Stock */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <h2 className="text-sm font-extrabold text-slate-900">أصناف ناقصة / تحت الحد الأدنى ({data.low_stock_count})</h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('products')}
              className="text-xs font-bold text-sky-700 hover:underline"
            >
              عرض الكل
            </button>
          </div>
          {data.low_stock_items.length === 0 ? (
            <p className="text-xs text-emerald-700 bg-emerald-50 rounded-xl p-3 font-semibold">
              جميع الأصناف متوفرة فوق الحد الأدنى.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-200">
                    <th className="py-2 text-right">الصنف</th>
                    <th className="py-2 text-center">المتوفر</th>
                    <th className="py-2 text-center">الحد الأدنى</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.low_stock_items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2">
                        <div className="font-bold text-slate-800">{item.name}</div>
                        <div className="text-[11px] text-slate-500">
                          {[item.brand, item.size].filter(Boolean).join(' • ')}
                        </div>
                      </td>
                      <td className="py-2 text-center font-extrabold text-rose-600">
                        {formatQty(item.total_stock)} {item.base_unit_name}
                      </td>
                      <td className="py-2 text-center text-slate-600">{formatQty(item.min_stock)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Due Checks */}
        {user.role !== 'cashier' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-5 h-5 text-rose-500" />
                <h2 className="text-sm font-extrabold text-slate-900">
                  شيكات الموردين المستحقة خلال 7 أيام ({data.due_checks_count})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('checks')}
                className="text-xs font-bold text-sky-700 hover:underline"
              >
                إدارة الشيكات
              </button>
            </div>
            {data.due_checks.length === 0 ? (
              <p className="text-xs text-slate-500 bg-slate-50 rounded-xl p-3">
                لا توجد شيكات مستحقة خلال الأيام السبعة القادمة.
              </p>
            ) : (
              <div className="space-y-2">
                {data.due_checks.map((chk) => {
                  const overdue = chk.due_date < data.today;
                  return (
                    <div
                      key={chk.id}
                      className={`rounded-xl border p-3 flex items-center justify-between gap-2 text-xs ${
                        overdue ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-slate-900">
                          شيك #{chk.check_no} — {chk.supplier_name}
                        </div>
                        <div className="text-slate-600 mt-0.5">
                          {chk.bank_name} • الاستحقاق: {chk.due_date} {overdue ? '(متأخر)' : ''}
                        </div>
                      </div>
                      <div className="font-extrabold text-sm text-rose-700">{formatMoney(chk.amount)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
