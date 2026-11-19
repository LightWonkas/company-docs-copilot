import { expect, type Page } from "@playwright/test";
import { loadEnv, serviceClient } from "../../scripts/lib/local";

loadEnv();

export async function loginAs(page: Page, fullName: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(fullName) }).click();
  // The persona's name is also on the login button: wait for the redirect and
  // the signed-in header, not just the text.
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

export async function ask(page: Page, question: string) {
  await page.goto("/");
  await page.getByLabel("Question").fill(question);
  await page.getByRole("button", { name: "Ask" }).click();
}

/** Test-side lookup (admin script context, local stack only). */
export async function documentId(slug: string): Promise<string> {
  const { data } = await serviceClient().from("documents").select("id").eq("slug", slug).single();
  return data!.id;
}
