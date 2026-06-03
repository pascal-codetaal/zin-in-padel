import { describe, expect, it } from "vitest";
import { buildOrganiserNotifyContentVariables } from "./variables";

describe("buildOrganiserNotifyContentVariables", () => {
  it("maps the notice body and match token to the two CTA variables", () => {
    expect(
      buildOrganiserNotifyContentVariables({
        body: "Tom doet mee met je padelmatch bij Padel X (vrijdag 19:00). 🎾",
        matchToken: "AAA111BBB222CCC333DDD4",
      }),
    ).toEqual({
      "1": "Tom doet mee met je padelmatch bij Padel X (vrijdag 19:00). 🎾",
      "2": "AAA111BBB222CCC333DDD4",
    });
  });
});
