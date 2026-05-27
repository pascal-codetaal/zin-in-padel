# WhatsApp message templates

Copy and Twilio Content payloads for outbound WhatsApp. **Registration state** (`contentSid`, Meta approval) lives in Postgres (`WhatsAppTemplate` table).

## Layout

| Path | Purpose |
|------|---------|
| `registry.ts` | Stable template ids + paths to JSON payloads |
| `shared.ts` | CTA button labels, STOP footer |
| `invites/` | Cascade invite formatters + `variables.ts` for `ContentVariables` |
| `invites/twilio/` | Content API JSON submitted to Twilio |
| `bot/` | Hardcoded bot commands |
| `organiser/` | Messages to the match organiser |
| `invitee/` | Removed / cancelled notices |

## Database (`WhatsAppTemplate`)

| Column | Meaning |
|--------|---------|
| `id` | App key, e.g. `invite_phase_1` |
| `contentSid` | Twilio `HX…` after create |
| `approvalStatus` | `draft` → `received` / `pending` → `approved` or `rejected` |
| `rejectionReason` | From Twilio when Meta rejects |

Cascade invites use an approved template when `approvalStatus === 'approved'` and `contentSid` is set; otherwise they fall back to plain text (`formatInviteMessage`).

## Commands

```bash
# Apply migration (once)
pnpm prisma:migrate

# Insert registry rows (draft, no Twilio API)
pnpm templates:seed

# Create in Twilio + submit to Meta (one or all)
pnpm templates:register invite_phase_1
pnpm templates:register --all

# Already created in Console? Link SID manually, then sync
pnpm templates:register --set-sid invite_phase_1 HXxxxxxxxx

# Refresh approval status from Twilio
pnpm templates:sync
```

## Register manually (curl)

```bash
curl -X POST "https://content.twilio.com/v1/Content" \
  -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d @whatsapp-templates/invites/twilio/phase-1.content.json

pnpm templates:register --set-sid invite_phase_1 HX…
pnpm templates:sync
```

## App imports

- `@whatsapp-templates/invites/format` — plain-text body
- `@whatsapp-templates/invites/variables` — `ContentVariables` map
- `~/lib/whatsapp-templates-db.server` — DB + sync/register helpers

Legacy re-exports: `~/lib/cascade/format`, `~/lib/bot-messages.nl`.
