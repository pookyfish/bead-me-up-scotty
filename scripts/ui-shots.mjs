// Screenshot each main view of the running scotty instance for design review.
//   node scripts/ui-shots.mjs [outDir] [baseUrl] [projectId]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2] ?? "shots";
const base = process.argv[3] ?? "http://localhost:1701";
const project = process.argv[4] ?? "better-palia-maps";
// [storage key, sidebar label]. The label is how we switch views: clicking the
// nav keeps the loaded bead cache, where a reload-per-view raced the fetch and
// shot Epics as "No epics yet" and the Board as "Loading beads…".
const VIEWS = [
  ["board", "Board"],
  ["list", "List"],
  ["epics", "Epics"],
  ["graph", "Graph"],
  ["timeline", "Timeline"],
  ["crosstalk", "Crosstalk"],
  ["unmerged", "Unmerged Work"],
  ["insights", "Insights"],
  ["settings", "Settings"],
];

/** Wait until nothing on screen is still loading, then let layout settle. */
async function waitForContent(page) {
  await page
    .waitForFunction(
      () =>
        !document.querySelector("[data-skeleton]") &&
        !/Loading beads/.test(document.body.innerText),
      { timeout: 25000 },
    )
    .catch(() => {});
  await page.waitForTimeout(900);
}

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const page = await context.newPage();

for (const mode of ["light", "dark"]) {
  await page.goto(`${base}/p/${project}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ([key, m]) => {
      localStorage.setItem(`bmus.theme.${key}`, m);
      localStorage.setItem(`bmus.view.${key}`, "board");
    },
    [project, mode],
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("aside nav button", { timeout: 15000 }).catch(() => {});
  await waitForContent(page);

  for (const [view, label] of VIEWS) {
    if (mode === "dark" && !["board", "timeline", "graph"].includes(view)) continue; // dark spot-check only
    await page.locator("aside nav button", { hasText: label }).first().click();
    await waitForContent(page);
    await page.screenshot({ path: join(out, `${mode}-${view}.png`) });
    process.stdout.write(`${mode}-${view}.png\n`);
  }
}
await browser.close();
