import { fail, ok } from "../../../../../lib/api";
import { buildControlPlaneSnapshot } from "../../../../../lib/control-plane/snapshot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ projectId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { projectId } = await params;
    return ok(await buildControlPlaneSnapshot(projectId));
  } catch (error) {
    return fail(error);
  }
}
