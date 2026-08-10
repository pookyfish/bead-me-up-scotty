import "server-only";

import { readFile as nodeReadFile } from "node:fs/promises";
import path from "node:path";
import {
  availableObservation,
  failedObservation,
  hookCoverageSnapshotSchema,
  type HookCoverageSnapshot,
  type HookReference,
  type Observation,
} from "./types";

const AUTHORITY = "project-hook-configuration";
const CAPABILITIES = ["observe-project-hook-configuration"];

type HookProvider = HookReference["provider"];
type FileScope = HookReference["fileScope"];

export interface HookCoverageDependencies {
  readFile?: (file: string) => Promise<string>;
  now?: () => Date;
}

interface ParsedConfig {
  present: boolean;
  references: Array<Omit<HookReference, "fileRef" | "fileScope" | "exists"> & {
    candidate: string | null;
  }>;
  failure: "parse_error" | "unavailable" | null;
}

interface CheckedReferences {
  references: HookReference[];
  missingConfiguredFiles: string[];
  unavailable: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === "string" ? error.code : undefined;
}

function usesWindowsPaths(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\");
}

function pathApiFor(projectPath: string, candidate = "") {
  return usesWindowsPaths(projectPath) || usesWindowsPaths(candidate) ? path.win32 : path.posix;
}

function tokenize(command: string): string[] {
  const tokens: string[] = [];
  const matcher = /(?:[^\s"']+|"[^"]*"|'[^']*')+/g;
  for (const match of command.matchAll(matcher)) {
    const token = match[0].replace(/^(?:"|')|(?:"|')$/g, "");
    if (token) tokens.push(token);
  }
  return tokens;
}

function isEnvironmentAssignment(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(value);
}

function executableIndex(tokens: string[]): number {
  let index = 0;
  if (tokens[index]?.toLowerCase() === "env") index += 1;
  while (tokens[index] && isEnvironmentAssignment(tokens[index])) index += 1;
  return index;
}

function executableBasename(tokens: string[]): string | null {
  const index = executableIndex(tokens);
  const executable = tokens[index];
  if (!executable || executable.startsWith("$") || executable.startsWith("%")) return null;
  const api = pathApiFor(executable, executable);
  return api.basename(executable) || null;
}

const INLINE_CODE_OPTIONS = new Set(["-e", "--eval", "-c", "--command"]);
const FILE_ARGUMENT_OPTIONS = new Set(["-file", "--file"]);

function looksLikeFileArgument(value: string): boolean {
  if (!value || /[()[\]{};&|`]/.test(value)) return false;
  return value.startsWith("./") ||
    value.startsWith(".\\") ||
    value.startsWith("../") ||
    value.startsWith("..\\") ||
    value.startsWith(".claude/") ||
    value.startsWith(".claude\\") ||
    value.startsWith(".codex/") ||
    value.startsWith(".codex\\") ||
    value.startsWith("/") ||
    value.startsWith("\\") ||
    value.includes("/") ||
    value.includes("\\") ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.startsWith("~") ||
    value.startsWith("$") ||
    value.startsWith("%");
}

function referenceCandidate(tokens: string[]): string | null {
  const index = executableIndex(tokens);
  if (looksLikeFileArgument(tokens[index] ?? "")) return tokens[index];
  const next = tokens[index + 1];
  if (!next || INLINE_CODE_OPTIONS.has(next.toLowerCase())) return null;
  if (FILE_ARGUMENT_OPTIONS.has(next.toLowerCase())) {
    const fileArgument = tokens[index + 2];
    return looksLikeFileArgument(fileArgument ?? "") ? fileArgument : null;
  }
  return !next.startsWith("-") && looksLikeFileArgument(next) ? next : null;
}

function parseCommand(provider: HookProvider, event: string, command: string) {
  const tokens = tokenize(command);
  return {
    provider,
    event,
    executableBasename: executableBasename(tokens),
    candidate: referenceCandidate(tokens),
  };
}

function parseConfig(provider: HookProvider, text: string): ParsedConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { present: true, references: [], failure: "parse_error" };
  }
  if (!isRecord(raw) || (raw.hooks !== undefined && !isRecord(raw.hooks))) {
    return { present: true, references: [], failure: "parse_error" };
  }

  const references: ParsedConfig["references"] = [];
  let malformed = false;
  for (const [event, groups] of Object.entries(raw.hooks ?? {})) {
    if (!Array.isArray(groups)) {
      malformed = true;
      continue;
    }
    for (const group of groups) {
      if (!isRecord(group) || !Array.isArray(group.hooks)) {
        malformed = true;
        continue;
      }
      for (const hook of group.hooks) {
        if (isRecord(hook) && typeof hook.command === "string") {
          references.push(parseCommand(provider, event, hook.command));
        }
      }
    }
  }
  return { present: true, references, failure: malformed ? "parse_error" : null };
}

async function readConfig(
  provider: HookProvider,
  configPath: string,
  readFile: (file: string) => Promise<string>,
): Promise<ParsedConfig> {
  try {
    return parseConfig(provider, await readFile(configPath));
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return { present: false, references: [], failure: null };
    }
    return { present: false, references: [], failure: "unavailable" };
  }
}

function projectRelativeReference(projectPath: string, candidate: string): {
  scope: FileScope;
  fileRef: string | null;
  absolutePath: string | null;
} {
  if (candidate.startsWith("~") || candidate.startsWith("$") || candidate.startsWith("%")) {
    return { scope: "external", fileRef: null, absolutePath: null };
  }
  const pathApi = pathApiFor(projectPath, candidate);
  const resolvedProject = pathApi.resolve(projectPath);
  const resolvedCandidate = pathApi.resolve(resolvedProject, candidate);
  const relative = pathApi.relative(resolvedProject, resolvedCandidate);
  const contained = relative !== "" && relative !== ".." &&
    !relative.startsWith(`..${pathApi.sep}`) && !pathApi.isAbsolute(relative);
  if (!contained) {
    return { scope: "external", fileRef: null, absolutePath: null };
  }
  return {
    scope: "project",
    fileRef: relative.replace(/\\/g, "/"),
    absolutePath: resolvedCandidate,
  };
}

async function checkReferences(
  projectPath: string,
  input: ParsedConfig["references"],
  readFile: (file: string) => Promise<string>,
): Promise<CheckedReferences> {
  const references: HookReference[] = [];
  const missingConfiguredFiles: string[] = [];
  let unavailable = false;

  for (const item of input) {
    if (item.candidate === null) {
      references.push({ ...item, fileRef: null, fileScope: "unknown", exists: null });
      continue;
    }
    const resolved = projectRelativeReference(projectPath, item.candidate);
    if (resolved.scope !== "project" || resolved.absolutePath === null || resolved.fileRef === null) {
      references.push({
        provider: item.provider,
        event: item.event,
        executableBasename: item.executableBasename,
        fileRef: null,
        fileScope: resolved.scope,
        exists: null,
      });
      continue;
    }
    try {
      await readFile(resolved.absolutePath);
      references.push({
        provider: item.provider,
        event: item.event,
        executableBasename: item.executableBasename,
        fileRef: resolved.fileRef,
        fileScope: "project",
        exists: true,
      });
    } catch (error) {
      const missing = errorCode(error) === "ENOENT";
      if (missing) missingConfiguredFiles.push(resolved.fileRef);
      else unavailable = true;
      references.push({
        provider: item.provider,
        event: item.event,
        executableBasename: item.executableBasename,
        fileRef: resolved.fileRef,
        fileScope: "project",
        exists: missing ? false : null,
      });
    }
  }

  return { references, missingConfiguredFiles, unavailable };
}

export async function observeHookCoverage(
  projectPath: string,
  deps: HookCoverageDependencies = {},
): Promise<Observation<HookCoverageSnapshot>> {
  const readFile = deps.readFile ?? ((file: string) => nodeReadFile(file, "utf8"));
  const observedAt = (deps.now ?? (() => new Date()))().toISOString();
  const pathApi = pathApiFor(projectPath);
  const claudeConfig = await readConfig(
    "claude",
    pathApi.resolve(projectPath, ".claude", "settings.json"),
    readFile,
  );
  const codexConfig = await readConfig(
    "codex",
    pathApi.resolve(projectPath, ".codex", "hooks.json"),
    readFile,
  );
  const checked = await checkReferences(
    projectPath,
    [...claudeConfig.references, ...codexConfig.references],
    readFile,
  );
  const data = hookCoverageSnapshotSchema.parse({
    scope: "project-only",
    claudeSettingsPresent: claudeConfig.present,
    codexHookConfigPresent: codexConfig.present,
    references: checked.references,
    missingConfiguredFiles: checked.missingConfiguredFiles,
    codexGlobalCoverage: "unknown",
  });
  const meta = { observedAt, freshness: "live" } as const;

  if (!claudeConfig.present && !codexConfig.present &&
    claudeConfig.failure === null && codexConfig.failure === null) {
    return failedObservation(
      "hooks",
      AUTHORITY,
      "unavailable",
      "not_configured",
      "No project hook configuration files were found.",
      data,
      CAPABILITIES,
      meta,
    );
  }
  if (claudeConfig.failure === "parse_error" || codexConfig.failure === "parse_error") {
    return failedObservation(
      "hooks",
      AUTHORITY,
      "degraded",
      "parse_error",
      "One or more project hook configuration files could not be parsed.",
      data,
      CAPABILITIES,
      meta,
    );
  }
  if (claudeConfig.failure === "unavailable" || codexConfig.failure === "unavailable" || checked.unavailable) {
    return failedObservation(
      "hooks",
      AUTHORITY,
      "degraded",
      "unavailable",
      "One or more project hook configuration files could not be inspected.",
      data,
      CAPABILITIES,
      meta,
    );
  }
  if (checked.missingConfiguredFiles.length > 0) {
    return failedObservation(
      "hooks",
      AUTHORITY,
      "degraded",
      "incomplete_observation",
      "One or more configured project hook files are missing.",
      data,
      CAPABILITIES,
      meta,
    );
  }
  return availableObservation("hooks", AUTHORITY, data, CAPABILITIES, meta);
}
