import Box from "@mui/material/Box";
import {
  listCustomers,
  listProducts,
  listPurchases,
} from "@/lib/db";
import HistoryClient, { type HistoryRow } from "./HistoryClient";

export const dynamic = "force-dynamic";

export default async function ProductHistoryPage() {
  const [purchases, products, customers] = await Promise.all([
    listPurchases(),
    listProducts(true),
    listCustomers(),
  ]);

  const rows: HistoryRow[] = purchases.map((p) => ({
    id: p.id,
    purchase_ref: p.purchase_ref,
    purchased_at: p.purchased_at,
    customer_id: p.customer_id,
    customer_name: p.customer_name,
    product_id: p.product_id,
    product_name: p.product_name,
    unit_amount: p.unit_amount,
    currency: p.currency,
    status: p.status,
    billing_type: p.billing_type,
  }));

  return (
    <Box>
      <HistoryClient
        rows={rows}
        products={products.map((p) => ({ id: p.id, name: p.name }))}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
      />
    </Box>
  );
}
