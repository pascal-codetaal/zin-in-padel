import { findPadelstatsMemberById } from "~/lib/padelstats-catalog.server";
import { parsePhoneFromText } from "~/lib/phone.server";
import { WAITLIST_CONSENT_TEXT_VERSION } from "~/lib/waitlist-consent.shared";
import type { WaitlistFormError } from "~/lib/waitlist-form.shared";

export type { WaitlistFormError } from "~/lib/waitlist-form.shared";
export { WAITLIST_ERROR_MESSAGES } from "~/lib/waitlist-form.shared";

export type WaitlistFormInput = {
  phone: string;
  tvMemberId: number;
  clubId: string | null;
  consent: boolean;
  consentTextVersion: string;
};

export async function parseWaitlistForm(
  form: FormData,
): Promise<
  { ok: true; data: WaitlistFormInput } | { ok: false; error: WaitlistFormError }
> {
  if (form.get("website")?.toString().trim()) {
    return { ok: false, error: "honeypot" };
  }

  const phoneRaw = form.get("phone")?.toString() ?? "";
  const phone = parsePhoneFromText(phoneRaw);
  if (!phone) {
    return { ok: false, error: "phone_invalid" };
  }

  const memberRaw =
    form.get("tvMemberId")?.toString().trim() ??
    form.get("padelstatsMemberId")?.toString().trim() ??
    "";
  const tvMemberId = Number.parseInt(memberRaw, 10);
  if (!memberRaw || Number.isNaN(tvMemberId)) {
    return { ok: false, error: "member_required" };
  }

  const member = await findPadelstatsMemberById(tvMemberId);
  if (!member) {
    return { ok: false, error: "member_not_found" };
  }

  const clubIdRaw = form.get("clubId")?.toString().trim() ?? "";
  const clubId = clubIdRaw || member.clubId || null;

  const consent = form.get("consent") === "on" || form.get("consent") === "true";
  if (!consent) {
    return { ok: false, error: "consent_required" };
  }

  return {
    ok: true,
    data: {
      phone,
      tvMemberId,
      clubId,
      consent,
      consentTextVersion: WAITLIST_CONSENT_TEXT_VERSION,
    },
  };
}
