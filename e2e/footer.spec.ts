import { test, expect } from "@playwright/test";

/**
 * The marketing footer's internal links (#121) each land on a real page.
 * Contact points off-site (`ianjmacintosh.com`), so it's checked by its
 * href rather than followed.
 */
for (const [name, path, heading] of [
  ["Log In", "/login", "Sign in"],
  ["About Dreamport", "/about", "About Dreamport"],
  ["Privacy Policy", "/privacy", "Privacy Policy"],
  ["Terms of Service", "/terms", "Terms of Service"],
  ["Copyright", "/copyright", "Copyright"],
] as const) {
  test(`homepage footer: ${name} opens ${path}`, async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("contentinfo")
      .getByRole("link", { name, exact: true })
      .click();

    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
  });
}

test("homepage footer: Contact opens Ian's contact page in a new tab", async ({
  page,
}) => {
  await page.goto("/");
  const contact = page
    .getByRole("contentinfo")
    .getByRole("link", { name: "Contact", exact: true });

  await expect(contact).toHaveAttribute(
    "href",
    "https://ianjmacintosh.com/contact",
  );
  await expect(contact).toHaveAttribute("target", "_blank");
});
