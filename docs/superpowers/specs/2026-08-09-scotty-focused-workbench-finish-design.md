# Scotty Focused Workbench and Remaining UI Completion

**Status:** approved · **Date:** 2026-08-09

**Beads:** `better-palia-maps-m0tcl`, `better-palia-maps-9aevk`,
`better-palia-maps-7nznk`, `better-palia-maps-x2s76`

## Problem

The fork's earlier Scotty UI batch landed, but four connected gaps remain:

1. The Board and List do not scale to a real project. Better Palia Maps currently
   exposes 1,198 beads, including 1,092 Done beads. Board gives an empty Backlog
   lane permanent width and gives Done equal prominence to active work. List is a
   single status-grouped stream with no visible sort control or bounded result set.
2. Mobile is unusable. At 390 px, the desktop sidebar consumes roughly 228 px,
   the toolbar overflows, and List rows collapse to IDs while hiding their titles.
3. Scotty accepts more native `bd` statuses and internal issue types than it
   presents. Hooked is folded into In Progress, Pinned disappears from Board, and
   internal molecule/gate/event beads lack complete display metadata.
4. Customization and live updates are incomplete: inline triage edits are missing,
   relative age does not understand the project's game-patch boundaries, five
   accent presets fail contrast in at least one scheme, and the filesystem/SSE
   reconnect path can stop recovering while still looking live.

The rendered audit used the existing `localhost:1701` runtime at desktop and
390×844 mobile widths. Captures are retained outside the repository under
`C:\Users\sannp\AppData\Local\Temp\scotty-board-list-audit\`.

## User-approved direction

The user selected **Focused Workbench** and separately approved the detailed
Board and List designs.

- Active work is the default surface. Done is deliberate history, not a sixth
  endless work lane.
- `Most recent` is the default Board and List order, using `updated_at` with
  `created_at` fallback.
- Board keeps workflow lanes, but bounds each lane and can focus one lane.
- List becomes a sortable, paginated work index rather than grouped walls.
- Mobile uses a navigation drawer, a one-lane Board, and readable List cards.
- Attention counts are clickable filters, not decorative dashboard tiles.
- The native model uses a built-in catalog with a visible unknown fallback. It
  does not shell out to discover runtime enums.
- Better Palia Maps gets a source-configured patch calendar. Other projects keep
  the current relative-age fallback until a calendar is explicitly added.
- Implementation stays on one feature branch and is divided into small,
  test-first workstreams because several surfaces share files.

## 1. Shared workbench view model

Add a pure client-safe module, `lib/workbench.ts`, used by both Board and List.
It owns display-only querying; `bd` remains the source of truth.

```ts
export type WorkbenchSort =
  | "updated"
  | "oldest"
  | "priority"
  | "title"
  | "status"
  | "owner"
  | "manual";

export type AttentionView =
  | "all"
  | "recent"
  | "blocked"
  | "stale"
  | "unassigned";

export interface WorkbenchPrefs {
  sort: WorkbenchSort;
  activeOnly: boolean;
  attention: AttentionView;
  groupListByStatus: boolean;
  boardLaneLimit: number;
  listPageSize: number;
  mobilePageSize: number;
}
```

Pure helpers provide stable, testable behavior:

- `lastTouchedAt(bead)` parses `updated_at ?? created_at`; missing or invalid
  dates sort last.
- `sortWorkbenchBeads(beads, sort, manualOrder)` uses an ID tiebreaker so equal
  timestamps do not jump between renders.
- `applyAttentionView` implements Recently touched (current local day), Blocked
  (native or dependency-derived), Stale (patch-aware when configured), and
  Unassigned (no assignee/owner).
- `paginateBeads` returns the page items plus total/page metadata and clamps a
  stale page after filters change.
- `summarizeWorkbench` calculates counts in one pass, avoiding per-card scans.

`hooks/use-workbench-prefs.ts` persists display choices per project and view:

```text
bmus.workbench.<projectId>.board
bmus.workbench.<projectId>.list
```

Defaults are `updated`, active-only, no attention filter, Board limit 25,
desktop List page size 50, and mobile List page size 25. Existing
`bmus.board.blockedColumn` behavior is migrated or read as a fallback rather
than silently discarded. Preferences are device-local, matching existing theme
and notification preferences.

`components/workbench-toolbar.tsx` becomes the shared search/filter/sort surface.
It reuses the existing `FilterBar` controls and filter state rather than creating
a second filter system. The active sort and active-only state are always visible.

## 2. Native status and type catalog

`lib/board-columns.ts` becomes the single built-in status catalog for display:

| Lane | Native status/condition | Default treatment |
|---|---|---|
| Backlog | `deferred` | Collapsed rail when empty |
| Ready | `open` and not dependency-blocked | Active |
| Hooked | `hooked` | Separate from In Progress |
| In Progress | `in_progress` | Active |
| Blocked | `blocked` or dependency-blocked open bead | Attention cue |
| Pinned | `pinned` | Separate visible lane |
| Done | `closed` | Collapsed history |

An observed status that matches none of these appears in a dynamic **Other:
`<raw status>`** lane. Unknown data is never dropped. It receives neutral styling,
the raw label, no unsupported drag target, and remains available in List/search.

The issue-type catalog distinguishes:

- **Creatable/editable core types:** task, feature, bug, epic, chore, docs,
  question, milestone.
- **Displayable internal types:** molecule, gate, event.
- **Unknown types:** neutral icon/color and a humanized raw label.

The read schema remains loose and changes to `passthrough()` so future subtype
fields are not stripped. The generic create/update schemas remain restricted to
supported core types. Internal beads are visible in Board/List and open a
read-only generic drawer summary. Known metadata such as `await_type` is shown
through an allowlist; dedicated supported actions such as resolving a human gate
remain available, but the generic type editor is not offered.

This is a static catalog plus observed fallback. There is no startup dependency
on a particular `bd` CLI version or a new enum-discovery subprocess.

## 3. Board layout and behavior

### Desktop

- Keep the familiar horizontal Board, but show active lanes first.
- Empty nonessential lanes collapse to a narrow labeled rail instead of consuming
  a full column.
- Show at most 25 cards per lane. The footer says `View remaining N` and opens
  focus mode for that lane.
- Focus mode uses the available content width, keeps the same filters/sort, and
  renders a bounded/virtualized lane rather than expanding the whole page.
- Done is a compact history strip: number completed in the last seven days plus
  total Done count. `Open history` opens a focused, paginated Done view.
- Lane headers show name, count, and Focus. Counts reflect current filters.
- Cards show a two-line title, short ID, priority/type, owner, last touched time,
  and compact comment/dependency signals. Descriptions stay in the drawer.

### Sorting and drag behavior

- Default `Most recent` is descending last-touch time.
- Available modes are Most recent, Oldest, Priority, and Manual.
- Drag sensors and reorder affordances exist only in Manual mode. Switching away
  from Manual disables reordering so the visible order is never ambiguous.
- Existing saved manual order remains intact while another sort is selected.
- Moving a bead between lanes continues to use the native status mutation path.
  Unknown/derived lanes that cannot map safely to one native status are not drop
  targets.

### Mobile

- The persistent desktop sidebar becomes a drawer opened from the top bar.
- Board shows one selected lane. A horizontally scrollable lane-picker uses
  compact pills; the cards themselves never form tiny horizontal columns.
- Search remains inline. Sort and filters open compact menus/sheets.
- Card title, priority, type, owner, and recency remain visible at 390 px.
- No page-level horizontal overflow is allowed.

## 4. List layout and behavior

### Desktop

List is one sortable index; status grouping is optional and off by default.

The sticky header columns are Title, Status, Priority, Owner, Updated, and
Signals. Title includes the short bead ID/type as secondary text. Every sortable
header shows its direction. The default is Updated descending.

The default result set is active-only. Done and archived data are exposed through
explicit filters/history. Quick attention presets—Recently touched, Blocked,
Stale, and Unassigned—change the result set and show their count.

List uses explicit pagination, not an unbounded document:

- Desktop: 50 rows per page by default.
- Mobile: 25 cards per page by default.
- Footer always shows the displayed range and total result count.
- Search/filter/sort changes reset or clamp the current page.

### Inline editing

Reuse the existing mutation stack: `useUpdateBead`/PATCH for title and priority,
and the dedicated status endpoint for status transitions.

- Title: double-click or `F2` enters an input. Enter saves, Escape and blur cancel.
- Empty/whitespace-only titles do not save.
- Status and priority use compact row controls that stop propagation so editing
  does not open the drawer or start a drag.
- While saving, that editor is disabled. On success, React Query invalidation
  refreshes all views. On failure, the editor remains open with its value and an
  inline/toast error; the failure is never silently converted to a cancel.
- Internal/unknown types with unsupported mutation semantics remain read-only.

### Mobile

Rows become stacked cards, not a horizontally clipped table. Each card keeps the
title, status, priority, short ID, owner, updated time, and signals. Selecting the
card opens the existing drawer. Navigation is the same top-bar drawer used by the
mobile Board.

## 5. Patch-aware age and actionable insights

Add `lib/patch-calendars.ts`, a source-configured registry keyed by project ID.
The initial Better Palia Maps calendar is:

| Version | Effective date | Notes |
|---|---|---|
| 0.204 | 2026-07-06 | Patch boundary |
| 0.205 | 2026-07-28 | Current audited boundary |

The 2026-07-14 0.204 hotfix is not a separate age bucket.

`lib/bead-age.ts` keeps relative age and adds patch context:

- touched on/after 2026-07-28: current patch;
- touched from 2026-07-06 through 2026-07-27: previous patch;
- touched before 2026-07-06: legacy/two-or-more patches old.

The UI says “predates 0.205” rather than pretending every old bead is invalid.
The badge is a verification cue, not an automatic close/defer rule. Projects with
no configured calendar retain the existing 7/45-day relative tones and do not
show a game-patch claim.

`lib/insights.ts`, the insights API, and `components/insights-view.tsx` add a
patch-age histogram for active, unarchived work only. Buckets are Current patch,
Previous patch, and Older. Clicking a bucket opens List with the matching filter.
The same staleness predicate powers the Workbench Stale preset; there is no second
definition.

## 6. Accent contrast completion

`components/appearance.tsx` evolves each `AccentPreset` from one shared brand pair
to matched light/dark bundles:

```ts
interface AccentBundle {
  brand: string;
  brand2: string;
  weak: string;
  foreground: string;
}

interface AccentPreset {
  key: string;
  name: string;
  light: AccentBundle;
  dark: AccentBundle;
}
```

Applying an accent updates `--brand`, `--brand-2`, `--brand-weak`,
`--primary-foreground`, and the matching sidebar primary foreground. Theme or
light/dark changes reapply the correct bundle. The default Indigo behavior and
existing stored accent keys migrate without user action.

Do not add per-theme CSS override blocks to `app/globals.css`; the appearance
provider is the existing customization path. The automated audit expands to all
9 themes × 6 accents = 54 combinations and checks:

- brand text on brand-weak and the actual background/surface tokens where it is
  used;
- foreground text on brand-filled buttons and sidebar primary controls;
- focus/ring and computed-token presence;
- existing axe coverage for desktop and mobile states.

The current failing presets—Nord, Teal, Rose, Amber, and Grove—must clear WCAG AA
for text uses in both schemes. Non-text-only decorative marks retain the 3:1
criterion where applicable.

## 7. SSE and watcher recovery

### Client

`useBeadsStream` exposes a connection state rather than one optimistic boolean:

```ts
type StreamState = "disabled" | "connecting" | "live" | "reconnecting";
```

- The first connection starts as Connecting.
- `open` sets Live and invalidates bead/activity queries immediately, closing the
  gap for events missed while disconnected.
- `error` sets Reconnecting; native EventSource backoff remains the transport.
- `change` invalidates the existing query keys.
- Cleanup closes the EventSource once and returns Disabled.
- The existing periodic React Query refetch remains as a correctness backup for
  teammate changes that do not touch the watched top-level files.

The project switcher/status indicator renders the four states honestly; a stale
green Live dot is not allowed.

### Server watcher

`lib/beads-watch.ts` keeps one watcher per project and non-recursive watching, but
adds supervised recovery:

- watcher errors clear the dead watcher and schedule a bounded exponential retry
  while references remain;
- a fresh subscription always re-resolves the `.beads` directory;
- one retry timer exists per entry and is cleared with debounce on final release;
- restart emits no fake change, but successful SSE open causes the client refetch.

### SSE route and registry

Extract a testable stream lifecycle helper with one idempotent `close()` path.
Client cancellation, request abort, enqueue/controller failure, shutdown registry
closure, and normal unsubscribe all call that same path. It unregisters the
stream, removes the watcher listener, clears keepalive work, and closes the
controller at most once. Enqueue failure must not bypass cleanup.

## 8. Error handling and graceful degradation

- Unknown statuses/types remain visible with neutral fallback metadata.
- Invalid timestamps sort last and suppress misleading patch claims.
- Missing patch calendars fall back to relative age.
- Failed inline mutations retain user input and explain the error.
- Failed filesystem watchers surface Reconnecting and continue polling.
- Demo/public data without a watchable `.beads` directory reports Disabled and
  continues to use normal queries.
- Empty attention filters show an explicit zero-result state and a Clear filter
  action, not a blank page.
- Page numbers clamp after mutation/filter changes; the app never strands the
  user on an empty out-of-range page.

## 9. Reuse boundaries

This work must extend the existing system rather than reimplement it:

- Existing `FilterBar` and filter predicates remain authoritative.
- Existing bead drawer, React Query keys, update mutation, status endpoint, and
  manual order store remain authoritative.
- `lib/workbench.ts` is the only new shared sort/filter/page layer for Board and
  List.
- `lib/board-columns.ts` is the only built-in status/lane catalog.
- `lib/bead-age.ts` plus `lib/patch-calendars.ts` is the only staleness path used
  by cards, presets, and Insights.
- `AppearanceBoot` remains the only runtime accent-token writer.
- Do not add surface-scoped defaults maps or Board/List-specific copies of base
  components to force parity.

## 10. Verification and review gates

Implementation is test-first. Add focused automated coverage before each behavior
change, using the repository's current Node/Next/Playwright toolchain rather than
source-shape pins.

Required behavioral coverage:

1. Workbench sort stability, missing dates, active-only filtering, attention
   predicates, page clamping, and persistence/migration.
2. Seven built-in lanes, separate Hooked/Pinned, dependency-blocked placement,
   unknown-status fallback, and internal/unknown type visibility.
3. Manual-only drag, 25-card lane bounds, Done history bounds, and List page sizes.
4. Inline title/status/priority save, cancel, invalid title, propagation, and
   failure-retains-editor behavior.
5. Patch-boundary dates (before/on/after July 6 and July 28), nonconfigured project
   fallback, and Insights histogram/filter parity.
6. All 54 theme/accent combinations plus computed foreground token checks.
7. SSE open/change/error/reconnect transitions, query invalidation on open,
   idempotent route cleanup, watcher retry, and polling fallback.

Required product review:

- Desktop Board and List with the real 1,198-bead Better Palia Maps dataset.
- Mobile Board and List at 390×844.
- No page-level horizontal overflow; title remains visible; desktop sidebar is not
  rendered as a fixed-width mobile obstruction.
- Light+Teal desktop Board and Nord+Amber mobile Settings/theme states, covering
  the historically failing accents.
- Reuse audit against the existing filter, drawer, mutation, preference, theme,
  and stream paths.
- Test assertions verify user behavior and parity with the app, not literal source
  shapes introduced by the implementation.

Before any resource-heavy build/browser pass, inspect current memory and running
browser/Node processes and run only one heavy job. Reuse the existing Scotty
runtime where healthy. Report “not visually verified” rather than claiming
approval if workstation load blocks rendered QA.

## 11. Delivery sequence

Use branch `codex/scotty-focused-workbench-finish` and keep the checkout on this
branch only while actively working.

1. Pure model/catalog/workbench preference helpers and tests.
2. Board layout, sorting, bounds, Done history, and responsive navigation.
3. List table/cards, pagination, and inline edits.
4. Patch calendar, shared staleness predicate, and Insights histogram.
5. Accent bundles and the 54-combination audit.
6. SSE lifecycle, watcher recovery, and truthful connection status.
7. Integrated lint/type/build tests, independent code review, then one controlled
   desktop/mobile rendered pass.

Each workstream gets a fresh implementation agent and an independent reviewer or
review pass. Shared files are locked before edits, so agents work sequentially
where file ownership overlaps. After all required validation passes, push the
feature branch, merge it into `main`, push `main`, update/close the four beads,
release orchestration locks, and leave the Scotty checkout clean on `main`.

## Out of scope

- Dynamic CLI discovery of statuses/types.
- Arbitrary user-authored patch calendars or an editor for them.
- User-defined theme/accent colors.
- Replacing React Query or the existing `bd` API paths.
- A new analytics dashboard or general notification center.
- Bulk editing, multi-select mutation, or a new keyboard-command language.
- Changing Beads persistence or adding fields to the `bd` database.
