"use client";

import * as React from "react";
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
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import Switch from "@mui/material/Switch";
import Autocomplete from "@mui/material/Autocomplete";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import type {
  FormFieldDef,
  FormMapping,
  FormMappingTarget,
} from "@/lib/types";
import type { FormRow, TagLite } from "./FormsClient";

// The builder edits three things at once: the field list, how each field maps
// onto a customer, and which tags get applied. Field "key" is auto-derived from
// the label so the embedding site's form names line up predictably.

type FieldType = FormFieldDef["type"];

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  { value: "number", label: "Number" },
  { value: "textarea", label: "Paragraph" },
  { value: "checkbox", label: "Checkbox" },
];

const MAP_OPTIONS: { value: string; label: string }[] = [
  { value: "name", label: "→ Contact name" },
  { value: "email", label: "→ Contact email" },
  { value: "notes", label: "→ Contact notes" },
  { value: "ignore", label: "Don't map (store only)" },
];

interface DraftField extends FormFieldDef {
  map: "name" | "email" | "notes" | "ignore";
}

function keyFromLabel(label: string, existing: string[]): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32) || "field";
  let key = base;
  let i = 1;
  while (existing.includes(key)) key = `${base}_${++i}`;
  return key;
}

function toDraft(row: FormRow | null): DraftField[] {
  if (!row) {
    // Sensible starter: name + email, mapped.
    return [
      { key: "name", label: "Full name", type: "text", required: true, map: "name" },
      { key: "email", label: "Email address", type: "email", required: true, map: "email" },
    ];
  }
  return row.fields.map((f) => {
    const t = row.mapping.fields[f.key];
    const map =
      t?.kind === "customer_field" ? t.field : "ignore";
    return { ...f, map };
  });
}

export default function FormBuilderDialog({
  open,
  row,
  allTags,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  row: FormRow | null;
  allTags: TagLite[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (vals: {
    name: string;
    fields: FormFieldDef[];
    mapping: FormMapping;
    create_customer: boolean;
  }) => void;
}) {
  const [name, setName] = React.useState(row?.name ?? "");
  const [fields, setFields] = React.useState<DraftField[]>(() => toDraft(row));
  const [createCustomer, setCreateCustomer] = React.useState(
    row?.create_customer ?? true,
  );
  const [tags, setTags] = React.useState<TagLite[]>(
    () =>
      row?.mapping.apply_tag_ids
        .map((id) => allTags.find((t) => t.id === id))
        .filter((t): t is TagLite => !!t) ?? [],
  );
  const [err, setErr] = React.useState<string | null>(null);

  function updateField(idx: number, patch: Partial<DraftField>) {
    setFields((fs) => fs.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  }

  function addField() {
    setFields((fs) => [
      ...fs,
      {
        key: keyFromLabel("Field", fs.map((f) => f.key)),
        label: "",
        type: "text",
        required: false,
        map: "ignore",
      },
    ]);
  }

  function removeField(idx: number) {
    setFields((fs) => fs.filter((_, i) => i !== idx));
  }

  function handleSave() {
    const clean = fields
      .map((f) => ({ ...f, label: f.label.trim() }))
      .filter((f) => f.label);
    if (!name.trim()) {
      setErr("Give the form a name");
      return;
    }
    if (clean.length === 0) {
      setErr("Add at least one field with a label");
      return;
    }

    // Re-derive keys from labels to keep them stable & unique.
    const keys: string[] = [];
    const outFields: FormFieldDef[] = [];
    const mappingFields: Record<string, FormMappingTarget> = {};
    for (const f of clean) {
      const key = keyFromLabel(f.label, keys);
      keys.push(key);
      outFields.push({
        key,
        label: f.label,
        type: f.type,
        required: f.required,
      });
      mappingFields[key] =
        f.map === "ignore"
          ? { kind: "ignore" }
          : { kind: "customer_field", field: f.map };
    }

    setErr(null);
    onSubmit({
      name: name.trim(),
      fields: outFields,
      mapping: {
        fields: mappingFields,
        apply_tag_ids: tags.map((t) => t.id),
      },
      create_customer: createCustomer,
    });
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{row ? "Edit form" : "New form"}</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          <TextField
            label="Form name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            fullWidth
            placeholder="e.g. Website Lead Capture"
          />

          <Box>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 1 }}
            >
              <Typography variant="subtitle2">Fields</Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={addField}>
                Add field
              </Button>
            </Stack>
            <Stack spacing={1.5}>
              {fields.map((f, idx) => (
                <Box
                  key={idx}
                  sx={{
                    p: 1.5,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 2,
                  }}
                >
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1.5}
                    alignItems={{ sm: "center" }}
                  >
                    <TextField
                      label="Label"
                      value={f.label}
                      onChange={(e) => updateField(idx, { label: e.target.value })}
                      size="small"
                      sx={{ flex: 1 }}
                    />
                    <TextField
                      select
                      label="Type"
                      value={f.type}
                      onChange={(e) =>
                        updateField(idx, { type: e.target.value as FieldType })
                      }
                      size="small"
                      sx={{ minWidth: 130 }}
                    >
                      {FIELD_TYPES.map((t) => (
                        <MenuItem key={t.value} value={t.value}>
                          {t.label}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      select
                      label="Maps to"
                      value={f.map}
                      onChange={(e) =>
                        updateField(idx, {
                          map: e.target.value as DraftField["map"],
                        })
                      }
                      size="small"
                      sx={{ minWidth: 190 }}
                    >
                      {MAP_OPTIONS.map((o) => (
                        <MenuItem key={o.value} value={o.value}>
                          {o.label}
                        </MenuItem>
                      ))}
                    </TextField>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={f.required}
                          onChange={(e) =>
                            updateField(idx, { required: e.target.checked })
                          }
                          size="small"
                        />
                      }
                      label="Req."
                    />
                    <Tooltip title="Remove field">
                      <IconButton size="small" onClick={() => removeField(idx)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Box>
              ))}
            </Stack>
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              On submit
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={createCustomer}
                  onChange={(e) => setCreateCustomer(e.target.checked)}
                />
              }
              label="Create or update a contact from each submission"
            />
            <Autocomplete
              multiple
              options={allTags}
              value={tags}
              onChange={(_, v) => setTags(v)}
              getOptionLabel={(o) => o.name}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              sx={{ mt: 2 }}
              disabled={!createCustomer}
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
                  label="Apply these tags to new contacts"
                  placeholder="Choose tags…"
                />
              )}
            />
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
        <Button variant="contained" disabled={busy} onClick={handleSave}>
          {row ? "Save form" : "Create form"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
