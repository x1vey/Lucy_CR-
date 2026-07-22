import Box from "@mui/material/Box";
import { listTagHistory, listTags } from "@/lib/db";
import TagHistoryClient, { type TagActivityRow } from "./TagHistoryClient";

export const dynamic = "force-dynamic";

export default async function TagHistoryPage() {
  const [history, tags] = await Promise.all([listTagHistory(), listTags()]);
  const colorById = new Map(tags.map((t) => [t.id, t.color]));

  const rows: TagActivityRow[] = history.map((h) => ({
    id: h.id,
    action: h.action,
    tag_id: h.tag_id ?? "",
    tag_name: h.tag_name,
    tag_color: (h.tag_id && colorById.get(h.tag_id)) || "#6366f1",
    customer_name: h.customer_name,
    created_at: h.created_at,
  }));

  return (
    <Box>
      <TagHistoryClient
        rows={rows}
        tags={tags.map((t) => ({ id: t.id, name: t.name }))}
      />
    </Box>
  );
}
