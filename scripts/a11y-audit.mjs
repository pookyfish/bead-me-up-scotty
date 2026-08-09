// Accessibility audit for the running scotty instance (bead-me-up-scotty fork).
// Runs axe-core (WCAG 2.1 A/AA) against each main view of the project page and
// prints violations grouped by impact. Requires scotty to be running.
//
//   node scripts/a11y-audit.mjs [baseUrl] [projectId]
//   default: http://localhost:1701 better-palia-maps
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const base = process.argv[2] ?? "http://localhost:1701";
const project = process.argv[3] ?? "better-palia-maps";
const VIEWS = ["board", "list", "epics", "graph", "insights", "activity", "timeline", "crosstalk", "unmerged", "settings"];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();

const totals = { critical: 0, serious: 0, moderate: 0, minor: 0 };
const byRule = new Map();

for (const view of VIEWS) {
  await page.goto(`${base}/p/${project}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ([key, v]) => localStorage.setItem(`bmus.view.${key}`, v),
    [project, view],
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  // SSE keeps the network busy forever; wait for the app shell instead.
  await page.waitForSelector("aside nav button", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  for (const v of results.violations) {
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

process.stdout.write(`\n=== TOTAL NODES BY IMPACT: critical ${totals.critical} · serious ${totals.serious} · moderate ${totals.moderate} · minor ${totals.minor}\n\n`);
const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
for (const [key, e] of [...byRule.entries()].sort((a, b) => {
  const ia = order[a[0].match(/\[(\w+)\]/)?.[1]] ?? 4;
  const ib = order[b[0].match(/\[(\w+)\]/)?.[1]] ?? 4;
  return ia - ib || b[1].nodes - a[1].nodes;
})) {
  process.stdout.write(`${key}\n  ${e.nodes} nodes in [${[...e.views].join(", ")}]\n  e.g. ${e.sample}\n\n`);
}
await browser.close();
