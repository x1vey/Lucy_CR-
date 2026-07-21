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
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import PersonAddIcon from "@mui/icons-material/PersonAddAlt1";
import PersonRemoveIcon from "@mui/icons-material/PersonRemoveAlt1";
import {
  DataGrid,
  type GridColDef,
  type GridRenderCellParams,
} from "@mui/x-data-grid";
import PageHeader from "@/components/PageHeader";
import { formatDate } from "@/lib/format";
import type { TagActivityKind } from "@/lib/types";

export interface TagActivityRow {
  id: string;
  kind: TagActivityKind;
  tag_id: string;
  tag_name: string;
  tag_color: string;
  who_names: string[];
  created_at: string;
}

const KIND_META: Record<
  TagActivityKind,
  { label: string; color: "default" | "success" | "info"; icon: React.ReactNode }
> = {
  created: {
    label: "Created",
    color: "info",
    icon: <AddCircleOutlineIcon fontSize="small" />,
  },
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
  const [kindFilter, setKindFilter] = React.useState<"all" | TagActivityKind>(
    "all",
  );

  const filtered = React.useMemo(
    () =>
      rows.filter(
        (r) =>
          (tagFilter === "all" || r.tag_id === tagFilter) &&
          (kindFilter === "all" || r.kind === kindFilter),
      ),
    [rows, tagFilter, kindFilter],
  );

  const columns: GridColDef<TagActivityRow>[] = [
    {
      field: "created_at",
      headerName: "When",
      width: 140,
      valueFormatter: (v: string) => formatDate(v),
    },
    {
      field: "kind",
      headerName: "Activity",
      width: 150,
      renderCell: (p: GridRenderCellParams<TagActivityRow>) => {
        const m = KIND_META[p.row.kind];
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
      field: "who_names",
      headerName: "Who (contacts)",
      flex: 1,
      minWidth: 220,
      sortable: false,
      renderCell: (p: GridRenderCellParams<TagActivityRow>) => {
        // "created" rows aren't about people; add/removed list the contacts.
        if (p.row.kind === "created" || p.row.who_names.length === 0) {
          return (
            <Typography variant="caption" color="text.secondary">
              —
            </Typography>
          );
        }
        return (
          <Stack
            direction="row"
            spacing={0.5}
            useFlexGap
            flexWrap="wrap"
            sx={{ py: 1 }}
          >
            {p.row.who_names.map((name, i) => (
              <Chip
                key={`${name}-${i}`}
                size="small"
                variant="outlined"
                label={name || "(unnamed)"}
              />
            ))}
          </Stack>
        );
      },
    },
    {
      field: "count",
      headerName: "#",
      width: 70,
      align: "right",
      headerAlign: "right",
      sortable: false,
      renderCell: (p: GridRenderCellParams<TagActivityRow>) =>
        p.row.kind === "created" ? (
          <Typography variant="caption" color="text.secondary">
            —
          </Typography>
        ) : (
          <Typography variant="body2">{p.row.who_names.length}</Typography>
        ),
    },
  ];

  return (
    <Box>
      <PageHeader
        title="Tag activity"
        subtitle="One log for everything tags: created, and added to / removed from contacts (who, and when)."
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
          value={kindFilter}
          onChange={(e) =>
            setKindFilter(e.target.value as "all" | TagActivityKind)
          }
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="all">All activity</MenuItem>
          <MenuItem value="created">Created</MenuItem>
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
