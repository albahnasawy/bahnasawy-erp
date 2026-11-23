import { useCallback, useEffect, useState } from 'react';
import { Banknote, FileText, Plus, Printer, Search } from 'lucide-react';
import { api } from '../api';
import type { Customer, PriceTier, PrintDocumentPayload, TreasuryAccount } from '../types';
import { formatMoney, priceTierLabel, todayIso } from '../utils/format';
import { Modal } from '../components/Modal';
import type { StatementPrintData } from '../components/PrintableRoot';

interface CustomersPageProps {
  onPrint: (payload: PrintDocumentPayload) => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

export function CustomersPage({ onPrint, onNotify }: CustomersPageProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([]);
  const [q, setQ] = useState('');

  // Add/Edit modal
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [tier, setTier] = useState<PriceTier>('retail');
  const [openingBalance, setOpeningBalance] = useState(0);
  const [notes, setNotes] = useState('');

  // Collect payment modal
  const [payOpen, setPayOpen] = useState(false);
  const [payCustomer, setPayCustomer] = useState<Customer | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payAccountId, setPayAccountId] = useState(0);
  const [payDate, setPayDate] = useState(todayIso());
  const [payNotes, setPayNotes] = useState('');

  // Statement modal
  const [stmtOpen, setStmtOpen] = useState(false);
  const [stmtData, setStmtData] = useState<{
    customer: Customer;
    entries: {
      date: string;
      ref_no: string;
      description: string;
      debit: number;
      credit: number;
      running_balance: number;
    }[];
    calculated_balance: number;
  } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [cRes, aRes] = await Promise.all([
        api.get<{ customers: Customer[] }>(`/api/customers?q=${encodeURIComponent(q.trim())}`),
        api.get<{ accounts: TreasuryAccount[] }>('/api/treasury/accounts'),
      ]);
      setCustomers(cRes.customers);
      setAccounts(aRes.accounts);
      const def = aRes.accounts.find((a) => a.is_default_pos === 1) || aRes.accounts[0];
      if (def) setPayAccountId((p) => p || def.id);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر تحميل العملاء', 'error');
    }
  }, [q, onNotify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function openNew() {
    setEditing(null);
    setName('');
    setPhone('');
    setAddress('');
    setTier('retail');
    setOpeningBalance(0);
    setNotes('');
    setFormOpen(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setName(c.name);
    setPhone(c.phone);
    setAddress(c.address);
    setTier(c.price_tier);
    setOpeningBalance(c.opening_balance);
    setNotes(c.notes);
    setFormOpen(true);
  }

  async function saveCustomer() {
    if (!name.trim()) {
      onNotify('يرجى إدخال اسم العميل', 'error');
      return;
    }
    try {
      if (editing) {
        await api.put(`/api/customers/${editing.id}`, {
          name: name.trim(),
          phone,
          address,
          price_tier: tier,
          notes,
        });
        onNotify('تم تحديث بيانات العميل');
      } else {
        await api.post('/api/customers', {
          name: name.trim(),
          phone,
          address,
          price_tier: tier,
          opening_balance: openingBalance,
          notes,
        });
        onNotify('تمت إضافة العميل');
      }
      setFormOpen(false);
      await loadData();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر الحفظ', 'error');
    }
  }

  async function submitPayment() {
    if (!payCustomer || payAmount <= 0) {
      onNotify('أدخل مبلغاً صحيحاً للتحصيل', 'error');
      return;
    }
    try {
      await api.post(`/api/customers/${payCustomer.id}/payments`, {
        amount: payAmount,
        treasury_account_id: payAccountId,
        payment_date: payDate,
        notes: payNotes,
      });
      setPayOpen(false);
      onNotify(`تم تحصيل ${formatMoney(payAmount)} من ${payCustomer.name}`);
      await loadData();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر التحصيل', 'error');
    }
  }

  async function openStatement(c: Customer) {
    try {
      const res = await api.get<typeof stmtData>(`/api/customers/${c.id}/statement`);
      setStmtData(res);
      setStmtOpen(true);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر تحميل كشف الحساب', 'error');
    }
  }

  function printStatement() {
    if (!stmtData) return;
    const payload: StatementPrintData = {
      title: 'كشف حساب عميل تفصيلي',
      partyName: stmtData.customer.name,
      partyPhone: stmtData.customer.phone,
      partyMeta: stmtData.customer.address,
      summaryCards: [
        { label: 'فئة التسعير', value: priceTierLabel(stmtData.customer.price_tier) },
        { label: 'عدد الحركات', value: String(stmtData.entries.length) },
        { label: 'رصيد أول المدة', value: formatMoney(stmtData.customer.opening_balance) },
        { label: 'الرصيد المستحق الحالي', value: formatMoney(stmtData.calculated_balance) },
      ],
      columns: [
        { label: 'التاريخ', align: 'center' },
        { label: 'المرجع', align: 'center' },
        { label: 'البيان', align: 'right' },
        { label: 'مدين (عليه)', align: 'center' },
        { label: 'دائن (مسدد)', align: 'center' },
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
            placeholder="بحث باسم العميل أو الموبايل..."
            className="w-full rounded-xl border border-slate-300 pr-9 pl-3 py-2 text-sm"
          />
        </div>

        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold"
        >
          <Plus className="w-4 h-4" /> إضافة عميل جديد
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="bg-slate-100 text-slate-700">
              <th className="p-3 text-right">اسم العميل</th>
              <th className="p-3 text-center">الموبايل</th>
              <th className="p-3 text-right">العنوان</th>
              <th className="p-3 text-center">التسعير الافتراضي</th>
              <th className="p-3 text-center">الرصيد الآجل المستحق</th>
              <th className="p-3 text-center">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {customers.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="p-3 font-extrabold text-slate-900">
                  {c.name}
                  {c.is_walkin === 1 && (
                    <span className="mr-2 text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">
                      افتراضي
                    </span>
                  )}
                </td>
                <td className="p-3 text-center" dir="ltr">
                  {c.phone || '—'}
                </td>
                <td className="p-3 text-slate-600">{c.address || '—'}</td>
                <td className="p-3 text-center">
                  <span className="text-[11px] font-bold bg-sky-50 text-sky-800 px-2.5 py-0.5 rounded-full">
                    {priceTierLabel(c.price_tier)}
                  </span>
                </td>
                <td
                  className={`p-3 text-center font-extrabold ${
                    c.balance > 0 ? 'text-rose-700' : 'text-emerald-700'
                  }`}
                >
                  {formatMoney(c.balance)}
                </td>
                <td className="p-3">
                  <div className="flex items-center justify-center gap-1.5">
                    {c.is_walkin === 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setPayCustomer(c);
                            setPayAmount(c.balance > 0 ? c.balance : 0);
                            setPayNotes('');
                            setPayOpen(true);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold"
                        >
                          <Banknote className="w-3.5 h-3.5" /> تحصيل دفعة
                        </button>
                        <button
                          type="button"
                          onClick={() => openStatement(c)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-800 text-xs font-bold"
                        >
                          <FileText className="w-3.5 h-3.5" /> كشف حساب
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(c)}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
                        >
                          تعديل
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Customer Modal */}
      <Modal
        open={formOpen}
        title={editing ? `تعديل بيانات العميل: ${editing.name}` : 'إضافة عميل جديد'}
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
              onClick={saveCustomer}
              className="px-5 py-2 rounded-xl bg-sky-600 text-white text-sm font-bold"
            >
              حفظ
            </button>
          </>
        }
      >
        <div className="space-y-3 text-xs sm:text-sm">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">اسم العميل *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">رقم الموبايل</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">فئة التسعير</label>
              <select
                value={tier}
                onChange={(e) => setTier(e.target.value as PriceTier)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
              >
                <option value="retail">{priceTierLabel('retail')}</option>
                <option value="plumber">{priceTierLabel('plumber')}</option>
                <option value="wholesale">{priceTierLabel('wholesale')}</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">العنوان / المشروع</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </div>
          {!editing && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">رصيد افتتاحي سابق (عليه)</label>
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

      {/* Collect Payment Modal */}
      <Modal
        open={payOpen && Boolean(payCustomer)}
        title={payCustomer ? `تحصيل دفعة / قسط من: ${payCustomer.name}` : ''}
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
              onClick={submitPayment}
              className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold"
            >
              تأكيد التحصيل
            </button>
          </>
        }
      >
        {payCustomer && (
          <div className="space-y-3 text-xs sm:text-sm">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              الرصيد المستحق حالياً: <strong className="text-rose-700">{formatMoney(payCustomer.balance)}</strong>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">المبلغ المحصّل</label>
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
              <label className="block text-xs font-bold text-slate-700 mb-1">إيداع في خزنة / حساب</label>
              <select
                value={payAccountId}
                onChange={(e) => setPayAccountId(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ التحصيل</label>
              <input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات</label>
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
        title={stmtData ? `كشف حساب العميل: ${stmtData.customer.name}` : ''}
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
              <span>الرصيد المستحق النهائي: <strong className="text-rose-700">{formatMoney(stmtData.calculated_balance)}</strong></span>
              <span>عدد الحركات: {stmtData.entries.length}</span>
            </div>
            <table className="w-full border-collapse border border-slate-200">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-200 p-2 text-center">التاريخ</th>
                  <th className="border border-slate-200 p-2 text-center">المرجع</th>
                  <th className="border border-slate-200 p-2 text-right">البيان</th>
                  <th className="border border-slate-200 p-2 text-center">مدين (عليه)</th>
                  <th className="border border-slate-200 p-2 text-center">دائن (مسدد)</th>
                  <th className="border border-slate-200 p-2 text-left">الرصيد</th>
                </tr>
              </thead>
              <tbody>
                {stmtData.entries.map((e, idx) => (
                  <tr key={idx}>
                    <td className="border border-slate-200 p-2 text-center">{e.date}</td>
                    <td className="border border-slate-200 p-2 text-center font-bold">{e.ref_no}</td>
                    <td className="border border-slate-200 p-2">{e.description}</td>
                    <td className="border border-slate-200 p-2 text-center text-rose-700 font-semibold">
                      {e.debit > 0 ? formatMoney(e.debit) : '—'}
                    </td>
                    <td className="border border-slate-200 p-2 text-center text-emerald-700 font-semibold">
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
