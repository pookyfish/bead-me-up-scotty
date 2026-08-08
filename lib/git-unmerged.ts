import "server-only";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Bead } from "./schema";
import type {
  ChangedFile,
  ConflictState,
  PairConflict,
  SimilarPair,
  UnmergedBranch,
  UnmergedResponse,
} from "./unmerged-types";

/**
 * Unmerged-work analysis for a beads project that is also a git repo.
 *
 * Everything here is READ-ONLY git: for-each-ref, rev-list, log, diff, and
 * `merge-tree --write-tree`, which trial-merges entirely in the object
 * database — it never touches the working tree, the index, or any ref. That
 * matters because the repos this points at have live agent sessions working
 * in the same checkout.
 */

const GIT_TIMEOUT_MS = 15000;
const MAX_DETAILED_BRANCHES = 40;
const MAX_FILES_PER_BRANCH = 400;
const MAX_PAIRWISE = 60;
const MAX_SIMILAR_PAIRS = 20;

/** Files that overlap on nearly every branch and would glue all clusters together. */
const NOISE_FILES = new Set([
  "package-lock.json",
  "MEMORY.md",
  ".claude/settings.local.json",
]);

const STOPWORDS = new Set([
  "feature", "feat", "fix", "quick", "codex", "claude", "agent", "branch",
  "the", "and", "for", "with", "from", "into", "not", "new", "add", "adds",
  "wip", "work", "update", "updates",
]);

interface GitResult {
  code: number;
  stdout: string;
}

function runGit(repo: string, args: string[]): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["-C", repo, ...args],
      { timeout: GIT_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        if (err && typeof (err as NodeJS.ErrnoException & { code?: unknown }).code !== "number") {
          // Spawn failure (git missing) or timeout — not a normal nonzero exit.
          reject(err instanceof Error ? err : new Error(String(err)));
          return;
        }
        const code = err ? ((err as unknown as { code: number }).code ?? 1) : 0;
        resolve({ code, stdout: String(stdout) });
      },
    );
  });
}

async function detectBaseRef(repo: string): Promise<string | null> {
  for (const ref of ["origin/master", "origin/main", "master", "main"]) {
    const r = await runGit(repo, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
    if (r.code === 0) return ref;
  }
  return null;
}

/** Trial-merge two commits in-memory. Exit 0 = clean, 1 = conflicts. */
async function trialMerge(
  repo: string,
  a: string,
  b: string,
): Promise<{ state: ConflictState; files: string[] }> {
  const r = await runGit(repo, [
    "merge-tree", "--write-tree", "--name-only", "--no-messages", a, b,
  ]);
  if (r.code === 0) return { state: "clean", files: [] };
  if (r.code === 1) {
    // Output: tree OID on line 1, then one conflicted filename per line.
    const files = r.stdout.split("\n").slice(1).map((s) => s.trim()).filter(Boolean);
    return { state: "conflicts", files };
  }
  // Old git without --write-tree, unrelated histories, etc.
  return { state: "unknown", files: [] };
}

function parseNameStatus(out: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const status = (parts[0] ?? "").charAt(0);
    // Renames/copies list old\tnew — the new path is the one that exists.
    const p = (status === "R" || status === "C" ? parts[2] : parts[1]) ?? "";
    if (status && p) files.push({ path: p, status });
  }
  return files;
}

function tokens(s: string): Set<string> {
  const out = new Set<string>();
  for (const t of s.toLowerCase().split(/[^a-z0-9]+/)) {
    if (t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t)) out.add(t);
  }
  return out;
}

function overlapScore(a: Set<string>, b: Set<string>): { shared: number; score: number } {
  if (!a.size || !b.size) return { shared: 0, score: 0 };
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return { shared, score: shared / Math.min(a.size, b.size) };
}

const DELIBERATE = /unreviewed|do[-_ ]?not[-_ ]?merge|\bwip\b|fossil|superseded|abandon/i;

interface BranchRaw {
  name: string;
  sha: string;
  committedAt: string;
  subject: string;
}

function matchBead(
  branch: string,
  subjects: string[],
  beads: Bead[],
): UnmergedBranch["bead"] {
  const haystack = `${branch}\n${subjects.join("\n")}`.toLowerCase();

  // Pass 1 — explicit id: the full bead id, or its final segment as a whole
  // word (agents often name branches with just the suffix, e.g. "uye4x").
  const idHits: { bead: Bead; exact: boolean }[] = [];
  for (const b of beads) {
    const id = b.id.toLowerCase();
    if (haystack.includes(id)) {
      idHits.push({ bead: b, exact: true });
      continue;
    }
    const suffix = id.split("-").pop() ?? "";
    if (suffix.length >= 4 && new RegExp(`\\b${suffix}\\b`).test(haystack)) {
      idHits.push({ bead: b, exact: false });
    }
  }
  if (idHits.length) {
    // Prefer verbatim id hits, then open beads over closed ones.
    idHits.sort(
      (x, y) =>
        Number(y.exact) - Number(x.exact) ||
        Number(x.bead.status === "closed") - Number(y.bead.status === "closed"),
    );
    const b = idHits[0].bead;
    return { id: b.id, title: b.title, status: b.status, match: "id" };
  }

  // Pass 2 — fuzzy: branch-name words vs bead-title words.
  const branchTail = branch.split("/").pop() ?? branch;
  const bt = tokens(`${branchTail} ${subjects[0] ?? ""}`);
  let best: { bead: Bead; score: number } | null = null;
  for (const b of beads) {
    const { shared, score } = overlapScore(bt, tokens(b.title));
    if (shared >= 2 && score >= 0.5 && (!best || score > best.score)) {
      best = { bead: b, score };
    }
  }
  if (best) {
    const b = best.bead;
    return { id: b.id, title: b.title, status: b.status, match: "fuzzy" };
  }
  return null;
}

/** Union-find clustering of branches that touch overlapping files (5b). */
function clusterBranches(fileSets: Map<string, Set<string>>): Map<string, number> {
  const names = [...fileSets.keys()];
  const parent = names.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = fileSets.get(names[i])!, b = fileSets.get(names[j])!;
      for (const f of a) {
        if (b.has(f)) {
          union(i, j);
          break;
        }
      }
    }
  }
  // Only clusters with 2+ members get an id; singletons stay -1.
  const sizes = new Map<number, number>();
  for (let i = 0; i < names.length; i++) sizes.set(find(i), (sizes.get(find(i)) ?? 0) + 1);
  const idByRoot = new Map<number, number>();
  let next = 0;
  const out = new Map<string, number>();
  for (let i = 0; i < names.length; i++) {
    const root = find(i);
    if ((sizes.get(root) ?? 0) < 2) {
      out.set(names[i], -1);
      continue;
    }
    if (!idByRoot.has(root)) idByRoot.set(root, next++);
    out.set(names[i], idByRoot.get(root)!);
  }
  return out;
}

/** Open beads with near-duplicate titles — the duplicate-system smell (5c). */
function similarOpenBeads(beads: Bead[]): SimilarPair[] {
  const open = beads.filter((b) => b.status !== "closed");
  if (open.length > 400) return []; // quadratic guard; noted by the caller
  const toks = open.map((b) => tokens(b.title));
  const pairs: SimilarPair[] = [];
  for (let i = 0; i < open.length; i++) {
    for (let j = i + 1; j < open.length; j++) {
      const { shared, score } = overlapScore(toks[i], toks[j]);
      if (shared >= 2 && score >= 0.6) {
        pairs.push({
          aId: open[i].id, aTitle: open[i].title,
          bId: open[j].id, bTitle: open[j].title,
          score: Math.round(score * 100) / 100,
        });
      }
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  return pairs.slice(0, MAX_SIMILAR_PAIRS);
}

export async function analyzeUnmerged(repoPath: string, beads: Bead[]): Promise<UnmergedResponse> {
  const notes: string[] = [];
  const empty = (reason: string): UnmergedResponse => ({
    available: false, reason, branches: [], pairs: [], similarOpenBeads: [], notes,
  });

  if (!fs.existsSync(path.join(repoPath, ".git"))) {
    return empty("This project folder is not a git repository.");
  }
  let baseRef: string | null;
  try {
    baseRef = await detectBaseRef(repoPath);
  } catch {
    return empty("git is not available on PATH.");
  }
  if (!baseRef) {
    return empty("No master/main base ref found (tried origin/master, origin/main, master, main).");
  }

  const list = await runGit(repoPath, [
    "for-each-ref", "refs/heads", "--no-merged", baseRef, "--sort=-committerdate",
    "--format=%(refname:short)%09%(objectname:short)%09%(committerdate:iso8601-strict)%09%(contents:subject)",
  ]);
  const raws: BranchRaw[] = list.stdout
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      const [name, sha, committedAt, ...rest] = l.split("\t");
      return { name, sha, committedAt, subject: rest.join("\t") };
    })
    // The base's local twin being behind origin is sync noise, not lost work.
    .filter((b) => b.name !== "master" && b.name !== "main");

  const detailed = raws.slice(0, MAX_DETAILED_BRANCHES);
  if (raws.length > detailed.length) {
    notes.push(
      `Showing the ${MAX_DETAILED_BRANCHES} most recent of ${raws.length} unmerged branches.`,
    );
  }

  const branches: UnmergedBranch[] = [];
  const fileSets = new Map<string, Set<string>>();
  for (const raw of detailed) {
    const [ahead, subjects, diff, conflict] = await Promise.all([
      runGit(repoPath, ["rev-list", "--count", `${baseRef}..${raw.name}`]),
      runGit(repoPath, ["log", "--format=%s", "-n", "30", `${baseRef}..${raw.name}`]),
      runGit(repoPath, ["diff", "--name-status", `${baseRef}...${raw.name}`]),
      trialMerge(repoPath, baseRef, raw.name),
    ]);

    const allFiles = parseNameStatus(diff.stdout);
    const changedFiles = allFiles.slice(0, MAX_FILES_PER_BRANCH);
    const subjectLines = subjects.stdout.split("\n").filter(Boolean);
    const bead = matchBead(raw.name, subjectLines, beads);
    const nonNoise = allFiles.filter((f) => !NOISE_FILES.has(f.path));

    branches.push({
      name: raw.name,
      sha: raw.sha,
      committedAt: raw.committedAt,
      subject: raw.subject,
      aheadCount: Number(ahead.stdout.trim()) || 0,
      changedFiles,
      filesTruncated: allFiles.length > changedFiles.length,
      conflict,
      bead,
      closedBeadUnmerged: bead?.status === "closed",
      deliberateHint: DELIBERATE.test(raw.name),
      buildAlongside:
        nonNoise.length >= 3 && nonNoise.every((f) => f.status === "A"),
      clusterId: -1,
    });
    fileSets.set(raw.name, new Set(nonNoise.map((f) => f.path)));
  }

  const clusters = clusterBranches(fileSets);
  for (const b of branches) b.clusterId = clusters.get(b.name) ?? -1;

  // Pairwise trial merges between unmerged branches that touch the same files
  // (5a) — catches branch-vs-branch fights before either reaches master.
  const candidates: { a: string; b: string; overlap: string[] }[] = [];
  for (let i = 0; i < branches.length; i++) {
    for (let j = i + 1; j < branches.length; j++) {
      const fa = fileSets.get(branches[i].name)!, fb = fileSets.get(branches[j].name)!;
      const overlap = [...fa].filter((f) => fb.has(f));
      if (overlap.length) candidates.push({ a: branches[i].name, b: branches[j].name, overlap });
    }
  }
  candidates.sort((x, y) => y.overlap.length - x.overlap.length);
  if (candidates.length > MAX_PAIRWISE) {
    notes.push(
      `Trial-merged the ${MAX_PAIRWISE} most-overlapping of ${candidates.length} branch pairs.`,
    );
  }
  const pairs: PairConflict[] = [];
  for (const c of candidates.slice(0, MAX_PAIRWISE)) {
    const r = await trialMerge(repoPath, c.a, c.b);
    pairs.push({ a: c.a, b: c.b, state: r.state, files: r.files, overlap: c.overlap.slice(0, 40) });
  }

  const similar = similarOpenBeads(beads);
  if (beads.filter((b) => b.status !== "closed").length > 400) {
    notes.push("Too many open beads for title-similarity scan (cap 400) — skipped.");
  }

  return {
    available: true,
    baseRef,
    generatedAt: new Date().toISOString(),
    branches,
    pairs,
    similarOpenBeads: similar,
    notes,
  };
}
