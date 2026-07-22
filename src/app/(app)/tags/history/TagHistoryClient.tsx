"use client";

import * as React from "react";
import NextLink from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import SellIcon from "@mui/icons-material/Sell";
import PersonAddIcon from "@mui/icons-material/PersonAddAlt1";
import PersonRemoveIcon from "@mui/icons-material/PersonRemoveAlt1";
import {
  DataGrid,
  type GridColDef,
  type GridRenderCellParams,
} from "@mui/x-data-grid";
import PageHeader from "@/components/PageHeader";
import { formatDate } from "@/lib/format";
import type { TagHistoryAction } from "@/lib/types";

export interface TagActivityRow {
  id: string;
  action: TagHistoryAction;
  tag_id: string;
  tag_name: string;
  tag_color: string;
  customer_name: string;
  created_at: string;
}

const ACTION_META: Record<
  TagHistoryAction,
  { label: string; color: "default" | "success"; icon: React.ReactNode }
> = {
  added: {
    label: "Added",
    color: "success",
    icon: <PersonAddIcon fontSize="small" />,
  },
  removed: {
    label: "Removed",
    color: "default",
    icon: <PersonRemoveIcon fontSize="small" />,
  },
};

export default function TagHistoryClient({
  rows,
  tags,
}: {
  rows: TagActivityRow[];
  tags: { id: string; name: string }[];
}) {
  const [tagFilter, setTagFilter] = React.useState("all");
  const [actionFilter, setActionFilter] = React.useState<"all" | TagHistoryAction>(
    "all",
  );

  const filtered = React.useMemo(
    () =>
      rows.filter(
        (r) =>
          (tagFilter === "all" || r.tag_id === tagFilter) &&
          (actionFilter === "all" || r.action === actionFilter),
      ),
    [rows, tagFilter, actionFilter],
  );

  const columns: GridColDef<TagActivityRow>[] = [
    {
      field: "created_at",
      headerName: "When",
      width: 140,
      valueFormatter: (v: string) => formatDate(v),
    },
    {
      field: "action",
      headerName: "Activity",
      width: 150,
      renderCell: (p: GridRenderCellParams<TagActivityRow>) => {
        const m = ACTION_META[p.row.action];
        return (
          <Chip
            size="small"
            variant="outlined"
            color={m.color}
            icon={m.icon as React.ReactElement}
            label={m.label}
          />
        );
      },
    },
    {
      field: "tag_name",
      headerName: "Tag",
      width: 160,
      renderCell: (p: GridRenderCellParams<TagActivityRow>) => (
        <Chip
          size="small"
          label={p.row.tag_name}
          sx={{ bgcolor: p.row.tag_color, color: "#fff", fontWeight: 600 }}
        />
      ),
    },
    {
      field: "customer_name",
      headerName: "Contact",
      flex: 1,
      minWidth: 220,
      renderCell: (p: GridRenderCellParams<TagActivityRow>) => (
        <Typography variant="body2">
          {p.row.customer_name || "(unnamed)"}
        </Typography>
      ),
    },
  ];

  return (
    <Box>
      <PageHeader
        title="Tag activity"
        subtitle="Audit trail of tags added to and removed from contacts (who, and when)."
        action={
          <Button
            variant="outlined"
            component={NextLink}
            href="/tags"
            startIcon={<SellIcon />}
          >
            Manage tags
          </Button>
        }
      />

      <Stack direction="row" spacing={2} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <TextField
          select
          size="small"
          label="Tag"
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="all">All tags</MenuItem>
          {tags.map((t) => (
            <MenuItem key={t.id} value={t.id}>
              {t.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Activity"
          value={actionFilter}
          onChange={(e) =>
            setActionFilter(e.target.value as "all" | TagHistoryAction)
          }
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="all">All activity</MenuItem>
          <MenuItem value="added">Added to contacts</MenuItem>
          <MenuItem value="removed">Removed from contacts</MenuItem>
        </TextField>
      </Stack>

      <Box sx={{ bgcolor: "background.paper", borderRadius: 2 }}>
        <DataGrid
          rows={filtered}
          columns={columns}
          getRowHeight={() => "auto"}
          disableRowSelectionOnClick
          initialState={{
            pagination: { paginationModel: { pageSize: 25 } },
          }}
          pageSizeOptions={[25, 50, 100]}
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 2,
            "& .MuiDataGrid-cell": { alignItems: "flex-start" },
            "& .MuiDataGrid-columnHeaders": {
              bgcolor: "background.default",
            },
          }}
        />
      </Box>
    </Box>
  );
}
