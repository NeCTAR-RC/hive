import { describe, expect, it } from "vitest";
import { calendarFile } from "./calendar";

describe("calendarFile", () => {
  it("serves the entry from the reservation's calendar path, named after it", () => {
    expect(calendarFile({ id: "res-42" })).toEqual({
      url: "/api/reservations/res-42/calendar.ics",
      filename: "nectar-reservation-res-42.ics",
    });
  });
});
