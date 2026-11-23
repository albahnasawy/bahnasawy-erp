import { useCallback, useEffect, useState } from 'react';
import { Banknote, FileText, Plus, Printer, Search } from 'lucide-react';
import { api } from '../api';
import type { PrintDocumentPayload, Supplier, TreasuryAccount } from '../types';
import { formatMoney, todayIso } from '../utils/format';
import { Modal } from '../components/Modal';
import type { StatementPrintData } from '../components/PrintableRoot';

interface SuppliersPageProps {
  onPrint: (payload: PrintDocumentPayload) => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

export function SuppliersPage({ onPrint, onNotify }: SuppliersPageProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([]);
  const [q, setQ] = useState('');

  // Add/Edit supplier
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [address, setAddress] = useState('');
  const [openingBalance, setOpeningBalance] = useState(0);
  const [notes, setNotes] = useState('');

  // Pay supplier modal
  const [payOpen, setPayOpen] = useState(false);
  const [paySup, setPaySup] = useState<Supplier | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payAccId, setPayAccId] = useState(0);
  const [payDate, setPayDate] = useState(todayIso());
  const [payNotes, setPayNotes] = useState('');

  // Statement modal
  const [stmtOpen, setStmtOpen] = useState(false);
  const [stmtData, setStmtData] = useState<{
    supplier: Supplier;
    entries: {
      date: string;
      ref_no: string;
      description: string;
      debit: number;
      credit: number;
      running_balance: number;
    }[];
    pending_checks: { check_no: string; bank_name: string; amount: number; due_date: string }[];
    calculated_balance: number;
  } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [sRes, aRes] = await Promise.all([
        api.get<{ suppliers: Supplier[] }>(`/api/suppliers?q=${encodeURIComponent(q.trim())}`),
        api.get<{ accounts: TreasuryAccount[] }>('/api/treasury/accounts'),
      ]);
      setSuppliers(sRes.suppliers);
      setAccounts(aRes.accounts);
      const def = aRes.accounts.find((a) => a.account_type === 'main_safe') || aRes.accounts[0];
      if (def) setPayAccId((p) => p || def.id);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر تحميل الموردين', 'error');
    }
  }, [q, onNotify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function saveSupplier() {
    if (!name.trim()) {
      onNotify('يرجى إدخال اسم المورد', 'error');
      return;
    }
    try {
      if (editing) {
        await api.put(`/api/suppliers/${editing.id}`, { name: name.trim(), phone, company, address, notes });
        onNotify('تم تحديث بيانات المورد');
      } else {
        await api.post('/api/suppliers', {
          name: name.trim(),
          phone,
          company,
          address,
          opening_balance: openingBalance,
          notes,
        });
        onNotify('تمت إضافة المورد');
      }
      setFormOpen(false);
      await loadData();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر الحفظ', 'error');
    }
  }

  async function submitPay() {
    if (!paySup || payAmount <= 0) return;
    try {
      await api.post(`/api/suppliers/${paySup.id}/payments`, {
        amount: payAmount,
        treasury_account_id: payAccId,
        payment_date: payDate,
        notes: payNotes,
      });
      setPayOpen(false);
      onNotify(`تم سداد ${formatMoney(payAmount)} للمورد ${paySup.name}`);
      await loadData();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر السداد', 'error');
    }
  }

  async function openStatement(s: Supplier) {
    try {
      const res = await api.get<typeof stmtData>(`/api/suppliers/${s.id}/statement`);
      setStmtData(res);
      setStmtOpen(true);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر تحميل كشف الحساب', 'error');
    }
  }

  function printStatement() {
    if (!stmtData) return;
    const payload: StatementPrintData = {
      title: 'كشف حساب مورد تفصيلي',
      partyName: stmtData.supplier.name,
      partyPhone: stmtData.supplier.phone,
      partyMeta: stmtData.supplier.company,
      summaryCards: [
        { label: 'رصيد أول المدة', value: formatMoney(stmtData.supplier.opening_balance) },
        { label: 'الرصيد المستحق للمورد', value: formatMoney(stmtData.calculated_balance) },
        { label: 'شيكات قيد الانتظار', value: String(stmtData.pending_checks.length) },
        { label: 'عدد الحركات', value: String(stmtData.entries.length) },
      ],
      columns: [
        { label: 'التاريخ', align: 'center' },
        { label: 'المرجع', align: 'center' },
        { label: 'البيان', align: 'right' },
        { label: 'مدين (مسدد/مرتجع)', align: 'center' },
        { label: 'دائن (مشتريات)', align: 'center' },
        { label: 'الرصيد', align: 'left' },
      ],
      rows: stmtData.entries.map((e) => [
        e.date,
        e.ref_no,
        e.description,
        e.debit > 0 ? formatMoney(e.debit) : '—',
        e.credit > 0 ? formatMoney(e.credit) : '—',
        formatMoney(e.running_balance),
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
            placeholder="بحث باسم المورد أو الشركة أو الهاتف..."
            className="w-full rounded-xl border border-slate-300 pr-9 pl-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setName('');
            setPhone('');
            setCompany('');
            setAddress('');
            setOpeningBalance(0);
            setNotes('');
            setFormOpen(true);
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold"
        >
          <Plus className="w-4 h-4" /> إضافة مورد جديد
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="bg-slate-100 text-slate-700">
              <th className="p-3 text-right">المورد</th>
              <th className="p-3 text-right">الشركة</th>
              <th className="p-3 text-center">الهاتف</th>
              <th className="p-3 text-center">رصيد مستحق للمورد</th>
              <th className="p-3 text-center">شيكات قيد الانتظار</th>
              <th className="p-3 text-center">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {suppliers.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="p-3 font-extrabold text-slate-900">{s.name}</td>
                <td className="p-3 text-slate-600">{s.company || '—'}</td>
                <td className="p-3 text-center" dir="ltr">
                  {s.phone || '—'}
                </td>
                <td className={`p-3 text-center font-extrabold ${s.balance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                  {formatMoney(s.balance)}
                </td>
                <td className="p-3 text-center text-amber-700 font-bold">
                  {Number(s.pending_checks_total || 0) > 0 ? formatMoney(s.pending_checks_total) : '—'}
                </td>
                <td className="p-3">
                  <div className="flex items-center justify-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setPaySup(s);
                        setPayAmount(s.balance > 0 ? s.balance : 0);
                        setPayNotes('');
                        setPayOpen(true);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold"
                    >
                      <Banknote className="w-3.5 h-3.5" /> سداد دفعة
                    </button>
                    <button
                      type="button"
                      onClick={() => openStatement(s)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-800 text-xs font-bold"
                    >
                      <FileText className="w-3.5 h-3.5" /> كشف حساب
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(s);
                        setName(s.name);
                        setPhone(s.phone);
                        setCompany(s.company);
                        setAddress(s.address);
                        setNotes(s.notes);
                        setFormOpen(true);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold"
                    >
                      تعديل
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      <Modal
        open={formOpen}
        title={editing ? `تعديل المورد: ${editing.name}` : 'إضافة مورد جديد'}
        onClose={() => setFormOpen(false)}
        maxWidthClass="max-w-lg"
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
              onClick={saveSupplier}
              className="px-5 py-2 rounded-xl bg-sky-600 text-white text-sm font-bold"
            >
              حفظ
            </button>
          </>
        }
      >
        <div className="space-y-3 text-xs sm:text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">اسم المورد *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الشركة</label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الهاتف</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">العنوان</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>
          </div>
          {!editing && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">رصيد افتتاحي مستحق للمورد</label>
              <input
                type="number"
                step="any"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>
          )}
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

      {/* Pay Supplier Modal */}
      <Modal
        open={payOpen && Boolean(paySup)}
        title={paySup ? `سداد دفعة للمورد: ${paySup.name}` : ''}
        onClose={() => setPayOpen(false)}
        maxWidthClass="max-w-md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setPayOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-bold"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={submitPay}
              className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold"
            >
              تأكيد السداد
            </button>
          </>
        }
      >
        {paySup && (
          <div className="space-y-3 text-xs sm:text-sm">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              المستحق للمورد: <strong className="text-rose-700">{formatMoney(paySup.balance)}</strong>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">المبلغ المدفوع</label>
              <input
                type="number"
                min="0.01"
                step="any"
                value={payAmount}
                onChange={(e) => setPayAmount(Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الخزنة / الحساب البنكي / إنستاباي</label>
              <select
                value={payAccId}
                onChange={(e) => setPayAccId(Number(e.target.value))}
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
              <label className="block text-xs font-bold text-slate-700 mb-1">التاريخ</label>
              <input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات / رقم التحويل</label>
              <input
                type="text"
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Statement Modal */}
      <Modal
        open={stmtOpen && Boolean(stmtData)}
        title={stmtData ? `كشف حساب المورد: ${stmtData.supplier.name}` : ''}
        onClose={() => setStmtOpen(false)}
        maxWidthClass="max-w-4xl"
        footer={
          <button
            type="button"
            onClick={printStatement}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-bold"
          >
            <Printer className="w-4 h-4" /> طباعة كشف الحساب (A4)
          </button>
        }
      >
        {stmtData && (
          <div className="space-y-3 text-xs">
            <div className="flex flex-wrap justify-between items-center bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold">
              <span>الرصيد المستحق للمورد: <strong className="text-rose-700">{formatMoney(stmtData.calculated_balance)}</strong></span>
              <span>شيكات قيد الانتظار: <strong className="text-amber-700">{stmtData.pending_checks.length}</strong></span>
            </div>
            <table className="w-full border-collapse border border-slate-200">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-200 p-2 text-center">التاريخ</th>
                  <th className="border border-slate-200 p-2 text-center">المرجع</th>
                  <th className="border border-slate-200 p-2 text-right">البيان</th>
                  <th className="border border-slate-200 p-2 text-center">مدين (مسدد/مرتجع)</th>
                  <th className="border border-slate-200 p-2 text-center">دائن (مشتريات)</th>
                  <th className="border border-slate-200 p-2 text-left">الرصيد</th>
                </tr>
              </thead>
              <tbody>
                {stmtData.entries.map((e, idx) => (
                  <tr key={idx}>
                    <td className="border border-slate-200 p-2 text-center">{e.date}</td>
                    <td className="border border-slate-200 p-2 text-center font-bold">{e.ref_no}</td>
                    <td className="border border-slate-200 p-2">{e.description}</td>
                    <td className="border border-slate-200 p-2 text-center text-emerald-700 font-semibold">
                      {e.debit > 0 ? formatMoney(e.debit) : '—'}
                    </td>
                    <td className="border border-slate-200 p-2 text-center text-rose-700 font-semibold">
                      {e.credit > 0 ? formatMoney(e.credit) : '—'}
                    </td>
                    <td className="border border-slate-200 p-2 text-left font-extrabold">
                      {formatMoney(e.running_balance)}
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
