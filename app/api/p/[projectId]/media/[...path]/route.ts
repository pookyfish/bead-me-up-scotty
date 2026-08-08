import "server-only";
import fs from "node:fs";
import path from "node:path";
import { getProject, DEMO_PROJECT, ConfigError } from "@/lib/config";
import { fail } from "@/lib/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string; path: string[] }> };

/**
 * Read-only media serving from INSIDE the project repo, so bead descriptions
 * can reference existing design files (mockups, spritesheets, GIFs, capture
 * clips) by plain repo-relative path — `![shelf](design/shelf-mockup.png)` —
 * without re-uploading them as attachments. Deliberately restricted to media
 * extensions: this must not become a general file server for the repo.
 */
const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { projectId, path: segments } = await params;
    if (projectId === DEMO_PROJECT.id) {
      return new Response("Not found", { status: 404 });
    }
    const project = getProject(projectId);
    if (!project || project.path === null) {
      throw new ConfigError(`Unknown project: ${projectId}`, "unknown_project");
    }

    const base = path.resolve(project.path);
    const full = path.resolve(base, ...(segments ?? []));
    // SECURITY: the resolved path must stay inside the project repo.
    if (full !== base && !full.startsWith(base + path.sep)) {
      return new Response("Forbidden", { status: 403 });
    }

    const ext = path.extname(full).toLowerCase();
    const type = MIME[ext];
    if (!type) {
      return new Response("Unsupported media type", { status: 415 });
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(full);
    } catch {
      return new Response("Not found", { status: 404 });
    }
    if (!stat.isFile()) {
      return new Response("Not found", { status: 404 });
    }

    const data = fs.readFileSync(full);
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": type,
        "Cache-Control": "private, max-age=300",
        "Content-Length": String(stat.size),
      },
    });
  } catch (e) {
    return fail(e);
  }
}
