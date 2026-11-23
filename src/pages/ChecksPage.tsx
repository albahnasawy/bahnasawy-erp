import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Plus, XCircle } from 'lucide-react';
import { api } from '../api';
import type { Supplier, SupplierCheck, TreasuryAccount } from '../types';
import { formatMoney, todayIso } from '../utils/format';
import { Modal } from '../components/Modal';

interface ChecksPageProps {
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

export function ChecksPage({ onNotify }: ChecksPageProps) {
  const [checks, setChecks] = useState<SupplierCheck[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([]);
  const [statusFilter, setStatusFilter] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [checkNo, setCheckNo] = useState('');
  const [bankName, setBankName] = useState('البنك الأهلي المصري');
  const [supplierId, setSupplierId] = useState(0);
  const [accountId, setAccountId] = useState(0);
  const [amount, setAmount] = useState(0);
  const [issueDate, setIssueDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState(todayIso());
  const [notes, setNotes] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [cRes, sRes, aRes] = await Promise.all([
        api.get<{ checks: SupplierCheck[] }>(`/api/treasury/checks${statusFilter ? `?status=${statusFilter}` : ''}`),
        api.get<{ suppliers: Supplier[] }>('/api/suppliers'),
        api.get<{ accounts: TreasuryAccount[] }>('/api/treasury/accounts'),
      ]);
      setChecks(cRes.checks);
      setSuppliers(sRes.suppliers);
      setAccounts(aRes.accounts);
      if (sRes.suppliers.length > 0) setSupplierId((p) => p || sRes.suppliers[0].id);
      if (aRes.accounts.length > 0) {
        const bank = aRes.accounts.find((a) => a.account_type === 'instapay' || a.account_type === 'bank') || aRes.accounts[0];
        setAccountId((p) => p || bank.id);
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر تحميل الشيكات', 'error');
    }
  }, [statusFilter, onNotify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function saveCheck() {
    if (!checkNo.trim() || amount <= 0) {
      onNotify('يرجى إدخال رقم الشيك والمبلغ', 'error');
      return;
    }
    try {
      await api.post('/api/treasury/checks', {
        check_no: checkNo.trim(),
        bank_name: bankName.trim(),
        supplier_id: supplierId,
        treasury_account_id: accountId,
        amount,
        issue_date: issueDate,
        due_date: dueDate,
        notes,
      });
      setAddOpen(false);
      setCheckNo('');
      setAmount(0);
      setNotes('');
      onNotify('تم تسجيل الشيك بنجاح');
      await loadData();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر تسجيل الشيك', 'error');
    }
  }

  async function clearCheck(chk: SupplierCheck) {
    if (!confirm(`تأكيد صرف الشيك رقم ${chk.check_no} بمبلغ ${formatMoney(chk.amount)}؟ سيتم خصمه من الحساب وحساب المورد.`)) {
      return;
    }
    try {
      await api.post(`/api/treasury/checks/${chk.id}/clear`, {
        treasury_account_id: chk.treasury_account_id || accountId,
      });
      onNotify('تم تأكيد صرف الشيك وتحديث رصيد الحساب والمورد');
      await loadData();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر صرف الشيك', 'error');
    }
  }

  async function setCheckStatus(chk: SupplierCheck, status: 'bounced' | 'cancelled') {
    try {
      await api.post(`/api/treasury/checks/${chk.id}/status`, { status });
      onNotify(status === 'bounced' ? 'تم تسجيل الشيك كمرتجع' : 'تم إلغاء الشيك');
      await loadData();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر تحديث الحالة', 'error');
    }
  }

  const today = todayIso();

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { k: '', label: 'الكل' },
            { k: 'pending', label: 'قيد الانتظار' },
            { k: 'cleared', label: 'تم الصرف' },
            { k: 'bounced', label: 'مرتجع' },
            { k: 'cancelled', label: 'ملغى' },
          ].map((tab) => (
            <button
              key={tab.k}
              type="button"
              onClick={() => setStatusFilter(tab.k)}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold ${
                statusFilter === tab.k ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold"
        >
          <Plus className="w-4 h-4" /> تسجيل شيك لمورد
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="bg-slate-100 text-slate-700">
              <th className="p-3 text-right">رقم الشيك</th>
              <th className="p-3 text-right">المورد</th>
              <th className="p-3 text-right">البنك / الحساب</th>
              <th className="p-3 text-center">تاريخ الاستحقاق</th>
              <th className="p-3 text-center">المبلغ</th>
              <th className="p-3 text-center">الحالة</th>
              <th className="p-3 text-center">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {checks.map((chk) => {
              const overdue = chk.status === 'pending' && chk.due_date <= today;
              return (
                <tr key={chk.id} className={overdue ? 'bg-rose-50/40' : ''}>
                  <td className="p-3 font-extrabold">{chk.check_no}</td>
                  <td className="p-3 font-bold">{chk.supplier_name}</td>
                  <td className="p-3 text-xs text-slate-600">
                    {chk.bank_name}
                    {chk.account_name ? ` (${chk.account_name})` : ''}
                  </td>
                  <td className={`p-3 text-center font-bold ${overdue ? 'text-rose-700' : ''}`}>
                    {chk.due_date} {overdue ? '(مستحق)' : ''}
                  </td>
                  <td className="p-3 text-center font-extrabold">{formatMoney(chk.amount)}</td>
                  <td className="p-3 text-center">
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                        chk.status === 'cleared'
                          ? 'bg-emerald-100 text-emerald-800'
                          : chk.status === 'pending'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {chk.status === 'pending'
                        ? 'قيد الانتظار'
                        : chk.status === 'cleared'
                          ? 'تم الصرف'
                          : chk.status === 'bounced'
                            ? 'مرتجع'
                            : 'ملغى'}
                    </span>
                  </td>
                  <td className="p-3">
                    {chk.status === 'pending' && (
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => clearCheck(chk)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> تم الصرف
                        </button>
                        <button
                          type="button"
                          onClick={() => setCheckStatus(chk, 'bounced')}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 text-rose-700 text-xs font-bold"
                        >
                          <XCircle className="w-3.5 h-3.5" /> مرتجع
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal
        open={addOpen}
        title="تسجيل شيك صادر لمورد"
        onClose={() => setAddOpen(false)}
        maxWidthClass="max-w-lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-bold"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={saveCheck}
              className="px-5 py-2 rounded-xl bg-sky-600 text-white text-sm font-bold"
            >
              حفظ الشيك
            </button>
          </>
        }
      >
        <div className="space-y-3 text-xs sm:text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">رقم الشيك *</label>
              <input
                type="text"
                value={checkNo}
                onChange={(e) => setCheckNo(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">البنك *</label>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">المورد</label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(Number(e.target.value))}
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
              <label className="block text-xs font-bold text-slate-700 mb-1">الحساب المسحوب عليه</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">المبلغ</label>
              <input
                type="number"
                min="1"
                step="any"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ التحرير</label>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-2 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الاستحقاق</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-2 py-2 text-xs"
              />
            </div>
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
    </div>
  );
}
