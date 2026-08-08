import { getStore } from "@/lib/store";
import { getProject, DEMO_PROJECT } from "@/lib/config";
import { ok, fail } from "@/lib/api";
import { analyzeUnmerged } from "@/lib/git-unmerged";
import type { UnmergedResponse } from "@/lib/unmerged-types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string }> };

// The analysis fans out into dozens of read-only git subprocesses, so results
// are cached briefly; `?refresh=1` (the panel's refresh button) busts it.
const TTL_MS = 60000;
const cache = new Map<string, { at: number; data: UnmergedResponse }>();

export async function GET(req: Request, { params }: Ctx) {
  try {
    const { projectId } = await params;
    const project = getProject(projectId);
    if (projectId === DEMO_PROJECT.id || !project || project.path === null) {
      return ok({
        available: false,
        reason: "Unmerged-work analysis needs a real project folder (not Demo).",
        branches: [],
        pairs: [],
        similarOpenBeads: [],
        notes: [],
      } satisfies UnmergedResponse);
    }

    const refresh = new URL(req.url).searchParams.get("refresh") === "1";
    const hit = cache.get(projectId);
    if (!refresh && hit && Date.now() - hit.at < TTL_MS) {
      return ok(hit.data);
    }

    const store = await getStore(projectId);
    const beads = await store.list();
    const data = await analyzeUnmerged(project.path, beads);
    cache.set(projectId, { at: Date.now(), data });
    return ok(data);
  } catch (e) {
    return fail(e);
  }
}
