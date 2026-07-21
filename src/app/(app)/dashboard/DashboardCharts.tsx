"use client";

import * as React from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthlyPoint, ProductStat } from "@/lib/analytics";
import { formatMoney } from "@/lib/format";

// Dataviz palette (validated default, light mode). Single-hue by default:
// each chart shows one measure, so we use categorical slot 1 (blue) and only
// bring in a second hue when a second measure is toggled on.
const INK = "#0b0b0b";
const MUTED = "#898781";
const GRID = "#e1e0d9";
const SURFACE = "#ffffff";
const BLUE = "#2a78d6";
const AQUA = "#1baf7a";

type Measure = "units" | "buyers" | "revenue";

const MEASURE_LABEL: Record<Measure, string> = {
  units: "Units sold",
  buyers: "Buyers",
  revenue: "Revenue",
};

function ChartTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; dataKey?: string }>;
  label?: string;
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <Box
      sx={{
        bgcolor: SURFACE,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1.5,
        px: 1.5,
        py: 1,
        boxShadow: 3,
      }}
    >
      <Typography variant="caption" sx={{ fontWeight: 700, color: INK }}>
        {label}
      </Typography>
      {payload.map((p) => (
        <Typography
          key={p.dataKey}
          variant="caption"
          sx={{ display: "block", color: "text.secondary" }}
        >
          {p.dataKey === "revenue"
            ? formatMoney(Number(p.value ?? 0), currency)
            : `${p.value} ${p.dataKey}`}
        </Typography>
      ))}
    </Box>
  );
}

export default function DashboardCharts({
  perProduct,
  monthly,
  currency,
}: {
  perProduct: ProductStat[];
  monthly: MonthlyPoint[];
  currency: string;
}) {
  const [measure, setMeasure] = React.useState<Measure>("units");

  // Show at most 8 products in the bar chart; fold the rest into "Other".
  const barData = React.useMemo(() => {
    const top = perProduct.slice(0, 8).map((p) => ({
      name: p.product_name,
      units: p.units,
      buyers: p.buyers,
      revenue: p.revenue,
    }));
    if (perProduct.length > 8) {
      const rest = perProduct.slice(8);
      top.push({
        name: "Other",
        units: rest.reduce((s, p) => s + p.units, 0),
        buyers: rest.reduce((s, p) => s + p.buyers, 0),
        revenue: rest.reduce((s, p) => s + p.revenue, 0),
      });
    }
    return top;
  }, [perProduct]);

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", lg: "3fr 2fr" },
        gap: 3,
      }}
    >
      <Card>
        <CardContent>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 1,
              mb: 2,
            }}
          >
            <Box>
              <Typography variant="h6">What people bought</Typography>
              <Typography variant="body2" color="text.secondary">
                {MEASURE_LABEL[measure]} by product
              </Typography>
            </Box>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={measure}
              onChange={(_, v: Measure | null) => v && setMeasure(v)}
            >
              <ToggleButton value="units">Units</ToggleButton>
              <ToggleButton value="buyers">Buyers</ToggleButton>
              <ToggleButton value="revenue">Revenue</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          {barData.length === 0 ? (
            <EmptyPlot />
          ) : (
            <ResponsiveContainer width="100%" height={340}>
              <BarChart
                data={barData}
                layout="vertical"
                margin={{ top: 4, right: 24, bottom: 4, left: 8 }}
              >
                <CartesianGrid horizontal={false} stroke={GRID} />
                <XAxis
                  type="number"
                  tick={{ fill: MUTED, fontSize: 12 }}
                  tickLine={false}
                  axisLine={{ stroke: GRID }}
                  tickFormatter={(v) =>
                    measure === "revenue"
                      ? formatMoney(Number(v), currency)
                      : String(v)
                  }
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={140}
                  tick={{ fill: INK, fontSize: 12 }}
                  tickLine={false}
                  axisLine={{ stroke: GRID }}
                />
                <Tooltip
                  cursor={{ fill: "rgba(42,120,214,0.06)" }}
                  content={<ChartTooltip currency={currency} />}
                />
                <Bar
                  dataKey={measure}
                  fill={BLUE}
                  radius={[0, 4, 4, 0]}
                  barSize={22}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6">Sales trend</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Units per month (last 6 months)
          </Typography>
          {monthly.every((m) => m.units === 0) ? (
            <EmptyPlot />
          ) : (
            <ResponsiveContainer width="100%" height={340}>
              <LineChart
                data={monthly}
                margin={{ top: 4, right: 16, bottom: 4, left: -16 }}
              >
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: MUTED, fontSize: 12 }}
                  tickLine={false}
                  axisLine={{ stroke: GRID }}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: MUTED, fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  cursor={{ stroke: GRID }}
                  content={<ChartTooltip currency={currency} />}
                />
                <Line
                  type="monotone"
                  dataKey="units"
                  stroke={AQUA}
                  strokeWidth={2}
                  dot={{ r: 4, fill: AQUA, strokeWidth: 0 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

function EmptyPlot() {
  return (
    <Box
      sx={{
        height: 340,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Typography variant="body2" color="text.secondary">
        No paid purchases yet.
      </Typography>
    </Box>
  );
}
