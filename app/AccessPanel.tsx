"use client";

import { FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

type Mode = "signin" | "signup";

export function AccessPanel({
  initialMode,
  returnTo,
}: {
  initialMode: Mode;
  returnTo: string;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (mode === "signup" && password !== confirmPassword) {
      setError("Le password non coincidono.");
      return;
    }

    setLoading(true);
    try {
      const result =
        mode === "signup"
          ? await authClient.signUp.email({
              name: name.trim(),
              email: email.trim().toLowerCase(),
              password,
            })
          : await authClient.signIn.email({
              email: email.trim().toLowerCase(),
              password,
              rememberMe: true,
            });

      if (result.error) {
        throw new Error(
          mode === "signup"
            ? "Non è stato possibile creare l'account. Controlla i dati o prova ad accedere."
            : "Email o password non corrette.",
        );
      }
      window.location.assign(
        mode === "signup"
          ? `/?setup=economy&returnTo=${encodeURIComponent(returnTo)}`
          : returnTo,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Operazione non riuscita.");
    } finally {
      setLoading(false);
    }
  }

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setError("");
    setPassword("");
    setConfirmPassword("");
  }

  return (
    <section className="access-card" aria-labelledby="access-title">
      <div className="access-tabs" role="tablist" aria-label="Modalità di accesso">
        <button className={mode === "signin" ? "active" : ""} type="button" onClick={() => changeMode("signin")}>Accedi</button>
        <button className={mode === "signup" ? "active" : ""} type="button" onClick={() => changeMode("signup")}>Crea account</button>
      </div>

      <p className="eyebrow">ACCOUNT TECNOSOCIALISMO</p>
      <h1 id="access-title">{mode === "signup" ? "Crea il tuo spazio." : "Bentornato."}</h1>
      <p className="card-intro">
        {mode === "signup"
          ? "Una sola identità per entrare in tutti i servizi presenti e futuri."
          : "Accedi una volta e continua in tutta la suite."}
      </p>

      <form onSubmit={submit}>
        {mode === "signup" && (
          <label>
            <span>Nome</span>
            <input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={60} required />
          </label>
        )}
        <label>
          <span>Email</span>
          <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>
          <span>Password</span>
          <input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} maxLength={128} required />
          {mode === "signup" && <small>Almeno 12 caratteri.</small>}
        </label>
        {mode === "signup" && (
          <label>
            <span>Ripeti la password</span>
            <input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={12} maxLength={128} required />
          </label>
        )}
        {error && <div className="error-banner" role="alert">{error}</div>}
        <button className="primary-button" type="submit" disabled={loading}>
          {loading ? "Un momento…" : mode === "signup" ? "Crea account" : "Entra nella suite"}
          <span aria-hidden="true">↗</span>
        </button>
      </form>
      <p className="privacy-note">Sessione protetta · nessun account ChatGPT richiesto</p>
    </section>
  );
}
