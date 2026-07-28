"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

const products = [
  { mark: "I", name: "Iskra", description: "Pensa e costruisci", href: "https://iskra.tecnosocialismo.com/chat" },
  { mark: "R", name: "Rizoma", description: "Cerca e scopri", href: "https://rizoma.tecnosocialismo.com" },
  { mark: "C", name: "Cloud", description: "Conserva e apri", href: "https://cloud.tecnosocialismo.com" },
  { mark: "M", name: "Mail", description: "Comunica", href: "https://mail.tecnosocialismo.com" },
  { mark: "V", name: "Video", description: "Guarda e pubblica", href: "https://video.tecnosocialismo.com" },
  { mark: "S", name: "Social", description: "Partecipa", href: "https://social.tecnosocialismo.com" },
  { mark: "F", name: "Sport", description: "Allenati e incontra persone", href: "https://sport.tecnosocialismo.com" },
  { mark: "G", name: "Messaggi", description: "Parla e collabora", href: "https://messaggi.tecnosocialismo.com" },
  { mark: "K", name: "Market", description: "Beni, spesa e consegne", href: "https://market.tecnosocialismo.com" },
  { mark: "L", name: "Lavoro", description: "Trova e offri capacità", href: "https://lavoro.tecnosocialismo.com" },
  { mark: "Z", name: "Azienda", description: "Gestisci e decidi insieme", href: "https://azienda.tecnosocialismo.com" },
  { mark: "E", name: "Servizi", description: "Trova la capacità giusta", href: "https://servizi.tecnosocialismo.com" },
  { mark: "B", name: "Biblioteca", description: "Leggi e conserva conoscenza", href: "https://biblioteca.tecnosocialismo.com" },
];

export function AccountPanel({ user }: { user: { name: string; email: string } }) {
  const [loading, setLoading] = useState(false);

  async function signOut() {
    setLoading(true);
    await authClient.signOut();
    window.location.assign("/");
  }

  return (
    <section className="account-card" aria-labelledby="account-title">
      <p className="eyebrow">IL TUO ACCOUNT</p>
      <div className="identity-row">
        <span>{initials(user.name)}</span>
        <div>
          <h1 id="account-title">{user.name}</h1>
          <p>{user.email}</p>
        </div>
        <i>ATTIVO</i>
      </div>
      <div className="product-list">
        {products.map((product) => (
          <a href={product.href} key={product.name}>
            <span>{product.mark}</span>
            <div><strong>{product.name}</strong><small>{product.description}</small></div>
            <b aria-hidden="true">↗</b>
          </a>
        ))}
      </div>
      <Link className="economic-profile-link" href="/?setup=economy"><span>SV</span><div><strong>Paniere e profilo economico</strong><small>Bisogni, lavoro e forme di contributo</small></div><b>→</b></Link>
      <button className="signout-button" type="button" onClick={() => void signOut()} disabled={loading}>
        {loading ? "Uscita…" : "Esci da tutti i servizi"}
      </button>
    </section>
  );
}

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}
