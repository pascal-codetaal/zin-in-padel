/** Stable DB / app key for the registrable invite template. */
export const INVITE_WHATSAPP_TEMPLATE_ID = "invite_phase_1" as const;

export type WhatsAppTemplateKey = typeof INVITE_WHATSAPP_TEMPLATE_ID;

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
    id: INVITE_WHATSAPP_TEMPLATE_ID,
    friendlyName: "zip_invite_phase_1_v2",
    whatsappName: "padel_invite_phase_1",
    category: "UTILITY",
    contentSourcePath: "invites/twilio/phase-1.content.json",
  },
];

export function templateDefinitionById(
  id: string,
): WhatsAppTemplateDefinition | undefined {
  return WHATSAPP_TEMPLATE_REGISTRY.find((row) => row.id === id);
}
