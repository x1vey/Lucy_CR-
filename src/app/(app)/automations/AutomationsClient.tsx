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
import Menu from "@mui/material/Menu";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PeopleIcon from "@mui/icons-material/People";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import SellIcon from "@mui/icons-material/Sell";
import ScheduleIcon from "@mui/icons-material/Schedule";
import {
  DataGrid,
  type GridColDef,
  type GridRenderCellParams,
} from "@mui/x-data-grid";
import PageHeader from "@/components/PageHeader";
import type {
  AutomationStep,
  AutomationTrigger,
  AutomationTriggerKind,
} from "@/lib/types";
import {
  archiveAutomationAction,
  createAutomationAction,
  runTickAction,
  setAutomationActiveAction,
  updateAutomationAction,
  type AutomationActionInput,
} from "../actions";

export interface AutomationRow {
  id: string;
  name: string;
  description: string | null;
  trigger: AutomationTrigger;
  steps: AutomationStep[];
  active: boolean;
  stepCount: number;
  emailCount: number;
  activeEnrollments: number;
}

interface FormOpt {
  id: string;
  name: string;
}
interface TagOpt {
  id: string;
  name: string;
  color: string;
}

type Toast = { severity: "success" | "error"; msg: string } | null;

const TRIGGER_LABEL: Record<AutomationTriggerKind, string> = {
  form_submission: "Form submission",
  tag_added: "Tag added",
  manual: "Manual / bulk",
};

export default function AutomationsClient({
  rows,
  forms,
  tags,
  leadConnectorLive,
}: {
  rows: AutomationRow[];
  forms: FormOpt[];
  tags: TagOpt[];
  leadConnectorLive: boolean;
}) {
  const router = useRouter();
  const [toast, setToast] = React.useState<Toast>(null);
  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  const [editRow, setEditRow] = React.useState<AutomationRow | null>(null);

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

  function runNow() {
    startTransition(async () => {
      try {
        const s = await runTickAction();
        setToast({
          severity: "success",
          msg: `Ran ${s.claimed} due — ${s.emailsSent} email(s), ${s.completed} completed`,
        });
        router.refresh();
      } catch (e) {
        setToast({
          severity: "error",
          msg: e instanceof Error ? e.message : "Something went wrong",
        });
      }
    });
  }

  const columns: GridColDef<AutomationRow>[] = [
    {
      field: "name",
      headerName: "Automation",
      flex: 1.4,
      minWidth: 220,
      renderCell: (p: GridRenderCellParams<AutomationRow>) => (
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
      field: "trigger",
      headerName: "Trigger",
      width: 150,
      renderCell: (p: GridRenderCellParams<AutomationRow>) => (
        <Chip
          size="small"
          variant="outlined"
          label={TRIGGER_LABEL[p.row.trigger.kind]}
        />
      ),
    },
    {
      field: "stepCount",
      headerName: "Steps",
      width: 130,
      renderCell: (p: GridRenderCellParams<AutomationRow>) => (
        <Typography variant="caption">
          {p.row.stepCount} step{p.row.stepCount === 1 ? "" : "s"} ·{" "}
          {p.row.emailCount} email{p.row.emailCount === 1 ? "" : "s"}
        </Typography>
      ),
    },
    {
      field: "activeEnrollments",
      headerName: "Enrolled",
      width: 90,
      align: "right",
      headerAlign: "right",
    },
    {
      field: "active",
      headerName: "Status",
      width: 110,
      renderCell: (p: GridRenderCellParams<AutomationRow>) => (
        <Chip
          size="small"
          color={p.row.active ? "success" : "default"}
          variant="outlined"
          label={p.row.active ? "Active" : "Paused"}
        />
      ),
    },
    {
      field: "actions",
      headerName: "",
      width: 160,
      sortable: false,
      filterable: false,
      align: "right",
      headerAlign: "right",
      renderCell: (p: GridRenderCellParams<AutomationRow>) => (
        <Box>
          <Tooltip title="Enrollments">
            <IconButton
              size="small"
              component={NextLink}
              href={`/automations/${p.row.id}`}
            >
              <PeopleIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={p.row.active ? "Pause" : "Activate"}>
            <IconButton
              size="small"
              onClick={() =>
                run(
                  () => setAutomationActiveAction(p.row.id, !p.row.active),
                  p.row.active ? "Automation paused" : "Automation activated",
                )
              }
            >
              <PlayArrowIcon fontSize="small" />
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
                    () => archiveAutomationAction(p.row.id),
                    "Automation archived",
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
        title="Email automations"
        subtitle="Build sequences like form → email → tag → wait → email. Emails send through LeadConnector; Lucy runs the timing."
        action={
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={runNow} disabled={pending}>
              Run now
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => {
                setEditRow(null);
                setOpen(true);
              }}
            >
              Add automation
            </Button>
          </Stack>
        }
      />

      {!leadConnectorLive && (
        <Alert severity="info" sx={{ mb: 2 }}>
          LeadConnector isn&apos;t connected — email steps are logged as demo
          sends so you can build and test sequences. Add your API key on{" "}
          <NextLink href="/settings/integrations">Integrations</NextLink> to send
          for real.
        </Alert>
      )}

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

      <AutomationDialog
        key={editRow?.id ?? "new"}
        open={open}
        row={editRow}
        busy={pending}
        forms={forms}
        tags={tags}
        onClose={() => setOpen(false)}
        onSubmit={(vals) => {
          const action = editRow
            ? () => updateAutomationAction(editRow.id, vals)
            : () => createAutomationAction(vals);
          run(action, editRow ? "Automation updated" : "Automation created");
          setOpen(false);
        }}
      />

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

// A local, editable step (same shape as AutomationStep with sensible defaults).
type DraftStep = AutomationStep;

function AutomationDialog({
  open,
  row,
  busy,
  forms,
  tags,
  onClose,
  onSubmit,
}: {
  open: boolean;
  row: AutomationRow | null;
  busy: boolean;
  forms: FormOpt[];
  tags: TagOpt[];
  onClose: () => void;
  onSubmit: (vals: AutomationActionInput) => void;
}) {
  const [name, setName] = React.useState(row?.name ?? "");
  const [description, setDescription] = React.useState(row?.description ?? "");
  const [active, setActive] = React.useState(row?.active ?? true);
  const [triggerKind, setTriggerKind] = React.useState<AutomationTriggerKind>(
    row?.trigger.kind ?? "form_submission",
  );
  const [formId, setFormId] = React.useState(
    row?.trigger.form_id ?? forms[0]?.id ?? "",
  );
  const [tagId, setTagId] = React.useState(
    row?.trigger.tag_id ?? tags[0]?.id ?? "",
  );
  const [steps, setSteps] = React.useState<DraftStep[]>(row?.steps ?? []);
  const [err, setErr] = React.useState<string | null>(null);
  const [addAnchor, setAddAnchor] = React.useState<null | HTMLElement>(null);

  function addStep(type: AutomationStep["type"]) {
    setAddAnchor(null);
    setSteps((s) => {
      if (type === "email")
        return [...s, { type, subject: "", body: "", from_name: "" }];
      if (type === "tag")
        return [...s, { type, tag_id: tags[0]?.id ?? "", action: "add" }];
      return [...s, { type: "wait", minutes: 60 }];
    });
  }

  function updateStep(idx: number, patch: Partial<DraftStep>) {
    setSteps((s) =>
      s.map((step, i) =>
        i === idx ? ({ ...step, ...patch } as DraftStep) : step,
      ),
    );
  }

  function move(idx: number, dir: -1 | 1) {
    setSteps((s) => {
      const next = [...s];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return s;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  function remove(idx: number) {
    setSteps((s) => s.filter((_, i) => i !== idx));
  }

  function submit() {
    if (!name.trim()) {
      setErr("Name is required");
      return;
    }
    if (steps.length === 0) {
      setErr("Add at least one step");
      return;
    }
    for (const [i, step] of steps.entries()) {
      if (step.type === "email" && (!step.subject.trim() || !step.body.trim())) {
        setErr(`Step ${i + 1}: email needs a subject and body`);
        return;
      }
      if (step.type === "tag" && !step.tag_id) {
        setErr(`Step ${i + 1}: choose a tag`);
        return;
      }
      if (step.type === "wait" && (!step.minutes || step.minutes < 1)) {
        setErr(`Step ${i + 1}: wait must be at least 1 minute`);
        return;
      }
    }
    setErr(null);
    const trigger: AutomationTrigger = {
      kind: triggerKind,
      form_id: triggerKind === "form_submission" ? formId : null,
      tag_id: triggerKind === "tag_added" ? tagId : null,
    };
    onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      trigger,
      steps,
      active,
    });
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{row ? "Edit automation" : "Add automation"}</DialogTitle>
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
          <FormControlLabel
            control={
              <Switch
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
            }
            label="Active"
          />

          <Divider textAlign="left">
            <Typography variant="caption" color="text.secondary">
              TRIGGER
            </Typography>
          </Divider>
          <TextField
            select
            label="When this happens"
            value={triggerKind}
            onChange={(e) =>
              setTriggerKind(e.target.value as AutomationTriggerKind)
            }
            fullWidth
          >
            <MenuItem value="form_submission">A form is submitted</MenuItem>
            <MenuItem value="tag_added">A tag is added</MenuItem>
            <MenuItem value="manual">Manual / bulk enroll only</MenuItem>
          </TextField>
          {triggerKind === "form_submission" && (
            <TextField
              select
              label="Form"
              value={formId}
              onChange={(e) => setFormId(e.target.value)}
              fullWidth
              helperText={forms.length ? undefined : "No forms yet"}
            >
              {forms.map((f) => (
                <MenuItem key={f.id} value={f.id}>
                  {f.name}
                </MenuItem>
              ))}
            </TextField>
          )}
          {triggerKind === "tag_added" && (
            <TextField
              select
              label="Tag"
              value={tagId}
              onChange={(e) => setTagId(e.target.value)}
              fullWidth
              helperText={tags.length ? undefined : "No tags yet"}
            >
              {tags.map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.name}
                </MenuItem>
              ))}
            </TextField>
          )}

          <Divider textAlign="left">
            <Typography variant="caption" color="text.secondary">
              STEPS
            </Typography>
          </Divider>

          <Stack spacing={1.5}>
            {steps.map((step, idx) => (
              <StepEditor
                key={idx}
                index={idx}
                step={step}
                tags={tags}
                isFirst={idx === 0}
                isLast={idx === steps.length - 1}
                onChange={(patch) => updateStep(idx, patch)}
                onMove={(dir) => move(idx, dir)}
                onRemove={() => remove(idx)}
              />
            ))}
          </Stack>

          <Box>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={(e) => setAddAnchor(e.currentTarget)}
            >
              Add step
            </Button>
            <Menu
              anchorEl={addAnchor}
              open={!!addAnchor}
              onClose={() => setAddAnchor(null)}
            >
              <MenuItem onClick={() => addStep("email")}>
                <MailOutlineIcon fontSize="small" sx={{ mr: 1 }} /> Send email
              </MenuItem>
              <MenuItem onClick={() => addStep("tag")}>
                <SellIcon fontSize="small" sx={{ mr: 1 }} /> Add / remove tag
              </MenuItem>
              <MenuItem onClick={() => addStep("wait")}>
                <ScheduleIcon fontSize="small" sx={{ mr: 1 }} /> Wait
              </MenuItem>
            </Menu>
          </Box>

          <Typography variant="caption" color="text.secondary">
            Merge fields: <code>{"{{name}}"}</code>, <code>{"{{email}}"}</code>,{" "}
            <code>{"{{custom.key}}"}</code>
          </Typography>

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

function StepEditor({
  index,
  step,
  tags,
  isFirst,
  isLast,
  onChange,
  onMove,
  onRemove,
}: {
  index: number;
  step: DraftStep;
  tags: TagOpt[];
  isFirst: boolean;
  isLast: boolean;
  onChange: (patch: Partial<DraftStep>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const icon =
    step.type === "email" ? (
      <MailOutlineIcon fontSize="small" />
    ) : step.type === "tag" ? (
      <SellIcon fontSize="small" />
    ) : (
      <ScheduleIcon fontSize="small" />
    );

  return (
    <Box
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2,
        p: 1.5,
        bgcolor: (t) => alpha(t.palette.primary.main, 0.03),
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Box sx={{ color: "primary.main", display: "flex" }}>{icon}</Box>
        <Typography variant="body2" sx={{ fontWeight: 600, flexGrow: 1 }}>
          Step {index + 1} ·{" "}
          {step.type === "email"
            ? "Email"
            : step.type === "tag"
              ? "Tag"
              : "Wait"}
        </Typography>
        <IconButton size="small" disabled={isFirst} onClick={() => onMove(-1)}>
          <ArrowUpwardIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" disabled={isLast} onClick={() => onMove(1)}>
          <ArrowDownwardIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={onRemove}>
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Stack>

      {step.type === "email" && (
        <Stack spacing={1.5}>
          <TextField
            label="Subject"
            size="small"
            value={step.subject}
            onChange={(e) => onChange({ subject: e.target.value })}
            fullWidth
          />
          <TextField
            label="Body"
            size="small"
            value={step.body}
            onChange={(e) => onChange({ body: e.target.value })}
            multiline
            minRows={3}
            fullWidth
          />
          <TextField
            label="From name (optional)"
            size="small"
            value={step.from_name ?? ""}
            onChange={(e) => onChange({ from_name: e.target.value })}
            fullWidth
          />
        </Stack>
      )}
      {step.type === "tag" && (
        <Stack direction="row" spacing={1.5}>
          <TextField
            select
            label="Action"
            size="small"
            value={step.action}
            onChange={(e) =>
              onChange({ action: e.target.value as "add" | "remove" })
            }
            sx={{ width: 130 }}
          >
            <MenuItem value="add">Add</MenuItem>
            <MenuItem value="remove">Remove</MenuItem>
          </TextField>
          <TextField
            select
            label="Tag"
            size="small"
            value={step.tag_id}
            onChange={(e) => onChange({ tag_id: e.target.value })}
            fullWidth
          >
            {tags.map((t) => (
              <MenuItem key={t.id} value={t.id}>
                {t.name}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      )}
      {step.type === "wait" && (
        <TextField
          label="Wait (minutes)"
          type="number"
          size="small"
          value={step.minutes}
          onChange={(e) => onChange({ minutes: Number(e.target.value) })}
          helperText="1440 = 1 day"
          sx={{ width: 200 }}
        />
      )}
    </Box>
  );
}
