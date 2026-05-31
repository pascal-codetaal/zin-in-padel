import { describe, expect, it } from "vitest";
import { parsePlaytomicPaste } from "./playtomic-paste.server";

const SAMPLE = `WEDSTRIJD IN GARRINCHA GENT THE LOOP

 📅 vrijdag 29, 11:00 (90min)
 📍 Gent
 📊 Niveau 2.76 - 3.76
 ✅ Pascal Van Hecke (3)
 ✅ Matthee Van (2,8)
 ✅ Victor (3,7)
 ⚪ ??
https://app.playtomic.io/t/iOkG4bwv`;

describe("parsePlaytomicPaste", () => {
  it("parses club, time, duration and ✅ players", () => {
    const parsed = parsePlaytomicPaste(SAMPLE);
    expect(parsed).not.toBeNull();
    expect(parsed!.clubQuery).toContain("GARRINCHA");
    expect(parsed!.weekday).toBe("vrijdag");
    expect(parsed!.day).toBe(29);
    expect(parsed!.hour).toBe(11);
    expect(parsed!.minute).toBe(0);
    expect(parsed!.durationMinutes).toBe(90);
    expect(parsed!.city).toBe("Gent");
    expect(parsed!.confirmedPlayerNames).toEqual([
      "Pascal Van Hecke",
      "Matthee Van",
      "Victor",
    ]);
  });

  it("implies one open slot on a padel court of four", () => {
    const parsed = parsePlaytomicPaste(SAMPLE)!;
    expect(parsed.confirmedPlayerNames).toHaveLength(3);
    expect(4 - parsed.confirmedPlayerNames.length).toBe(1);
  });
});
