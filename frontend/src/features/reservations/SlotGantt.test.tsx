import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ReservationFlavor } from "../../lib/api/types";
import { buildRows, ganttRange } from "./gantt";
import { SlotGantt } from "./SlotGantt";

const flavor: ReservationFlavor = {
  id: "f1",
  name: "ardc.g3.xlarge",
  description: "L4 with 24GB of GPU RAM",
  category: "GPU",
  availability_zone: "ardctest-artm",
  vcpu: 64,
  memory_mb: 49152,
  disk_gb: 30,
  ephemeral_gb: 200,
  max_length_hours: 168,
  max_days: 7,
  rate: 0.899,
  is_public: true,
  active: true,
  slots: 1,
  start: null,
  end: null,
};

const range = ganttRange("2026-10-12");
const rows = buildRows(
  [flavor],
  [
    {
      flavor_id: "f1",
      start: "2026-10-12T00:00:00+00:00",
      end: "2026-11-01T00:00:00+00:00",
      first_day: "2026-10-12",
      last_day: "2026-10-31",
    },
  ],
  [
    {
      id: "mw-1",
      start: "2026-10-20T00:00:00+00:00",
      end: "2026-10-21T00:00:00+00:00",
      note: "Firmware updates",
      flavors: [],
    },
  ],
  range,
);

describe("SlotGantt", () => {
  it("names each free slot and opens the flavour details", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(
      <SlotGantt
        rows={rows}
        range={range}
        daysLeft={18}
        canReserve
        onPick={onPick}
      />,
    );
    expect(
      screen.getByRole("group", { name: "ardc.g3.xlarge" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "Maintenance 20 Oct 2026: Firmware updates",
      }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "ardc.g3.xlarge" }));
    expect(screen.getByText("L4 with 24GB of GPU RAM")).toBeVisible();
    expect(screen.getByText("0.9 SU/hour")).toBeVisible();
  });

  it("proposes the first eligible days when activated from the keyboard", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(
      <SlotGantt
        rows={rows}
        range={range}
        daysLeft={3}
        canReserve
        onPick={onPick}
      />,
    );
    const bar = screen.getByRole("button", {
      name: "Reserve ardc.g3.xlarge, free 12 Oct 2026 to 31 Oct 2026 (20 days)",
    });
    bar.focus();
    await user.keyboard("{Enter}");
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0]?.[0].selection).toEqual({
      start: "2026-10-12",
      end: "2026-10-14",
      days: 3,
    });
  });

  it("disables the slots when the project cannot reserve", () => {
    render(
      <SlotGantt
        rows={rows}
        range={range}
        daysLeft={0}
        canReserve={false}
        onPick={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /^Reserve/ })).toBeDisabled();
  });
});
