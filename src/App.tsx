import { useCallback, useEffect, useState } from 'react';
import { api, getStoredToken, setOnUnauthorized, setStoredToken } from './api';
import { isDemoMode, resetDemoData } from './lib/demoBackend';
import type { AuthUser, PrintDocumentPayload } from './types';
import { Sidebar, TopBar, type PageKey } from './components/Sidebar';
import { PrintableRoot } from './components/PrintableRoot';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { PosPage } from './pages/PosPage';
import { SalesHistoryPage } from './pages/SalesHistoryPage';
import { ProductsPage } from './pages/ProductsPage';
import { WarehousesPage } from './pages/WarehousesPage';
import { PurchasesPage } from './pages/PurchasesPage';
import { CustomersPage } from './pages/CustomersPage';
import { PlumbersPage } from './pages/PlumbersPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { ChecksPage } from './pages/ChecksPage';
import { TreasuryPage } from './pages/TreasuryPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';

const PAGE_TITLES: Record<PageKey, string> = {
  dashboard: 'لوحة التحكم الرئيسية',
  pos: 'نقطة البيع السريعة (الكاشير)',
  sales: 'فواتير المبيعات والمرتجعات',
  products: 'إدارة الأصناف والأسعار والباركود',
  warehouses: 'المخازن والتحويلات والجرد',
  purchases: 'المشتريات وتوالف الموردين',
  customers: 'العملاء والبيع الآجل وكشوف الحساب',
  plumbers: 'السباكون والفنيون وتقاريرهم',
  suppliers: 'الموردون وحساباتهم',
  checks: 'شيكات الموردين وتواريخ الاستحقاق',
  treasury: 'الخزائن والحسابات البنكية والمصروفات',
  reports: 'التقارير المحاسبية وصافي الأرباح',
  settings: 'إعدادات المتجر والمستخدمين والنسخ الاحتياطي',
};

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [activePage, setActivePage] = useState<PageKey>('dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);

  const [settings, setSettings] = useState<Record<string, string>>({});
  const [lowStockCount, setLowStockCount] = useState(0);
  const [dueChecksCount, setDueChecksCount] = useState(0);

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [printPayload, setPrintPayload] = useState<PrintDocumentPayload | null>(null);

  const notify = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => {
      setToast((curr) => (curr?.msg === msg ? null : curr));
    }, 3500);
  }, []);

  const loadGlobals = useCallback(async () => {
    try {
      const [sRes, dRes] = await Promise.all([
        api.get<{ settings: Record<string, string> }>('/api/settings'),
        api.get<{ low_stock_count: number; due_checks_count: number }>('/api/reports/dashboard'),
      ]);
      setSettings(sRes.settings);
      setLowStockCount(dRes.low_stock_count || 0);
      setDueChecksCount(dRes.due_checks_count || 0);
    } catch {
      // ignore if logged out
    }
  }, []);

  useEffect(() => {
    setOnUnauthorized(() => {
      setStoredToken('');
      setUser(null);
    });

    const token = getStoredToken();
    if (!token) {
      setBooting(false);
      return;
    }

    api
      .get<{ user: AuthUser }>('/api/auth/me')
      .then((res) => {
        setUser(res.user);
        return loadGlobals();
      })
      .catch(() => {
        setStoredToken('');
      })
      .finally(() => setBooting(false));
  }, [loadGlobals]);

  // Keyboard F2 shortcut to jump straight to POS
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2' && user) {
        e.preventDefault();
        setActivePage('pos');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [user]);

  // Trigger print cleanly after printPayload renders into #print-root
  const handlePrint = useCallback((payload: PrintDocumentPayload) => {
    document.body.setAttribute('data-print-mode', payload.mode);
    setPrintPayload(payload);
    setTimeout(() => {
      window.print();
    }, 180);
  }, []);

  function handleLogout() {
    setStoredToken('');
    setUser(null);
    setActivePage('dashboard');
  }

  function handleNavigate(nextPage: PageKey) {
    if (!user) return;
    if (nextPage === 'settings' && user.role !== 'admin') {
      notify('هذه الصفحة مخصصة للمدير فقط', 'error');
      return;
    }
    if (
      ['warehouses', 'purchases', 'suppliers', 'checks', 'reports'].includes(nextPage) &&
      user.role === 'cashier'
    ) {
      notify('ليست لديك صلاحية للوصول لهذه الصفحة', 'error');
      return;
    }
    setActivePage(nextPage);
    loadGlobals();
  }

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 text-slate-600 text-sm font-bold">
        جاري تشغيل نظام البهنساوي المحاسبي...
      </div>
    );
  }

  if (!user) {
    return (
      <LoginPage
        onLoginSuccess={(u) => {
          setUser(u);
          setActivePage(u.role === 'cashier' ? 'pos' : 'dashboard');
          loadGlobals();
        }}
      />
    );
  }

  return (
    <>
      <div id="app-shell" className="min-h-screen flex bg-slate-100 text-slate-900">
        <Sidebar
          user={user}
          storeName={settings.store_name || 'متجر البهنساوي'}
          activePage={activePage}
          onNavigate={handleNavigate}
          onLogout={handleLogout}
          lowStockCount={lowStockCount}
          dueChecksCount={dueChecksCount}
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
        />

        <div className="flex-1 flex flex-col min-w-0">
          {isDemoMode && (
            <div className="no-print bg-amber-50 border-b border-amber-200 px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
              <span>
                <strong>وضع معاينة الويب التفاعلية:</strong> تُحفظ التغييرات محلياً في متصفحك لتجربة كل شاشات النظام بحرية.
              </span>
              <button
                type="button"
                onClick={() => {
                  if (confirm('إعادة ضبط جميع البيانات التجريبية للوضع الافتراضي؟')) {
                    resetDemoData();
                    window.location.reload();
                  }
                }}
                className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold transition"
              >
                إعادة ضبط البيانات التجريبية
              </button>
            </div>
          )}
          <TopBar
            title={PAGE_TITLES[activePage]}
            user={user}
            lowStockCount={lowStockCount}
            dueChecksCount={dueChecksCount}
            onNavigate={handleNavigate}
            onOpenMobileMenu={() => setMobileOpen(true)}
          />

          <main className="flex-1 p-4 sm:p-5 overflow-x-hidden">
            {activePage === 'dashboard' && <DashboardPage user={user} onNavigate={handleNavigate} />}
            {activePage === 'pos' && (
              <PosPage settings={settings} onPrint={handlePrint} onNotify={notify} />
            )}
            {activePage === 'sales' && (
              <SalesHistoryPage user={user} onPrint={handlePrint} onNotify={notify} />
            )}
            {activePage === 'products' && (
              <ProductsPage user={user} onPrint={handlePrint} onNotify={notify} />
            )}
            {activePage === 'warehouses' && <WarehousesPage onNotify={notify} />}
            {activePage === 'purchases' && <PurchasesPage onNotify={notify} />}
            {activePage === 'customers' && <CustomersPage onPrint={handlePrint} onNotify={notify} />}
            {activePage === 'plumbers' && <PlumbersPage onPrint={handlePrint} onNotify={notify} />}
            {activePage === 'suppliers' && <SuppliersPage onPrint={handlePrint} onNotify={notify} />}
            {activePage === 'checks' && <ChecksPage onNotify={notify} />}
            {activePage === 'treasury' && <TreasuryPage user={user} onNotify={notify} />}
            {activePage === 'reports' && (
              <ReportsPage user={user} onPrint={handlePrint} onNotify={notify} />
            )}
            {activePage === 'settings' && user.role === 'admin' && (
              <SettingsPage onSettingsChanged={loadGlobals} onNotify={notify} />
            )}
          </main>
        </div>
      </div>

      {/* Print Root */}
      <PrintableRoot payload={printPayload} settings={settings} />

      {/* Toast */}
      {toast && (
        <div
          className={`no-print fixed bottom-5 left-5 z-50 px-4 py-3 rounded-xl shadow-xl text-xs sm:text-sm font-bold text-white transition ${
            toast.type === 'error' ? 'bg-rose-600' : 'bg-emerald-600'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </>
  );
}
