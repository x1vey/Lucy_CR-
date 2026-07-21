"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import NextLink from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import InputAdornment from "@mui/material/InputAdornment";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import {
  DataGrid,
  type GridColDef,
  type GridRenderCellParams,
} from "@mui/x-data-grid";
import PageHeader from "@/components/PageHeader";
import { formatMoney } from "@/lib/format";
import {
  archiveProductAction,
  createProductAction,
  updateProductAction,
} from "../actions";

type Billing = "one_time" | "subscription";

export interface ProductRow {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  billing_type: Billing;
  units: number;
  revenue: number;
}

type Toast = { severity: "success" | "error"; msg: string } | null;

export default function ProductsClient({ rows }: { rows: ProductRow[] }) {
  const router = useRouter();
  const [toast, setToast] = React.useState<Toast>(null);
  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  const [editRow, setEditRow] = React.useState<ProductRow | null>(null);

  function run(fn: () => Promise<unknown>, okMsg: string) {
    startTransition(async () => {
      try {
        await fn();
        setToast({ severity: "success", msg: okMsg });
        router.refresh();
      } catch (e) {
        setToast({
          severity: "error",
          msg: e instanceof Error ? e.message : "Something went wrong",
        });
      }
    });
  }

  const columns: GridColDef<ProductRow>[] = [
    {
      field: "name",
      headerName: "Product",
      flex: 1.4,
      minWidth: 220,
      renderCell: (p: GridRenderCellParams<ProductRow>) => (
        <Box sx={{ py: 0.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {p.row.name}
          </Typography>
          {p.row.description && (
            <Typography variant="caption" color="text.secondary">
              {p.row.description}
            </Typography>
          )}
        </Box>
      ),
    },
    {
      field: "billing_type",
      headerName: "Billing",
      width: 130,
      renderCell: (p: GridRenderCellParams<ProductRow>) => (
        <Chip
          size="small"
          variant="outlined"
          label={p.row.billing_type === "subscription" ? "Subscription" : "One-time"}
        />
      ),
    },
    {
      field: "price",
      headerName: "Price",
      width: 120,
      align: "right",
      headerAlign: "right",
      valueFormatter: (_v, row) => formatMoney(row.price, row.currency),
    },
    {
      field: "units",
      headerName: "Units sold",
      width: 110,
      align: "right",
      headerAlign: "right",
    },
    {
      field: "revenue",
      headerName: "Revenue",
      width: 130,
      align: "right",
      headerAlign: "right",
      valueFormatter: (_v, row) => formatMoney(row.revenue, row.currency),
    },
    {
      field: "actions",
      headerName: "",
      width: 100,
      sortable: false,
      filterable: false,
      align: "right",
      headerAlign: "right",
      renderCell: (p: GridRenderCellParams<ProductRow>) => (
        <Box>
          <Tooltip title="Edit">
            <IconButton
              size="small"
              onClick={() => {
                setEditRow(p.row);
                setOpen(true);
              }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Archive">
            <IconButton
              size="small"
              onClick={() => {
                if (confirm(`Archive ${p.row.name}?`)) {
                  run(
                    () => archiveProductAction(p.row.id),
                    "Product archived",
                  );
                }
              }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ];

  return (
    <Box>
      <PageHeader
        title="Products"
        subtitle="Your catalogue. Units sold and revenue come from the purchase ledger."
        action={
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              component={NextLink}
              href="/products/history"
              startIcon={<ReceiptLongIcon />}
            >
              Product history
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => {
                setEditRow(null);
                setOpen(true);
              }}
            >
              Add product
            </Button>
          </Stack>
        }
      />

      <Box sx={{ bgcolor: "background.paper", borderRadius: 2 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          getRowHeight={() => "auto"}
          disableRowSelectionOnClick
          initialState={{
            pagination: { paginationModel: { pageSize: 10 } },
          }}
          pageSizeOptions={[10, 25, 50]}
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 2,
            "& .MuiDataGrid-cell": {
              alignItems: "center",
              display: "flex",
            },
            "& .MuiDataGrid-columnHeaders": {
              bgcolor: "background.default",
            },
          }}
        />
      </Box>

      <ProductDialog
        key={editRow?.id ?? "new"}
        open={open}
        row={editRow}
        busy={pending}
        onClose={() => setOpen(false)}
        onSubmit={(vals) => {
          const action = editRow
            ? () => updateProductAction(editRow.id, vals)
            : () => createProductAction(vals);
          run(action, editRow ? "Product updated" : "Product created");
          setOpen(false);
        }}
      />

      <Snackbar
        open={!!toast}
        autoHideDuration={3500}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)}>
            {toast.msg}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}

function ProductDialog({
  open,
  row,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  row: ProductRow | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (vals: {
    name: string;
    description?: string;
    price: number;
    currency: string;
    billing_type: Billing;
  }) => void;
}) {
  const [name, setName] = React.useState(row?.name ?? "");
  const [description, setDescription] = React.useState(row?.description ?? "");
  const [price, setPrice] = React.useState(String(row?.price ?? ""));
  const [currency, setCurrency] = React.useState(row?.currency ?? "USD");
  const [billing, setBilling] = React.useState<Billing>(
    row?.billing_type ?? "one_time",
  );
  const [err, setErr] = React.useState<string | null>(null);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{row ? "Edit product" : "Add product"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            fullWidth
          />
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            minRows={2}
            fullWidth
          />
          <Stack direction="row" spacing={2}>
            <TextField
              label="Price"
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              fullWidth
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">$</InputAdornment>
                ),
              }}
            />
            <TextField
              label="Currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              inputProps={{ maxLength: 3 }}
              sx={{ width: 120 }}
            />
          </Stack>
          <TextField
            select
            label="Billing type"
            value={billing}
            onChange={(e) => setBilling(e.target.value as Billing)}
            fullWidth
          >
            <MenuItem value="one_time">One-time</MenuItem>
            <MenuItem value="subscription">Subscription</MenuItem>
          </TextField>
          {err && (
            <Typography variant="caption" color="error">
              {err}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={busy}
          onClick={() => {
            const priceNum = Number(price);
            if (!name.trim()) {
              setErr("Name is required");
              return;
            }
            if (Number.isNaN(priceNum) || priceNum < 0) {
              setErr("Enter a valid price");
              return;
            }
            if (currency.trim().length !== 3) {
              setErr("Currency must be a 3-letter code");
              return;
            }
            setErr(null);
            onSubmit({
              name: name.trim(),
              description: description.trim() || undefined,
              price: priceNum,
              currency: currency.trim().toUpperCase(),
              billing_type: billing,
            });
          }}
        >
          {row ? "Save" : "Create"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
