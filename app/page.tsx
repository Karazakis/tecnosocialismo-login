import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AccessPanel } from "./AccessPanel";
import { AccountPanel } from "./AccountPanel";
import { EconomicSetup } from "./EconomicSetup";
import { auth } from "@/lib/auth";
import { createDefaultEconomicProfile, getEconomicProfile } from "@/lib/economic-profile";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; returnTo?: string; setup?: string }>;
}) {
  const params = await searchParams;
  const returnTo = safeReturnUrl(params.returnTo);
  const session = await auth.api.getSession({ headers: await headers() });

  if (session?.user && params.setup === "economy") {
    const profile = await getEconomicProfile(session.user.id);
    return <EconomicSetup user={{ name: session.user.name || session.user.email, email: session.user.email }} initialProfile={profile ?? createDefaultEconomicProfile()} returnTo={returnTo} />;
  }

  if (session?.user && params.returnTo) redirect(returnTo);

  return (
    <main className="login-shell">
      <nav className="topbar">
        <a className="brand" href="https://tecnosocialismo.com" aria-label="Tecnosocialismo, pagina iniziale">
          <span className="brand-dot" />
          <strong>LOGIN</strong>
        </a>
        <details className="login-suite">
          <summary>Tutti i servizi <span>＋</span></summary>
          <div>{suiteLinks.map((item) => <a href={item.href} key={item.label}><i>{item.mark}</i>{item.label}<b>↗</b></a>)}</div>
        </details>
      </nav>

      <section className="intro-panel">
        <p className="eyebrow">UN ACCOUNT · TUTTA LA SUITE</p>
        <h2>La tua identità<br /><em>attraversa ogni spazio.</em></h2>
        <p>Ricerca, intelligenza, cloud, comunicazione, musica, cultura e organizzazione. Un accesso indipendente, riconosciuto in tutto l’ecosistema.</p>
        <div className="network" aria-hidden="true">
          <span className="node node-a">R</span>
          <span className="node node-b">I</span>
          <span className="node node-c">C</span>
          <span className="core">L</span>
          <i className="line line-a" /><i className="line line-b" /><i className="line line-c" />
        </div>
      </section>

      <section className="panel-wrap">
        {session?.user ? (
          <AccountPanel user={{ name: session.user.name || session.user.email, email: session.user.email }} />
        ) : (
          <AccessPanel initialMode={params.mode === "signup" ? "signup" : "signin"} returnTo={returnTo} />
        )}
      </section>

      <footer><span>Account indipendente</span><span>Sessione condivisa</span><span>Privacy per impostazione</span></footer>
    </main>
  );
}

const suiteLinks = [
  { mark: "T", label: "Home", href: "https://tecnosocialismo.com" },
  { mark: "R", label: "Rizoma", href: "https://rizoma.tecnosocialismo.com" },
  { mark: "I", label: "Iskra", href: "https://iskra.tecnosocialismo.com" },
  { mark: "C", label: "Cloud", href: "https://cloud.tecnosocialismo.com" },
  { mark: "M", label: "Mail", href: "https://mail.tecnosocialismo.com" },
  { mark: "V", label: "Video", href: "https://video.tecnosocialismo.com" },
  { mark: "U", label: "Musica", href: "https://musica.tecnosocialismo.com" },
  { mark: "S", label: "Social", href: "https://social.tecnosocialismo.com" },
  { mark: "G", label: "Messaggi", href: "https://messaggi.tecnosocialismo.com" },
  { mark: "F", label: "Sport", href: "https://sport.tecnosocialismo.com" },
  { mark: "K", label: "Market", href: "https://market.tecnosocialismo.com" },
  { mark: "L", label: "Lavoro", href: "https://lavoro.tecnosocialismo.com" },
  { mark: "Z", label: "Azienda", href: "https://azienda.tecnosocialismo.com" },
  { mark: "E", label: "Servizi", href: "https://servizi.tecnosocialismo.com" },
  { mark: "SA", label: "Salute", href: "https://salute.tecnosocialismo.com" },
  { mark: "ED", label: "Educazione", href: "https://educazione.tecnosocialismo.com" },
  { mark: "LE", label: "Legge", href: "https://legge.tecnosocialismo.com" },
  { mark: "BU", label: "Burocrazia", href: "https://burocrazia.tecnosocialismo.com" },
  { mark: "B", label: "Biblioteca", href: "https://biblioteca.tecnosocialismo.com" },
  { mark: "P", label: "Militant", href: "https://militant.tecnosocialismo.com" },
  { mark: "A", label: "Account", href: "https://login.tecnosocialismo.com" },
];

function safeReturnUrl(value?: string) {
  if (!value) return "https://rizoma.tecnosocialismo.com";
  try {
    const target = new URL(value);
    const allowed =
      target.protocol === "https:" &&
      (target.hostname === "tecnosocialismo.com" || target.hostname.endsWith(".tecnosocialismo.com"));
    return allowed ? target.toString() : "https://rizoma.tecnosocialismo.com";
  } catch {
    return "https://rizoma.tecnosocialismo.com";
  }
}
