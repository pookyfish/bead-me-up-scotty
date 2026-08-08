/**
 * Wire types for the Unmerged Work panel, shared by the client and
 * lib/git-unmerged.ts (server) so they can't drift apart — same pattern as
 * lib/update-types.ts.
 *
 * The panel answers the multi-agent pain this fork exists for: features get
 * finished on parallel branches and then lost unmerged. It lists every local
 * branch not merged into the base ref, links each to its bead, and flags the
 * lethal combo (bead CLOSED but the branch never merged).
 */

export interface ChangedFile {
  path: string;
  /** Single-letter git status vs the merge-base: A/M/D/R/C/T. */
  status: string;
}

export type ConflictState = "clean" | "conflicts" | "unknown";

export interface BranchBeadLink {
  id: string;
  title: string;
  status: string;
  /** How the link was made: the bead id appeared verbatim ("id") or the
   *  branch/commit words overlapped the bead title ("fuzzy"). */
  match: "id" | "fuzzy";
}

export interface UnmergedBranch {
  name: string;
  sha: string;
  /** ISO committer date of the branch tip. */
  committedAt: string;
  /** Subject of the tip commit. */
  subject: string;
  /** Commits ahead of the base ref. */
  aheadCount: number;
  /** Files changed vs the merge-base (capped; see filesTruncated). */
  changedFiles: ChangedFile[];
  filesTruncated: boolean;
  /** Trial-merge result vs the base ref (git merge-tree, in-memory only). */
  conflict: { state: ConflictState; files: string[] };
  bead: BranchBeadLink | null;
  /** RED: the linked bead is closed but this branch was never merged. */
  closedBeadUnmerged: boolean;
  /** Branch name says it's deliberately unmerged (UNREVIEWED / DO NOT MERGE / wip…). */
  deliberateHint: boolean;
  /** Build-alongside signature: the diff ONLY adds files (possible parallel system). */
  buildAlongside: boolean;
  /** Branches whose diffs touch overlapping files share a clusterId; -1 = unclustered. */
  clusterId: number;
}

export interface PairConflict {
  a: string;
  b: string;
  state: ConflictState;
  files: string[];
  /** The changed files the two branches have in common (why the pair was tested). */
  overlap: string[];
}

export interface SimilarPair {
  aId: string;
  aTitle: string;
  bId: string;
  bTitle: string;
  /** Title-token overlap score in (0, 1]. */
  score: number;
}

export interface UnmergedResponse {
  available: boolean;
  /** Set when unavailable: demo project, no git repo, git missing, etc. */
  reason?: string;
  baseRef?: string;
  generatedAt?: string;
  branches: UnmergedBranch[];
  pairs: PairConflict[];
  /** Open beads with near-duplicate titles (possible duplicate-system work). */
  similarOpenBeads: SimilarPair[];
  /** Human-readable notes about any caps applied — no silent truncation. */
  notes: string[];
}
