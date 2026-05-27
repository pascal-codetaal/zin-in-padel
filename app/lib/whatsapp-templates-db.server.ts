import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { WhatsAppTemplate } from "@prisma/client";
import { prisma } from "~/lib/prisma.server";
import {
  createTwilioContentTemplate,
  fetchTwilioWhatsAppApproval,
  submitTwilioWhatsAppApproval,
  type TwilioContentCreatePayload,
  type TwilioWhatsAppApprovalStatus,
} from "~/lib/twilio-content.server";
import {
  templateDefinitionById,
  WHATSAPP_TEMPLATE_REGISTRY,
  type WhatsAppTemplateDefinition,
} from "@whatsapp-templates/registry";
import { resolveInviteTemplateBaseUrl } from "@whatsapp-templates/invites/url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const templatesRoot = path.join(repoRoot, "whatsapp-templates");

export type WhatsAppTemplateRow = WhatsAppTemplate;

export function isTemplateApproved(
  row: Pick<WhatsAppTemplate, "approvalStatus" | "contentSid">,
): boolean {
  return row.approvalStatus === "approved" && Boolean(row.contentSid?.trim());
}

export async function findWhatsAppTemplateById(
  id: string,
): Promise<WhatsAppTemplate | null> {
  return prisma.whatsAppTemplate.findUnique({ where: { id } });
}

export async function findApprovedWhatsAppTemplate(
  id: string,
): Promise<WhatsAppTemplate | null> {
  const row = await findWhatsAppTemplateById(id);
  if (!row || !isTemplateApproved(row)) return null;
  return row;
}

export async function listWhatsAppTemplates(): Promise<WhatsAppTemplate[]> {
  return prisma.whatsAppTemplate.findMany({ orderBy: { id: "asc" } });
}

export async function seedWhatsAppTemplateRegistry(now = new Date()): Promise<{
  created: number;
  existing: number;
}> {
  let created = 0;
  let existing = 0;

  for (const def of WHATSAPP_TEMPLATE_REGISTRY) {
    const row = await prisma.whatsAppTemplate.findUnique({ where: { id: def.id } });
    if (row) {
      existing += 1;
      continue;
    }
    await prisma.whatsAppTemplate.create({
      data: {
        id: def.id,
        friendlyName: def.friendlyName,
        whatsappName: def.whatsappName,
        category: def.category,
        approvalStatus: "draft",
        contentSourcePath: def.contentSourcePath,
        createdAt: now,
        updatedAt: now,
      },
    });
    created += 1;
  }

  return { created, existing };
}

export async function loadContentPayload(
  def: WhatsAppTemplateDefinition,
): Promise<TwilioContentCreatePayload> {
  const filePath = path.join(templatesRoot, def.contentSourcePath);
  const raw = await readFile(filePath, "utf8");
  const payload = JSON.parse(raw) as TwilioContentCreatePayload;
  return patchInviteTemplateBaseUrl(payload);
}

/** Replace sample host in CTA URLs with BASE_URL / APP_ORIGIN at registration time. */
function patchInviteTemplateBaseUrl(
  payload: TwilioContentCreatePayload,
): TwilioContentCreatePayload {
  const base = resolveInviteTemplateBaseUrl();
  const cta = payload.types?.["twilio/call-to-action"] as
    | { actions?: Array<{ type?: string; url?: string }> }
    | undefined;
  if (!cta?.actions) return payload;

  for (const action of cta.actions) {
    if (action.type === "URL" && typeof action.url === "string") {
      action.url = action.url.replace("https://zip.app", base);
    }
  }
  return payload;
}

export async function registerWhatsAppTemplateFromRepo(
  templateId: string,
  options: { submitApproval?: boolean } = {},
): Promise<WhatsAppTemplate> {
  const def = templateDefinitionById(templateId);
  if (!def) {
    throw new Error(`Unknown template id: ${templateId}`);
  }

  const now = new Date();
  await seedWhatsAppTemplateRegistry(now);

  const payload = await loadContentPayload(def);
  const created = await createTwilioContentTemplate(payload);

  let approvalStatus: TwilioWhatsAppApprovalStatus = "unsubmitted";
  let rejectionReason: string | null = null;

  if (options.submitApproval !== false) {
    await submitTwilioWhatsAppApproval({
      contentSid: created.sid,
      name: def.whatsappName,
      category: def.category,
    });
    const approval = await fetchTwilioWhatsAppApproval(created.sid);
    approvalStatus = approval.status;
    rejectionReason = approval.rejectionReason;
  }

  return prisma.whatsAppTemplate.upsert({
    where: { id: def.id },
    create: {
      id: def.id,
      friendlyName: created.friendlyName,
      contentSid: created.sid,
      whatsappName: def.whatsappName,
      category: def.category,
      approvalStatus,
      rejectionReason,
      contentSourcePath: def.contentSourcePath,
      lastSyncedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    update: {
      friendlyName: created.friendlyName,
      contentSid: created.sid,
      whatsappName: def.whatsappName,
      category: def.category,
      approvalStatus,
      rejectionReason,
      contentSourcePath: def.contentSourcePath,
      lastSyncedAt: now,
      updatedAt: now,
    },
  });
}

export async function syncWhatsAppTemplateApproval(
  templateId: string,
): Promise<WhatsAppTemplate | null> {
  const row = await findWhatsAppTemplateById(templateId);
  if (!row?.contentSid) return row;

  const approval = await fetchTwilioWhatsAppApproval(row.contentSid);
  const now = new Date();

  return prisma.whatsAppTemplate.update({
    where: { id: templateId },
    data: {
      approvalStatus: approval.status,
      rejectionReason: approval.rejectionReason,
      whatsappName: approval.whatsappName ?? row.whatsappName,
      lastSyncedAt: now,
      updatedAt: now,
    },
  });
}

export async function syncAllWhatsAppTemplateApprovals(): Promise<
  Array<{ id: string; status: string; skipped: boolean }>
> {
  const rows = await listWhatsAppTemplates();
  const results: Array<{ id: string; status: string; skipped: boolean }> = [];

  for (const row of rows) {
    if (!row.contentSid) {
      results.push({ id: row.id, status: row.approvalStatus, skipped: true });
      continue;
    }
    const updated = await syncWhatsAppTemplateApproval(row.id);
    results.push({
      id: row.id,
      status: updated?.approvalStatus ?? row.approvalStatus,
      skipped: false,
    });
  }

  return results;
}

export async function setWhatsAppTemplateContentSid(input: {
  templateId: string;
  contentSid: string;
}): Promise<WhatsAppTemplate> {
  const def = templateDefinitionById(input.templateId);
  if (!def) {
    throw new Error(`Unknown template id: ${input.templateId}`);
  }

  const now = new Date();
  await seedWhatsAppTemplateRegistry(now);

  return prisma.whatsAppTemplate.upsert({
    where: { id: input.templateId },
    create: {
      id: def.id,
      friendlyName: def.friendlyName,
      contentSid: input.contentSid,
      whatsappName: def.whatsappName,
      category: def.category,
      approvalStatus: "unsubmitted",
      contentSourcePath: def.contentSourcePath,
      lastSyncedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    update: {
      contentSid: input.contentSid,
      lastSyncedAt: now,
      updatedAt: now,
    },
  });
}
