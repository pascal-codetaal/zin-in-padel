import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  addPlaytomicAlias,
  getClubsByIds,
  loadAllClubsCompact,
  searchClubs,
} from "~/lib/clubs.server";
import {
  findDraftMatch,
  findOrCreateDraftMatch,
  findUserById,
  finalizeMatchDraft,
  getDatabase,
  updateMatchDraft,
} from "~/lib/db.server";
import { buildMaatjesPageUrl } from "~/lib/maatjes-url.server";
import { dispatchPendingInvites } from "~/lib/cascade/send.server";
import { resolveAppOrigin } from "~/lib/app-origin.server";
import {
  ALL_PADEL_LEVELS,
  acceptedPlayerRefsOf,
  formatMatchFormat,
  openSlotsOf,
  type PadelLevel,
} from "~/types/domain";

/* ---------------------------------- Schemas ------------------------------- */

const matchFormatSchema = z.enum(["mixed", "men_only", "women_only"]);

const padelLevelSchema = z
  .number()
  .refine((v) => (ALL_PADEL_LEVELS as readonly number[]).includes(v), {
    message:
      "Padelniveau moet een Tennis Vlaanderen P-klassement zijn (50, 100, 200, 300, 400, 500, 700, 1000).",
  });

const dutchWeekdays = [
  "zondag",
  "maandag",
  "dinsdag",
  "woensdag",
  "donderdag",
  "vrijdag",
  "zaterdag",
] as const;

/* --------------------------- read-match-profile --------------------------- */

/**
 * Read everything the match-creator agent needs about the active user in a
 * single call: profile, favorite players (with names), preferred clubs, and
 * a personal maatjes-page URL.
 */
export const readMatchProfileTool = createTool({
  id: "read-match-profile",
  description:
    "Lees alle relevante info van de actieve gebruiker voor het maken van een match: profiel (geslacht, klassement, match-range), favoriete spelers met namen, voorkeurclubs.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    maatjesPageUrl: z.string().nullable(),
    user: z
      .object({
        id: z.string(),
        profileName: z.string(),
        gender: z.enum(["m", "w"]).nullable(),
        level: padelLevelSchema.nullable(),
        matchLevelMin: padelLevelSchema.nullable(),
        matchLevelMax: padelLevelSchema.nullable(),
        matchPreference: z
          .enum(["friends_only", "level_only", "open"])
          .nullable()
          .describe(
            "Profielinstelling uit /profiel/.../speelvoorkeur. Gebruik dit als suggestie voor de cascade-vraag.",
          ),
      })
      .nullable(),
    favoritePlayers: z.array(
      z.object({
        ref: z.string(),
        name: z.string(),
        phone: z.string(),
      }),
    ),
    preferredClubs: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        city: z.string(),
        province: z.string().optional(),
      }),
    ),
  }),
  execute: async (_input, context) => {
    const userId = context?.requestContext?.get("userId") as string | undefined;
    const db = await getDatabase();
    const user = userId ? db.users.find((u) => u.id === userId) : null;

    const appOrigin = resolveAppOrigin(context);
    const maatjesPageUrl =
      user
        ? buildMaatjesPageUrl(new Request(`${appOrigin}/`), user.manageToken)
        : null;

    const favoritePlayers = user
      ? db.players
          .filter((p) => user.favoritePlayerRefs.includes(p.ref))
          .map((p) => ({ ref: p.ref, name: p.name, phone: p.phone }))
      : [];

    const preferredClubs = user ? await getClubsByIds(user.preferredClubIds) : [];

    return {
      maatjesPageUrl,
      user: user
        ? {
            id: user.id,
            profileName: user.profileName,
            gender: user.gender,
            level: user.level,
            matchLevelMin: user.matchLevelMin,
            matchLevelMax: user.matchLevelMax,
            matchPreference: user.matchPreference,
          }
        : null,
      favoritePlayers,
      preferredClubs,
    };
  },
});

/* ------------------------------- search-clubs ----------------------------- */

export const matchSearchClubsTool = createTool({
  id: "search-clubs",
  description:
    "Zoek padelclubs in Vlaanderen op naam, gemeente, provincie of een eerder geleerde Playtomic-alias. Gebruik de exacte naam uit een Playtomic-bericht als zoekterm. Geeft tot 15 resultaten met hun club-id. Als dit niets oplevert: roep list-all-clubs aan voor de volledige catalogus.",
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .describe("Zoekterm, bv. 'Garrincha Gent', 'Padel Arena', 'Antwerpen'"),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    count: z.number(),
    clubs: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        city: z.string(),
        province: z.string().optional(),
      }),
    ),
    message: z.string().optional(),
  }),
  execute: async ({ query }) => {
    const clubs = await searchClubs(query);
    if (clubs.length === 0) {
      return {
        ok: true,
        count: 0,
        clubs: [],
        message: `Geen clubs gevonden voor "${query}".`,
      };
    }
    return { ok: true, count: clubs.length, clubs };
  },
});

/* ------------------------ parse-dutch-datetime ---------------------------- */

/**
 * Deterministic helper for converting fragments like "dinsdag 19, 10:30" to an
 * upcoming ISO date. The LLM is fine at extracting the fragments but bad at
 * date math, so we give it a sharp tool.
 */
export const parseDutchDateTimeTool = createTool({
  id: "parse-dutch-datetime",
  description:
    "Reken een Nederlandse datum/uur (bv. uit 'dinsdag 19, 10:30') om naar de eerstvolgende ISO-timestamp in de toekomst. Geef ofwel `day` (dag van de maand) ofwel `weekday` (maandag..zondag); samen mogen ze het beste resultaat geven.",
  inputSchema: z.object({
    weekday: z.enum(dutchWeekdays).optional(),
    day: z.number().int().min(1).max(31).optional(),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
  }),
  outputSchema: z.object({
    iso: z.string(),
    iso8601: z.string(),
    weekdayResolved: z.string(),
    note: z.string().optional(),
  }),
  execute: async ({ weekday, day, hour, minute }) => {
    const now = new Date();
    let target: Date | null = null;
    let note: string | undefined;

    if (typeof day === "number") {
      // Find the next occurrence of `day` (today or up to ~62 days ahead).
      for (let i = 0; i < 62; i++) {
        const candidate = new Date(now);
        candidate.setDate(now.getDate() + i);
        if (candidate.getDate() === day) {
          candidate.setHours(hour, minute, 0, 0);
          if (candidate.getTime() <= now.getTime() && i === 0) continue;
          if (weekday) {
            const wIdx = dutchWeekdays.indexOf(weekday);
            if (candidate.getDay() !== wIdx) {
              continue;
            }
          }
          target = candidate;
          break;
        }
      }
      if (!target && weekday) {
        note =
          "Geen volgende datum gevonden die dag-van-maand én weekdag combineert; probeer alleen op weekdag.";
      }
    }

    if (!target && weekday) {
      const wIdx = dutchWeekdays.indexOf(weekday);
      const t = new Date(now);
      const offset = (wIdx - t.getDay() + 7) % 7 || 7;
      t.setDate(t.getDate() + offset);
      t.setHours(hour, minute, 0, 0);
      target = t;
    }

    if (!target) {
      throw new Error("Geef minstens `day` of `weekday` mee.");
    }

    return {
      iso: target.toISOString(),
      iso8601: target.toISOString(),
      weekdayResolved: dutchWeekdays[target.getDay()]!,
      note,
    };
  },
});

/* -------------------------- match-draft CRUD ------------------------------ */

export const readMatchDraftTool = createTool({
  id: "read-match-draft",
  description:
    "Lees de actieve draft-match (1 per gebruiker). Geeft null als er nog geen draft is. `openSlots` = totalSlots − confirmedSlotNames − acceptedPlayerRefs.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    draft: z
      .object({
        id: z.string(),
        clubId: z.string().nullable(),
        clubIds: z.array(z.string()),
        scheduledAt: z.string().nullable(),
        durationMinutes: z.number(),
        format: matchFormatSchema,
        totalSlots: z.number(),
        confirmedSlotNames: z.array(z.string()),
        invitedFriendRefs: z.array(z.string()),
        acceptedPlayerRefs: z.array(z.string()),
        openSlots: z.number(),
        fallbackToLevelRange: z.boolean(),
        fallbackLevelMin: padelLevelSchema.nullable(),
        fallbackLevelMax: padelLevelSchema.nullable(),
        fallbackLevelDelayMinutes: z.number(),
        fallbackToEveryone: z.boolean(),
        fallbackEveryoneDelayMinutes: z.number(),
        status: z.string(),
      })
      .nullable(),
  }),
  execute: async (_input, context) => {
    const userId = context?.requestContext?.get("userId") as string | undefined;
    if (!userId) return { draft: null };
    const draft = await findDraftMatch(userId);
    if (!draft) return { draft: null };
    return {
      draft: {
        id: draft.id,
        clubId: draft.clubId,
        clubIds: draft.clubIds,
        scheduledAt: draft.scheduledAt,
        durationMinutes: draft.durationMinutes,
        format: draft.format,
        totalSlots: draft.totalSlots,
        confirmedSlotNames: draft.confirmedSlotNames,
        invitedFriendRefs: draft.invitedFriendRefs,
        acceptedPlayerRefs: acceptedPlayerRefsOf(draft),
        openSlots: openSlotsOf(draft),
        fallbackToLevelRange: draft.fallbackToLevelRange,
        fallbackLevelMin: draft.fallbackLevelMin,
        fallbackLevelMax: draft.fallbackLevelMax,
        fallbackLevelDelayMinutes: draft.fallbackLevelDelayMinutes,
        fallbackToEveryone: draft.fallbackToEveryone,
        fallbackEveryoneDelayMinutes: draft.fallbackEveryoneDelayMinutes,
        status: draft.status,
      },
    };
  },
});

export const upsertMatchDraftTool = createTool({
  id: "upsert-match-draft",
  description:
    "Maak een draft-match aan voor de actieve gebruiker (als er nog geen is) en/of werk velden bij. Geef alleen velden mee die je wilt zetten — niet meegegeven velden blijven ongewijzigd. Geef scheduledAt als ISO-string (zie parse-dutch-datetime). Bij een Playtomic-paste: geef totalSlots=4 en confirmedSlotNames met alle ✅-namen mee, zodat openSlots automatisch klopt.",
  inputSchema: z.object({
    clubId: z.string().optional().describe("Enkele club; gebruik clubIds voor meerdere."),
    clubIds: z
      .array(z.string())
      .optional()
      .describe("Eén of meerdere club-ids uit de voorkeurclubs van de gebruiker."),
    scheduledAt: z
      .string()
      .datetime({ offset: true })
      .optional()
      .describe("ISO datetime, bv. 2026-05-19T08:30:00.000Z"),
    durationMinutes: z.number().int().min(30).max(240).optional(),
    format: matchFormatSchema.optional(),
    totalSlots: z
      .number()
      .int()
      .min(2)
      .max(8)
      .optional()
      .describe("Aantal speelplaatsen — bij padel is dit 4."),
    confirmedSlotNames: z
      .array(z.string())
      .optional()
      .describe(
        "Namen van spelers die al bevestigd zijn (✅ in een Playtomic-paste, of de organisator zelf voor een eigen match).",
      ),
    invitedFriendRefs: z
      .array(z.string())
      .optional()
      .describe(
        "Lijst van player-refs (telefoonnummers) uit de favorietenlijst van de gebruiker.",
      ),
    fallbackToLevelRange: z.boolean().optional(),
    fallbackLevelMin: padelLevelSchema.optional(),
    fallbackLevelMax: padelLevelSchema.optional(),
    fallbackLevelDelayMinutes: z
      .number()
      .int()
      .min(0)
      .max(720)
      .optional()
      .describe("Minuten na de eerste invite-golf voor de niveau-fallback."),
    fallbackToEveryone: z.boolean().optional(),
    fallbackEveryoneDelayMinutes: z
      .number()
      .int()
      .min(0)
      .max(1440)
      .optional()
      .describe("Minuten na de eerste invite-golf voor de iedereen-fallback."),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    error: z.string().optional(),
    draftId: z.string().optional(),
    openSlots: z.number().optional(),
  }),
  execute: async (input, context) => {
    const userId = context?.requestContext?.get("userId") as string | undefined;
    if (!userId) return { ok: false, error: "no_user_context" };

    const user = await findUserById(userId);
    if (!user) return { ok: false, error: "user_not_found" };

    const draft = await findOrCreateDraftMatch(userId);

    // Validate invitedFriendRefs are actually in the user's favorites.
    const refs =
      input.invitedFriendRefs &&
      input.invitedFriendRefs.filter((r) => user.favoritePlayerRefs.includes(r));

    const clubIds =
      input.clubIds ??
      (input.clubId !== undefined
        ? input.clubId
          ? [input.clubId]
          : []
        : undefined);

    try {
      const updated = await updateMatchDraft(draft.id, {
        ...(clubIds !== undefined ? { clubIds } : {}),
        scheduledAt: input.scheduledAt,
        durationMinutes: input.durationMinutes,
        format: input.format,
        totalSlots: input.totalSlots,
        confirmedSlotNames: input.confirmedSlotNames,
        invitedFriendRefs: refs,
        fallbackToLevelRange: input.fallbackToLevelRange,
        fallbackLevelMin: input.fallbackLevelMin as PadelLevel | undefined,
        fallbackLevelMax: input.fallbackLevelMax as PadelLevel | undefined,
        fallbackLevelDelayMinutes: input.fallbackLevelDelayMinutes,
        fallbackToEveryone: input.fallbackToEveryone,
        fallbackEveryoneDelayMinutes: input.fallbackEveryoneDelayMinutes,
      });
      return { ok: true, draftId: draft.id, openSlots: openSlotsOf(updated) };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "update_failed",
      };
    }
  },
});

export const finalizeMatchTool = createTool({
  id: "finalize-match",
  description:
    "Bevestig de draft-match: zet de status op 'open'. Roep dit pas aan als de essentiële velden (datum, club) ingevuld zijn. Geeft een korte samenvatting terug.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    ok: z.boolean(),
    error: z.string().optional(),
    matchId: z.string().optional(),
    summary: z.string().optional(),
    listUrl: z.string().nullable().optional(),
  }),
  execute: async (_input, context) => {
    const userId = context?.requestContext?.get("userId") as string | undefined;
    if (!userId) return { ok: false, error: "no_user_context" };

    const user = await findUserById(userId);
    if (!user) return { ok: false, error: "user_not_found" };

    const draft = await findDraftMatch(userId);
    if (!draft) return { ok: false, error: "no_draft" };
    if (!draft.scheduledAt || draft.clubIds.length === 0) {
      return { ok: false, error: "draft_incomplete" };
    }

    const finalized = await finalizeMatchDraft(draft.id, "open");
    // Phase E.0: fire phase-1 invite messages now that the match is live.
    // Safe to await — POC scale, and surfacing failures to the agent turn
    // is better than silently dropping invites.
    await dispatchPendingInvites(finalized.id, new Date());
    const clubs = await getClubsByIds(draft.clubIds);
    const db = await getDatabase();
    const inviteeNames = finalized.invitedFriendRefs
      .map((ref) => db.players.find((p) => p.ref === ref)?.name ?? ref)
      .join(", ");

    const openSlots = openSlotsOf(finalized);

    const summaryParts = [
      `${formatMatchFormat(finalized.format)} match`,
      clubs.length > 0
        ? `bij ${clubs.map((c) => c.name).join(" / ")}`
        : null,
      finalized.scheduledAt
        ? `op ${new Date(finalized.scheduledAt).toLocaleString("nl-BE", {
            weekday: "long",
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
          })}`
        : null,
    ].filter(Boolean);

    const slotsLine =
      openSlots === 0
        ? "Volzet."
        : openSlots === 1
          ? "1 open plaats."
          : `${openSlots} open plaatsen.`;

    const summary = `${summaryParts.join(" ")}. ${slotsLine}${
      inviteeNames ? ` Uitgenodigd: ${inviteeNames}.` : ""
    }`;

    const listUrl = `${resolveAppOrigin(context)}/match/${user.manageToken}?created=${finalized.id}`;

    return { ok: true, matchId: finalized.id, summary, listUrl };
  },
});

/* ------------------------------ list-all-clubs ---------------------------- */

/**
 * Fallback when `search-clubs` returns nothing for a Playtomic-shaped name.
 * Returns the entire catalog (id, name, city, province) so the LLM can do
 * fuzzy matching itself and propose 2-3 candidates to the user.
 *
 * Yes — this is intentionally a big payload. 329 clubs × ~80 bytes ≈ 25KB,
 * which fits comfortably in the model context. It's only called as a
 * fallback, not on every turn.
 */
export const listAllClubsTool = createTool({
  id: "list-all-clubs",
  description:
    "Geeft de volledige lijst Vlaamse padelclubs (id, naam, gemeente, provincie). Gebruik dit ALLEEN als 'search-clubs' geen of geen goede match geeft voor de clubnaam uit de paste. Doe daarna zelf fuzzy matching en stel max 3 kandidaten voor aan de gebruiker. Filter eventueel op stad als die in de paste vermeld staat.",
  inputSchema: z.object({
    city: z
      .string()
      .optional()
      .describe(
        "Optionele stad-filter (case-insensitive substring). Beperkt het resultaat tot clubs in die stad/gemeente.",
      ),
  }),
  outputSchema: z.object({
    count: z.number(),
    clubs: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        city: z.string(),
        province: z.string().optional(),
      }),
    ),
  }),
  execute: async ({ city }) => {
    let clubs = await loadAllClubsCompact();
    if (city) {
      const c = city.trim().toLowerCase();
      clubs = clubs.filter((club) => club.city.toLowerCase().includes(c));
    }
    return { count: clubs.length, clubs };
  },
});

/* ---------------------- link-playtomic-name ------------------------------- */

/**
 * Persist the original Playtomic-style name onto a club so the NEXT paste
 * with that exact text resolves directly via `search-clubs`. Use this only
 * after the user has explicitly confirmed the right club.
 */
export const linkPlaytomicNameTool = createTool({
  id: "link-playtomic-name",
  description:
    "Bewaar de Playtomic-naam (de volledige clubtekst uit de paste, bv. 'GARRINCHA GENT THE LOOP') als alias op de club, zodat search-clubs hem volgende keer direct vindt. Roep dit pas aan NADAT de gebruiker expliciet bevestigd heeft welke club het is.",
  inputSchema: z.object({
    clubId: z.string().describe("Id uit list-all-clubs / search-clubs."),
    playtomicName: z
      .string()
      .min(1)
      .describe(
        "De originele tekst zoals die in het Playtomic-bericht stond (bv. 'GARRINCHA GENT THE LOOP').",
      ),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    error: z.string().optional(),
    club: z
      .object({
        id: z.string(),
        name: z.string(),
        city: z.string(),
        playtomicNames: z.array(z.string()).optional(),
      })
      .optional(),
  }),
  execute: async ({ clubId, playtomicName }) => {
    const result = await addPlaytomicAlias(clubId, playtomicName);
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      club: {
        id: result.club.id,
        name: result.club.name,
        city: result.club.city,
        playtomicNames: result.club.playtomicNames,
      },
    };
  },
});
