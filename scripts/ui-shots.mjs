// Screenshot each main view of the running scotty instance for design review.
//   node scripts/ui-shots.mjs [outDir] [baseUrl] [projectId]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2] ?? "shots";
const base = process.argv[3] ?? "http://localhost:1701";
const project = process.argv[4] ?? "better-palia-maps";
const VIEWS = ["board", "list", "epics", "graph", "timeline", "crosstalk", "unmerged", "insights", "settings"];

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
  for (const view of VIEWS) {
    if (mode === "dark" && !["board", "timeline", "graph"].includes(view)) continue; // dark spot-check only
    await page.evaluate(([key, v]) => localStorage.setItem(`bmus.view.${key}`, v), [project, view]);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("aside nav button", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1100);
    // Insights/Unmerged fetch heavy data; give their loading states time to resolve.
    await page
      .waitForFunction(() => !/Loading insights|Scanning branches/.test(document.body.innerText), { timeout: 25000 })
      .catch(() => {});
    await page.screenshot({ path: join(out, `${mode}-${view}.png`) });
    process.stdout.write(`${mode}-${view}.png\n`);
  }
}
await browser.close();
