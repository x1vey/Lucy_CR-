import Box from "@mui/material/Box";
import { listTags, tagUsageCounts } from "@/lib/db";
import TagsClient, { type TagRow } from "./TagsClient";

export const dynamic = "force-dynamic";

export default async function TagsPage() {
  const [tags, counts] = await Promise.all([listTags(), tagUsageCounts()]);

  const rows: TagRow[] = tags.map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
    count: counts[t.id] ?? 0,
  }));

  return (
    <Box>
      <TagsClient rows={rows} />
    </Box>
  );
}
