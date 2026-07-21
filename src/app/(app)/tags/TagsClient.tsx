"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import NextLink from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
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
import HistoryIcon from "@mui/icons-material/History";
import PageHeader from "@/components/PageHeader";
import {
  archiveTagAction,
  createTagAction,
  updateTagAction,
} from "../actions";

export interface TagRow {
  id: string;
  name: string;
  color: string;
  count: number;
}

type Toast = { severity: "success" | "error"; msg: string } | null;

// A small, friendly swatch set. Users can still type any hex.
const PRESET_COLORS = [
  "#4f46e5",
  "#2a78d6",
  "#1baf7a",
  "#eda100",
  "#eb6834",
  "#e34948",
  "#e87ba4",
  "#4a3aa7",
  "#0ea5e9",
  "#64748b",
];

export default function TagsClient({ rows }: { rows: TagRow[] }) {
  const router = useRouter();
  const [toast, setToast] = React.useState<Toast>(null);
  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  const [editRow, setEditRow] = React.useState<TagRow | null>(null);

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

  return (
    <Box>
      <PageHeader
        title="Tags"
        subtitle="Label contacts however you like. Tags applied by forms are managed here too."
        action={
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              component={NextLink}
              href="/tags/history"
              startIcon={<HistoryIcon />}
            >
              Tag activity
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => {
                setEditRow(null);
                setOpen(true);
              }}
            >
              New tag
            </Button>
          </Stack>
        }
      />

      {rows.length === 0 ? (
        <Card>
          <CardContent>
            <Typography variant="body2" color="text.secondary">
              No tags yet. Create your first tag to start labelling contacts.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "1fr 1fr",
              md: "repeat(3, 1fr)",
            },
            gap: 2,
          }}
        >
          {rows.map((t) => (
            <Card key={t.id}>
              <CardContent
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 1,
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Chip
                    label={t.name}
                    size="small"
                    sx={{ bgcolor: t.color, color: "#fff", fontWeight: 600 }}
                  />
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mt: 1 }}
                  >
                    {t.count} {t.count === 1 ? "contact" : "contacts"}
                  </Typography>
                </Box>
                <Box sx={{ flexShrink: 0 }}>
                  <Tooltip title="Edit">
                    <IconButton
                      size="small"
                      onClick={() => {
                        setEditRow(t);
                        setOpen(true);
                      }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete tag">
                    <IconButton
                      size="small"
                      onClick={() => {
                        if (
                          confirm(
                            `Delete "${t.name}"? It will be removed from ${t.count} contact(s).`,
                          )
                        ) {
                          run(() => archiveTagAction(t.id), "Tag deleted");
                        }
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      <TagDialog
        key={editRow?.id ?? "new"}
        open={open}
        row={editRow}
        busy={pending}
        onClose={() => setOpen(false)}
        onSubmit={(vals) => {
          const action = editRow
            ? () => updateTagAction(editRow.id, vals)
            : () => createTagAction(vals);
          run(action, editRow ? "Tag updated" : "Tag created");
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

function TagDialog({
  open,
  row,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  row: TagRow | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (vals: { name: string; color: string }) => void;
}) {
  const [name, setName] = React.useState(row?.name ?? "");
  const [color, setColor] = React.useState(row?.color ?? PRESET_COLORS[0]);
  const [err, setErr] = React.useState<string | null>(null);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{row ? "Edit tag" : "New tag"}</DialogTitle>
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
          <Box>
            <Typography variant="caption" color="text.secondary">
              Color
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
              {PRESET_COLORS.map((c) => (
                <Box
                  key={c}
                  onClick={() => setColor(c)}
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    bgcolor: c,
                    cursor: "pointer",
                    border: "2px solid",
                    borderColor: color === c ? "text.primary" : "transparent",
                    boxShadow: color === c ? 2 : 0,
                  }}
                />
              ))}
            </Stack>
            <TextField
              label="Hex"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              size="small"
              sx={{ mt: 2, width: 140 }}
              inputProps={{ maxLength: 7 }}
            />
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Preview
            </Typography>
            <Box sx={{ mt: 0.5 }}>
              <Chip
                label={name || "Tag name"}
                size="small"
                sx={{ bgcolor: color, color: "#fff", fontWeight: 600 }}
              />
            </Box>
          </Box>
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
            if (!/^#([0-9a-fA-F]{6})$/.test(color)) {
              setErr("Color must be a 6-digit hex like #4f46e5");
              return;
            }
            setErr(null);
            onSubmit({ name: name.trim(), color });
          }}
        >
          {row ? "Save" : "Create"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
