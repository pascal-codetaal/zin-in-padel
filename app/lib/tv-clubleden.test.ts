import { describe, expect, it } from "vitest";
import {
  filterTvClubledenPadelPlayers,
  parseTvClubledenHtml,
} from "~/lib/tv-clubleden.server";

const FIXTURE = `
<h1>RACING WETTEREN TENNIS EN PADEL - clubleden voor seizoen 2026</h1>
<p>Er zijn 2 gevonden clubleden</p>
<table>
<tbody>
<tr>
<td role="gridcell" data-title="Naam"><a href="/dashboard?userId=726873">Alen Gilles</a></td>
<td role="gridcell" data-title="Tennis enkel">20 ptn</td>
<td role="gridcell" data-title="Tennis dubbel">20 ptn</td>
<td role="gridcell" data-title="Padel">P400</td>
<td role="gridcell" data-title="Geslacht">Man</td>
</tr>
<tr>
<td role="gridcell" data-title="Naam"><a href="/dashboard?userId=999001">Plain Tennis</a></td>
<td role="gridcell" data-title="Tennis enkel">3 ptn</td>
<td role="gridcell" data-title="Tennis dubbel">3 ptn</td>
<td role="gridcell" data-title="Padel"></td>
<td role="gridcell" data-title="Geslacht">Vrouw</td>
</tr>
</tbody>
</table>
`;

describe("parseTvClubledenHtml", () => {
  it("parses member rows with tvUserId and rankings", () => {
    const parsed = parseTvClubledenHtml(FIXTURE);
    expect(parsed.reportedCount).toBe(2);
    expect(parsed.clubName).toBe("RACING WETTEREN TENNIS EN PADEL");
    expect(parsed.members).toHaveLength(2);
    expect(parsed.members[0]).toEqual({
      tvUserId: 726873,
      displayName: "Alen Gilles",
      tennisSingles: "20 ptn",
      tennisDoubles: "20 ptn",
      padelRanking: "P400",
      gender: "Man",
    });
  });

  it("filters padel players by P-ranking", () => {
    const parsed = parseTvClubledenHtml(FIXTURE);
    const padel = filterTvClubledenPadelPlayers(parsed.members);
    expect(padel).toHaveLength(1);
    expect(padel[0]!.tvUserId).toBe(726873);
  });
});
