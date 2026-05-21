import {
  addFavoriteToUser,
  clearPendingPhoneCapture,
  clearPendingPlayerChoice,
  findUserById,
  setPendingPhoneCapture,
  setPendingPlayerChoice,
  upsertTvPlayer,
} from "~/lib/db.server";
import { parsePhoneFromText } from "~/lib/phone.server";
import { searchTvPlayers } from "~/lib/tennis-vlaanderen.server";
import type { TvPlayerCandidate, User } from "~/types/domain";
import {
  formatTvPlayerLine,
  formatTvPlayerName,
  playerRefFromNumFed,
} from "~/types/domain";

export type LookupResult =
  | { status: "not_found"; query: string }
  | { status: "single"; player: TvPlayerCandidate }
  | { status: "multiple"; query: string; candidates: TvPlayerCandidate[] };

export function phonePrompt(name: string): string {
  return `Welk mobiel nummer heeft ${name}? Stuur het nummer (bv. 0470123456).`;
}

export async function lookupTvPlayer(query: string): Promise<LookupResult> {
  const candidates = await searchTvPlayers(query);
  if (candidates.length === 0) {
    return { status: "not_found", query };
  }
  if (candidates.length === 1) {
    return { status: "single", player: candidates[0]! };
  }
  return { status: "multiple", query, candidates };
}

export function formatMultipleChoice(
  query: string,
  candidates: TvPlayerCandidate[],
): string {
  const lines = candidates.map((c, i) => formatTvPlayerLine(c, i + 1));
  return `Ik vond meerdere spelers voor "${query}":\n\n${lines.join("\n")}\n\nAntwoord met het nummer van de juiste persoon.`;
}

export async function saveTvPlayerAsFavorite(
  userId: string,
  candidate: TvPlayerCandidate,
  phone: string,
): Promise<{ name: string; ref: string; alreadyFavorite: boolean }> {
  const ref = playerRefFromNumFed(candidate.numFed);
  const name = formatTvPlayerName(candidate);
  const existing = await findUserById(userId);
  const alreadyFavorite =
    existing?.favoritePlayerRefs.includes(ref) ?? false;

  await upsertTvPlayer({
    ref,
    name,
    phone,
    tvMemberId: candidate.memberId,
    tvNumFed: candidate.numFed,
    tvRanking: candidate.ranking,
  });
  await addFavoriteToUser(userId, ref);
  await clearPendingPhoneCapture(userId);

  return { name, ref, alreadyFavorite };
}

export async function stagePhoneCapture(
  userId: string,
  candidate: TvPlayerCandidate,
): Promise<{ name: string; message: string }> {
  const name = formatTvPlayerName(candidate);
  await setPendingPhoneCapture(userId, { candidate });
  return { name, message: phonePrompt(name) };
}

export async function startPendingChoice(
  userId: string,
  query: string,
  candidates: TvPlayerCandidate[],
): Promise<User> {
  return setPendingPlayerChoice(userId, { query, candidates });
}

export async function tryResolvePendingChoice(
  user: User,
  body: string,
): Promise<{ handled: true; reply: string; user: User } | { handled: false }> {
  const pending = user.pendingPlayerChoice;
  if (!pending) return { handled: false };

  const match = body.trim().match(/^(\d{1,2})$/);
  if (!match) return { handled: false };

  const index = Number.parseInt(match[1]!, 10) - 1;
  const candidate = pending.candidates[index];
  if (!candidate) {
    return {
      handled: true,
      reply: `Kies een nummer tussen 1 en ${pending.candidates.length}.`,
      user,
    };
  }

  const { message } = await stagePhoneCapture(user.id, candidate);
  const updated = await clearPendingPlayerChoice(user.id);

  return {
    handled: true,
    reply: message,
    user: updated,
  };
}

export async function tryResolvePendingPhone(
  user: User,
  body: string,
): Promise<{ handled: true; reply: string; user: User } | { handled: false }> {
  const pending = user.pendingPhoneCapture;
  if (!pending) return { handled: false };

  const phone = parsePhoneFromText(body);
  if (!phone) {
    return {
      handled: true,
      reply: `Dat lijkt geen geldig mobiel nummer. ${phonePrompt(formatTvPlayerName(pending.candidate))}`,
      user,
    };
  }

  const saved = await saveTvPlayerAsFavorite(
    user.id,
    pending.candidate,
    phone,
  );
  const updated = await findUserById(user.id);
  if (!updated) {
    return { handled: true, reply: messagesInternal.error, user };
  }

  const dup =
    saved.alreadyFavorite ? " Die stond al in je maatjeslijst." : "";
  return {
    handled: true,
    reply: `${saved.name} toegevoegd (${phone}).${dup}`,
    user: updated,
  };
}

const messagesInternal = {
  error: "Er ging iets mis. Probeer opnieuw.",
};

export async function lookupAndStage(
  userId: string,
  query: string,
  phone?: string,
): Promise<
  | { ok: true; added: { name: string; ref: string; alreadyFavorite: boolean; phone: string } }
  | { ok: true; pending: true; message: string; reason: "choice" | "phone" }
  | { ok: false; error: "not_found"; query: string }
> {
  const result = await lookupTvPlayer(query);

  if (result.status === "not_found") {
    return { ok: false, error: "not_found", query: result.query };
  }

  if (result.status === "multiple") {
    await startPendingChoice(userId, result.query, result.candidates);
    return {
      ok: true,
      pending: true,
      reason: "choice",
      message: formatMultipleChoice(result.query, result.candidates),
    };
  }

  const candidate = result.player;
  const normalizedPhone = phone ? parsePhoneFromText(phone) : null;

  if (!normalizedPhone) {
    const staged = await stagePhoneCapture(userId, candidate);
    return {
      ok: true,
      pending: true,
      reason: "phone",
      message: staged.message,
    };
  }

  const added = await saveTvPlayerAsFavorite(
    userId,
    candidate,
    normalizedPhone,
  );
  return { ok: true, added: { ...added, phone: normalizedPhone } };
}

export async function setPhoneForPendingOrRef(
  userId: string,
  phone: string,
  playerRef?: string,
): Promise<
  | { ok: true; added: { name: string; ref: string; phone: string } }
  | { ok: false; error: string }
> {
  const user = await findUserById(userId);
  if (!user) return { ok: false, error: "user_not_found" };

  const normalized = parsePhoneFromText(phone);
  if (!normalized) return { ok: false, error: "invalid_phone" };

  if (user.pendingPhoneCapture) {
    const added = await saveTvPlayerAsFavorite(
      userId,
      user.pendingPhoneCapture.candidate,
      normalized,
    );
    return {
      ok: true,
      added: { name: added.name, ref: added.ref, phone: normalized },
    };
  }

  if (playerRef) {
    const { findPlayerByRef } = await import("~/lib/db.server");
    const player = await findPlayerByRef(playerRef);
    if (!player) return { ok: false, error: "player_not_found" };
    await upsertTvPlayer({ ...player, phone: normalized });
    return {
      ok: true,
      added: { name: player.name, ref: player.ref, phone: normalized },
    };
  }

  return { ok: false, error: "no_pending_player" };
}
