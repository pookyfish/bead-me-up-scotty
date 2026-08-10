import { fail } from "../../../../../../lib/api";
import { ConfigError, getProject } from "../../../../../../lib/config";
import { subscribeOrchestraChange } from "../../../../../../lib/orchestra-watch";
import { createSignalSseResponse } from "../../../../../../lib/signal-sse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ projectId: string }> };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const { projectId } = await params;
    const project = getProject(projectId);
    if (!project) throw new ConfigError(`Unknown project: ${projectId}`, "unknown_project");
    if (project.path === null) return new Response(null, { status: 204 });
    return createSignalSseResponse(req, (emit) =>
      subscribeOrchestraChange(projectId, () => emit("orchestra")),
    );
  } catch (error) {
    return fail(error);
  }
}
