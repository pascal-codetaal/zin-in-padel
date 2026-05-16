import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("webhooks/twilio/whatsapp", "routes/webhooks.twilio.whatsapp.ts"),
] satisfies RouteConfig;
