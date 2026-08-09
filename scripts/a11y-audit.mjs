// Accessibility audit for the running scotty instance (bead-me-up-scotty fork).
// Runs axe-core (WCAG 2.1 A/AA) against each main view of the project page and
// prints violations grouped by impact. Requires scotty to be running.
//
//   node scripts/a11y-audit.mjs [baseUrl] [projectId] [--theme <id>]
//   default: http://localhost:1701 better-palia-maps (light theme)
//
// This is the pin for bead 1ovaf's two invariants, and it EXITS NONZERO when
// either is broken:
//   * no nested interactive controls — cards/rows must not be clickable
//     containers with focusable children (use the .bd-stretch overlay pattern);
//   * every text/background pair clears WCAG AA 4.5:1 — run it once per theme
//     with --theme, since each theme block in globals.css sets its own ramp.
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const rawArgs = process.argv.slice(2);
// --detail prints the measured foreground/background/ratio behind every
// color-contrast node, which is the only way to fix one without guessing.
const detail = rawArgs.includes("--detail");
const args = rawArgs.filter((a) => a !== "--detail");
const themeFlag = args.indexOf("--theme");
const theme = themeFlag === -1 ? null : args[themeFlag + 1];
const positional = themeFlag === -1 ? args : [...args.slice(0, themeFlag), ...args.slice(themeFlag + 2)];
const base = positional[0] ?? "http://localhost:1701";
const project = positional[1] ?? "better-palia-maps";
const VIEWS = ["board", "list", "epics", "graph", "insights", "activity", "timeline", "crosstalk", "unmerged", "settings"];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();

const totals = { critical: 0, serious: 0, moderate: 0, minor: 0 };
const byRule = new Map();

for (const view of VIEWS) {
  await page.goto(`${base}/p/${project}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ([key, v, themeId]) => {
      localStorage.setItem(`bmus.view.${key}`, v);
      if (themeId) localStorage.setItem(`bmus.theme.${key}`, themeId);
    },
    [project, view, theme],
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  // SSE keeps the network busy forever; wait for the app shell instead.
  await page.waitForSelector("aside nav button", { timeout: 15000 }).catch(() => {});
  // …then for the view's own data. A 1.2s settle used to scan List and Epics
  // while they still said "Loading beads…", which silently hid every violation
  // those two views own.
  await page
    .waitForFunction(
      () =>
        !document.querySelector("[data-skeleton]") &&
        !/Loading beads…/.test(document.body.innerText),
      { timeout: 20000 },
    )
    .catch(() => {});
  await page.waitForTimeout(1500);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  for (const v of results.violations) {
    if (detail) {
      const seen = new Map();
      for (const n of v.nodes) {
        const d = (n.any ?? []).find((a) => a.id === "color-contrast")?.data;
        const key = d ? `${d.fgColor} on ${d.bgColor} @${d.fontSize} ${d.fontWeight} = ${d.contrastRatio}` : v.id;
        const rec = seen.get(key) ?? { n: 0, sample: n.html.slice(0, 150) };
        rec.n++;
        seen.set(key, rec);
      }
      for (const [k, r] of [...seen].sort((a, b) => b[1].n - a[1].n)) {
        process.stdout.write(`   [${view}] ${String(r.n).padStart(3)}x ${k}\n      ${r.sample}\n`);
      }
    }
    totals[v.impact ?? "minor"] = (totals[v.impact ?? "minor"] ?? 0) + v.nodes.length;
    const key = `${v.id} [${v.impact}] ${v.help}`;
    const entry = byRule.get(key) ?? { views: new Set(), nodes: 0, sample: "" };
    entry.views.add(view);
    entry.nodes += v.nodes.length;
    entry.sample = v.nodes[0]?.html?.slice(0, 120) ?? "";
    byRule.set(key, entry);
  }
  process.stdout.write(`${view.padEnd(10)} ${results.violations.length} violation types\n`);
}

process.stdout.write(`\n=== ${theme ? `THEME ${theme} · ` : ""}TOTAL NODES BY IMPACT: critical ${totals.critical} · serious ${totals.serious} · moderate ${totals.moderate} · minor ${totals.minor}\n\n`);
const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
for (const [key, e] of [...byRule.entries()].sort((a, b) => {
  const ia = order[a[0].match(/\[(\w+)\]/)?.[1]] ?? 4;
  const ib = order[b[0].match(/\[(\w+)\]/)?.[1]] ?? 4;
  return ia - ib || b[1].nodes - a[1].nodes;
})) {
  process.stdout.write(`${key}\n  ${e.nodes} nodes in [${[...e.views].join(", ")}]\n  e.g. ${e.sample}\n\n`);
}
await browser.close();

// Pin, not a report: a nested interactive control or a sub-4.5:1 text pair
// fails the run. Kept impact-based rather than rule-name-based so a NEW
// serious/critical rule can't slip in unnoticed either.
if (totals.critical + totals.serious > 0) {
  process.stdout.write(
    `FAIL: ${totals.critical + totals.serious} critical/serious node(s)${theme ? ` in theme ${theme}` : ""}.\n`,
  );
  process.exitCode = 1;
}
