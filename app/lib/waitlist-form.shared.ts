export type WaitlistFormError =
  | "honeypot"
  | "phone_invalid"
  | "member_required"
  | "member_not_found"
  | "consent_required";

export const WAITLIST_ERROR_MESSAGES: Record<WaitlistFormError, string> = {
  honeypot: "Er ging iets mis. Probeer opnieuw.",
  phone_invalid: "Vul een geldig Belgisch of Nederlands mobiel nummer in.",
  member_required: "Kies jezelf uit de spelerslijst.",
  member_not_found: "Speler niet gevonden. Zoek opnieuw en kies uit de lijst.",
  consent_required: "Je moet akkoord gaan om je gegevens te bewaren.",
};
