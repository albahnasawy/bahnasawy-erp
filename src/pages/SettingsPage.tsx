import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { DatabaseBackup, Download, Plus, Save, ShieldCheck, Upload } from 'lucide-react';
import { api, getStoredToken } from '../api';
import { downloadDemoBackup, isDemoMode, restoreDemoBackup } from '../lib/demoBackend';
import type { AuthUser, UserRole } from '../types';
import { roleLabel } from '../utils/format';
import { Modal } from '../components/Modal';

interface SettingsPageProps {
  onSettingsChanged: () => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

export function SettingsPage({ onSettingsChanged, onNotify }: SettingsPageProps) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [backupsInfo, setBackupsInfo] = useState<{
    files: { filename: string; size: number; created_at: string }[];
    backups_dir: string;
    last_backup_at: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [backingUp, setBackingUp] = useState(false);

  // Add/Edit user modal
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<AuthUser | null>(null);
  const [uUsername, setUUsername] = useState('');
  const [uFullName, setUFullName] = useState('');
  const [uRole, setURole] = useState<UserRole>('cashier');
  const [uPassword, setUPassword] = useState('');
  const [uActive, setUActive] = useState(true);

  const loadAll = useCallback(async () => {
    try {
      const [sRes, uRes, bRes] = await Promise.all([
        api.get<{ settings: Record<string, string> }>('/api/settings'),
        api.get<{ users: AuthUser[] }>('/api/auth/users'),
        api.get<typeof backupsInfo>('/api/backups'),
      ]);
      setSettings(sRes.settings);
      setUsers(uRes.users);
      setBackupsInfo(bRes);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر تحميل الإعدادات', 'error');
    }
  }, [onNotify]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function saveSettings() {
    setSaving(true);
    try {
      await api.put('/api/settings', settings);
      onNotify('تم حفظ الإعدادات بنجاح');
      onSettingsChanged();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر حفظ الإعدادات', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function runBackupNow() {
    setBackingUp(true);
    try {
      const res = await api.post<{
        backup: { filename: string; secondaryCopied: boolean; secondaryError: string | null };
      }>('/api/backups/now');
      if (res.backup.secondaryError) {
        onNotify(
          `تم إنشاء النسخة محلياً (${res.backup.filename}) لكن تعذر النسخ للفلاشة: ${res.backup.secondaryError}`,
          'error'
        );
      } else {
        onNotify(`تم إنشاء النسخة الاحتياطية بنجاح: ${res.backup.filename}`);
      }
      await loadAll();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'فشل النسخ الاحتياطي', 'error');
    } finally {
      setBackingUp(false);
    }
  }

  async function handleRestoreFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (
      !confirm(
        `سيتم استبدال قاعدة البيانات الحالية بالملف "${file.name}" مع أخذ نسخة احتياطية وقائية أولاً. هل تريد المتابعة؟`
      )
    ) {
      return;
    }

    try {
      if (isDemoMode) {
        const text = await file.text();
        restoreDemoBackup(text);
        onNotify('تمت استعادة نسخة المعاينة بنجاح!');
        await loadAll();
        onSettingsChanged();
        return;
      }
      const buf = await file.arrayBuffer();
      const res = await fetch('/api/backups/restore', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getStoredToken()}`,
          'Content-Type': 'application/octet-stream',
        },
        body: buf,
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error || 'فشلت الاستعادة');
      onNotify('تمت استعادة قاعدة البيانات بنجاح! سيتم إعادة تحميل البيانات.');
      await loadAll();
      onSettingsChanged();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'فشل استعادة النسخة الاحتياطية', 'error');
    }
  }

  async function saveUser() {
    try {
      if (editUser) {
        await api.put(`/api/auth/users/${editUser.id}`, {
          full_name: uFullName.trim(),
          role: uRole,
          is_active: uActive,
          password: uPassword || undefined,
        });
        onNotify('تم تحديث بيانات المستخدم');
      } else {
        await api.post('/api/auth/users', {
          username: uUsername.trim(),
          full_name: uFullName.trim(),
          role: uRole,
          password: uPassword,
        });
        onNotify('تمت إضافة المستخدم بنجاح');
      }
      setUserModalOpen(false);
      await loadAll();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر حفظ المستخدم', 'error');
    }
  }

  return (
    <div className="space-y-6">
      {/* Store & VAT Settings */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-extrabold text-slate-900">بيانات المتجر والضرائب والطباعة</h2>
          <button
            type="button"
            disabled={saving}
            onClick={saveSettings}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs sm:text-sm">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">اسم المتجر</label>
            <input
              type="text"
              value={settings.store_name || ''}
              onChange={(e) => setSettings((s) => ({ ...s, store_name: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">اسم المالك / المسؤول</label>
            <input
              type="text"
              value={settings.owner_name || ''}
              onChange={(e) => setSettings((s) => ({ ...s, owner_name: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">هاتف المتجر</label>
            <input
              type="text"
              value={settings.store_phone || ''}
              onChange={(e) => setSettings((s) => ({ ...s, store_phone: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-slate-700 mb-1">العنوان</label>
            <input
              type="text"
              value={settings.store_address || ''}
              onChange={(e) => setSettings((s) => ({ ...s, store_address: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">مقاس الطباعة الافتراضي</label>
            <select
              value={settings.default_print_size || '80mm'}
              onChange={(e) => setSettings((s) => ({ ...s, default_print_size: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
            >
              <option value="80mm">طابعة حرارية صغيرة 80mm</option>
              <option value="a4">ورق عادي A4</option>
              <option value="a5">ورق نصف صفحة A5</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs sm:text-sm">
          <label className="inline-flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.vat_enabled === 'true'}
              onChange={(e) =>
                setSettings((s) => ({ ...s, vat_enabled: e.target.checked ? 'true' : 'false' }))
              }
            />
            <span>تفعيل ضريبة القيمة المضافة افتراضياً بالفواتير</span>
          </label>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">نسبة الضريبة الافتراضية (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              step="any"
              value={settings.default_vat_rate || '14'}
              onChange={(e) => setSettings((s) => ({ ...s, default_vat_rate: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-1.5 bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">تذييل الفاتورة</label>
            <input
              type="text"
              value={settings.invoice_footer_note || ''}
              onChange={(e) => setSettings((s) => ({ ...s, invoice_footer_note: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-1.5 bg-white"
            />
          </div>
        </div>
      </div>

      {/* Backup & Restore */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <DatabaseBackup className="w-5 h-5 text-emerald-600" />
              <span>النسخ الاحتياطي التلقائي والاستعادة (الجهاز + الفلاشة)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              مجلد النسخ المحلي: <span dir="ltr">{backupsInfo?.backups_dir}</span> • آخر نسخة:{' '}
              {backupsInfo?.last_backup_at || 'لم تؤخذ بعد'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={backingUp}
              onClick={runBackupNow}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold"
            >
              <DatabaseBackup className="w-4 h-4" />
              <span>{backingUp ? 'جاري النسخ...' : 'إنشاء نسخة احتياطية الآن'}</span>
            </button>

            <label className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold cursor-pointer">
              <Upload className="w-4 h-4" />
              <span>{isDemoMode ? 'استعادة من ملف (.json)' : 'استعادة من ملف (.db)'}</span>
              <input
                type="file"
                accept={isDemoMode ? '.json' : '.db'}
                className="hidden"
                onChange={handleRestoreFile}
              />
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs sm:text-sm">
          <label className="inline-flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.auto_backup_enabled === 'true'}
              onChange={(e) =>
                setSettings((s) => ({ ...s, auto_backup_enabled: e.target.checked ? 'true' : 'false' }))
              }
            />
            <span>تفعيل النسخ الاحتياطي اليومي التلقائي</span>
          </label>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              مسار النسخ الثانوي (فلاشة USB مثلاً: E:\Bahnasawy-Backups)
            </label>
            <input
              type="text"
              dir="ltr"
              placeholder="E:\Bahnasawy-Backups"
              value={settings.secondary_backup_path || ''}
              onChange={(e) => setSettings((s) => ({ ...s, secondary_backup_path: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-1.5 bg-white text-left"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">الاحتفاظ بالنسخ لمدة (أيام)</label>
            <input
              type="number"
              min="1"
              value={settings.backup_retention_days || '30'}
              onChange={(e) => setSettings((s) => ({ ...s, backup_retention_days: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-1.5 bg-white"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100">
                <th className="p-2.5 text-right">اسم الملف</th>
                <th className="p-2.5 text-center">تاريخ الإنشاء</th>
                <th className="p-2.5 text-center">الحجم</th>
                <th className="p-2.5 text-center">تحميل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(backupsInfo?.files || []).map((f) => (
                <tr key={f.filename}>
                  <td className="p-2.5 font-bold" dir="ltr">
                    {f.filename}
                  </td>
                  <td className="p-2.5 text-center">{f.created_at}</td>
                  <td className="p-2.5 text-center">{Math.round(f.size / 1024)} KB</td>
                  <td className="p-2.5 text-center">
                    {isDemoMode ? (
                      <button
                        type="button"
                        onClick={() => downloadDemoBackup(f.filename)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 font-bold hover:bg-sky-100"
                      >
                        <Download className="w-3.5 h-3.5" /> تحميل
                      </button>
                    ) : (
                      <a
                        href={`/api/backups/download/${encodeURIComponent(f.filename)}?token=${encodeURIComponent(
                          getStoredToken()
                        )}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 font-bold hover:bg-sky-100"
                      >
                        <Download className="w-3.5 h-3.5" /> تحميل
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Users & Permissions */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-sky-600" />
            <span>المستخدمون والصلاحيات</span>
          </h2>
          <button
            type="button"
            onClick={() => {
              setEditUser(null);
              setUUsername('');
              setUFullName('');
              setURole('cashier');
              setUPassword('');
              setUActive(true);
              setUserModalOpen(true);
            }}
            className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold"
          >
            <Plus className="w-4 h-4" /> مستخدم جديد
          </button>
        </div>

        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="bg-slate-100">
              <th className="p-2.5 text-right">اسم المستخدم</th>
              <th className="p-2.5 text-right">الاسم الكامل</th>
              <th className="p-2.5 text-center">الصلاحية</th>
              <th className="p-2.5 text-center">الحالة</th>
              <th className="p-2.5 text-center">تعديل</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="p-2.5 font-bold">{u.username}</td>
                <td className="p-2.5">{u.full_name}</td>
                <td className="p-2.5 text-center">
                  <span className="px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-800 text-xs font-bold">
                    {roleLabel(u.role)}
                  </span>
                </td>
                <td className="p-2.5 text-center">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      u.is_active === 1 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    {u.is_active === 1 ? 'نشط' : 'معطل'}
                  </span>
                </td>
                <td className="p-2.5 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setEditUser(u);
                      setUUsername(u.username);
                      setUFullName(u.full_name);
                      setURole(u.role);
                      setUPassword('');
                      setUActive(u.is_active === 1);
                      setUserModalOpen(true);
                    }}
                    className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold"
                  >
                    تعديل
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* User Modal */}
      <Modal
        open={userModalOpen}
        title={editUser ? `تعديل المستخدم: ${editUser.username}` : 'إضافة مستخدم جديد'}
        onClose={() => setUserModalOpen(false)}
        maxWidthClass="max-w-md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setUserModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-bold"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={saveUser}
              className="px-5 py-2 rounded-xl bg-sky-600 text-white text-sm font-bold"
            >
              حفظ
            </button>
          </>
        }
      >
        <div className="space-y-3 text-xs sm:text-sm">
          {!editUser && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">اسم المستخدم (للدخول)</label>
              <input
                type="text"
                value={uUsername}
                onChange={(e) => setUUsername(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">الاسم الكامل</label>
            <input
              type="text"
              value={uFullName}
              onChange={(e) => setUFullName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">الصلاحية</label>
            <select
              value={uRole}
              onChange={(e) => setURole(e.target.value as UserRole)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
            >
              <option value="admin">المدير العام (كل الصلاحيات والأرباح والحذف)</option>
              <option value="cashier">كاشير (مبيعات وعملاء بدون تكلفة أو أرباح أو حذف)</option>
              <option value="warehouse">أمين مخزن (الأصناف والمخازن والمشتريات)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {editUser ? 'كلمة مرور جديدة (اتركها فارغة للإبقاء على الحالية)' : 'كلمة المرور'}
            </label>
            <input
              type="password"
              value={uPassword}
              onChange={(e) => setUPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </div>
          {editUser && (
            <label className="inline-flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
              <input type="checkbox" checked={uActive} onChange={(e) => setUActive(e.target.checked)} />
              <span>الحساب نشط</span>
            </label>
          )}
        </div>
      </Modal>
    </div>
  );
}
