export type UserRole = 'admin' | 'cashier' | 'warehouse';
export type PriceTier = 'retail' | 'plumber' | 'wholesale';
export type PrintMode = '80mm' | 'a4' | 'a5' | 'labels-50x25' | 'labels-a4';

export interface AuthUser {
  id: number;
  username: string;
  full_name: string;
  role: UserRole;
  is_active?: number;
  created_at?: string;
}

export interface Warehouse {
  id: number;
  name: string;
  location: string;
  is_default: number;
  is_active: number;
  active_items_count?: number;
  total_units_count?: number;
}

export interface ProductUnit {
  id?: number;
  product_id?: number;
  unit_name: string;
  conversion_factor: number;
  barcode: string;
  retail_price: number;
  plumber_price: number;
  wholesale_price: number;
  is_base: number | boolean;
}

export interface ProductKitItem {
  id?: number;
  kit_product_id?: number;
  component_product_id: number;
  quantity_base: number;
  component_name?: string;
  component_unit?: string;
  component_cost?: number;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  category: string;
  brand: string;
  size: string;
  color: string;
  base_unit_name: string;
  is_kit: boolean;
  last_purchase_cost?: number;
  min_stock: number;
  vat_rate: number | null;
  notes: string;
  is_active: boolean;
  units: ProductUnit[];
  kit_items: ProductKitItem[];
  stock_by_warehouse: Record<number, number>;
  total_stock: number;
}

export interface Customer {
  id: number;
  name: string;
  phone: string;
  address: string;
  price_tier: PriceTier;
  opening_balance: number;
  balance: number;
  is_walkin: number;
  notes: string;
  is_active: number;
  created_at: string;
}

export interface Plumber {
  id: number;
  name: string;
  phone: string;
  area: string;
  notes: string;
  is_active: number;
  invoices_count?: number;
  total_sales?: number;
}

export interface Supplier {
  id: number;
  name: string;
  phone: string;
  company: string;
  address: string;
  opening_balance: number;
  balance: number;
  notes: string;
  pending_checks_total?: number;
}

export interface TreasuryAccount {
  id: number;
  name: string;
  account_type: 'cashier_safe' | 'main_safe' | 'bank' | 'instapay' | 'e_wallet';
  balance: number;
  is_default_pos: number;
}

export interface SalesInvoice {
  id: number;
  invoice_no: string;
  invoice_date: string;
  warehouse_id: number;
  warehouse_name?: string;
  customer_id: number;
  customer_name?: string;
  customer_phone?: string;
  customer_address?: string;
  is_walkin?: number;
  plumber_id: number | null;
  plumber_name?: string | null;
  price_tier: PriceTier;
  subtotal: number;
  discount_amount: number;
  vat_enabled: number;
  vat_amount: number;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  treasury_account_id: number | null;
  account_name?: string;
  status: 'completed' | 'voided';
  notes: string;
  user_name?: string;
  returned_total?: number;
  total_cost?: number;
  created_at: string;
}

export interface SalesInvoiceItem {
  id: number;
  invoice_id: number;
  product_id: number;
  product_name: string;
  sku?: string;
  size?: string;
  brand?: string;
  unit_id: number | null;
  unit_name: string;
  conversion_factor: number;
  quantity: number;
  returned_qty: number;
  unit_price: number;
  discount_amount: number;
  vat_rate: number;
  vat_amount: number;
  line_total: number;
  unit_cost_at_sale?: number;
  is_kit: number;
}

export interface SalesReturn {
  id: number;
  return_no: string;
  return_date: string;
  original_invoice_id: number;
  original_invoice_no?: string;
  warehouse_id: number;
  warehouse_name?: string;
  customer_id: number;
  customer_name?: string;
  plumber_id: number | null;
  plumber_name?: string | null;
  total_return_amount: number;
  refund_method: 'cash' | 'credit_note';
  account_name?: string;
  notes: string;
  created_at: string;
  items?: {
    id: number;
    product_name: string;
    unit_name: string;
    quantity: number;
    unit_price: number;
    vat_amount: number;
    line_total: number;
  }[];
}

export interface SupplierCheck {
  id: number;
  check_no: string;
  bank_name: string;
  supplier_id: number;
  supplier_name?: string;
  supplier_company?: string;
  treasury_account_id: number | null;
  account_name?: string;
  amount: number;
  issue_date: string;
  due_date: string;
  status: 'pending' | 'cleared' | 'bounced' | 'cancelled';
  cleared_at: string | null;
  notes: string;
}

export interface PrintDocumentPayload {
  mode: PrintMode;
  kind: 'sales_invoice' | 'sales_return' | 'statement' | 'labels';
  data: unknown;
}
