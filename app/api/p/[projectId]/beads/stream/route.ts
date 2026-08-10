import { fail } from "../../../../../../lib/api";
import { subscribeBeadsChange } from "../../../../../../lib/beads-watch";
import { ConfigError, getProject } from "../../../../../../lib/config";
import { createSignalSseResponse } from "../../../../../../lib/signal-sse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ projectId: string }> };

/**
 * Server-Sent Events stream of beads changes for a project.
 *
 * The server watches the project's `.beads/` directory (see lib/beads-watch)
 * and emits a `change` event whenever it mutates. The client reacts by
 * refetching `/api/p/<projectId>/beads`, so this stream is signal-only — it
 * carries no bead data of its own.
 */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { projectId } = await params;
    const project = getProject(projectId);
    if (!project) throw new ConfigError(`Unknown project: ${projectId}`, "unknown_project");
    if (project.path === null) return new Response(null, { status: 204 });
    return createSignalSseResponse(req, (emit) =>
      subscribeBeadsChange(projectId, () => emit("1")),
    );
  } catch (error) {
    return fail(error);
  }
}
