import type { ReactNode } from "react";
import { useNavigation } from "react-router";
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

/** scroll-mt = sticky header (h-16) + ruimte */
const SIGNUP_SCROLL_CLASS = "scroll-mt-24";

function SignupAnchorLink({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <>
      <a href="#inschrijven-mobile" className={`lg:hidden ${className}`.trim()}>
        {children}
      </a>
      <a href="#inschrijven" className={`hidden lg:inline ${className}`.trim()}>
        {children}
      </a>
    </>
  );
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Zin in Padel — Automatisch padel matchen via WhatsApp" },
    {
      name: "description",
      content:
        "Herken je het probleem om vlot een match te vinden of in te vullen? Chat of snelle interface, automatische uitnodigingen op Padel Vlaanderen-niveau — de bot leert je voorkeuren.",
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
          <MatchWaysSection />
          <HowItWorksSection />
          <FaqSection />
          <CtaSection />
        </main>

        {/* Desktop: kolom even hoog als main zodat sticky doorheen de pagina blijft hangen */}
        <aside
          className="relative hidden lg:block lg:px-8 lg:pl-0"
          aria-label="Inschrijven"
        >
          <div
            id="inschrijven"
            className={`sticky top-20 z-30 max-h-[calc(100dvh-5rem)] overflow-y-auto pt-10 sm:pt-14 ${SIGNUP_SCROLL_CLASS} ${isSubmitting ? "pointer-events-none opacity-70" : ""}`}
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
            Oplossing
          </a>
          <a href="#hoe" className="transition hover:text-foreground">
            Hoe het werkt
          </a>
          <a href="#faq" className="transition hover:text-foreground">
            FAQ
          </a>
        </nav>
        <SignupAnchorLink className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-glow transition hover:opacity-95">
          Inschrijven
        </SignupAnchorLink>
      </div>
    </header>
  );
}

function HeroSection({ mobileSignup }: { mobileSignup: ReactNode }) {
  return (
    <section
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
              Volledig automatisch via WhatsApp
            </p>
            <h1 className="mt-5 font-display text-4xl font-bold leading-[1.05] tracking-tight text-balance sm:text-5xl lg:text-[3.25rem]">
              Herken je het probleem om{" "}
              <span className="bg-gradient-hero bg-clip-text text-transparent">
                vlot een match te vinden of in te vullen?
              </span>
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground text-pretty">
              Wij regelen je match volledig automatisch. Onze bot start met je
              favorieten, nodigt daarna spelers uit op niveau van Padel
              Vlaanderen en gaat last minute verder zoeken tot er vier zijn.
              Chat je match samen in WhatsApp, of gebruik onze snelle interface
              om alles in één keer te configureren.
            </p>
          </div>

          <ul className="grid gap-3 md:grid-cols-3">
            <HeroPillar
              title="Chat of snelle setup"
              text="Praat met de bot zoals met een maatje, of vul moment, niveau en club in via een compact scherm."
            />
            <HeroPillar
              title="Geen groepsposts"
              text="Geen berichten in vijf verschillende chats meer en niemand die opvolgt."
            />
            <HeroPillar
              title="Leert je voorkeuren"
              text="Na het spelen stelt de bot je vragen. Zo worden volgende matches beter op maat."
            />
          </ul>

          <ChatPreview />
        </div>

        <div
          id="inschrijven-mobile"
          className={`lg:hidden [&_form]:max-w-none ${SIGNUP_SCROLL_CLASS}`}
        >
          {mobileSignup}
        </div>
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
      text: "Zin in padel zaterdag 19u? Ik nodig eerst Tom en Lisa (je favorieten) uit.",
    },
    { from: "you" as const, text: "Top — 200 tot 400, heren in Gent." },
    {
      from: "bot" as const,
      text: "Tom en Lisa kunnen niet. Ik zoek verder op Padel Vlaanderen-niveau bij je club…",
    },
    {
      from: "bot" as const,
      text: "Last minute nog 1 speler nodig — ik breid de zoekactie uit. Match rond ✅ 19:00.",
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
      title: "Posts in groepen",
      text: "Je plaatst overal dezelfde vraag en hoopt dat iemand reageert — vaak zonder resultaat.",
    },
    {
      title: "Opvolgen kost tijd",
      text: "Nabellen, herinneren, opnieuw zoeken als iemand afzegt. Jij bent de planner.",
    },
    {
      title: "Last minute stress",
      text: "Een uur voor de wedstrijd nog steeds geen vierde speler. Herkenbaar?",
    },
  ];

  return (
    <section
      className={landingSectionClass(
        "border-y border-border/60 bg-secondary/40 py-16 md:py-20",
      )}
    >
      <SectionLabel>Het probleem</SectionLabel>
      <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold tracking-tight md:text-4xl">
        Vlot een match vinden of in te vullen blijft voor veel spelers moeilijk
      </h2>
      <p className="mt-4 max-w-2xl text-muted-foreground">
        Herken je dit? Schrijf je dan in — we bouwen een assistent die het
        zoeken en filteren voor je overneemt.
      </p>
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
      title: "Favorieten eerst",
      text: "De bot start met je vaste maten uit te nodigen — zij krijgen als eerste de kans.",
    },
    {
      step: "02",
      title: "Padel Vlaanderen-niveau",
      text: "Reageren zij niet? Dan nodigt de bot spelers uit op basis van het officiële klassement, binnen het bereik dat jij kiest (bv. 200–400).",
    },
    {
      step: "03",
      title: "Last minute uitbreiden",
      text: "Komt de baan nog niet vol? De zoekactie wordt verder gezet tot er vier spelers zijn.",
    },
    {
      step: "04",
      title: "Volledig automatisch",
      text: "Uitnodigen, opvolgen en filteren met AI — in plaats van posten in groepen en zelf achter reacties aan te gaan.",
    },
  ];

  return (
    <section id="product" className="py-16 md:py-24">
      <SectionLabel>Onze oplossing</SectionLabel>
      <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold tracking-tight md:text-4xl">
        Wij regelen je match — jij zegt ja of nee
      </h2>
      <p className="mt-4 max-w-2xl text-muted-foreground">
        Een WhatsApp-chatbot die vrienden en spelers uitnodigt via een slim
        algoritme — en steeds slimmer wordt naarmate je meer speelt. Geen
        aparte app installeren: koppel je telefoonnummer aan je Tennis & Padel
        Vlaanderen-account en je bent klaar.
      </p>
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

function MatchWaysSection() {
  const ways = [
    {
      title: "Chat met de bot",
      text: "Vertel wanneer je wilt spelen, met wie en op welk niveau — de bot begrijpt gewone taal en regelt de rest.",
    },
    {
      title: "Snelle interface",
      text: "Liever alles in één scherm? Onze compacte flow laat je moment, club, niveau en voorkeuren in één keer instellen.",
    },
    {
      title: "Slimmer na elke match",
      text: "Gedaan met spelen? De bot stelt je korte vragen, onthoudt je voorkeuren en houdt daar rekening mee bij de volgende uitnodigingen.",
    },
  ];

  return (
    <section
      className={landingSectionClass(
        "border-y border-border/60 bg-secondary/20 py-16 md:py-20",
      )}
    >
      <SectionLabel>Jouw manier van werken</SectionLabel>
      <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold tracking-tight md:text-4xl">
        Chat, configureer of laat je begeleiden
      </h2>
      <ul className="mt-10 grid gap-5 md:grid-cols-3">
        {ways.map((way) => (
          <li
            key={way.title}
            className="rounded-2xl border border-border bg-card p-6 shadow-soft"
          >
            <h3 className="font-semibold">{way.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {way.text}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HowItWorksSection() {
  const steps = [
    {
      title: "Schrijf je in",
      text: "Herken je het probleem? Laat je naam en WhatsApp-nummer achter op de wachtlijst.",
    },
    {
      title: "Koppel je account",
      text: "Eenmaal live: je nummer koppelen aan je TV-padelprofiel. Geen app downloaden.",
    },
    {
      title: "Start je match",
      text: "Via WhatsApp-chat of de snelle interface — jij kiest. De bot nodigt uit en vult aan.",
    },
    {
      title: "Geef feedback",
      text: "Na het spelen beantwoord je een paar vragen. De bot leert en past volgende matches aan.",
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
          Van inschrijving tot je eerste match
        </h2>
      </div>
      <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, i) => (
          <li key={step.title} className="relative text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary font-display text-lg font-bold text-primary-foreground">
              {i + 1}
            </span>
            {i < steps.length - 1 && (
              <span
                className="absolute top-5 left-[calc(50%+2rem)] hidden h-px w-[calc(100%-4rem)] bg-border lg:block"
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
      q: "Moet ik een app installeren?",
      a: "Nee. Je werkt via WhatsApp en een snelle webinterface om een match te configureren. Je koppelt je nummer aan je Tennis & Padel Vlaanderen-padelaccount — geen download uit de app store.",
    },
    {
      q: "Chat of interface — wat kies ik best?",
      a: "Beide kan. In WhatsApp stel je je match in met gewone taal. In de snelle interface zet je alles in één keer klaar. De bot regelt daarna op dezelfde manier de uitnodigingen.",
    },
    {
      q: "Hoe leert de bot mijn voorkeuren?",
      a: "Na je wedstrijd stelt de bot je enkele vragen over hoe het gespeeld is en met wie je graag speelt. Die antwoorden gebruikt hij bij volgende zoekacties en uitnodigingen.",
    },
    {
      q: "Is dit al live?",
      a: "We zijn in opbouw. Schrijf je in — we contacteren je via WhatsApp zodra de bot voor jouw club klaarstaat.",
    },
    {
      q: "Hoe zoekt de bot spelers?",
      a: "Eerst je favorieten, daarna op officiële Padel Vlaanderen-niveaus binnen jouw bereik, en last minute wordt de zoekactie verder gezet. AI helpt filteren en opvolgen.",
    },
    {
      q: "Vervangt dit groepsapps?",
      a: "Het doel is dat je niet meer in meerdere groepen moet posten en zelf reacties moet najagen. De bot neemt uitnodigen en opvolgen over.",
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
        Herken je het probleem?
      </h2>
      <p className="mx-auto mt-3 max-w-lg text-sm text-primary-foreground/85 md:text-base">
        Schrijf je in op de wachtlijst. We bouwen de WhatsApp-bot die voor jou
        zoekt, filtert en uitnodigt — zonder groepsposts.
      </p>
      <SignupAnchorLink className="mt-6 inline-flex rounded-full bg-accent px-8 py-3.5 text-base font-semibold text-accent-foreground shadow-glow transition hover:opacity-95">
        Naar het formulier
      </SignupAnchorLink>
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
          <SignupAnchorLink className="hover:text-foreground">Inschrijven</SignupAnchorLink>
          {" · "}
          <a href="mailto:hallo@zin-in-padel.be" className="hover:text-foreground">
            Contact
          </a>
        </p>
      </div>
    </footer>
  );
}
