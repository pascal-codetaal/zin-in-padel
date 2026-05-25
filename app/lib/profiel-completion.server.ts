import { findUserById, updateUserProfile } from "~/lib/db.server";
import { messages } from "~/lib/bot-messages.nl";
import { buildNewMatchPageUrl } from "~/lib/maatjes-url.server";
import { firstNameFromDisplayName, formatPersonName } from "~/lib/person-name";
import { isProfielFormComplete } from "~/lib/profiel-completion";
import { sendWhatsAppMessage } from "~/lib/whatsapp-messaging.server";

export type { ProfielFormUser, ProfielStepSlug };
export {
  isProfielFormComplete,
  isProfielStepComplete,
  PROFIEL_STEP_SLUGS,
} from "~/lib/profiel-completion";

export type FinishProfielFromWebResult =
  | { ok: true; newlyComplete: boolean; whatsAppSent: boolean }
  | { ok: false; error: "user_not_found" | "profiel_incomplete" };

/**
 * Mark onboarding complete after the web wizard, and notify opted-in users
 * on WhatsApp (once per completion).
 */
export async function finishProfielFromWeb(
  userId: string,
  request: Request,
): Promise<FinishProfielFromWebResult> {
  const user = await findUserById(userId);
  if (!user) return { ok: false, error: "user_not_found" };

  if (!isProfielFormComplete(user)) {
    return { ok: false, error: "profiel_incomplete" };
  }

  if (user.onboardingComplete) {
    return { ok: true, newlyComplete: false, whatsAppSent: false };
  }

  await updateUserProfile(userId, { onboardingComplete: true });

  let whatsAppSent = false;
  if (user.optedIn) {
    const firstName =
      user.firstName?.trim() ||
      firstNameFromDisplayName(user.profileName) ||
      formatPersonName({
        firstName: user.firstName,
        lastName: user.lastName,
        profileName: user.profileName,
        fallback: "speler",
      });
    const newMatchUrl = buildNewMatchPageUrl(request, user.manageToken);
    await sendWhatsAppMessage(
      userId,
      messages.profileCompleteFromWeb(firstName, newMatchUrl),
    );
    whatsAppSent = true;
  }

  return { ok: true, newlyComplete: true, whatsAppSent };
}
