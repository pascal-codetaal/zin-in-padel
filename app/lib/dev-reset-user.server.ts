import { assertDevOnly } from "~/lib/dev-guard.server";
import {
  deleteMessagesForUser,
  discardMatchDraft,
  findDraftMatch,
} from "~/lib/db.server";
import { deleteAgentThread } from "~/lib/mastra/memory.server";
import { prisma } from "~/lib/prisma.server";
import { optOutUser } from "~/lib/user-session.server";

export type DevUserResetResult = {
  messagesDeleted: number;
  mastraThreadDeleted: boolean;
  draftDiscarded: boolean;
};

/**
 * Dev-only: wipe WhatsApp log + agent memory thread, discard match draft,
 * and reset opt-in / onboarding / profile (same as STOP + cleared history).
 */
export async function resetDevSimulatorUser(
  userId: string,
): Promise<DevUserResetResult> {
  assertDevOnly();

  const messagesDeleted = await deleteMessagesForUser(userId);
  const mastraThreadDeleted = await deleteAgentThread(userId);

  const draft = await findDraftMatch(userId);
  if (draft) {
    await discardMatchDraft(draft.id);
  }

  await optOutUser(userId);
  await prisma.user.update({
    where: { id: userId },
    data: { onboardingStep: null },
  });

  return {
    messagesDeleted,
    mastraThreadDeleted,
    draftDiscarded: Boolean(draft),
  };
}
