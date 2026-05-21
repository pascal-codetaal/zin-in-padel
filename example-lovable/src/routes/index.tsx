import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { MessageCircle, Users, Zap, Trophy, Calendar, Send, CheckCircle2, ArrowRight } from "lucide-react";
import heroImg from "@/assets/hero-padel.jpg";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <ChatDemo />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-background/80 border-b border-border/60">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <a href="#" className="flex items-center gap-2 font-display font-bold text-lg">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-hero text-primary-foreground shadow-glow">
            <MessageCircle className="h-4 w-4" />
          </span>
          PadelMatch
        </a>
        <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
          <a href="#features" className="hover:text-foreground transition">Features</a>
          <a href="#how" className="hover:text-foreground transition">Hoe het werkt</a>
          <a href="#faq" className="hover:text-foreground transition">FAQ</a>
        </nav>
        <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-full shadow-glow">
          <a href="#cta">Start gratis</a>
        </Button>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-radial pointer-events-none" />
      <div className="max-w-6xl mx-auto px-6 pt-20 pb-24 grid lg:grid-cols-2 gap-12 items-center relative">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground mb-6">
            <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
            Live op WhatsApp — geen app nodig
          </div>
          <h1 className="text-5xl md:text-6xl font-bold leading-[1.05] text-balance">
            Padel wedstrijden,{" "}
            <span className="bg-gradient-hero bg-clip-text text-transparent">
              geregeld via WhatsApp
            </span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl">
            Geef je voorkeursspelers door. Wij vragen ze automatisch via WhatsApp.
            Niet beschikbaar? Dan zoeken we verder in andere padel-groepen tot je 4 spelers hebt.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" asChild className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-full h-12 px-7 text-base shadow-glow">
              <a href="#cta">
                Start je eerste match <ArrowRight className="ml-1" />
              </a>
            </Button>
            <Button size="lg" variant="outline" asChild className="rounded-full h-12 px-7 text-base border-border">
              <a href="#how">Zo werkt het</a>
            </Button>
          </div>
          <div className="mt-8 flex items-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-accent" /> Geen download</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-accent" /> Match in 5 min</div>
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-6 bg-gradient-hero opacity-20 blur-3xl rounded-full" />
          <div className="relative rounded-3xl overflow-hidden shadow-glow border border-border">
            <img
              src={heroImg}
              alt="Padel spelers in actie op een padelbaan"
              width={1536}
              height={1024}
              className="w-full h-[480px] object-cover"
            />
            <div className="absolute bottom-4 left-4 right-4 rounded-2xl bg-card/95 backdrop-blur p-4 shadow-soft">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-accent/20 flex items-center justify-center">
                  <Trophy className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold">Match bevestigd</div>
                  <div className="text-xs text-muted-foreground">Zaterdag 19:00 — 4 spelers compleet</div>
                </div>
                <CheckCircle2 className="h-6 w-6 text-accent" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Features() {
  const items = [
    { icon: Users, title: "Jouw voorkeursspelers eerst", text: "Stel je vaste vrienden of clubmaatjes in. Zij krijgen altijd de eerste vraag." },
    { icon: Zap, title: "Automatisch backup", text: "Niemand beschikbaar? We polsen direct andere padel-groepen tot we 4 spelers vinden." },
    { icon: MessageCircle, title: "Volledig in WhatsApp", text: "Geen extra app, geen account. Antwoord gewoon met 'ja' of 'nee' in je vertrouwde chat." },
  ];
  return (
    <section id="features" className="py-24 bg-secondary/40">
      <div className="max-w-6xl mx-auto px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-primary uppercase tracking-widest">Waarom PadelMatch</p>
          <h2 className="mt-3 text-4xl md:text-5xl font-bold text-balance">Stop met spammen in 5 groepschats.</h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Eén bericht naar onze bot, en wij regelen het hele matchmaking proces.
          </p>
        </div>
        <div className="mt-14 grid md:grid-cols-3 gap-6">
          {items.map(({ icon: Icon, title, text }) => (
            <div key={title} className="group rounded-3xl bg-card border border-border p-8 shadow-soft hover:shadow-glow transition">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-hero text-primary-foreground shadow-glow mb-5">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-xl font-semibold">{title}</h3>
              <p className="mt-2 text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { icon: Send, title: "Stuur een bericht", text: "Tag PadelMatch in WhatsApp: 'Match zaterdag 19u'." },
    { icon: Users, title: "Wij vragen je voorkeur", text: "Je opgegeven voorkeursspelers krijgen als eerste de vraag." },
    { icon: Zap, title: "Backup uit andere groepen", text: "Te weinig ja's? We zoeken verder in extra padel-communities." },
    { icon: Calendar, title: "Match staat", text: "Iedereen krijgt automatisch een bevestiging met tijd en baan." },
  ];
  return (
    <section id="how" className="py-24">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-sm font-semibold text-primary uppercase tracking-widest">Hoe het werkt</p>
          <h2 className="mt-3 text-4xl md:text-5xl font-bold text-balance">Van bericht tot match in 4 stappen</h2>
        </div>
        <div className="mt-16 grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((s, i) => (
            <div key={s.title} className="relative rounded-3xl border border-border bg-card p-6">
              <div className="absolute -top-4 left-6 h-8 w-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-sm font-bold shadow-glow">
                {i + 1}
              </div>
              <s.icon className="h-6 w-6 text-primary mt-3" />
              <h3 className="mt-4 font-semibold text-lg">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ChatDemo() {
  const messages = [
    { from: "you", text: "Match zaterdag 19u, Padel Club Antwerpen 🎾" },
    { from: "bot", text: "Top! Ik vraag het aan je voorkeursspelers: Tom, Lisa, Senne." },
    { from: "bot", text: "Tom: ✅  •  Lisa: ✅  •  Senne: ❌ kan niet" },
    { from: "bot", text: "Ik zoek een 4e in groep 'Padel Vrienden'..." },
    { from: "bot", text: "Match compleet! 🏆 Jij, Tom, Lisa & Karim — zaterdag 19:00." },
  ];
  return (
    <section className="py-24 bg-primary text-primary-foreground relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-radial opacity-30" />
      <div className="max-w-6xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center relative">
        <div>
          <p className="text-sm font-semibold text-accent uppercase tracking-widest">In actie</p>
          <h2 className="mt-3 text-4xl md:text-5xl font-bold text-balance">Zo voelt een match aanmaken aan.</h2>
          <p className="mt-4 text-lg text-primary-foreground/80">
            Geen formulieren, geen kalenders. Gewoon één zin in WhatsApp en wij doen de rest —
            inclusief reminders en eventuele vervangers als iemand last-minute afzegt.
          </p>
          <ul className="mt-6 space-y-3 text-primary-foreground/90">
            {["Slimme volgorde van voorkeursspelers", "Real-time updates bij elke reactie", "Automatische vervanger zoeken bij afzeggen"].map((t) => (
              <li key={t} className="flex gap-3"><CheckCircle2 className="h-5 w-5 text-accent shrink-0 mt-0.5" />{t}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-3xl bg-card text-card-foreground p-5 shadow-glow border border-border/50 max-w-md w-full mx-auto">
          <div className="flex items-center gap-3 pb-4 border-b border-border">
            <div className="h-10 w-10 rounded-full bg-gradient-hero flex items-center justify-center text-primary-foreground">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold text-sm">PadelMatch Bot</div>
              <div className="text-xs text-accent">online</div>
            </div>
          </div>
          <div className="py-5 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.from === "you" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                  m.from === "you"
                    ? "bg-accent text-accent-foreground rounded-br-sm"
                    : "bg-secondary text-secondary-foreground rounded-bl-sm"
                }`}>
                  {m.text}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const faqs = [
    { q: "Heb ik een aparte app nodig?", a: "Nee. Alles loopt via je gewone WhatsApp. Je voegt onze bot toe als contact en je bent klaar." },
    { q: "Hoe stel ik mijn voorkeursspelers in?", a: "Bij je eerste match stuur je gewoon de namen of nummers door. Daarna onthoudt PadelMatch ze." },
    { q: "Wat als niemand kan?", a: "Dan zoeken we automatisch in aangesloten padel-groepen tot we 4 spelers hebben — of we laten je weten dat het niet lukt." },
    { q: "Is het gratis?", a: "Tijdens de bèta is PadelMatch volledig gratis. Later komt er een betaalbaar plan voor clubs en frequente spelers." },
    { q: "Werkt het ook voor andere sporten?", a: "We focussen nu volledig op padel. Tennis en pickleball staan op de roadmap." },
  ];
  return (
    <section id="faq" className="py-24 bg-secondary/40">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center">
          <p className="text-sm font-semibold text-primary uppercase tracking-widest">FAQ</p>
          <h2 className="mt-3 text-4xl md:text-5xl font-bold text-balance">Vragen? We hebben de antwoorden.</h2>
        </div>
        <Accordion type="single" collapsible className="mt-12">
          {faqs.map((f, i) => (
            <AccordionItem key={i} value={`i${i}`} className="border-border">
              <AccordionTrigger className="text-left text-base font-semibold hover:no-underline">{f.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground text-base">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section id="cta" className="py-24">
      <div className="max-w-5xl mx-auto px-6">
        <div className="relative rounded-[2.5rem] bg-gradient-hero p-12 md:p-16 text-primary-foreground overflow-hidden shadow-glow">
          <div className="absolute inset-0 bg-gradient-radial opacity-40" />
          <div className="relative max-w-2xl">
            <h2 className="text-4xl md:text-5xl font-bold text-balance">Klaar voor je volgende padel-match?</h2>
            <p className="mt-4 text-lg text-primary-foreground/85">
              Voeg PadelMatch toe op WhatsApp en regel je eerste wedstrijd vandaag nog. Gratis tijdens de bèta.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-full h-12 px-7 text-base">
                <a href="https://wa.me/" target="_blank" rel="noreferrer">
                  <MessageCircle /> Open in WhatsApp
                </a>
              </Button>
              <Button size="lg" variant="outline" asChild className="rounded-full h-12 px-7 text-base bg-transparent border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground">
                <a href="#how">Meer info</a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border py-10">
      <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-gradient-hero text-primary-foreground">
            <MessageCircle className="h-3 w-3" />
          </span>
          © {new Date().getFullYear()} PadelMatch — Gemaakt voor padelfans.
        </div>
        <div className="flex gap-6">
          <a href="#" className="hover:text-foreground">Privacy</a>
          <a href="#" className="hover:text-foreground">Contact</a>
        </div>
      </div>
    </footer>
  );
}
