// Guards _ds-overrides.scss: those rules select @ardc-ui/react's internal
// CSS-module class names, which a DS release can rename without notice. If
// this fails after a DS bump, update the selectors there and here together.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import { Dialog, Modal } from "@ardc-ui/react";
import { beforeAll, describe, expect, it } from "vitest";
import { stubResizeObserver } from "../components/testing/resizeObserver";
import { QuotaMeter } from "../components/QuotaMeter/QuotaMeter";

// Read as text: Vite would compile a stylesheet import away in tests.
const overrides = readFileSync(
  join(import.meta.dirname, "_ds-overrides.scss"),
  "utf8",
);
const MODAL_OVERLAY = '[class*="Dialog-module__overlay"]';
const METER_FILL = '[class*="Meter-module__fill"]';

describe("design-system overrides", () => {
  beforeAll(() => {
    stubResizeObserver();
  });

  it("still match the DS Modal overlay", () => {
    expect(overrides).toContain(MODAL_OVERLAY);
    render(
      <Modal isOpen size="md">
        <Dialog title="Check" closeLabel="Close">
          Body
        </Dialog>
      </Modal>,
    );
    expect(document.querySelector(MODAL_OVERLAY)).not.toBeNull();
  });

  it("still match the DS Meter fill under QuotaMeter's tone", () => {
    expect(overrides).toContain(`[data-hive-tone="warning"] ${METER_FILL}`);
    expect(overrides).toContain(`[data-hive-tone="danger"] ${METER_FILL}`);
    const { container } = render(
      <>
        <QuotaMeter label="Warning" value={9} max={10} />
        <QuotaMeter label="Danger" value={10} max={10} />
        <QuotaMeter label="Fine" value={1} max={10} />
      </>,
    );
    expect(
      container.querySelectorAll(`[data-hive-tone="warning"] ${METER_FILL}`),
    ).toHaveLength(1);
    expect(
      container.querySelectorAll(`[data-hive-tone="danger"] ${METER_FILL}`),
    ).toHaveLength(1);
    expect(container.querySelectorAll(METER_FILL)).toHaveLength(3);
  });
});
