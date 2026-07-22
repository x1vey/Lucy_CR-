"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import Divider from "@mui/material/Divider";
import Slider from "@mui/material/Slider";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import {
  DataGrid,
  type GridColDef,
  type GridRenderCellParams,
} from "@mui/x-data-grid";
import PageHeader from "@/components/PageHeader";
import { formatMoney } from "@/lib/format";
import type { Busyness, WeeklyHours } from "@/lib/types";
import {
  archiveCalendarAction,
  createCalendarAction,
  updateCalendarAction,
  type CalendarActionInput,
} from "../actions";

export interface CalendarRow {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  price: number;
  currency: string;
  paid: boolean;
  slot_minutes: number;
  utc_offset_minutes: number;
  timezone_label: string;
  lead_time_minutes: number;
  window_days: number;
  weekly_hours: WeeklyHours;
  busyness: Busyness;
  upcoming: number;
  total_bookings: number;
}

type Toast = { severity: "success" | "error"; msg: string } | null;

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// A small curated list of fixed UTC offsets (minutes). No DST — see availability.ts.
const OFFSETS: { label: string; minutes: number }[] = [
  { label: "GMT-08:00 (US Pacific)", minutes: -480 },
  { label: "GMT-07:00 (US Mountain)", minutes: -420 },
  { label: "GMT-06:00 (US Central)", minutes: -360 },
  { label: "GMT-05:00 (US Eastern)", minutes: -300 },
  { label: "GMT+00:00 (UTC)", minutes: 0 },
  { label: "GMT+01:00 (Central Europe)", minutes: 60 },
  { label: "GMT+02:00 (Eastern Europe)", minutes: 120 },
  { label: "GMT+05:30 (India)", minutes: 330 },
  { label: "GMT+08:00 (Singapore)", minutes: 480 },
  { label: "GMT+10:00 (Sydney)", minutes: 600 },
];

export default function CalendarClient({
  rows,
  appUrl,
}: {
  rows: CalendarRow[];
  appUrl: string;
}) {
  const router = useRouter();
  const [toast, setToast] = React.useState<Toast>(null);
  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  const [editRow, setEditRow] = React.useState<CalendarRow | null>(null);

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

  function copyLink(slug: string) {
    navigator.clipboard.writeText(`${appUrl}/c/${slug}`);
    setToast({ severity: "success", msg: "Booking link copied" });
  }

  const columns: GridColDef<CalendarRow>[] = [
    {
      field: "name",
      headerName: "Calendar",
      flex: 1.4,
      minWidth: 220,
      renderCell: (p: GridRenderCellParams<CalendarRow>) => (
        <Box sx={{ py: 0.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {p.row.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            /c/{p.row.slug} · {p.row.slot_minutes}-min slots
          </Typography>
        </Box>
      ),
    },
    {
      field: "paid",
      headerName: "Type",
      width: 130,
      renderCell: (p: GridRenderCellParams<CalendarRow>) =>
        p.row.paid ? (
          <Chip
            size="small"
            color="primary"
            variant="outlined"
            label={formatMoney(p.row.price, p.row.currency)}
          />
        ) : (
          <Chip size="small" variant="outlined" label="Free" />
        ),
    },
    {
      field: "timezone_label",
      headerName: "Timezone",
      width: 130,
      renderCell: (p: GridRenderCellParams<CalendarRow>) => (
        <Typography variant="caption">{p.row.timezone_label}</Typography>
      ),
    },
    {
      field: "upcoming",
      headerName: "Upcoming",
      width: 100,
      align: "right",
      headerAlign: "right",
    },
    {
      field: "actions",
      headerName: "",
      width: 160,
      sortable: false,
      filterable: false,
      align: "right",
      headerAlign: "right",
      renderCell: (p: GridRenderCellParams<CalendarRow>) => (
        <Box>
          <Tooltip title="Copy booking link">
            <IconButton size="small" onClick={() => copyLink(p.row.slug)}>
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Open booking page">
            <IconButton
              size="small"
              component="a"
              href={`/c/${p.row.slug}`}
              target="_blank"
            >
              <OpenInNewIcon fontSize="small" />
            </IconButton>
          </Tooltip>
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
                    () => archiveCalendarAction(p.row.id),
                    "Calendar archived",
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
        title="Booking calendars"
        subtitle="Calendly-style calendars. Each has its own public booking link, availability rules, and optional payment."
        action={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setEditRow(null);
              setOpen(true);
            }}
          >
            Add calendar
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
            "& .MuiDataGrid-cell": { alignItems: "center", display: "flex" },
            "& .MuiDataGrid-columnHeaders": { bgcolor: "background.default" },
          }}
        />
      </Box>

      <CalendarDialog
        key={editRow?.id ?? "new"}
        open={open}
        row={editRow}
        busy={pending}
        onClose={() => setOpen(false)}
        onSubmit={(vals) => {
          const action = editRow
            ? () => updateCalendarAction(editRow.id, vals)
            : () => createCalendarAction(vals);
          run(action, editRow ? "Calendar updated" : "Calendar created");
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

// Default open hours for a brand-new calendar: weekdays 9–5.
function defaultHours(): WeeklyHours {
  const h: WeeklyHours = {};
  for (let d = 1; d <= 5; d++) h[d] = [{ start: "09:00", end: "17:00" }];
  return h;
}

function CalendarDialog({
  open,
  row,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  row: CalendarRow | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (vals: CalendarActionInput) => void;
}) {
  const [name, setName] = React.useState(row?.name ?? "");
  const [description, setDescription] = React.useState(row?.description ?? "");
  const [offset, setOffset] = React.useState(row?.utc_offset_minutes ?? 0);
  const [slot, setSlot] = React.useState(row?.slot_minutes ?? 30);
  const [lead, setLead] = React.useState(row?.lead_time_minutes ?? 120);
  const [windowDays, setWindowDays] = React.useState(row?.window_days ?? 14);
  const [paid, setPaid] = React.useState(row?.paid ?? false);
  const [price, setPrice] = React.useState(String(row?.price ?? ""));
  const [currency, setCurrency] = React.useState(row?.currency ?? "USD");
  const [hours, setHours] = React.useState<WeeklyHours>(
    row?.weekly_hours ?? defaultHours(),
  );
  const [busyEnabled, setBusyEnabled] = React.useState(
    row?.busyness.enabled ?? true,
  );
  const [busyFraction, setBusyFraction] = React.useState(
    row?.busyness.fraction ?? 0.3,
  );
  const [epochDays, setEpochDays] = React.useState(
    row?.busyness.epoch_days ?? 1,
  );
  const [err, setErr] = React.useState<string | null>(null);

  function toggleDay(day: number) {
    setHours((h) => {
      const next = { ...h };
      if (next[day]) delete next[day];
      else next[day] = [{ start: "09:00", end: "17:00" }];
      return next;
    });
  }

  function setWindow(
    day: number,
    field: "start" | "end",
    value: string,
  ) {
    setHours((h) => {
      const windows = h[day] ? [...h[day]] : [{ start: "09:00", end: "17:00" }];
      windows[0] = { ...windows[0], [field]: value };
      return { ...h, [day]: windows };
    });
  }

  function submit() {
    if (!name.trim()) {
      setErr("Name is required");
      return;
    }
    const priceNum = paid ? Number(price) : 0;
    if (paid && (Number.isNaN(priceNum) || priceNum <= 0)) {
      setErr("Paid calendars need a price above 0");
      return;
    }
    if (Object.keys(hours).length === 0) {
      setErr("Open at least one day");
      return;
    }
    for (const [day, windows] of Object.entries(hours)) {
      for (const w of windows) {
        if (w.start >= w.end) {
          setErr(`${DAY_NAMES[Number(day)]}: end must be after start`);
          return;
        }
      }
    }
    setErr(null);
    const label =
      OFFSETS.find((o) => o.minutes === offset)?.label.split(" ")[0] ?? "UTC";
    onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      price: priceNum,
      currency: currency.trim().toUpperCase(),
      config: {
        utc_offset_minutes: offset,
        timezone_label: label,
        slot_minutes: slot,
        weekly_hours: hours as Record<
          string,
          { start: string; end: string }[]
        >,
        lead_time_minutes: lead,
        window_days: windowDays,
        paid,
        busyness: {
          enabled: busyEnabled,
          fraction: busyFraction,
          epoch_days: epochDays,
        },
      },
    });
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{row ? "Edit calendar" : "Add calendar"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
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

          <Divider textAlign="left">
            <Typography variant="caption" color="text.secondary">
              AVAILABILITY
            </Typography>
          </Divider>

          <Stack direction="row" spacing={2}>
            <TextField
              select
              label="Timezone"
              value={offset}
              onChange={(e) => setOffset(Number(e.target.value))}
              fullWidth
            >
              {OFFSETS.map((o) => (
                <MenuItem key={o.minutes} value={o.minutes}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Slot length"
              value={slot}
              onChange={(e) => setSlot(Number(e.target.value))}
              sx={{ width: 160 }}
            >
              {[15, 30, 45, 60].map((m) => (
                <MenuItem key={m} value={m}>
                  {m} min
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          <Stack direction="row" spacing={2}>
            <TextField
              label="Lead time (minutes)"
              type="number"
              value={lead}
              onChange={(e) => setLead(Number(e.target.value))}
              helperText="Earliest a slot can be booked"
              fullWidth
            />
            <TextField
              label="Booking window (days)"
              type="number"
              value={windowDays}
              onChange={(e) => setWindowDays(Number(e.target.value))}
              helperText="How far ahead bookings open"
              fullWidth
            />
          </Stack>

          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
              Open hours
            </Typography>
            <Stack spacing={1}>
              {DAY_NAMES.map((dn, day) => {
                const on = !!hours[day];
                const win = hours[day]?.[0];
                return (
                  <Stack
                    key={day}
                    direction="row"
                    spacing={1.5}
                    alignItems="center"
                  >
                    <FormControlLabel
                      sx={{ width: 130, m: 0 }}
                      control={
                        <Switch
                          size="small"
                          checked={on}
                          onChange={() => toggleDay(day)}
                        />
                      }
                      label={
                        <Typography variant="body2">{dn.slice(0, 3)}</Typography>
                      }
                    />
                    {on ? (
                      <>
                        <TextField
                          type="time"
                          size="small"
                          value={win?.start ?? "09:00"}
                          onChange={(e) =>
                            setWindow(day, "start", e.target.value)
                          }
                          sx={{ width: 120 }}
                        />
                        <Typography variant="body2" color="text.secondary">
                          to
                        </Typography>
                        <TextField
                          type="time"
                          size="small"
                          value={win?.end ?? "17:00"}
                          onChange={(e) => setWindow(day, "end", e.target.value)}
                          sx={{ width: 120 }}
                        />
                      </>
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        Closed
                      </Typography>
                    )}
                  </Stack>
                );
              })}
            </Stack>
          </Box>

          <Divider textAlign="left">
            <Typography variant="caption" color="text.secondary">
              SCARCITY
            </Typography>
          </Divider>
          <FormControlLabel
            control={
              <Switch
                checked={busyEnabled}
                onChange={(e) => setBusyEnabled(e.target.checked)}
              />
            }
            label="Show some open slots as busy to signal demand"
          />
          {busyEnabled && (
            <Box sx={{ px: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Hide {Math.round(busyFraction * 100)}% of open slots
              </Typography>
              <Slider
                value={busyFraction}
                min={0}
                max={0.8}
                step={0.05}
                onChange={(_e, v) => setBusyFraction(v as number)}
              />
              <TextField
                label="Re-roll every (days)"
                type="number"
                size="small"
                value={epochDays}
                onChange={(e) => setEpochDays(Number(e.target.value))}
                helperText="0 = never changes"
                sx={{ width: 200 }}
              />
            </Box>
          )}

          <Divider textAlign="left">
            <Typography variant="caption" color="text.secondary">
              PAYMENT
            </Typography>
          </Divider>
          <FormControlLabel
            control={
              <Switch
                checked={paid}
                onChange={(e) => setPaid(e.target.checked)}
              />
            }
            label="Require payment to book (Stripe)"
          />
          {paid && (
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
          )}

          {err && (
            <Typography variant="caption" color="error">
              {err}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={busy} onClick={submit}>
          {row ? "Save" : "Create"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
