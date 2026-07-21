"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import CodeIcon from "@mui/icons-material/Code";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PageHeader from "@/components/PageHeader";
import type { FormFieldDef, FormMapping } from "@/lib/types";
import {
  archiveFormAction,
  createFormAction,
  setFormActiveAction,
  updateFormAction,
} from "../actions";
import FormBuilderDialog from "./FormBuilderDialog";
import EmbedDialog from "./EmbedDialog";

export interface TagLite {
  id: string;
  name: string;
  color: string;
}

export interface FormRow {
  id: string;
  name: string;
  slug: string;
  token: string;
  fields: FormFieldDef[];
  mapping: FormMapping;
  create_customer: boolean;
  active: boolean;
  submissions: number;
}

type Toast = { severity: "success" | "error"; msg: string } | null;

export default function FormsClient({
  rows,
  allTags,
  appUrl,
}: {
  rows: FormRow[];
  allTags: TagLite[];
  appUrl: string;
}) {
  const router = useRouter();
  const [toast, setToast] = React.useState<Toast>(null);
  const [pending, startTransition] = React.useTransition();

  const [builderOpen, setBuilderOpen] = React.useState(false);
  const [editRow, setEditRow] = React.useState<FormRow | null>(null);
  const [embedRow, setEmbedRow] = React.useState<FormRow | null>(null);

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
        title="Forms"
        subtitle="Build a form, embed it anywhere, and captured submissions flow straight into Contacts."
        action={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setEditRow(null);
              setBuilderOpen(true);
            }}
          >
            New form
          </Button>
        }
      />

      {rows.length === 0 ? (
        <Card>
          <CardContent>
            <Typography variant="body2" color="text.secondary">
              No forms yet. Create one to start capturing leads from your
              website.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Stack spacing={2}>
          {rows.map((f) => (
            <Card key={f.id}>
              <CardContent
                sx={{
                  display: "flex",
                  alignItems: { xs: "flex-start", sm: "center" },
                  justifyContent: "space-between",
                  flexDirection: { xs: "column", sm: "row" },
                  gap: 2,
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="h6">{f.name}</Typography>
                    <Chip
                      size="small"
                      label={f.active ? "Active" : "Inactive"}
                      color={f.active ? "success" : "default"}
                      variant="outlined"
                    />
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {f.fields.length} field{f.fields.length === 1 ? "" : "s"} ·{" "}
                    {f.submissions} submission{f.submissions === 1 ? "" : "s"} ·{" "}
                    /f/{f.slug}
                  </Typography>
                  {f.mapping.apply_tag_ids.length > 0 && (
                    <Stack direction="row" spacing={0.5} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                      {f.mapping.apply_tag_ids.map((id) => {
                        const t = allTags.find((x) => x.id === id);
                        if (!t) return null;
                        return (
                          <Chip
                            key={id}
                            label={t.name}
                            size="small"
                            sx={{ bgcolor: t.color, color: "#fff", fontWeight: 600 }}
                          />
                        );
                      })}
                    </Stack>
                  )}
                </Box>

                <Stack direction="row" spacing={0.5} alignItems="center">
                  <Tooltip title={f.active ? "Deactivate" : "Activate"}>
                    <Switch
                      checked={f.active}
                      onChange={(e) =>
                        run(
                          () => setFormActiveAction(f.id, e.target.checked),
                          e.target.checked ? "Form activated" : "Form deactivated",
                        )
                      }
                    />
                  </Tooltip>
                  <Tooltip title="Embed code">
                    <IconButton onClick={() => setEmbedRow(f)}>
                      <CodeIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Open form">
                    <IconButton
                      component="a"
                      href={`/f/${f.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <OpenInNewIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Edit">
                    <IconButton
                      onClick={() => {
                        setEditRow(f);
                        setBuilderOpen(true);
                      }}
                    >
                      <EditIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Archive">
                    <IconButton
                      onClick={() => {
                        if (confirm(`Archive "${f.name}"?`)) {
                          run(() => archiveFormAction(f.id), "Form archived");
                        }
                      }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      <FormBuilderDialog
        key={editRow?.id ?? "new"}
        open={builderOpen}
        row={editRow}
        allTags={allTags}
        busy={pending}
        onClose={() => setBuilderOpen(false)}
        onSubmit={(vals) => {
          const action = editRow
            ? () =>
                updateFormAction(editRow.id, {
                  ...vals,
                  active: editRow.active,
                })
            : () => createFormAction(vals);
          run(action, editRow ? "Form saved" : "Form created");
          setBuilderOpen(false);
        }}
      />

      <EmbedDialog
        open={!!embedRow}
        form={embedRow}
        appUrl={appUrl}
        onClose={() => setEmbedRow(null)}
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
