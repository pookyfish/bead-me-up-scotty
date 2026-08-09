// One-off settled screenshot of a single view. node scripts/one-shot.mjs <view> <outPath> [extraWaitMs]
import { chromium } from "playwright";

const [view, outPath, extra = "3000"] = process.argv.slice(2);
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
await p.goto("http://localhost:1701/p/better-palia-maps", { waitUntil: "domcontentloaded" });
await p.evaluate((v) => localStorage.setItem("bmus.view.better-palia-maps", v), view);
await p.reload({ waitUntil: "domcontentloaded" });
await p.waitForFunction(() => !/Loading insights|Scanning branches/.test(document.body.innerText), { timeout: 25000 }).catch(() => {});
await p.waitForTimeout(Number(extra));
await p.screenshot({ path: outPath });
await b.close();
