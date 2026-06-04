import { data, Link } from "react-router";
import {
  buildReferralWhatsAppUrl,
  findReferralInviterByCode,
} from "~/lib/referrals.server";
import { buildReferralBotMessage, REFERRAL_CAMPAIGN } from "~/lib/referrals.shared";
import type { Route } from "./+types/r.$code";

export function meta({ loaderData }: Route.MetaArgs) {
  const inviter = loaderData?.inviter?.displayName;
  return [
    {
      title: inviter
        ? `${inviter} nodigt je uit | Zin in Padel`
        : "Referral | Zin in Padel",
    },
    {
      name: "description",
      content:
        "Start via WhatsApp met Zin in Padel en doe mee aan de vriendenactie.",
    },
  ];
}

export async function loader({ params }: Route.LoaderArgs) {
  const code = params.code?.trim() ?? "";
  const inviter = await findReferralInviterByCode(code);
  if (!inviter) throw data("Not Found", { status: 404 });

  return {
    code: code.toUpperCase(),
    inviter,
    botMessage: buildReferralBotMessage(code.toUpperCase()),
    whatsappUrl: buildReferralWhatsAppUrl(process.env.TWILIO_WHATSAPP_FROM, code),
  };
}

export default function ReferralCodePage({ loaderData }: Route.ComponentProps) {
  const { code, inviter, botMessage, whatsappUrl } = loaderData;

  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground sm:px-6 lg:px-8">
      <section className="mx-auto max-w-2xl rounded-3xl border border-border bg-card p-6 text-center shadow-soft sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          {REFERRAL_CAMPAIGN.title}
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">
          {inviter.displayName} nodigt je uit voor Zin in Padel
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Tik hieronder om WhatsApp te openen. Het bericht staat al klaar; stuur
          het naar onze bot om te starten.
        </p>

        {whatsappUrl ? (
          <a
            href={whatsappUrl}
            className="mt-6 inline-flex rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground shadow-glow transition hover:opacity-95"
          >
            Start via WhatsApp
          </a>
        ) : (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            WhatsApp-link nog niet geconfigureerd. Stuur dit bericht naar de Zin
            in Padel-bot: <code>{botMessage}</code>
          </div>
        )}

        <p className="mt-6 text-xs text-muted-foreground">
          Referralcode: <code>{code}</code>
        </p>
        <Link
          to="/vriendenactie"
          className="mt-4 inline-flex text-sm font-medium text-primary hover:underline"
        >
          Bekijk de vriendenactie
        </Link>
      </section>
    </main>
  );
}
