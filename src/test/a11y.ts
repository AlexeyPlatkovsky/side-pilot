import { afterEach, expect } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import type { AxeResults } from "jest-axe";

expect.extend(toHaveNoViolations);

const VIOLATION_LIMIT = 80;

export async function checkA11y(
  container: Element | HTMLElement,
  label?: string,
): Promise<void> {
  const results: AxeResults = await axe(container, {
    rules: {
      "aria-dialog-name": { enabled: false },
    },
  }) as AxeResults;

  const count = results.violations.length;
  if (count > 0) {
    const description = label ? `${String(label)} — ` : "";
    const guide =
      count > VIOLATION_LIMIT
        ? `${description}a11y: ${String(count)} violations (exceeds limit of ${String(VIOLATION_LIMIT)} — investigate before proceeding)`
        : `${description}a11y: ${String(count)} violation(s) found`;

    expect(results.violations).toEqual([]);
    throw new Error(guide);
  }
}

afterEach(() => {});

