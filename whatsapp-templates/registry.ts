import type { FiringPhase } from "~/lib/cascade/types";

/** Stable DB / app keys for each registrable template. */
export type WhatsAppTemplateKey =
  | "invite_phase_1"
  | "invite_phase_2"
  | "invite_phase_3";

export const INVITE_TEMPLATE_KEY_BY_PHASE: Record<FiringPhase, WhatsAppTemplateKey> =
  {
    1: "invite_phase_1",
    2: "invite_phase_2",
    3: "invite_phase_3",
  };

export type WhatsAppTemplateDefinition = {
  id: WhatsAppTemplateKey;
  friendlyName: string;
  /** Name passed to Meta on approval submit. */
  whatsappName: string;
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  /** Path under `whatsapp-templates/` to the Content API JSON payload. */
  contentSourcePath: string;
};

export const WHATSAPP_TEMPLATE_REGISTRY: WhatsAppTemplateDefinition[] = [
  {
    id: "invite_phase_1",
    friendlyName: "zip_invite_phase_1_v2",
    whatsappName: "padel_invite_phase_1",
    category: "UTILITY",
    contentSourcePath: "invites/twilio/phase-1.content.json",
  },
  {
    id: "invite_phase_2",
    friendlyName: "zip_invite_phase_2_v3",
    whatsappName: "padel_invite_phase_2",
    category: "UTILITY",
    contentSourcePath: "invites/twilio/phase-2.content.json",
  },
  {
    id: "invite_phase_3",
    friendlyName: "zip_invite_phase_3_v3",
    whatsappName: "padel_invite_phase_3",
    category: "UTILITY",
    contentSourcePath: "invites/twilio/phase-3.content.json",
  },
];

export function templateDefinitionById(
  id: string,
): WhatsAppTemplateDefinition | undefined {
  return WHATSAPP_TEMPLATE_REGISTRY.find((row) => row.id === id);
}
