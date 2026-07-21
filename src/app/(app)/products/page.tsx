import Box from "@mui/material/Box";
import { listProducts, listPurchases } from "@/lib/db";
import ProductsClient, { type ProductRow } from "./ProductsClient";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const [products, purchases] = await Promise.all([
    listProducts(true),
    listPurchases(),
  ]);

  // Aggregate paid purchases per product id in one pass.
  const stats = new Map<string, { units: number; revenue: number }>();
  for (const x of purchases) {
    if (x.status !== "paid" || !x.product_id) continue;
    const s = stats.get(x.product_id) ?? { units: 0, revenue: 0 };
    s.units += 1;
    s.revenue += x.unit_amount;
    stats.set(x.product_id, s);
  }

  const rows: ProductRow[] = products.map((p) => {
    const s = stats.get(p.id) ?? { units: 0, revenue: 0 };
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      price: p.price,
      currency: p.currency,
      billing_type: p.billing_type,
      units: s.units,
      revenue: s.revenue,
    };
  });

  return (
    <Box>
      <ProductsClient rows={rows} />
    </Box>
  );
}
