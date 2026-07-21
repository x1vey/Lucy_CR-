import Box from "@mui/material/Box";
import { listCustomers, listProducts, listPurchases, listTags } from "@/lib/db";
import ContactsClient, { type ContactRow } from "./ContactsClient";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const [customers, tags, products, purchases] = await Promise.all([
    listCustomers(),
    listTags(),
    listProducts(false), // exclude hidden from the purchase picker
    listPurchases(),
  ]);

  // Derive each contact's current products from the purchase ledger in one pass
  // rather than a query per contact.
  const productsByCustomer = new Map<string, Set<string>>();
  for (const p of purchases) {
    if (p.status !== "paid") continue;
    const set = productsByCustomer.get(p.customer_id) ?? new Set<string>();
    set.add(p.product_name);
    productsByCustomer.set(p.customer_id, set);
  }

  const rows: ContactRow[] = customers.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    notes: c.notes,
    products: [...(productsByCustomer.get(c.id) ?? [])],
    tags: c.tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
    created_at: c.created_at,
  }));

  return (
    <Box>
      <ContactsClient
        rows={rows}
        allTags={tags.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          currency: p.currency,
        }))}
      />
    </Box>
  );
}
