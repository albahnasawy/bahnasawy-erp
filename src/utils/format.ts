import type { PriceTier, UserRole } from '../types';

const moneyFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const qtyFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
});

export function formatMoney(val: unknown): string {
  const n = Number(val);
  return `${moneyFmt.format(Number.isFinite(n) ? n : 0)} ج.م`;
}

export function formatNum(val: unknown): string {
  const n = Number(val);
  return moneyFmt.format(Number.isFinite(n) ? n : 0);
}

export function formatQty(val: unknown): string {
  const n = Number(val);
  return qtyFmt.format(Number.isFinite(n) ? n : 0);
}

export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function monthStartIso(): string {
  return `${todayIso().slice(0, 7)}-01`;
}

export function roleLabel(role: UserRole): string {
  switch (role) {
    case 'admin':
      return 'المدير العام';
    case 'cashier':
      return 'كاشير';
    case 'warehouse':
      return 'أمين مخزن';
  }
}

export function priceTierLabel(tier: PriceTier): string {
  switch (tier) {
    case 'retail':
      return 'قطاعي (زبون)';
    case 'plumber':
      return 'سباك / فني';
    case 'wholesale':
      return 'جملة / مقاول';
  }
}

export function accountTypeLabel(t: string): string {
  switch (t) {
    case 'cashier_safe':
      return 'خزنة الكاشير';
    case 'main_safe':
      return 'الخزنة الرئيسية';
    case 'bank':
      return 'حساب بنكي';
    case 'instapay':
      return 'إنستاباي / تحويل';
    case 'e_wallet':
      return 'محفظة إلكترونية';
    default:
      return t;
  }
}

export function movementTypeLabel(t: string): string {
  switch (t) {
    case 'opening':
      return 'رصيد افتتاحي';
    case 'purchase':
      return 'توريد مشتريات';
    case 'sale':
      return 'فاتورة مبيعات';
    case 'sale_return':
      return 'مرتجع مبيعات';
    case 'purchase_return':
      return 'مرتجع مشتريات';
    case 'transfer_out':
      return 'تحويل صادر';
    case 'transfer_in':
      return 'تحويل وارد';
    case 'adjustment':
      return 'تسوية جرد';
    case 'sale_void':
      return 'إلغاء فاتورة بيع';
    default:
      return t;
  }
}

export function txTypeLabel(t: string): string {
  switch (t) {
    case 'opening':
      return 'رصيد افتتاحي';
    case 'sale_receipt':
      return 'تحصيل فاتورة مبيعات';
    case 'customer_payment':
      return 'تحصيل دفعة عميل';
    case 'sale_refund':
      return 'رد نقدي لمرتجع مبيعات';
    case 'purchase_payment':
      return 'سداد فاتورة مشتريات';
    case 'shipping_payment':
      return 'مصاريف شحن ونقل';
    case 'purchase_refund':
      return 'استرداد مرتجع مشتريات';
    case 'supplier_payment':
      return 'سداد دفعة لمورد';
    case 'check_clear':
      return 'صرف شيك مورد';
    case 'expense':
      return 'مصروف يومي';
    case 'transfer_in':
      return 'تحويل وارد';
    case 'transfer_out':
      return 'تحويل صادر';
    case 'sale_void_reversal':
      return 'عكس فاتورة ملغاة';
    default:
      return t;
  }
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const esc = (cell: string | number) => {
    const str = String(cell ?? '').replace(/"/g, '""');
    return `"${str}"`;
  };
  const content = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n');
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
