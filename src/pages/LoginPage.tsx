import { useState, type FormEvent } from 'react';
import { Lock, User, Wrench } from 'lucide-react';
import { api, setStoredToken } from '../api';
import type { AuthUser } from '../types';

interface LoginPageProps {
  onLoginSuccess: (user: AuthUser) => void;
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post<{ token: string; user: AuthUser }>('/api/auth/login', {
        username,
        password,
      });
      setStoredToken(res.token);
      onLoginSuccess(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-sky-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-l from-sky-700 to-cyan-700 text-white p-6 text-center">
          <div className="w-14 h-14 bg-white/15 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Wrench className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-xl font-extrabold">متجر البهنساوي للأدوات الصحية والسباكة</h1>
          <p className="text-sky-100 text-xs mt-1">النظام المحاسبي وإدارة المخازن ونقاط البيع</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold px-3.5 py-2.5 rounded-xl">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="loginUser" className="block text-xs font-bold text-slate-700 mb-1.5">
              اسم المستخدم
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
              <input
                id="loginUser"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                className="w-full rounded-xl border border-slate-300 pr-10 pl-3 py-2.5 text-sm focus:border-sky-600 focus:ring-2 focus:ring-sky-100 outline-none"
                placeholder="admin"
              />
            </div>
          </div>

          <div>
            <label htmlFor="loginPass" className="block text-xs font-bold text-slate-700 mb-1.5">
              كلمة المرور
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
              <input
                id="loginPass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-300 pr-10 pl-3 py-2.5 text-sm focus:border-sky-600 focus:ring-2 focus:ring-sky-100 outline-none"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl shadow-sm transition text-sm"
          >
            {loading ? 'جاري الدخول...' : 'تسجيل الدخول'}
          </button>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 space-y-1">
            <div className="font-bold text-slate-800">بيانات الدخول الافتراضية (يمكن تغييرها من الإعدادات):</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <button
                type="button"
                onClick={() => {
                  setUsername('admin');
                  setPassword('admin123');
                }}
                className="text-sky-700 hover:underline font-semibold"
              >
                مدير: admin / admin123
              </button>
              <button
                type="button"
                onClick={() => {
                  setUsername('cashier');
                  setPassword('1234');
                }}
                className="text-emerald-700 hover:underline font-semibold"
              >
                كاشير: cashier / 1234
              </button>
              <button
                type="button"
                onClick={() => {
                  setUsername('warehouse');
                  setPassword('1234');
                }}
                className="text-amber-700 hover:underline font-semibold"
              >
                مخزن: warehouse / 1234
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
