"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import MenuItem from "@mui/material/MenuItem";
import Autocomplete from "@mui/material/Autocomplete";
import Typography from "@mui/material/Typography";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import SellIcon from "@mui/icons-material/Sell";
import ShoppingCartIcon from "@mui/icons-material/AddShoppingCart";
import {
  DataGrid,
  type GridColDef,
  type GridRenderCellParams,
} from "@mui/x-data-grid";
import PageHeader from "@/components/PageHeader";
import { formatMoney } from "@/lib/format";
import {
  archiveContactAction,
  createContactAction,
  recordPurchaseAction,
  setContactTagsAction,
  updateContactAction,
} from "../actions";

export interface TagLite {
  id: string;
  name: string;
  color: string;
}
export interface ProductLite {
  id: string;
  name: string;
  price: number;
  currency: string;
}
export interface ContactRow {
  id: string;
  name: string;
  email: string | null;
  notes: string | null;
  products: string[];
  tags: TagLite[];
  created_at: string;
}

type Toast = { severity: "success" | "error"; msg: string } | null;

export default function ContactsClient({
  rows,
  allTags,
  products,
}: {
  rows: ContactRow[];
  allTags: TagLite[];
  products: ProductLite[];
}) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [toast, setToast] = React.useState<Toast>(null);
  const [pending, startTransition] = React.useTransition();

  const [editOpen, setEditOpen] = React.useState(false);
  const [editRow, setEditRow] = React.useState<ContactRow | null>(null);

  const [tagRow, setTagRow] = React.useState<ContactRow | null>(null);
  const [buyRow, setBuyRow] = React.useState<ContactRow | null>(null);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q) ||
        r.products.some((p) => p.toLowerCase().includes(q)) ||
        r.tags.some((t) => t.name.toLowerCase().includes(q)),
    );
  }, [rows, search]);

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

  const columns: GridColDef<ContactRow>[] = [
    {
      field: "name",
      headerName: "Name",
      flex: 1,
      minWidth: 160,
      renderCell: (p: GridRenderCellParams<ContactRow>) => (
        <Box sx={{ py: 0.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {p.row.name}
          </Typography>
          {p.row.email && (
            <Typography variant="caption" color="text.secondary">
              {p.row.email}
            </Typography>
          )}
        </Box>
      ),
    },
    {
      field: "products",
      headerName: "Products purchased",
      flex: 1.2,
      minWidth: 220,
      sortable: false,
      renderCell: (p: GridRenderCellParams<ContactRow>) =>
        p.row.products.length ? (
          <Stack
            direction="row"
            spacing={0.5}
            useFlexGap
            flexWrap="wrap"
            sx={{ py: 1 }}
          >
            {p.row.products.map((name) => (
              <Chip key={name} label={name} size="small" variant="outlined" />
            ))}
          </Stack>
        ) : (
          <Typography variant="caption" color="text.secondary">
            —
          </Typography>
        ),
    },
    {
      field: "tags",
      headerName: "Tags",
      flex: 1,
      minWidth: 180,
      sortable: false,
      renderCell: (p: GridRenderCellParams<ContactRow>) => (
        <Stack
          direction="row"
          spacing={0.5}
          useFlexGap
          flexWrap="wrap"
          alignItems="center"
          sx={{ py: 1 }}
        >
          {p.row.tags.map((t) => (
            <Chip
              key={t.id}
              label={t.name}
              size="small"
              sx={{
                bgcolor: t.color,
                color: "#fff",
                fontWeight: 600,
              }}
            />
          ))}
          <Tooltip title="Manage tags">
            <IconButton size="small" onClick={() => setTagRow(p.row)}>
              <SellIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
    {
      field: "actions",
      headerName: "",
      width: 130,
      sortable: false,
      filterable: false,
      align: "right",
      headerAlign: "right",
      renderCell: (p: GridRenderCellParams<ContactRow>) => (
        <Box>
          <Tooltip title="Record purchase">
            <IconButton size="small" onClick={() => setBuyRow(p.row)}>
              <ShoppingCartIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Edit">
            <IconButton
              size="small"
              onClick={() => {
                setEditRow(p.row);
                setEditOpen(true);
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
                    () => archiveContactAction(p.row.id),
                    "Contact archived",
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
        title="Contacts"
        subtitle="Everyone in the CRM, with the products they've purchased and their tags."
        action={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setEditRow(null);
              setEditOpen(true);
            }}
          >
            Add contact
          </Button>
        }
      />

      <TextField
        placeholder="Search name, email, product or tag…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        size="small"
        fullWidth
        sx={{ mb: 2, maxWidth: 420 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
      />

      <Box sx={{ bgcolor: "background.paper", borderRadius: 2 }}>
        <DataGrid
          rows={filtered}
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
            "& .MuiDataGrid-cell": { alignItems: "flex-start" },
            "& .MuiDataGrid-columnHeaders": {
              bgcolor: "background.default",
            },
          }}
        />
      </Box>

      <ContactDialog
        key={editRow?.id ?? "new"}
        open={editOpen}
        row={editRow}
        busy={pending}
        onClose={() => setEditOpen(false)}
        onSubmit={(vals) => {
          const action = editRow
            ? () => updateContactAction(editRow.id, vals)
            : () => createContactAction(vals);
          run(action, editRow ? "Contact updated" : "Contact created");
          setEditOpen(false);
        }}
      />

      <TagDialog
        open={!!tagRow}
        row={tagRow}
        allTags={allTags}
        busy={pending}
        onClose={() => setTagRow(null)}
        onSubmit={(tagIds) => {
          if (tagRow) {
            run(() => setContactTagsAction(tagRow.id, tagIds), "Tags updated");
          }
          setTagRow(null);
        }}
      />

      <PurchaseDialog
        open={!!buyRow}
        row={buyRow}
        products={products}
        busy={pending}
        onClose={() => setBuyRow(null)}
        onSubmit={(vals) => {
          if (buyRow) {
            run(
              () =>
                recordPurchaseAction({
                  customer_id: buyRow.id,
                  product_id: vals.product_id,
                  purchased_at: vals.purchased_at,
                  status: vals.status,
                }),
              "Purchase recorded",
            );
          }
          setBuyRow(null);
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

// ---- Add / edit contact ---------------------------------------------------

function ContactDialog({
  open,
  row,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  row: ContactRow | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (vals: { name: string; email?: string; notes?: string }) => void;
}) {
  const [name, setName] = React.useState(row?.name ?? "");
  const [email, setEmail] = React.useState(row?.email ?? "");
  const [notes, setNotes] = React.useState(row?.notes ?? "");
  const [err, setErr] = React.useState<string | null>(null);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{row ? "Edit contact" : "Add contact"}</DialogTitle>
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
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            fullWidth
          />
          <TextField
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            minRows={2}
            fullWidth
          />
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
            if (!name.trim()) {
              setErr("Name is required");
              return;
            }
            setErr(null);
            onSubmit({
              name: name.trim(),
              email: email.trim() || undefined,
              notes: notes.trim() || undefined,
            });
          }}
        >
          {row ? "Save" : "Create"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---- Manage tags on a contact ---------------------------------------------

function TagDialog({
  open,
  row,
  allTags,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  row: ContactRow | null;
  allTags: TagLite[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (tagIds: string[]) => void;
}) {
  const [selected, setSelected] = React.useState<TagLite[]>(row?.tags ?? []);

  React.useEffect(() => {
    setSelected(row?.tags ?? []);
  }, [row]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Tags · {row?.name}</DialogTitle>
      <DialogContent>
        <Autocomplete
          multiple
          options={allTags}
          value={selected}
          onChange={(_, v) => setSelected(v)}
          getOptionLabel={(o) => o.name}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          sx={{ mt: 1 }}
          renderTags={(value, getTagProps) =>
            value.map((option, index) => {
              const { key, ...chipProps } = getTagProps({ index });
              return (
                <Chip
                  key={key}
                  {...chipProps}
                  label={option.name}
                  size="small"
                  sx={{ bgcolor: option.color, color: "#fff", fontWeight: 600 }}
                />
              );
            })
          }
          renderInput={(params) => (
            <TextField
              {...params}
              label="Tags"
              placeholder="Choose tags…"
            />
          )}
        />
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
          Create new tags on the Tags page.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={busy}
          onClick={() => onSubmit(selected.map((t) => t.id))}
        >
          Save tags
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---- Record a purchase for a contact --------------------------------------

function PurchaseDialog({
  open,
  row,
  products,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  row: ContactRow | null;
  products: ProductLite[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (vals: {
    product_id: string;
    purchased_at?: string;
    status: "unpaid" | "paid" | "refunded";
  }) => void;
}) {
  const [productId, setProductId] = React.useState("");
  const [date, setDate] = React.useState("");
  const [status, setStatus] = React.useState<"unpaid" | "paid" | "refunded">(
    "paid",
  );

  React.useEffect(() => {
    if (open) {
      setProductId("");
      setDate("");
      setStatus("paid");
    }
  }, [open]);

  const chosen = products.find((p) => p.id === productId);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Record purchase · {row?.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
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
                No products — add one first
              </MenuItem>
            )}
            {products.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name} — {formatMoney(p.price, p.currency)}
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
            onChange={(e) =>
              setStatus(e.target.value as "unpaid" | "paid" | "refunded")
            }
            fullWidth
          >
            <MenuItem value="paid">Paid</MenuItem>
            <MenuItem value="unpaid">Unpaid</MenuItem>
            <MenuItem value="refunded">Refunded</MenuItem>
          </TextField>
          {chosen && (
            <Typography variant="caption" color="text.secondary">
              Recorded at {formatMoney(chosen.price, chosen.currency)}. This adds
              a new entry to product history.
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={busy || !productId}
          onClick={() =>
            onSubmit({
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
