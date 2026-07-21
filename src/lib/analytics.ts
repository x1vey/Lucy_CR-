import "server-only";

import {
  listCustomers,
  listProducts,
  listPurchases,
} from "@/lib/db";

// Aggregations for the analytics dashboard. All derived from the purchase
// ledger so the numbers always agree with product history.

export interface ProductStat {
  product_id: string | null;
  product_name: string;
  units: number; // count of paid purchases
  buyers: number; // distinct customers
  revenue: number; // sum of paid unit_amount
  currency: string;
}

export interface MonthlyPoint {
  month: string; // YYYY-MM
  label: string; // e.g. "Feb"
  units: number;
  revenue: number;
}

export interface Overview {
  totalCustomers: number;
  totalPurchases: number;
  totalRevenue: number;
  currency: string;
  activeProducts: number;
  perProduct: ProductStat[];
  monthly: MonthlyPoint[];
  topProduct: ProductStat | null;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export async function getOverview(): Promise<Overview> {
  const [allPurchases, customers, products] = await Promise.all([
    listPurchases(),
    listCustomers(),
    listProducts(),
  ]);
  const purchases = allPurchases.filter((p) => p.status === "paid");

  const currency = purchases[0]?.currency || products[0]?.currency || "USD";

  // Per-product aggregation.
  const byProduct = new Map<string, ProductStat>();
  for (const p of purchases) {
    const key = p.product_id ?? `name:${p.product_name}`;
    const stat =
      byProduct.get(key) ??
      {
        product_id: p.product_id,
        product_name: p.product_name || "(unknown)",
        units: 0,
        buyers: 0,
        revenue: 0,
        currency: p.currency,
      };
    stat.units += 1;
    stat.revenue += p.unit_amount;
    byProduct.set(key, stat);
  }
  // Distinct buyers per product.
  for (const [key, stat] of byProduct) {
    const buyers = new Set(
      purchases
        .filter((p) => (p.product_id ?? `name:${p.product_name}`) === key)
        .map((p) => p.customer_id),
    );
    stat.buyers = buyers.size;
  }
  const perProduct = [...byProduct.values()].sort((a, b) => b.units - a.units);

  // Last 6 months trend.
  const monthly = lastSixMonths().map((m) => {
    const inMonth = purchases.filter((p) => p.purchased_at.startsWith(m.key));
    return {
      month: m.key,
      label: m.label,
      units: inMonth.length,
      revenue: inMonth.reduce((s, p) => s + p.unit_amount, 0),
    };
  });

  return {
    totalCustomers: customers.length,
    totalPurchases: purchases.length,
    totalRevenue: purchases.reduce((s, p) => s + p.unit_amount, 0),
    currency,
    activeProducts: products.length,
    perProduct,
    monthly,
    topProduct: perProduct[0] ?? null,
  };
}

function lastSixMonths(): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 5; i >= 0; i--) {
    const dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    out.push({ key, label: MONTHS[dt.getMonth()] });
  }
  return out;
}
