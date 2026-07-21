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
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import {
  DataGrid,
  type GridColDef,
  type GridRenderCellParams,
} from "@mui/x-data-grid";
import PageHeader from "@/components/PageHeader";
import { formatDate } from "@/lib/format";
import {
  archiveAdminAction,
  createAdminAction,
  updateAdminAction,
} from "./actions";

type Role = "owner" | "admin";

export interface AdminRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  last_login_at: string | null;
  created_at: string;
  isYou: boolean;
}

type Toast = { severity: "success" | "error"; msg: string } | null;

export default function AdminsClient({ rows }: { rows: AdminRow[] }) {
  const router = useRouter();
  const [toast, setToast] = React.useState<Toast>(null);
  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  const [editRow, setEditRow] = React.useState<AdminRow | null>(null);

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

  const columns: GridColDef<AdminRow>[] = [
    {
      field: "name",
      headerName: "Name",
      flex: 1,
      minWidth: 180,
      renderCell: (p: GridRenderCellParams<AdminRow>) => (
        <Box sx={{ py: 0.5 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {p.row.name}
            </Typography>
            {p.row.isYou && (
              <Chip size="small" label="You" color="primary" variant="outlined" />
            )}
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {p.row.email}
          </Typography>
        </Box>
      ),
    },
    {
      field: "role",
      headerName: "Role",
      width: 120,
      renderCell: (p: GridRenderCellParams<AdminRow>) => (
        <Chip
          size="small"
          label={p.row.role === "owner" ? "Owner" : "Admin"}
          color={p.row.role === "owner" ? "primary" : "default"}
          variant="outlined"
        />
      ),
    },
    {
      field: "last_login_at",
      headerName: "Last login",
      width: 160,
      renderCell: (p: GridRenderCellParams<AdminRow>) => (
        <Typography variant="body2" color="text.secondary">
          {p.row.last_login_at ? formatDate(p.row.last_login_at) : "Never"}
        </Typography>
      ),
    },
    {
      field: "created_at",
      headerName: "Added",
      width: 140,
      valueFormatter: (v: string) => formatDate(v),
    },
    {
      field: "actions",
      headerName: "",
      width: 100,
      sortable: false,
      filterable: false,
      align: "right",
      headerAlign: "right",
      renderCell: (p: GridRenderCellParams<AdminRow>) => (
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
          <Tooltip title={p.row.isYou ? "You can't remove yourself" : "Remove"}>
            <span>
              <IconButton
                size="small"
                disabled={p.row.isYou}
                onClick={() => {
                  if (confirm(`Remove ${p.row.name}'s access?`)) {
                    run(() => archiveAdminAction(p.row.id), "Admin removed");
                  }
                }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      ),
    },
  ];

  return (
    <Box>
      <PageHeader
        title="Admins"
        subtitle="People who can sign in to Lucy CRM. Manage their access, roles and passwords."
        action={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setEditRow(null);
              setOpen(true);
            }}
          >
            Add admin
          </Button>
        }
      />

      <Box sx={{ bgcolor: "background.paper", borderRadius: 2 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          getRowHeight={() => "auto"}
          disableRowSelectionOnClick
          initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
          pageSizeOptions={[10, 25, 50]}
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 2,
            "& .MuiDataGrid-cell": { alignItems: "center" },
            "& .MuiDataGrid-columnHeaders": { bgcolor: "background.default" },
          }}
        />
      </Box>

      <AdminDialog
        key={editRow?.id ?? "new"}
        open={open}
        row={editRow}
        busy={pending}
        onClose={() => setOpen(false)}
        onSubmit={(vals) => {
          const action = editRow
            ? () => updateAdminAction(editRow.id, vals)
            : () =>
                createAdminAction({
                  name: vals.name,
                  email: vals.email,
                  role: vals.role,
                  password: vals.password ?? "",
                });
          run(action, editRow ? "Admin updated" : "Admin added");
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

function AdminDialog({
  open,
  row,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  row: AdminRow | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (vals: {
    name: string;
    email: string;
    role: Role;
    password?: string;
  }) => void;
}) {
  const [name, setName] = React.useState(row?.name ?? "");
  const [email, setEmail] = React.useState(row?.email ?? "");
  const [role, setRole] = React.useState<Role>(row?.role ?? "admin");
  const [password, setPassword] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{row ? "Edit admin" : "Add admin"}</DialogTitle>
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
            required
            fullWidth
          />
          <TextField
            select
            label="Role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            fullWidth
            helperText="Roles are labels for now — every admin has full access."
          >
            <MenuItem value="admin">Admin</MenuItem>
            <MenuItem value="owner">Owner</MenuItem>
          </TextField>
          <TextField
            label={row ? "New password (leave blank to keep)" : "Password"}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required={!row}
            fullWidth
            autoComplete="new-password"
            helperText="At least 8 characters"
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
            if (!name.trim()) return setErr("Name is required");
            if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
              return setErr("Enter a valid email");
            if (!row && password.length < 8)
              return setErr("Password must be at least 8 characters");
            if (row && password && password.length < 8)
              return setErr("Password must be at least 8 characters");
            setErr(null);
            onSubmit({
              name: name.trim(),
              email: email.trim(),
              role,
              password: password || undefined,
            });
          }}
        >
          {row ? "Save" : "Add admin"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
