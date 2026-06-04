import { test, expect, type Page } from "@playwright/test";

// Composer runtime-layout regressions (SP-0gx.2), measured in the WebKit
// engine — the class of bug that Vitest + jsdom (no layout) and Chromium
// previews (different engine) could not catch.

const INPUT = "textarea.composer__input";

async function gotoPanel(page: Page) {
  await page.goto("/e2e/fixture.html");
  await expect(page.getByTestId("panel")).toBeVisible();
}

/** Geometry of the composer textarea as WebKit actually rendered it. */
async function inputBox(page: Page) {
  return page.$eval(INPUT, (el) => {
    const ta = el as HTMLTextAreaElement;
    return {
      height: Math.round(ta.getBoundingClientRect().height),
      clientHeight: ta.clientHeight,
      scrollHeight: ta.scrollHeight,
      display: getComputedStyle(ta).display,
    };
  });
}

test("composer starts at a single row", async ({ page }) => {
  await gotoPanel(page);
  const box = await inputBox(page);
  // A single row is well under two rows; 3 rows lands ~60px+, so < 45 cleanly
  // distinguishes "1 row" from the "defaults to 3 rows" bug.
  expect(box.height).toBeLessThan(45);
  // No internal scroll for an empty field.
  expect(box.scrollHeight).toBeLessThanOrEqual(box.clientHeight + 1);
});

test("composer auto-grows with newlines, then caps and scrolls", async ({
  page,
}) => {
  await gotoPanel(page);
  const start = (await inputBox(page)).height;

  await page.fill(INPUT, "one\ntwo\nthree");
  const threeRows = (await inputBox(page)).height;
  expect(threeRows).toBeGreaterThan(start + 20); // grew by ~2 rows

  // Far past the cap — height must stop at the max and the field must scroll.
  await page.fill(INPUT, Array.from({ length: 12 }, (_, i) => `line ${i}`).join("\n"));
  const capped = await inputBox(page);
  expect(capped.height).toBeLessThanOrEqual(96);
  expect(capped.scrollHeight).toBeGreaterThan(capped.clientHeight + 1);
});

test("the auto-grown field fits its content exactly — no trailing gap", async ({
  page,
}) => {
  await gotoPanel(page);
  await page.fill(INPUT, "one\ntwo\nthree");
  const box = await inputBox(page);
  // Auto-grow sets height to scrollHeight, so the rendered field must fit its
  // content exactly (no dead space under the last line).
  expect(box.scrollHeight).toBe(box.clientHeight);
});

test("a single-row composer stays compact (no over-tall box)", async ({
  page,
}) => {
  await gotoPanel(page);
  const composerHeight = await page.$eval(".composer", (el) =>
    Math.round(el.getBoundingClientRect().height),
  );
  // The real fix for the "too much space" report was making `.composer`
  // border-box, so its `min-height: 42px` is the total height. As content-box
  // it rendered ~52px (42 + padding + border) — demonstrated by reverting the
  // fix. Guard against that regression.
  expect(composerHeight).toBeLessThanOrEqual(46);
});
