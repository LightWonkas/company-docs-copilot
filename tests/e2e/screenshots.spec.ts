// Generates the README screenshots (opt-in: SCREENSHOTS=1 pnpm test:e2e screenshots).
import { expect, test } from "@playwright/test";
import { ask, loginAs } from "./helpers";

test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to regenerate docs/images");

const QUESTION = "2027 yönetim kurulu stratejisinde gelir ve FAVÖK hedefleri nedir?";

for (const [file, persona] of [
  ["same-question-employee.png", "Ayşe Yılmaz"],
  ["same-question-executive.png", "Selin Koç"],
] as const) {
  test(`screenshot: ${persona}`, async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 720 });
    await loginAs(page, persona);
    await ask(page, QUESTION);
    await expect(page.locator("main section .text-xs.text-muted-foreground").last()).toBeVisible();
    // The Next.js dev-tools badge is not part of the app.
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `docs/images/${file}` });
  });
}
