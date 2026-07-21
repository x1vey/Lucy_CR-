import Box from "@mui/material/Box";
import { listTagActivity, listTags } from "@/lib/db";
import TagHistoryClient, { type TagActivityRow } from "./TagHistoryClient";

export const dynamic = "force-dynamic";

export default async function TagHistoryPage() {
  const [activity, tags] = await Promise.all([listTagActivity(), listTags()]);

  const rows: TagActivityRow[] = activity.map((a) => ({
    id: a.id,
    kind: a.kind,
    tag_id: a.tag_id,
    tag_name: a.name,
    tag_color: a.color,
    who_names: a.who_names,
    created_at: a.created_at,
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
