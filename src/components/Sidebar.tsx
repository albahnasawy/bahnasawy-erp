import type { ComponentType } from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  ReceiptText,
  Package,
  Warehouse,
  Truck,
  Users,
  Wrench,
  Building2,
  FileSpreadsheet,
  Vault,
  BarChart3,
  Settings,
  LogOut,
  AlertTriangle,
  Menu,
  X,
} from 'lucide-react';
import type { AuthUser } from '../types';
import { roleLabel } from '../utils/format';

export type PageKey =
  | 'dashboard'
  | 'pos'
  | 'sales'
  | 'products'
  | 'warehouses'
  | 'purchases'
  | 'customers'
  | 'plumbers'
  | 'suppliers'
  | 'checks'
  | 'treasury'
  | 'reports'
  | 'settings';

interface NavItem {
  key: PageKey;
  label: string;
  icon: ComponentType<{ className?: string }>;
  roles: ('admin' | 'cashier' | 'warehouse')[];
  badge?: number;
}

interface SidebarProps {
  user: AuthUser;
  storeName: string;
  activePage: PageKey;
  onNavigate: (page: PageKey) => void;
  onLogout: () => void;
  lowStockCount: number;
  dueChecksCount: number;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}

export function Sidebar({
  user,
  storeName,
  activePage,
  onNavigate,
  onLogout,
  lowStockCount,
  dueChecksCount,
  mobileOpen,
  setMobileOpen,
}: SidebarProps) {
  const navItems: NavItem[] = [
    { key: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard, roles: ['admin', 'cashier', 'warehouse'] },
    { key: 'pos', label: 'نقطة البيع (الكاشير)', icon: ShoppingCart, roles: ['admin', 'cashier', 'warehouse'] },
    { key: 'sales', label: 'الفواتير والمرتجعات', icon: ReceiptText, roles: ['admin', 'cashier', 'warehouse'] },
    {
      key: 'products',
      label: 'الأصناف والباركود',
      icon: Package,
      roles: ['admin', 'cashier', 'warehouse'],
      badge: lowStockCount > 0 ? lowStockCount : undefined,
    },
    { key: 'warehouses', label: 'المخازن والتحويلات', icon: Warehouse, roles: ['admin', 'warehouse'] },
    { key: 'purchases', label: 'المشتريات وتوالف الموردين', icon: Truck, roles: ['admin', 'warehouse'] },
    { key: 'customers', label: 'العملاء والآجل', icon: Users, roles: ['admin', 'cashier', 'warehouse'] },
    { key: 'plumbers', label: 'السباكون والفنيون', icon: Wrench, roles: ['admin', 'cashier', 'warehouse'] },
    { key: 'suppliers', label: 'الموردون', icon: Building2, roles: ['admin', 'warehouse'] },
    {
      key: 'checks',
      label: 'شيكات الموردين',
      icon: FileSpreadsheet,
      roles: ['admin', 'warehouse'],
      badge: dueChecksCount > 0 ? dueChecksCount : undefined,
    },
    { key: 'treasury', label: 'الخزائن والمصروفات', icon: Vault, roles: ['admin', 'cashier', 'warehouse'] },
    { key: 'reports', label: 'التقارير والأرباح', icon: BarChart3, roles: ['admin', 'warehouse'] },
    { key: 'settings', label: 'الإعدادات والنسخ الاحتياطي', icon: Settings, roles: ['admin'] },
  ];

  const visibleItems = navItems.filter((item) => item.roles.includes(user.role));

  const content = (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 w-64 select-none">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-2">
        <div>
          <div className="text-base font-extrabold text-sky-400 leading-tight">{storeName || 'متجر البهنساوي'}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">برنامج الحسابات والمخازن</div>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1.5 rounded-lg hover:bg-slate-800 text-slate-400"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto p-2.5 space-y-1">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const active = activePage === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                onNavigate(item.key);
                setMobileOpen(false);
              }}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition ${
                active
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </span>
              {item.badge !== undefined && (
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    active ? 'bg-white text-sky-700' : 'bg-amber-500/20 text-amber-300'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-800 bg-slate-950/50 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-bold text-white truncate">{user.full_name}</div>
            <div className="text-[11px] text-sky-400">{roleLabel(user.role)}</div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            title="تسجيل الخروج"
            className="p-2 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0">{content}</aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden flex bg-slate-900/60"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMobileOpen(false);
          }}
        >
          {content}
        </div>
      )}
    </>
  );
}

interface TopBarProps {
  title: string;
  user: AuthUser;
  lowStockCount: number;
  dueChecksCount: number;
  onNavigate: (p: PageKey) => void;
  onOpenMobileMenu: () => void;
}

export function TopBar({
  title,
  user,
  lowStockCount,
  dueChecksCount,
  onNavigate,
  onOpenMobileMenu,
}: TopBarProps) {
  return (
    <header className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between gap-3 sticky top-0 z-20">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-base sm:text-lg font-extrabold text-slate-900">{title}</h1>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {lowStockCount > 0 && (
          <button
            type="button"
            onClick={() => onNavigate('products')}
            className="hidden sm:inline-flex items-center gap-1.5 text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1.5 rounded-lg hover:bg-amber-100 transition"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <span>نواقص: {lowStockCount}</span>
          </button>
        )}
        {user.role !== 'cashier' && dueChecksCount > 0 && (
          <button
            type="button"
            onClick={() => onNavigate('checks')}
            className="hidden sm:inline-flex items-center gap-1.5 text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200 px-2.5 py-1.5 rounded-lg hover:bg-rose-100 transition"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-rose-600" />
            <span>شيكات مستحقة: {dueChecksCount}</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => onNavigate('pos')}
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl shadow-sm transition"
        >
          <ShoppingCart className="w-4 h-4" />
          <span>شاشة البيع (F2)</span>
        </button>
      </div>
    </header>
  );
}
