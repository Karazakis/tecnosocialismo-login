import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AccessPanel } from "./AccessPanel";
import { AccountPanel } from "./AccountPanel";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; returnTo?: string }>;
}) {
  const params = await searchParams;
  const returnTo = safeReturnUrl(params.returnTo);
  const session = await auth.api.getSession({ headers: await headers() });

  if (session?.user && params.returnTo) redirect(returnTo);

  return (
    <main className="login-shell">
      <nav className="topbar">
        <a className="brand" href="https://tecnosocialismo.com" aria-label="Tecnosocialismo, pagina iniziale">
          <span className="brand-dot" />
          <strong>LOGIN</strong>
        </a>
        <span className="suite-label">TECNOSOCIALISMO · IDENTITÀ</span>
      </nav>

      <section className="intro-panel">
        <p className="eyebrow">UN ACCOUNT · TUTTA LA SUITE</p>
        <h2>La tua identità<br /><em>attraversa ogni spazio.</em></h2>
        <p>Rizoma, Iskra, Cloud e i servizi che verranno. Un accesso indipendente, riconosciuto ovunque.</p>
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
