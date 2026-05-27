# Zin in Padel

WhatsApp bot voor padel met een React Router v7 admin-dashboard. Backend-endpoints draaien als **resource routes** (geen aparte Express-server).

## Stack

- [React Router v7](https://reactrouter.com/) (Framework mode, SSR)
- TypeScript
- [Vercel](https://vercel.com/) deployment via [`@vercel/react-router`](https://vercel.com/docs/frameworks/react-router)
- [Twilio WhatsApp](https://www.twilio.com/docs/whatsapp) webhook
- [Supabase](https://supabase.com/) Postgres via Prisma

## Database (Supabase Postgres)

De app gebruikt **PostgreSQL op Supabase**. Zet in `.env` (zie `.env.example`):

- `DATABASE_URL` — **connection pooler** (poort 6543, `?pgbouncer=true`) voor runtime op Vercel
- `DIRECT_URL` — directe verbinding (poort 5432) voor Prisma-migraties

Haal beide strings op in Supabase: **Project Settings → Database → Connection string**.

Prisma 7 gebruikt één `DATABASE_URL` per commando. Voor migraties tijdelijk de directe URL gebruiken:

```bash
pnpm prisma:generate
DATABASE_URL="$DIRECT_URL" pnpm db:migrate:deploy
```

Daarna weer de pooler-URL in `DATABASE_URL` voor `pnpm dev` / Vercel.

### Bestaande SQLite-data importeren (eenmalig)

Als je nog `data/app.db` hebt:

```bash
# Zorg dat DATABASE_URL naar Supabase wijst en schema deployed is
pnpm db:copy-sqlite
```

### Lokaal ontwikkelen

```bash
pnpm prisma migrate dev   # nieuwe migrations
```

De DB is de source of truth — er is geen JSON-seed meer.

## Vereisten

- Node.js 22 (zie `.nvmrc`, minimum 22.12)
- pnpm 11+ (via [Corepack](https://nodejs.org/api/corepack.html): `corepack enable`)
- Twilio-account met WhatsApp Sandbox (of productie-sender)
- [localtunnel](https://github.com/localtunnel/localtunnel) voor lokale webhook-tests

## Lokale setup

```bash
pnpm install
cp .env.example .env
# Vul TWILIO_* in .env in
pnpm dev
```

De app draait op [http://localhost:5173](http://localhost:5173).

- **Dashboard:** `/`
- **WhatsApp simulator (alleen lokaal):** `/dev/simulator`
- **Webhook:** `POST /webhooks/twilio/whatsapp`

## Omgevingsvariabelen

Kopieer `.env.example` naar `.env`:

| Variabele | Beschrijving |
|-----------|--------------|
| `TWILIO_ACCOUNT_SID` | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token |
| `TWILIO_WHATSAPP_FROM` | WhatsApp-sender, bijv. `whatsapp:+14155238886` |
| `OPENAI_API_KEY` | OpenAI API key voor de Mastra-agent (favorieten-flow) |

Inbound antwoorden gaan via **TwiML** op de webhook; proactieve berichten (bv. profiel klaar) via de **Twilio REST API**. Zet `TWILIO_WEBHOOK_URL` op je publieke tunnel-URL als signature-validatie faalt lokaal.

## localtunnel (lokale webhook)

1. Start de dev-server: `pnpm dev`
2. In een tweede terminal:

   ```bash
   npx localtunnel --port 5173 --subdomain padelbot-dev
   ```

3. Gebruik de vaste URL: `https://padelbot-dev.loca.lt`

## Twilio webhook instellen

In het [Twilio Console](https://console.twilio.com/) → **Messaging** → **Try it out** → **Send a WhatsApp message** (Sandbox), of je WhatsApp-sender:

| Veld | Waarde |
|------|--------|
| **When a message comes in** | `https://<jouw-host>/webhooks/twilio/whatsapp` |
| **HTTP method** | `POST` |

- **Lokaal:** `https://padelbot-dev.loca.lt/webhooks/twilio/whatsapp`
- **Vercel:** `https://<project>.vercel.app/webhooks/twilio/whatsapp`

## WhatsApp-commando's (Nederlands)

| Bericht | Actie |
|---------|--------|
| `JA` | Opt-in + start direct de favorieten-flow |
| `MAATJES` | Start (opnieuw) de favorieten-flow met de Mastra-agent |
| `STOP` | Afmelden (sluit ook actieve flow) |
| `HELP` | Commando-overzicht |

Alle bot-antwoorden staan in `whatsapp-templates/bot/messages.nl.ts` (re-export via `app/lib/bot-messages.nl.ts`).

## Mastra agent (favorieten-flow)

Na `JA` of `MAATJES` neemt een Mastra-agent de conversatie over om favoriete medespelers (naam + mobiel nummer) te verzamelen. De agent eindigt zijn laatste bericht met `[DONE]` (intern, wordt gestript) zodra de gebruiker klaar is — daarna staat `user.activeFlow` weer op `null` en pakken de hardcoded commando's de besturing terug.

Hardcoded commando's: alleen `STOP` (directe opt-out). Overige berichten (`JA`, `HELP`, `MATCH`, …) gaan naar de padel-assistent met sessie-tools (`opt-in`, `opt-out`, `set-active-flow`).

### Agent-geheugen

De agent heeft persistent geheugen via Mastra Memory + **Postgres** (zelfde Supabase DB als de app, `mastra_*` tabellen). Elke gebruiker krijgt een eigen `thread` (`= user.id`). Geconfigureerd in `app/lib/mastra/memory.server.ts` — gebruikt `DATABASE_URL` (directe `db.*.supabase.co:5432` verbinding werkt het best).

### Mastra Studio

Voor het iteratief tunen van het system prompt en handmatig testen van de tools:

```bash
pnpm presets:sync   # presets.json vullen met userId + appOrigin per gebruiker (telefoon in label)
pnpm mastra:dev
```

Open [http://localhost:4111](http://localhost:4111). Studio draait naast `pnpm dev` en gebruikt dezelfde `.env`.

**Request context (belangrijk):** tools zoals `get-new-match-link` en `read-profile` hebben de actieve gebruiker nodig. In Studio kies je bovenaan een **preset** (bv. `Pascal (32484085782)` — het telefoonnummer staat in het label). Die preset injecteert `userId` en `appOrigin` in elke tool-aanroep, net zoals de WhatsApp-webhook dat doet via het Twilio-nummer van de gebruiker.

Optioneel in `.env`: `APP_ORIGIN=http://localhost:5173` (standaard voor presets; productie-URL als je links naar Vercel wilt testen).

**Storage-fout "Tenant or user not found":** `DIRECT_URL` wijst vaak naar de Supabase pooler met user `postgres` — dat moet `postgres.<project-ref>` zijn. Zet `DIRECT_URL` gelijk aan je werkende `DATABASE_URL` (`db.*.supabase.co:5432`), of verwijder `DIRECT_URL` tijdelijk. Mastra gebruikt `DATABASE_URL` vóór `DIRECT_URL`.

## WhatsApp simulator (lokaal)

Voor end-to-end tests zonder Twilio-sandbox of localtunnel:

1. `pnpm dev`
2. Open [http://localhost:5173/dev/simulator](http://localhost:5173/dev/simulator)
3. Kies een gebruiker uit de DB (`data/app.db`) of maak een testgebruiker
4. Bekijk het WhatsApp-gesprek en stuur berichten — dezelfde `handleIncomingMessage`-pipeline als de webhook

De simulator **emuleert Twilio** (inbound/outbound in `messages[]`); de bot, Mastra-agent en geheugen (`data/mastra-memory.db`, `thread = user.id`) zijn identiek aan productie. Vereist `OPENAI_API_KEY` voor de favorieten-flow.

De route is niet beschikbaar als `NODE_ENV=production`.

## Vercel deployment

1. Push naar GitHub en importeer het project in [Vercel](https://vercel.com/new).
2. Framework wordt automatisch herkend (React Router + `@vercel/react-router` preset in `react-router.config.ts`).
3. Stel dezelfde `TWILIO_*` environment variables in bij Project → Settings → Environment Variables.
4. Deploy en werk de Twilio webhook-URL bij naar je productie-URL.

```bash
pnpm build   # lokaal testen
pnpm start   # productie-build lokaal
```

## Projectstructuur

```
app/
  routes/
    _index.tsx                      # Admin dashboard
    dev.simulator.tsx               # Lokale WhatsApp-emulatie (dev only)
    webhooks.twilio.whatsapp.ts     # POST webhook (resource route)
  lib/
    db.server.ts                    # JSON read/write (lokaal)
    twilio.server.ts                # Form parse + TwiML
    whatsapp-bot.server.ts          # Bot-logica
    whatsapp-messaging.server.ts    # Outbound (db + toekomstige Twilio API)
    dev-guard.server.ts             # Dev-only route guard
    dev-inbound.server.ts           # Synthetic Twilio inbound
    bot-messages.nl.ts              # Re-export → whatsapp-templates/
    mastra/
      index.ts                      # Mastra registry (voor Studio)
      agent.server.ts               # Favorieten-agent
      tools.server.ts               # readDb + addFavorite tools
      memory.server.ts              # LibSQL-backed agent memory
data/
  app.db                            # Lokale SQLite-DB (gitignored)
prisma/
  schema.prisma                     # Prisma schema (SQLite)
  migrations/                       # Versie-historie
whatsapp-templates/                 # WhatsApp copy + Twilio Content JSON
  invites/                          # Cascade uitnodigingen (3 fasen)
  bot/                              # Hardcoded commando's
  organiser/                        # Berichten naar organisator
  invitee/                          # Verwijderd / geannuleerd
```

Zie `whatsapp-templates/README.md` voor Twilio-registratie (`pnpm templates:seed` / `templates:register` / `templates:sync`).

## Scripts

| Script | Beschrijving |
|--------|--------------|
| `pnpm dev` | Development server |
| `pnpm mastra:dev` | Mastra Studio (http://localhost:4111) |
| `pnpm build` | Production build |
| `pnpm start` | Serve production build |
| `pnpm typecheck` | Typegen + TypeScript check |
| `pnpm prisma migrate dev` | Apply Prisma migrations |
