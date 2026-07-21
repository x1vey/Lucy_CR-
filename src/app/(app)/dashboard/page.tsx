import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import PeopleIcon from "@mui/icons-material/People";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import PaidIcon from "@mui/icons-material/Paid";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import PageHeader from "@/components/PageHeader";
import StatTile from "@/components/StatTile";
import { getOverview } from "@/lib/analytics";
import { formatMoney } from "@/lib/format";
import DashboardCharts from "./DashboardCharts";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const o = await getOverview();

  return (
    <Box>
      <PageHeader
        title="Analytics"
        subtitle="How many people bought what — derived from the purchase ledger."
      />

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "1fr 1fr",
            md: "repeat(4, 1fr)",
          },
          gap: 3,
          mb: 3,
        }}
      >
        <StatTile
          label="Contacts"
          value={String(o.totalCustomers)}
          icon={<PeopleIcon />}
          accent="#2a78d6"
        />
        <StatTile
          label="Paid purchases"
          value={String(o.totalPurchases)}
          icon={<ReceiptLongIcon />}
          accent="#1baf7a"
        />
        <StatTile
          label="Revenue"
          value={formatMoney(o.totalRevenue, o.currency)}
          sublabel="From paid purchases"
          icon={<PaidIcon />}
          accent="#eda100"
        />
        <StatTile
          label="Active products"
          value={String(o.activeProducts)}
          sublabel={o.topProduct ? `Top: ${o.topProduct.product_name}` : undefined}
          icon={<Inventory2Icon />}
          accent="#4a3aa7"
        />
      </Box>

      <DashboardCharts
        perProduct={o.perProduct}
        monthly={o.monthly}
        currency={o.currency}
      />

      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Product breakdown
          </Typography>
          <Box sx={{ overflowX: "auto" }}>
            <Box
              component="table"
              sx={{
                width: "100%",
                borderCollapse: "collapse",
                "& th, & td": {
                  textAlign: "left",
                  py: 1.25,
                  px: 1,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  fontSize: 14,
                },
                "& th": { color: "text.secondary", fontWeight: 600 },
                "& td.num, & th.num": {
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                },
              }}
            >
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Units</th>
                  <th className="num">Buyers</th>
                  <th className="num">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {o.perProduct.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <Typography variant="body2" color="text.secondary">
                        No purchases recorded yet.
                      </Typography>
                    </td>
                  </tr>
                ) : (
                  o.perProduct.map((p) => (
                    <tr key={p.product_id ?? p.product_name}>
                      <td>{p.product_name}</td>
                      <td className="num">{p.units}</td>
                      <td className="num">{p.buyers}</td>
                      <td className="num">
                        {formatMoney(p.revenue, p.currency)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Box>
          </Box>
          <Chip
            size="small"
            variant="outlined"
            label="Numbers reflect paid purchases only"
            sx={{ mt: 2 }}
          />
        </CardContent>
      </Card>
    </Box>
  );
}
