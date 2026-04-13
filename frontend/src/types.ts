export interface Category {
  pk: number;
  name: string;
  order?: number;
}

export interface Product {
  pk: number;
  name: string;
  category: number | null;
  category_name: string;
  unit: string;
  sell_price: string;
  svg_icon: string | null;
  low_stock_threshold: string;
  expiry_note: string;
  is_active: boolean;
  stock_level: number;
  most_recent_purchase_price: string | null;
}

export interface DashboardData {
  range: string;
  start: string;
  end: string;
  total_sales: string | number;
  net_profit: string | number;
  items_sold: number;
  best_sellers: {
    product_id: number;
    name: string;
    unit: string;
    revenue: string | number;
    quantity: string | number;
  }[];
  low_stock: {
    product_id: number;
    name: string;
    stock_level: string | number;
    threshold: string | number;
    unit: string;
  }[];
  chart: { date: string; sales: string | number }[];
  monthly_expenses: string | number;
  monthly_income_extra: string | number;
  total_debt_remaining: string | number;
}

export interface FinanceEntry {
  pk: number;
  category: string;
  entry_type: 'expense' | 'income';
  amount: string;
  date: string;
  is_recurring: boolean;
  notes: string;
}

export interface Debt {
  pk: number;
  name: string;
  total_amount: string;
  monthly_payment: string;
  start_date: string;
  is_active: boolean;
  remaining_amount: string;
  notes: string;
}

export interface DebtPayment {
  pk: number;
  debt: number;
  amount: string;
  date: string;
  notes: string;
}

export interface SaleItem {
  pk: number;
  product: number;
  product_name: string;
  quantity: string;
  sell_price: string;
}

export interface SaleRecord {
  pk: number;
  date: string;
  notes: string;
  items: SaleItem[];
}

export interface MarketStore {
  market: string;
  price: number;
  unitPrice: string;
}

export interface MarketPriceResult {
  id: string;
  title: string;
  brand: string;
  imageUrl: string | null;
  cheapest_stores: MarketStore[];
}

export interface StoreProfile {
  latitude: number;
  longitude: number;
  search_radius_km: number;
}
