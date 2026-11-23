import { useCallback, useEffect, useState } from 'react';
import { ArrowLeftRight, Plus, Trash2, Vault } from 'lucide-react';
import { api } from '../api';
import type { AuthUser, TreasuryAccount } from '../types';
import { accountTypeLabel, formatMoney, todayIso, txTypeLabel } from '../utils/format';
import { Modal } from '../components/Modal';

interface TreasuryPageProps {
  user: AuthUser;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

const EXPENSE_CATEGORIES = [
  'نقل ومشال',
  'عمالة ومرتبات',
  'إيجار',
  'كهرباء ومياه وغاز',
  'صيانة وضيافة',
  'إكراميات ونثريات',
];

export function TreasuryPage({ user, onNotify }: TreasuryPageProps) {
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([]);
  const [expenses, setExpenses] = useState<Record<string, unknown>[]>([]);
  const [transactions, setTransactions] = useState<Record<string, unknown>[]>([]);
  const [activeTab, setActiveTab] = useState<'expenses' | 'transactions'>('expenses');

  // Expense form
  const [expOpen, setExpOpen] = useState(false);
  const [expCategory, setExpCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [expAmount, setExpAmount] = useState(0);
  const [expAccId, setExpAccId] = useState(0);
  const [expDate, setExpDate] = useState(todayIso());
  const [expDesc, setExpDesc] = useState('');

  // Transfer / Close shift modal
  const [trOpen, setTrOpen] = useState(false);
  const [fromAccId, setFromAccId] = useState(0);
  const [toAccId, setToAccId] = useState(0);
  const [trAmount, setTrAmount] = useState(0);
  const [trNotes, setTrNotes] = useState('إقفال وردية وترحيل للخزنة الرئيسية');

  // Add account modal (admin)
  const [accOpen, setAccOpen] = useState(false);
  const [accName, setAccName] = useState('');
  const [accType, setAccType] = useState<TreasuryAccount['account_type']>('bank');
  const [accOpening, setAccOpening] = useState(0);

  const loadData = useCallback(async () => {
    try {
      const [aRes, eRes, tRes] = await Promise.all([
        api.get<{ accounts: TreasuryAccount[] }>('/api/treasury/accounts'),
        api.get<{ expenses: Record<string, unknown>[] }>('/api/treasury/expenses'),
        api.get<{ transactions: Record<string, unknown>[] }>('/api/treasury/transactions'),
      ]);
      setAccounts(aRes.accounts);
      setExpenses(eRes.expenses);
      setTransactions(tRes.transactions);

      if (aRes.accounts.length > 0) {
        const cashier = aRes.accounts.find((a) => a.account_type === 'cashier_safe') || aRes.accounts[0];
        const main = aRes.accounts.find((a) => a.account_type === 'main_safe') || aRes.accounts[1] || aRes.accounts[0];
        setExpAccId((p) => p || cashier.id);
        setFromAccId((p) => p || cashier.id);
        setToAccId((p) => p || main.id);
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر تحميل بيانات الخزينة', 'error');
    }
  }, [onNotify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function saveExpense() {
    if (expAmount <= 0) {
      onNotify('يرجى إدخال مبلغ صحيح للمصروف', 'error');
      return;
    }
    try {
      await api.post('/api/treasury/expenses', {
        expense_date: expDate,
        category: expCategory,
        amount: expAmount,
        treasury_account_id: expAccId,
        description: expDesc,
      });
      setExpOpen(false);
      setExpAmount(0);
      setExpDesc('');
      onNotify('تم تسجيل المصروف وخصمه من الخزنة');
      await loadData();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر حفظ المصروف', 'error');
    }
  }

  async function deleteExpense(id: number) {
    if (!confirm('حذف هذا المصروف وإعادة قيمته للخزنة؟')) return;
    try {
      await api.del(`/api/treasury/expenses/${id}`);
      onNotify('تم حذف المصروف');
      await loadData();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر الحذف', 'error');
    }
  }

  async function submitTransfer() {
    if (trAmount <= 0) return;
    try {
      await api.post('/api/treasury/transfers', {
        from_account_id: fromAccId,
        to_account_id: toAccId,
        amount: trAmount,
        tx_date: todayIso(),
        notes: trNotes,
      });
      setTrOpen(false);
      setTrAmount(0);
      onNotify('تم التحويل بين الحسابات بنجاح');
      await loadData();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر التحويل', 'error');
    }
  }

  async function saveAccount() {
    if (!accName.trim()) return;
    try {
      await api.post('/api/treasury/accounts', {
        name: accName.trim(),
        account_type: accType,
        opening_balance: accOpening,
      });
      setAccOpen(false);
      setAccName('');
      setAccOpening(0);
      onNotify('تمت إضافة الحساب / الخزنة');
      await loadData();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر إضافة الحساب', 'error');
    }
  }

  return (
    <div className="space-y-4">
      {/* Accounts Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {accounts.map((a) => (
          <div key={a.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{accountTypeLabel(a.account_type)}</span>
              <Vault className="w-4 h-4 text-sky-600" />
            </div>
            <div className="font-bold text-slate-900 mt-1 text-sm">{a.name}</div>
            <div className="text-xl font-extrabold text-sky-800 mt-2">{formatMoney(a.balance)}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('expenses')}
            className={`px-4 py-2 rounded-xl text-sm font-bold ${
              activeTab === 'expenses' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            المصروفات اليومية ({expenses.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('transactions')}
            className={`px-4 py-2 rounded-xl text-sm font-bold ${
              activeTab === 'transactions' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            سجل حركات الخزينة ({transactions.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setExpOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold"
          >
            <Plus className="w-4 h-4" /> تسجيل مصروف يومي
          </button>
          <button
            type="button"
            onClick={() => setTrOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold"
          >
            <ArrowLeftRight className="w-4 h-4" /> ترحيل / تحويل بين الخزائن
          </button>
          {user.role === 'admin' && (
            <button
              type="button"
              onClick={() => setAccOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 text-white text-sm font-bold"
            >
              <Plus className="w-4 h-4" /> خزنة / محفظة جديدة
            </button>
          )}
        </div>
      </div>

      {activeTab === 'expenses' ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th className="p-3 text-center">التاريخ</th>
                <th className="p-3 text-right">البند</th>
                <th className="p-3 text-right">البيان</th>
                <th className="p-3 text-right">الخزنة</th>
                <th className="p-3 text-center">المبلغ</th>
                <th className="p-3 text-right">المسؤول</th>
                {user.role === 'admin' && <th className="p-3 w-12"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {expenses.map((e) => (
                <tr key={Number(e.id)}>
                  <td className="p-3 text-center">{String(e.expense_date)}</td>
                  <td className="p-3 font-bold">{String(e.category)}</td>
                  <td className="p-3 text-slate-600">{String(e.description || '—')}</td>
                  <td className="p-3">{String(e.account_name)}</td>
                  <td className="p-3 text-center font-extrabold text-rose-700">{formatMoney(e.amount)}</td>
                  <td className="p-3 text-xs text-slate-500">{String(e.user_name || '')}</td>
                  {user.role === 'admin' && (
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => deleteExpense(Number(e.id))}
                        className="p-1 text-rose-600 hover:bg-rose-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  )}
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
                <th className="p-3 text-center">التاريخ</th>
                <th className="p-3 text-right">الحساب</th>
                <th className="p-3 text-center">النوع</th>
                <th className="p-3 text-right">الوصف</th>
                <th className="p-3 text-left">الحركة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.map((t) => {
                const delta = Number(t.amount_delta);
                return (
                  <tr key={Number(t.id)}>
                    <td className="p-3 text-center text-xs">{String(t.tx_date)}</td>
                    <td className="p-3 font-bold">{String(t.account_name)}</td>
                    <td className="p-3 text-center">
                      <span className="text-[11px] font-bold bg-slate-100 px-2 py-0.5 rounded-full">
                        {txTypeLabel(String(t.tx_type))}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-slate-600">{String(t.description)}</td>
                    <td
                      className={`p-3 text-left font-extrabold ${
                        delta >= 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {delta >= 0 ? `+${formatMoney(delta)}` : formatMoney(delta)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Expense Modal */}
      <Modal
        open={expOpen}
        title="تسجيل مصروف يومي"
        onClose={() => setExpOpen(false)}
        maxWidthClass="max-w-md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setExpOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-bold"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={saveExpense}
              className="px-5 py-2 rounded-xl bg-rose-600 text-white text-sm font-bold"
            >
              حفظ المصروف
            </button>
          </>
        }
      >
        <div className="space-y-3 text-xs sm:text-sm">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">بند المصروف</label>
            <select
              value={expCategory}
              onChange={(e) => setExpCategory(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">المبلغ</label>
              <input
                type="number"
                min="0.01"
                step="any"
                value={expAmount}
                onChange={(e) => setExpAmount(Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">التاريخ</label>
              <input
                type="date"
                value={expDate}
                onChange={(e) => setExpDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">يصرف من خزنة / حساب</label>
            <select
              value={expAccId}
              onChange={(e) => setExpAccId(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({formatMoney(a.balance)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">التفاصيل</label>
            <input
              type="text"
              value={expDesc}
              onChange={(e) => setExpDesc(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </div>
        </div>
      </Modal>

      {/* Transfer Modal */}
      <Modal
        open={trOpen}
        title="ترحيل / تحويل بين الخزائن والحسابات"
        subtitle="مثال: إقفال وردية خزنة الكاشير اليومية وترحيلها إلى الخزنة الرئيسية"
        onClose={() => setTrOpen(false)}
        maxWidthClass="max-w-md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setTrOpen(false)}
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
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">من حساب</label>
            <select
              value={fromAccId}
              onChange={(e) => setFromAccId(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({formatMoney(a.balance)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">إلى حساب</label>
            <select
              value={toAccId}
              onChange={(e) => setToAccId(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({formatMoney(a.balance)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">المبلغ المحوّل</label>
            <input
              type="number"
              min="0.01"
              step="any"
              value={trAmount}
              onChange={(e) => setTrAmount(Number(e.target.value) || 0)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 font-bold"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">البيان</label>
            <input
              type="text"
              value={trNotes}
              onChange={(e) => setTrNotes(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </div>
        </div>
      </Modal>

      {/* New Account Modal */}
      <Modal
        open={accOpen}
        title="إضافة خزنة / حساب بنكي / محفظة إلكترونية"
        onClose={() => setAccOpen(false)}
        maxWidthClass="max-w-md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setAccOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-bold"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={saveAccount}
              className="px-5 py-2 rounded-xl bg-sky-600 text-white text-sm font-bold"
            >
              حفظ الحساب
            </button>
          </>
        }
      >
        <div className="space-y-3 text-xs sm:text-sm">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">اسم الحساب / المحفظة</label>
            <input
              type="text"
              value={accName}
              onChange={(e) => setAccName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">النوع</label>
            <select
              value={accType}
              onChange={(e) => setAccType(e.target.value as TreasuryAccount['account_type'])}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
            >
              <option value="cashier_safe">خزنة كاشير</option>
              <option value="main_safe">خزنة رئيسية</option>
              <option value="bank">حساب بنكي</option>
              <option value="instapay">إنستاباي</option>
              <option value="e_wallet">محفظة إلكترونية</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">الرصيد الافتتاحي</label>
            <input
              type="number"
              step="any"
              value={accOpening}
              onChange={(e) => setAccOpening(Number(e.target.value) || 0)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
