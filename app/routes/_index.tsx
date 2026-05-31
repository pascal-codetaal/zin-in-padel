import type { ReactNode } from "react";
import { Link, useNavigation } from "react-router";
import { WaitlistSignupForm } from "~/components/waitlist-signup-form";
import { parseWaitlistForm } from "~/lib/waitlist-form.server";
import type { WaitlistFormError } from "~/lib/waitlist-form.shared";
import { upsertWaitlistSignup } from "~/lib/waitlist.server";
import type { Route } from "./+types/_index";

/** Full-bleed binnen `main` (px-5/sm:px-6); op lg weer binnen de kolom met afgeronde rand. */
const LANDING_BLEED = "-mx-5 px-5 sm:-mx-6 sm:px-6 lg:mx-0";
const LANDING_BLEED_LG = "lg:rounded-2xl lg:border-x";

function landingSectionClass(...extra: string[]) {
  return [LANDING_BLEED, LANDING_BLEED_LG, ...extra].join(" ");
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Zin in Padel — Padel matchen via WhatsApp" },
    {
      name: "description",
      content:
        "Automatisch padel matchen via WhatsApp: eerst je maatjes, dan spelers op TV-klassement. Minder groepsapps, jij kiest het niveau.",
    },
  ];
}

export async function loader() {
  return {};
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const parsed = await parseWaitlistForm(form);
  if (!parsed.ok) {
    return { ok: false as const, error: parsed.error };
  }

  const { created } = await upsertWaitlistSignup(parsed.data);
  return {
    ok: true as const,
    updated: !created,
  };
}

export default function LandingPage({
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const submitted = actionData?.ok === true;
  const error =
    actionData?.ok === false ? (actionData.error as WaitlistFormError) : undefined;
  const isSubmitting = navigation.state === "submitting";

  const signupForm = (
    <WaitlistSignupForm
      error={error}
      submitted={submitted}
      updated={actionData?.ok === true ? actionData.updated : undefined}
      compact
    />
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingHeader />
      <div className="mx-auto w-full max-w-6xl lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-x-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] xl:gap-x-12">
        <main className="min-w-0 px-5 sm:px-6 lg:px-8 lg:pr-4">
          <HeroSection mobileSignup={signupForm} />
          <ProblemSection />
          <ProductSection />
          <HowItWorksSection />
          <FaqSection />
          <CtaSection />
        </main>

        {/* Desktop: kolom even hoog als main zodat sticky doorheen de pagina blijft hangen */}
        <aside
          id="inschrijven-desktop"
          className="relative hidden lg:block lg:px-8 lg:pl-0"
          aria-label="Inschrijven"
        >
          <div
            className={`sticky top-20 z-30 max-h-[calc(100dvh-5rem)] overflow-y-auto pt-10 sm:pt-14 ${isSubmitting ? "pointer-events-none opacity-70" : ""}`}
          >
            {signupForm}
          </div>
        </aside>
      </div>
      <LandingFooter />
    </div>
  );
}

function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5 sm:px-6 lg:px-8">
        <a href="#" className="flex shrink-0 items-center gap-2 font-display text-lg font-bold">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-hero text-sm text-primary-foreground shadow-glow">
            🎾
          </span>
          Zin in Padel
        </a>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <a href="#product" className="transition hover:text-foreground">
            Wat het doet
          </a>
          <a href="#hoe" className="transition hover:text-foreground">
            Hoe het werkt
          </a>
          <a href="#faq" className="transition hover:text-foreground">
            FAQ
          </a>
          {import.meta.env.DEV && (
            <Link to="/admin" className="transition hover:text-foreground">
              Admin
            </Link>
          )}
        </nav>
        <a
          href="#inschrijven"
          className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-glow transition hover:opacity-95"
        >
          Inschrijven
        </a>
      </div>
    </header>
  );
}

function HeroSection({ mobileSignup }: { mobileSignup: ReactNode }) {
  return (
    <section
      id="inschrijven"
      className={landingSectionClass(
        "relative overflow-x-clip border-b border-border/60 bg-gradient-radial",
        "pt-10 pb-14 sm:pt-14 sm:pb-16 md:py-16 md:pb-20",
      )}
    >
      <div
        className="pointer-events-none absolute top-0 right-0 h-72 w-72 translate-x-1/4 rounded-full bg-accent/10 blur-3xl"
        aria-hidden
      />

      <div className="relative flex flex-col gap-10 sm:gap-12">
        <div className="flex min-w-0 flex-col gap-8">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Binnenkort via WhatsApp
            </p>
            <h1 className="mt-5 font-display text-4xl font-bold leading-[1.05] tracking-tight text-balance sm:text-5xl lg:text-[3.25rem]">
              Vier spelers op de baan.{" "}
              <span className="bg-gradient-hero bg-clip-text text-transparent">
                Zonder groepschaos.
              </span>
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground text-pretty">
              Zin in Padel regelt je wedstrijd via WhatsApp: je vaste maatjes
              eerst, daarna spelers binnen het niveau dat jij kiest. De bot
              nodigt uit en vult aan — jij zegt alleen ja of nee.
            </p>
          </div>

          <ul className="grid gap-3 md:grid-cols-3">
            <HeroPillar
              title="Minder groepen"
              text="Geen nieuwe chat per match. Alles via één WhatsApp-gesprek met de bot."
            />
            <HeroPillar
              title="Maatjes eerst"
              text="Je voorkeurspelers krijgen de eerste uitnodiging."
            />
            <HeroPillar
              title="TV-klassement"
              text="Vervolgens spelers uit je club op hun officiële P-niveau."
            />
          </ul>

          <ChatPreview />
        </div>

        <div className="lg:hidden [&_form]:max-w-none">{mobileSignup}</div>
      </div>
    </section>
  );
}

function HeroPillar({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <li className="rounded-2xl border border-border/80 bg-card p-4 shadow-soft">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
        {text}
      </p>
    </li>
  );
}

function ChatPreview() {
  const messages = [
    {
      from: "bot" as const,
      text: "Zin in padel zaterdag 19u? Tom en Lisa (je maatjes) zijn als eerste uitgenodigd.",
    },
    { from: "you" as const, text: "Top — P250 tot P350, heren in Gent." },
    {
      from: "bot" as const,
      text: "Tom en Lisa kunnen niet. Ik zoek verder binnen P250–P350 bij je club…",
    },
    {
      from: "bot" as const,
      text: "Match rond ✅ Zaterdag 19:00 — 4 spelers, binnen jouw niveau.",
    },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-[#25D366]/25 bg-[#e8f7ee] shadow-soft dark:border-[#25D366]/30 dark:bg-[#0d2818]/40">
      <div className="flex items-center gap-3 border-b border-[#25D366]/15 bg-[#dcf8e8] px-4 py-3 dark:bg-[#143d24]/60">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#25D366] text-sm text-white">
          🎾
        </div>
        <div>
          <div className="text-sm font-semibold text-[#111b21] dark:text-[#e9edef]">
            Zin in Padel
          </div>
          <div className="text-xs text-[#25D366]">online</div>
        </div>
      </div>
      <div className="space-y-2.5 px-3 py-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.from === "you" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[88%] rounded-lg px-3 py-2 text-[13px] leading-snug shadow-sm ${
                m.from === "you"
                  ? "rounded-tr-none bg-[#dcf8c6] text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]"
                  : "rounded-tl-none bg-white text-[#111b21] dark:bg-[#1f2c34] dark:text-[#e9edef]"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProblemSection() {
  const items = [
    {
      title: "Te veel groepen",
      text: "Overal dezelfde vraag — en toch geen vaste vier spelers.",
    },
    {
      title: "Niveau klopt niet",
      text: "Op papier P400, op de baan iets heel anders. Geen eerlijke wedstrijd.",
    },
    {
      title: "Jij bent de planner",
      text: "Uitnodigen, nabellen, opnieuw zoeken als iemand afzegt.",
    },
  ];

  return (
    <section
      className={landingSectionClass(
        "border-y border-border/60 bg-secondary/40 py-16 md:py-20",
      )}
    >
      <SectionLabel>Het probleem</SectionLabel>
      <h2 className="mt-3 max-w-xl font-display text-3xl font-bold tracking-tight md:text-4xl">
        Padel plannen kost nu te veel moeite
      </h2>
      <ul className="mt-10 grid gap-5 md:grid-cols-3">
        {items.map((item) => (
          <li
            key={item.title}
            className="rounded-2xl border border-border bg-card p-6"
          >
            <h3 className="font-semibold">{item.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {item.text}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProductSection() {
  const pillars = [
    {
      step: "01",
      title: "Makkelijker matchen",
      text: "Start één wedstrijd via WhatsApp. Geen eindeloos ping-pong in meerdere groepen.",
    },
    {
      step: "02",
      title: "Slimme uitnodigingen",
      text: "De bot nodigt eerst je voorkeurspelers uit. Reageren zij niet, dan spelers uit je club op TV-klassement.",
    },
    {
      step: "03",
      title: "Jij kiest het niveau",
      text: "Stel in welk P-bereik mee mag — bijvoorbeeld P250–P350. De bot blijft binnen jouw grenzen.",
    },
    {
      step: "04",
      title: "Volledig automatisch",
      text: "Uitnodigen, opvolgen en doorstromen tot er vier zijn. Jij hoeft niet te jagen op reacties.",
    },
  ];

  return (
    <section id="product" className="py-16 md:py-24">
      <SectionLabel>Wat Zin in Padel doet</SectionLabel>
      <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold tracking-tight md:text-4xl">
        Van uitnodiging tot volle baan — in één flow
      </h2>
      <div className="mt-12 grid gap-6 sm:grid-cols-2">
        {pillars.map((p) => (
          <article
            key={p.step}
            className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 pl-16 shadow-soft"
          >
            <span
              className="absolute left-5 top-6 font-display text-2xl font-bold text-accent/40"
              aria-hidden
            >
              {p.step}
            </span>
            <h3 className="text-lg font-semibold">{p.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {p.text}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const steps = [
    {
      title: "Schrijf je in",
      text: "Vind jezelf in de clubleden-database en laat je WhatsApp-nummer achter.",
    },
    {
      title: "Start een match",
      text: "Kies moment, club en niveaubereik. De bot gaat uitnodigen.",
    },
    {
      title: "Antwoord ja of nee",
      text: "Geen aparte app. De bot vult aan tot er vier spelers zijn.",
    },
  ];

  return (
    <section
      id="hoe"
      className={landingSectionClass(
        "border-y border-border/60 bg-secondary/30 py-16 md:py-24",
      )}
    >
      <div className="text-center">
        <SectionLabel className="justify-center">Hoe het werkt</SectionLabel>
        <h2 className="mx-auto mt-3 max-w-xl font-display text-3xl font-bold tracking-tight md:text-4xl">
          Zo start je straks een match
        </h2>
      </div>
      <ol className="mt-12 grid gap-8 md:grid-cols-3">
        {steps.map((step, i) => (
          <li key={step.title} className="relative text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary font-display text-lg font-bold text-primary-foreground">
              {i + 1}
            </span>
            {i < steps.length - 1 && (
              <span
                className="absolute top-5 left-[calc(50%+2rem)] hidden h-px w-[calc(100%-4rem)] bg-border md:block"
                aria-hidden
              />
            )}
            <h3 className="mt-4 font-semibold">{step.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{step.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function FaqSection() {
  const faqs = [
    {
      q: "Is dit al live?",
      a: "Nog niet volledig. Schrijf je in op de wachtlijst — we contacteren je via WhatsApp zodra de bot voor jouw club beschikbaar is.",
    },
    {
      q: "Hoe werkt het met P-klassement?",
      a: "We gebruiken de officiële clubleden-data van Tennis & Padel Vlaanderen. De bot nodigt alleen spelers uit binnen het bereik dat jij instelt.",
    },
    {
      q: "Waar komen de spelers vandaan?",
      a: "Uit de openbare clubledenlijsten per club. Sta je er niet bij? Mail ons via contact.",
    },
    {
      q: "Kost het geld?",
      a: "Inschrijven op de wachtlijst is gratis. Later bespreken we eventuele kosten eerst met de wachtlijst.",
    },
    {
      q: "Wat gebeurt er met mijn gegevens?",
      a: "Alleen voor de wachtlijst en contact over de lancering. Geen verkoop aan derden.",
    },
  ];

  return (
    <section id="faq" className="py-16 md:py-24">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-center font-display text-3xl font-bold tracking-tight">
          Vragen
        </h2>
        <dl className="mt-10 space-y-4">
          {faqs.map((f) => (
            <div
              key={f.q}
              className="rounded-2xl border border-border bg-card px-5 py-4"
            >
              <dt className="font-semibold">{f.q}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {f.a}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function CtaSection() {
  return (
    <section
      className={landingSectionClass(
        "mt-4 border border-primary/20 bg-primary py-14 text-center text-primary-foreground",
      )}
    >
      <h2 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
        Klaar om mee te doen?
      </h2>
      <p className="mx-auto mt-3 max-w-lg text-sm text-primary-foreground/85 md:text-base">
        Schrijf je in met je naam en WhatsApp-nummer. We contacteren je zodra de
        bot voor jouw club klaarstaat.
      </p>
      <a
        href="#inschrijven"
        className="mt-6 inline-flex rounded-full bg-accent px-8 py-3.5 text-base font-semibold text-accent-foreground shadow-glow transition hover:opacity-95"
      >
        Naar het formulier
      </a>
    </section>
  );
}

function SectionLabel({
  children,
  className = "",
}: {
  children: string;
  className?: string;
}) {
  return (
    <p
      className={`flex text-xs font-semibold uppercase tracking-widest text-primary ${className}`}
    >
      {children}
    </p>
  );
}

function LandingFooter() {
  return (
    <footer className="border-t border-border py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col justify-between gap-4 px-5 py-10 text-sm text-muted-foreground sm:px-6 lg:px-8 md:flex-row">
        <p>© {new Date().getFullYear()} Zin in Padel — gebouwd in Vlaanderen</p>
        <p>
          <a href="#inschrijven" className="hover:text-foreground">
            Inschrijven
          </a>
          {" · "}
          <a href="mailto:hallo@zin-in-padel.be" className="hover:text-foreground">
            Contact
          </a>
        </p>
      </div>
    </footer>
  );
}
