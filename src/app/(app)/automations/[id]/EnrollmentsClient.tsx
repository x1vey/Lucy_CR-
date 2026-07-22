"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import NextLink from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import Collapse from "@mui/material/Collapse";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import CancelIcon from "@mui/icons-material/CancelOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  DataGrid,
  type GridColDef,
  type GridRenderCellParams,
} from "@mui/x-data-grid";
import PageHeader from "@/components/PageHeader";
import type { EnrollmentStatus } from "@/lib/types";
import { cancelEnrollmentAction, enrollContactsAction } from "../../actions";

// A step-run row flattened for display (from automation_step_runs).
export interface HistoryEntry {
  at: string;
  detail: string;
  error: string | null;
}

export interface EnrollmentRow {
  id: string;
  customer_name: string;
  customer_email: string | null;
  status: EnrollmentStatus;
  current_step: number;
  step_count: number;
  next_run_at: string | null;
  history: HistoryEntry[];
}

interface Candidate {
  id: string;
  name: string;
  email: string | null;
}

type Toast = { severity: "success" | "error"; msg: string } | null;

const STATUS_COLOR: Record<
  EnrollmentStatus,
  "success" | "default" | "error" | "warning"
> = {
  active: "success",
  completed: "default",
  canceled: "warning",
  failed: "error",
};

export default function EnrollmentsClient({
  automationId,
  automationName,
  stepCount,
  rows,
  candidates,
}: {
  automationId: string;
  automationName: string;
  stepCount: number;
  rows: EnrollmentRow[];
  candidates: Candidate[];
}) {
  const router = useRouter();
  const [toast, setToast] = React.useState<Toast>(null);
  const [pending, startTransition] = React.useTransition();
  const [enrollOpen, setEnrollOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Candidate[]>([]);
  const [expanded, setExpanded] = React.useState<string | null>(null);

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

  const columns: GridColDef<EnrollmentRow>[] = [
    {
      field: "customer_name",
      headerName: "Contact",
      flex: 1.2,
      minWidth: 180,
      renderCell: (p: GridRenderCellParams<EnrollmentRow>) => (
        <Box sx={{ py: 0.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {p.row.customer_name}
          </Typography>
          {p.row.customer_email && (
            <Typography variant="caption" color="text.secondary">
              {p.row.customer_email}
            </Typography>
          )}
        </Box>
      ),
    },
    {
      field: "status",
      headerName: "Status",
      width: 110,
      renderCell: (p: GridRenderCellParams<EnrollmentRow>) => (
        <Chip
          size="small"
          variant="outlined"
          color={STATUS_COLOR[p.row.status]}
          label={p.row.status}
        />
      ),
    },
    {
      field: "current_step",
      headerName: "Progress",
      width: 110,
      renderCell: (p: GridRenderCellParams<EnrollmentRow>) => (
        <Typography variant="caption">
          {Math.min(p.row.current_step, p.row.step_count)}/{p.row.step_count}
        </Typography>
      ),
    },
    {
      field: "next_run_at",
      headerName: "Next run",
      width: 170,
      renderCell: (p: GridRenderCellParams<EnrollmentRow>) => (
        <Typography variant="caption" color="text.secondary">
          {p.row.next_run_at
            ? new Date(p.row.next_run_at).toLocaleString()
            : "—"}
        </Typography>
      ),
    },
    {
      field: "actions",
      headerName: "",
      width: 100,
      sortable: false,
      filterable: false,
      align: "right",
      headerAlign: "right",
      renderCell: (p: GridRenderCellParams<EnrollmentRow>) => (
        <Box>
          <Tooltip title="History">
            <IconButton
              size="small"
              onClick={() =>
                setExpanded((cur) => (cur === p.row.id ? null : p.row.id))
              }
            >
              <ExpandMoreIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {p.row.status === "active" && (
            <Tooltip title="Cancel enrollment">
              <IconButton
                size="small"
                onClick={() =>
                  run(
                    () => cancelEnrollmentAction(p.row.id),
                    "Enrollment canceled",
                  )
                }
              >
                <CancelIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      ),
    },
  ];

  const expandedRow = rows.find((r) => r.id === expanded);

  return (
    <Box>
      <PageHeader
        title={automationName}
        subtitle={`${stepCount} step${stepCount === 1 ? "" : "s"} · enrollments and per-contact history`}
        action={
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              component={NextLink}
              href="/automations"
              startIcon={<ArrowBackIcon />}
            >
              All automations
            </Button>
            <Button
              variant="contained"
              startIcon={<PersonAddIcon />}
              onClick={() => setEnrollOpen(true)}
            >
              Enroll contacts
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
          initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
          pageSizeOptions={[10, 25, 50]}
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 2,
            "& .MuiDataGrid-cell": { alignItems: "center", display: "flex" },
            "& .MuiDataGrid-columnHeaders": { bgcolor: "background.default" },
          }}
        />
      </Box>

      <Collapse in={!!expandedRow}>
        {expandedRow && (
          <Box
            sx={{
              mt: 2,
              p: 2,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
              bgcolor: "background.paper",
            }}
          >
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              History — {expandedRow.customer_name}
            </Typography>
            {expandedRow.history.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Nothing has run yet.
              </Typography>
            ) : (
              <Stack spacing={0.75}>
                {expandedRow.history.map((h, i) => (
                  <Stack
                    key={i}
                    direction="row"
                    spacing={1}
                    alignItems="baseline"
                  >
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ minWidth: 150 }}
                    >
                      {new Date(h.at).toLocaleString()}
                    </Typography>
                    <Typography variant="body2" sx={{ flexGrow: 1 }}>
                      {h.detail}
                      {h.error && (
                        <Chip
                          size="small"
                          color="error"
                          variant="outlined"
                          label={h.error}
                          sx={{ ml: 1 }}
                        />
                      )}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            )}
          </Box>
        )}
      </Collapse>

      <Dialog
        open={enrollOpen}
        onClose={() => setEnrollOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Enroll contacts</DialogTitle>
        <DialogContent>
          <Autocomplete
            multiple
            options={candidates}
            getOptionLabel={(o) =>
              o.email ? `${o.name} (${o.email})` : o.name
            }
            value={selected}
            onChange={(_e, v) => setSelected(v)}
            sx={{ mt: 1 }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Contacts"
                placeholder="Search contacts…"
              />
            )}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEnrollOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={pending || selected.length === 0}
            onClick={() => {
              const ids = selected.map((s) => s.id);
              run(
                () => enrollContactsAction(automationId, ids),
                `Enrolled ${ids.length} contact(s)`,
              );
              setSelected([]);
              setEnrollOpen(false);
            }}
          >
            Enroll
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
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
