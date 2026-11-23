import type { PrintDocumentPayload, SalesInvoice, SalesInvoiceItem, SalesReturn } from '../types';
import { formatMoney, formatNum, formatQty, priceTierLabel } from '../utils/format';
import { BarcodeSvg } from './BarcodeSvg';

export interface LabelPrintItem {
  productName: string;
  brand: string;
  size: string;
  unitName: string;
  barcode: string;
  price: number;
  copies: number;
}

export interface StatementPrintData {
  title: string;
  partyName: string;
  partyPhone?: string;
  partyMeta?: string;
  periodLabel?: string;
  columns: { label: string; align?: 'right' | 'left' | 'center' }[];
  rows: (string | number)[][];
  summaryCards?: { label: string; value: string }[];
}

interface PrintableRootProps {
  payload: PrintDocumentPayload | null;
  settings: Record<string, string>;
}

export function PrintableRoot({ payload, settings }: PrintableRootProps) {
  if (!payload) return <div id="print-root" />;

  const storeName = settings.store_name || 'متجر البهنساوي للأدوات الصحية والسباكة';
  const storePhone = settings.store_phone || '01020494954';
  const storeAddress = settings.store_address || '';
  const footerNote =
    settings.invoice_footer_note || 'شكراً لتعاملكم معنا — البضاعة المباعة ترد وتستبدل وفق سياسة المتجر.';

  if (payload.kind === 'sales_invoice') {
    const { invoice, items } = payload.data as { invoice: SalesInvoice; items: SalesInvoiceItem[] };
    const isThermal = payload.mode === '80mm';

    if (isThermal) {
      return (
        <div id="print-root" className="p-1 text-black text-[11px] leading-snug">
          <div className="text-center border-b border-dashed border-black pb-2 mb-2">
            <div className="text-sm font-extrabold">{storeName}</div>
            {storeAddress && <div className="text-[10px]">{storeAddress}</div>}
            <div className="text-[11px] font-bold" dir="ltr">
              {storePhone}
            </div>
            <div className="mt-1 font-bold text-xs border border-black inline-block px-2 py-0.5 rounded">
              فاتورة مبيعات #{invoice.invoice_no}
            </div>
          </div>

          <div className="space-y-0.5 text-[10.5px] border-b border-dashed border-black pb-1.5 mb-1.5">
            <div className="flex justify-between">
              <span>التاريخ: {invoice.invoice_date}</span>
              <span>التسعير: {priceTierLabel(invoice.price_tier)}</span>
            </div>
            <div>العميل: {invoice.customer_name}</div>
            {invoice.plumber_name && <div>السباك: {invoice.plumber_name}</div>}
            <div>المخزن: {invoice.warehouse_name}</div>
          </div>

          <table className="w-full text-[10px] border-collapse mb-2">
            <thead>
              <tr className="border-b border-black">
                <th className="text-right py-1">الصنف</th>
                <th className="text-center py-1">كمية</th>
                <th className="text-center py-1">سعر</th>
                <th className="text-left py-1">إجمالي</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b border-dotted border-gray-400">
                  <td className="py-1 pr-0.5">
                    <div className="font-bold">{it.product_name}</div>
                    <div className="text-[9px]">
                      {it.unit_name}
                      {it.size ? ` • ${it.size}` : ''}
                    </div>
                  </td>
                  <td className="text-center py-1">{formatQty(it.quantity)}</td>
                  <td className="text-center py-1">{formatNum(it.unit_price)}</td>
                  <td className="text-left py-1 font-bold">{formatNum(it.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="border-t border-black pt-1.5 space-y-0.5 text-[11px]">
            <div className="flex justify-between">
              <span>المجموع:</span>
              <span>{formatMoney(invoice.subtotal)}</span>
            </div>
            {Number(invoice.discount_amount) > 0 && (
              <div className="flex justify-between">
                <span>الخصم:</span>
                <span>-{formatMoney(invoice.discount_amount)}</span>
              </div>
            )}
            {Number(invoice.vat_amount) > 0 && (
              <div className="flex justify-between">
                <span>ضريبة القيمة المضافة:</span>
                <span>{formatMoney(invoice.vat_amount)}</span>
              </div>
            )}
            <div className="flex justify-between text-xs font-extrabold border-t border-dashed border-black pt-1">
              <span>الإجمالي النهائي:</span>
              <span>{formatMoney(invoice.total_amount)}</span>
            </div>
            <div className="flex justify-between">
              <span>المدفوع:</span>
              <span>{formatMoney(invoice.paid_amount)}</span>
            </div>
            {Number(invoice.remaining_amount) > 0 && (
              <div className="flex justify-between font-bold">
                <span>المتبقي (آجل):</span>
                <span>{formatMoney(invoice.remaining_amount)}</span>
              </div>
            )}
          </div>

          <div className="text-center text-[9.5px] border-t border-dashed border-black mt-2 pt-1.5">
            {footerNote}
          </div>
        </div>
      );
    }

    // A4 / A5 Formal Invoice
    const isA5 = payload.mode === 'a5';
    return (
      <div id="print-root" className={isA5 ? 'p-3 text-xs' : 'p-6 text-sm'}>
        <div className="flex items-start justify-between border-b-2 border-slate-800 pb-3 mb-4">
          <div>
            <h1 className={`${isA5 ? 'text-lg' : 'text-2xl'} font-extrabold text-slate-900`}>{storeName}</h1>
            {storeAddress && <p className="text-slate-700 text-xs mt-0.5">{storeAddress}</p>}
            <p className="text-slate-800 font-bold text-xs mt-0.5">هاتف: {storePhone}</p>
          </div>
          <div className="text-left">
            <div className="inline-block border-2 border-slate-900 px-3 py-1 rounded-lg font-extrabold text-base">
              فاتورة مبيعات
            </div>
            <div className="mt-1 font-bold">رقم: {invoice.invoice_no}</div>
            <div className="text-xs">التاريخ: {invoice.invoice_date}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 bg-slate-50 border border-slate-300 rounded-lg p-3 mb-4 text-xs">
          <div>
            <div>
              <span className="font-bold">العميل:</span> {invoice.customer_name}
            </div>
            {invoice.customer_phone && (
              <div>
                <span className="font-bold">الهاتف:</span> {invoice.customer_phone}
              </div>
            )}
            {invoice.customer_address && (
              <div>
                <span className="font-bold">العنوان:</span> {invoice.customer_address}
              </div>
            )}
          </div>
          <div>
            <div>
              <span className="font-bold">المخزن:</span> {invoice.warehouse_name}
            </div>
            <div>
              <span className="font-bold">فئة التسعير:</span> {priceTierLabel(invoice.price_tier)}
            </div>
            {invoice.plumber_name && (
              <div>
                <span className="font-bold">السباك / الفني:</span> {invoice.plumber_name}
              </div>
            )}
          </div>
        </div>

        <table className="w-full border-collapse border border-slate-400 mb-4 text-xs">
          <thead>
            <tr className="bg-slate-200">
              <th className="border border-slate-400 p-1.5 text-center w-8">#</th>
              <th className="border border-slate-400 p-1.5 text-right">الصنف والمواصفات</th>
              <th className="border border-slate-400 p-1.5 text-center">الوحدة</th>
              <th className="border border-slate-400 p-1.5 text-center">الكمية</th>
              <th className="border border-slate-400 p-1.5 text-center">السعر</th>
              <th className="border border-slate-400 p-1.5 text-center">خصم</th>
              {Number(invoice.vat_enabled) === 1 && <th className="border border-slate-400 p-1.5 text-center">ضريبة</th>}
              <th className="border border-slate-400 p-1.5 text-left">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={it.id}>
                <td className="border border-slate-400 p-1.5 text-center">{idx + 1}</td>
                <td className="border border-slate-400 p-1.5">
                  <div className="font-bold">{it.product_name}</div>
                  {(it.brand || it.size) && (
                    <div className="text-[10px] text-slate-600">
                      {[it.brand, it.size].filter(Boolean).join(' — ')}
                    </div>
                  )}
                </td>
                <td className="border border-slate-400 p-1.5 text-center">{it.unit_name}</td>
                <td className="border border-slate-400 p-1.5 text-center font-bold">{formatQty(it.quantity)}</td>
                <td className="border border-slate-400 p-1.5 text-center">{formatNum(it.unit_price)}</td>
                <td className="border border-slate-400 p-1.5 text-center">{formatNum(it.discount_amount)}</td>
                {Number(invoice.vat_enabled) === 1 && (
                  <td className="border border-slate-400 p-1.5 text-center">{formatNum(it.vat_amount)}</td>
                )}
                <td className="border border-slate-400 p-1.5 text-left font-bold">{formatNum(it.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-between items-start gap-6">
          <div className="text-xs text-slate-700 flex-1">
            {invoice.notes && (
              <div className="border border-slate-300 rounded p-2 mb-2">
                <span className="font-bold">ملاحظات:</span> {invoice.notes}
              </div>
            )}
            <p className="mt-2">{footerNote}</p>
          </div>
          <div className="w-60 border border-slate-400 rounded-lg p-2.5 text-xs space-y-1">
            <div className="flex justify-between">
              <span>المجموع الفرعي:</span>
              <span>{formatMoney(invoice.subtotal)}</span>
            </div>
            {Number(invoice.discount_amount) > 0 && (
              <div className="flex justify-between">
                <span>خصم إضافي:</span>
                <span>-{formatMoney(invoice.discount_amount)}</span>
              </div>
            )}
            {Number(invoice.vat_amount) > 0 && (
              <div className="flex justify-between">
                <span>ضريبة القيمة المضافة:</span>
                <span>{formatMoney(invoice.vat_amount)}</span>
              </div>
            )}
            <div className="flex justify-between font-extrabold text-sm border-t border-slate-400 pt-1">
              <span>الإجمالي:</span>
              <span>{formatMoney(invoice.total_amount)}</span>
            </div>
            <div className="flex justify-between">
              <span>المدفوع:</span>
              <span>{formatMoney(invoice.paid_amount)}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>المتبقي (آجل):</span>
              <span>{formatMoney(invoice.remaining_amount)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (payload.kind === 'sales_return') {
    const ret = payload.data as SalesReturn;
    const isThermal = payload.mode === '80mm';
    return (
      <div id="print-root" className={isThermal ? 'p-1 text-[11px]' : 'p-6 text-sm'}>
        <div className="text-center border-b-2 border-black pb-2 mb-3">
          <div className="font-extrabold text-base">{storeName}</div>
          <div className="text-xs">{storePhone}</div>
          <div className="font-bold mt-1">إشعار مرتجع مبيعات #{ret.return_no}</div>
        </div>
        <div className="text-xs space-y-1 mb-3">
          <div>التاريخ: {ret.return_date}</div>
          <div>الفاتورة الأصلية: {ret.original_invoice_no}</div>
          <div>العميل: {ret.customer_name}</div>
          <div>التسوية: {ret.refund_method === 'cash' ? 'رد نقدي من الخزنة' : 'خصم من الرصيد الآجل'}</div>
        </div>
        <table className="w-full border-collapse border border-slate-400 text-xs mb-3">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-400 p-1 text-right">الصنف</th>
              <th className="border border-slate-400 p-1 text-center">الوحدة</th>
              <th className="border border-slate-400 p-1 text-center">الكمية</th>
              <th className="border border-slate-400 p-1 text-left">القيمة</th>
            </tr>
          </thead>
          <tbody>
            {(ret.items || []).map((it) => (
              <tr key={it.id}>
                <td className="border border-slate-400 p-1">{it.product_name}</td>
                <td className="border border-slate-400 p-1 text-center">{it.unit_name}</td>
                <td className="border border-slate-400 p-1 text-center">{formatQty(it.quantity)}</td>
                <td className="border border-slate-400 p-1 text-left font-bold">{formatNum(it.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-between font-extrabold text-sm border-t border-black pt-2">
          <span>إجمالي المرتجع:</span>
          <span>{formatMoney(ret.total_return_amount)}</span>
        </div>
      </div>
    );
  }

  if (payload.kind === 'statement') {
    const stmt = payload.data as StatementPrintData;
    return (
      <div id="print-root" className="p-6 text-xs">
        <div className="flex justify-between items-start border-b-2 border-slate-800 pb-3 mb-4">
          <div>
            <h1 className="text-xl font-extrabold">{storeName}</h1>
            <p>هاتف: {storePhone}</p>
          </div>
          <div className="text-left">
            <h2 className="text-lg font-extrabold">{stmt.title}</h2>
            <div className="font-bold mt-1">{stmt.partyName}</div>
            {stmt.partyPhone && <div>هاتف: {stmt.partyPhone}</div>}
            {stmt.partyMeta && <div>{stmt.partyMeta}</div>}
          </div>
        </div>

        {stmt.summaryCards && stmt.summaryCards.length > 0 && (
          <div className="grid grid-cols-4 gap-2 mb-4">
            {stmt.summaryCards.map((c, i) => (
              <div key={i} className="border border-slate-300 rounded p-2 text-center">
                <div className="text-[10px] text-slate-600">{c.label}</div>
                <div className="font-extrabold text-sm mt-0.5">{c.value}</div>
              </div>
            ))}
          </div>
        )}

        <table className="w-full border-collapse border border-slate-400">
          <thead>
            <tr className="bg-slate-200">
              {stmt.columns.map((col, idx) => (
                <th
                  key={idx}
                  className={`border border-slate-400 p-1.5 text-${col.align || 'right'}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stmt.rows.map((r, rIdx) => (
              <tr key={rIdx}>
                {r.map((cell, cIdx) => (
                  <td
                    key={cIdx}
                    className={`border border-slate-400 p-1.5 text-${stmt.columns[cIdx]?.align || 'right'}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (payload.kind === 'labels') {
    const items = payload.data as LabelPrintItem[];
    const expanded: (LabelPrintItem & { key: string })[] = [];
    items.forEach((item, idx) => {
      const count = Math.max(1, Math.min(200, Math.round(item.copies || 1)));
      for (let i = 0; i < count; i++) {
        expanded.push({ ...item, key: `${idx}-${i}` });
      }
    });

    if (payload.mode === 'labels-50x25') {
      return (
        <div id="print-root">
          {expanded.map((lbl, idx) => (
            <div
              key={lbl.key}
              className={`w-[48mm] h-[23mm] mx-auto flex flex-col items-center justify-center text-center p-0.5 ${
                idx < expanded.length - 1 ? 'label-page-break' : ''
              }`}
            >
              <div className="text-[8px] font-extrabold truncate max-w-full">
                البهنساوي — {lbl.productName}
              </div>
              <div className="text-[7px] text-slate-700 truncate max-w-full">
                {[lbl.brand, lbl.size, lbl.unitName].filter(Boolean).join(' • ')}
              </div>
              <BarcodeSvg value={lbl.barcode} height={24} width={1.2} fontSize={9} />
              <div className="text-[9px] font-extrabold">{formatMoney(lbl.price)}</div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div id="print-root" className="p-2">
        <div className="grid grid-cols-3 gap-2">
          {expanded.map((lbl) => (
            <div
              key={lbl.key}
              className="border border-dashed border-slate-400 rounded p-2 flex flex-col items-center justify-center text-center break-inside-avoid"
            >
              <div className="text-[10px] font-extrabold truncate w-full">البهنساوي — {lbl.productName}</div>
              <div className="text-[9px] text-slate-700 truncate w-full">
                {[lbl.brand, lbl.size, lbl.unitName].filter(Boolean).join(' • ')}
              </div>
              <BarcodeSvg value={lbl.barcode} height={30} width={1.3} fontSize={10} />
              <div className="text-[11px] font-extrabold mt-0.5">{formatMoney(lbl.price)}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return <div id="print-root" />;
}
