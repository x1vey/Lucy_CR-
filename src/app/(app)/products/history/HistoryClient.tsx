"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
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
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import {
  DataGrid,
  type GridColDef,
  type GridRenderCellParams,
} from "@mui/x-data-grid";
import PageHeader from "@/components/PageHeader";
import { formatDate, formatMoney } from "@/lib/format";
import { archivePurchaseAction, recordPurchaseAction } from "../../actions";

type Status = "unpaid" | "paid" | "refunded";
type Billing = "one_time" | "subscription";

export interface HistoryRow {
  id: string;
  purchase_ref: string;
  purchased_at: string;
  customer_id: string;
  customer_name: string;
  product_id: string | null;
  product_name: string;
  unit_amount: number;
  currency: string;
  status: Status;
  billing_type: Billing;
}

interface Lite {
  id: string;
  name: string;
}
type Toast = { severity: "success" | "error"; msg: string } | null;

const STATUS_COLOR: Record<Status, "success" | "warning" | "error"> = {
  paid: "success",
  unpaid: "warning",
  refunded: "error",
};

export default function HistoryClient({
  rows,
  products,
  customers,
}: {
  rows: HistoryRow[];
  products: Lite[];
  customers: Lite[];
}) {
  const router = useRouter();
  const [toast, setToast] = React.useState<Toast>(null);
  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);

  const [productFilter, setProductFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState<"all" | Status>("all");

  const filtered = React.useMemo(
    () =>
      rows.filter(
        (r) =>
          (productFilter === "all" || r.product_id === productFilter) &&
          (statusFilter === "all" || r.status === statusFilter),
      ),
    [rows, productFilter, statusFilter],
  );

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

  const columns: GridColDef<HistoryRow>[] = [
    {
      field: "purchase_ref",
      headerName: "Ref",
      width: 110,
      renderCell: (p: GridRenderCellParams<HistoryRow>) => (
        <Typography
          variant="body2"
          sx={{ fontFamily: "monospace", color: "text.secondary" }}
        >
          {p.row.purchase_ref}
        </Typography>
      ),
    },
    {
      field: "purchased_at",
      headerName: "Date",
      width: 130,
      valueFormatter: (v: string) => formatDate(v),
    },
    {
      field: "product_name",
      headerName: "Product",
      flex: 1,
      minWidth: 180,
      renderCell: (p: GridRenderCellParams<HistoryRow>) => (
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {p.row.product_name || "(deleted product)"}
        </Typography>
      ),
    },
    {
      field: "customer_name",
      headerName: "Purchased by",
      flex: 1,
      minWidth: 160,
    },
    {
      field: "unit_amount",
      headerName: "Amount",
      width: 120,
      align: "right",
      headerAlign: "right",
      valueFormatter: (_v, row) => formatMoney(row.unit_amount, row.currency),
    },
    {
      field: "status",
      headerName: "Status",
      width: 120,
      renderCell: (p: GridRenderCellParams<HistoryRow>) => (
        <Chip
          size="small"
          color={STATUS_COLOR[p.row.status]}
          variant="outlined"
          label={p.row.status[0].toUpperCase() + p.row.status.slice(1)}
        />
      ),
    },
    {
      field: "actions",
      headerName: "",
      width: 60,
      sortable: false,
      filterable: false,
      align: "right",
      headerAlign: "right",
      renderCell: (p: GridRenderCellParams<HistoryRow>) => (
        <Tooltip title="Remove entry">
          <IconButton
            size="small"
            onClick={() => {
              if (confirm(`Remove ${p.row.purchase_ref} from history?`)) {
                run(
                  () => archivePurchaseAction(p.row.id),
                  "History entry removed",
                );
              }
            }}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
    },
  ];

  return (
    <Box>
      <PageHeader
        title="Product history"
        subtitle="Every purchase, newest first. Each entry is a snapshot: who bought what, and when."
        action={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setOpen(true)}
          >
            Record purchase
          </Button>
        }
      />

      <Stack direction="row" spacing={2} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <TextField
          select
          size="small"
          label="Product"
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="all">All products</MenuItem>
          {products.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | Status)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="all">All statuses</MenuItem>
          <MenuItem value="paid">Paid</MenuItem>
          <MenuItem value="unpaid">Unpaid</MenuItem>
          <MenuItem value="refunded">Refunded</MenuItem>
        </TextField>
      </Stack>

      <Box sx={{ bgcolor: "background.paper", borderRadius: 2 }}>
        <DataGrid
          rows={filtered}
          columns={columns}
          disableRowSelectionOnClick
          initialState={{
            pagination: { paginationModel: { pageSize: 25 } },
          }}
          pageSizeOptions={[25, 50, 100]}
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 2,
            "& .MuiDataGrid-columnHeaders": {
              bgcolor: "background.default",
            },
          }}
        />
      </Box>

      <RecordDialog
        open={open}
        products={products}
        customers={customers}
        busy={pending}
        onClose={() => setOpen(false)}
        onSubmit={(vals) => {
          run(() => recordPurchaseAction(vals), "Purchase recorded");
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

function RecordDialog({
  open,
  products,
  customers,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  products: Lite[];
  customers: Lite[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (vals: {
    customer_id: string;
    product_id: string;
    purchased_at?: string;
    status: Status;
  }) => void;
}) {
  const [customerId, setCustomerId] = React.useState("");
  const [productId, setProductId] = React.useState("");
  const [date, setDate] = React.useState("");
  const [status, setStatus] = React.useState<Status>("paid");

  React.useEffect(() => {
    if (open) {
      setCustomerId("");
      setProductId("");
      setDate("");
      setStatus("paid");
    }
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Record purchase</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            select
            label="Contact"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            required
            fullWidth
          >
            {customers.length === 0 && (
              <MenuItem disabled value="">
                No contacts yet
              </MenuItem>
            )}
            {customers.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Product"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            required
            fullWidth
          >
            {products.length === 0 && (
              <MenuItem disabled value="">
                No products yet
              </MenuItem>
            )}
            {products.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Purchase date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            helperText="Defaults to today if left blank"
            fullWidth
          />
          <TextField
            select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
            fullWidth
          >
            <MenuItem value="paid">Paid</MenuItem>
            <MenuItem value="unpaid">Unpaid</MenuItem>
            <MenuItem value="refunded">Refunded</MenuItem>
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={busy || !customerId || !productId}
          onClick={() =>
            onSubmit({
              customer_id: customerId,
              product_id: productId,
              purchased_at: date || undefined,
              status,
            })
          }
        >
          Record purchase
        </Button>
      </DialogActions>
    </Dialog>
  );
}
