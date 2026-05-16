# Zin in Padel

WhatsApp bot voor padel met een React Router v7 admin-dashboard. Backend-endpoints draaien als **resource routes** (geen aparte Express-server).

## Stack

- [React Router v7](https://reactrouter.com/) (Framework mode, SSR)
- TypeScript
- [Vercel](https://vercel.com/) deployment via [`@vercel/react-router`](https://vercel.com/docs/frameworks/react-router)
- [Twilio WhatsApp](https://www.twilio.com/docs/whatsapp) webhook
- Lokale JSON-opslag (`data/db.json`) voor proof of concept

## Waarschuwing: JSON-opslag op Vercel

**`data/db.json` is alleen geschikt voor lokaal ontwikkelen.**

Op Vercel zijn serverless functions stateless: schrijven naar het bestandssysteem is niet persistent en wordt niet gedeeld tussen requests. Gebruik voor deployed testing en productie een echte database, bijvoorbeeld:

- [Vercel KV](https://vercel.com/docs/storage/vercel-kv)
- [Supabase](https://supabase.com/)
- [Neon](https://neon.tech/) of Postgres

Vervang daarbij de implementatie in `app/lib/db.server.ts` door een store die op je gekozen backend aansluit.

## Vereisten

- Node.js 20+
- npm
- Twilio-account met WhatsApp Sandbox (of productie-sender)
- [localtunnel](https://github.com/localtunnel/localtunnel) voor lokale webhook-tests

## Lokale setup

```bash
npm install
cp .env.example .env
# Vul TWILIO_* in .env in
npm run dev
```

De app draait op [http://localhost:5173](http://localhost:5173).

- **Dashboard:** `/`
- **Webhook:** `POST /webhooks/twilio/whatsapp`

## Omgevingsvariabelen

Kopieer `.env.example` naar `.env`:

| Variabele | Beschrijving |
|-----------|--------------|
| `TWILIO_ACCOUNT_SID` | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token |
| `TWILIO_WHATSAPP_FROM` | WhatsApp-sender, bijv. `whatsapp:+14155238886` |

De webhook gebruikt voorlopig vooral TwiML-replies; de variabelen zijn nodig voor toekomstige outbound API-calls en optionele signature-validatie.

## localtunnel (lokale webhook)

1. Start de dev-server: `npm run dev`
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
| `JA` | Opt-in + onboarding voltooid |
| `STOP` | Afmelden |
| `HELP` | Commando-overzicht |

Alle bot-antwoorden staan in `app/lib/bot-messages.nl.ts`.

## Vercel deployment

1. Push naar GitHub en importeer het project in [Vercel](https://vercel.com/new).
2. Framework wordt automatisch herkend (React Router + `@vercel/react-router` preset in `react-router.config.ts`).
3. Stel dezelfde `TWILIO_*` environment variables in bij Project → Settings → Environment Variables.
4. Deploy en werk de Twilio webhook-URL bij naar je productie-URL.

```bash
npm run build   # lokaal testen
npm run start   # productie-build lokaal
```

## Projectstructuur

```
app/
  routes/
    _index.tsx                      # Admin dashboard
    webhooks.twilio.whatsapp.ts     # POST webhook (resource route)
  lib/
    db.server.ts                    # JSON read/write (lokaal)
    twilio.server.ts                # Form parse + TwiML
    whatsapp-bot.server.ts          # Bot-logica
    bot-messages.nl.ts              # Nederlandse teksten
data/
  db.json                           # Lokale POC-database
```

## Scripts

| Script | Beschrijving |
|--------|--------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run typecheck` | Typegen + TypeScript check |
