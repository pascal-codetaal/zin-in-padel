import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("maatjes/:token", "routes/maatjes.$token.tsx"),
  route("profiel/:token", "routes/profiel.$token.tsx", [
    index("routes/profiel.$token._index.tsx"),
    route("geslacht", "routes/profiel.$token.geslacht.tsx"),
    route("klassement", "routes/profiel.$token.klassement.tsx"),
    route("kant", "routes/profiel.$token.kant.tsx"),
    route("speelvoorkeur", "routes/profiel.$token.speelvoorkeur.tsx"),
    route("clubs", "routes/profiel.$token.clubs.tsx"),
  ]),
  route("match/nieuw/:token", "routes/match.nieuw.$token.tsx", [
    index("routes/match.nieuw.$token._index.tsx"),
    route("spelers", "routes/match.nieuw.$token.spelers.tsx"),
    route("maatjes", "routes/match.nieuw.$token.maatjes.tsx"),
    route("wanneer", "routes/match.nieuw.$token.wanneer.tsx"),
    route("formaat", "routes/match.nieuw.$token.formaat.tsx"),
    route("uitnodigingen", "routes/match.nieuw.$token.uitnodigingen.tsx"),
    route("bevestigen", "routes/match.nieuw.$token.bevestigen.tsx"),
  ]),
  route("match/:token", "routes/match.$token.tsx"),
  route("dev/simulator", "routes/dev.simulator.tsx"),
  route("webhooks/twilio/whatsapp", "routes/webhooks.twilio.whatsapp.ts"),
] satisfies RouteConfig;
