"use client";

import { useState, type FormEvent } from "react";
import type {
  EconomicPreference,
  GeneralEconomicProfile,
  PreferenceDomain,
} from "@/lib/economic-profile";

const domains: { id: PreferenceDomain; label: string; mark: string; copy: string }[] = [
  { id: "goods", label: "Beni e consumo", mark: "01", copy: "Cibo vegano, bevande e beni materiali" },
  { id: "services", label: "Servizi", mark: "02", copy: "Salute, cura, tecnica, mobilità e digitale" },
  { id: "work", label: "Lavoro", mark: "03", copy: "Attività e formazione professionale desiderate" },
  { id: "leisure", label: "Tempo e gioco", mark: "04", copy: "Sport, cultura, socialità e attività ludiche" },
  { id: "education", label: "Didattica", mark: "05", copy: "Apprendimento, insegnamento e conoscenza" },
];

const contributionOptions = [
  "Produzione", "Preparazione alimentare", "Riparazione", "Logistica", "Cura",
  "Didattica", "Organizzazione", "Catalogazione", "Sviluppo tecnologico", "Ricerca",
];

export function EconomicSetup({
  user,
  initialProfile,
  returnTo,
}: {
  user: { name: string; email: string };
  initialProfile: GeneralEconomicProfile;
  returnTo: string;
}) {
  const [draft, setDraft] = useState(initialProfile);
  const [step, setStep] = useState(1);
  const [domain, setDomain] = useState<PreferenceDomain>("goods");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [workAreas, setWorkAreas] = useState(draft.work.desiredAreas.join(", "));
  const [skills, setSkills] = useState(draft.work.skills.join(", "));
  const [learning, setLearning] = useState(draft.work.learningGoals.join(", "));
  const [activities, setActivities] = useState(draft.contribution.productiveActivities.join(", "));
  const [resources, setResources] = useState(draft.contribution.resources.join(", "));

  const visibleEntries = draft.basket.filter((entry) => entry.domain === domain);
  const enabledEntries = draft.basket.filter((entry) => entry.enabled);

  function updateEntry(id: string, key: keyof EconomicPreference, value: string | number | boolean) {
    setDraft((current) => ({
      ...current,
      basket: current.basket.map((entry) => (entry.id === id ? { ...entry, [key]: value } : entry)),
    }));
  }

  function removeEntry(id: string) {
    setDraft((current) => ({ ...current, basket: current.basket.filter((entry) => entry.id !== id) }));
  }

  function addEntry() {
    setDraft((current) => ({ ...current, basket: [...current.basket, blankEntry(domain)] }));
  }

  function toggleContribution(area: string) {
    const active = draft.contribution.areas.includes(area);
    setDraft({
      ...draft,
      contribution: {
        ...draft.contribution,
        areas: active
          ? draft.contribution.areas.filter((item) => item !== area)
          : [...draft.contribution.areas, area],
      },
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (step < 4) {
      setStep((current) => current + 1);
      return;
    }
    setBusy(true);
    const profile: GeneralEconomicProfile = {
      ...draft,
      work: {
        ...draft.work,
        desiredAreas: parseList(workAreas),
        skills: parseList(skills),
        learningGoals: parseList(learning),
      },
      contribution: {
        ...draft.contribution,
        productiveActivities: parseList(activities),
        resources: parseList(resources),
      },
      updatedAt: new Date().toISOString(),
    };
    const response = await fetch("/api/economic-profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    }).catch(() => null);
    const payload = response ? await response.json().catch(() => ({})) as { error?: string } : {};
    if (!response?.ok) {
      setError(payload.error || "Non è stato possibile salvare il profilo.");
      setBusy(false);
      return;
    }
    window.location.assign(returnTo);
  }

  return (
    <main className="economic-setup-shell">
      <header className="economic-topbar">
        <a className="brand" href="https://tecnosocialismo.com"><span className="brand-dot" /><strong>TECNOSOCIALISMO</strong></a>
        <div><span>PROFILO ECONOMICO</span><b>{user.name}</b></div>
      </header>
      <form className="economic-workspace" onSubmit={submit}>
        <aside className="economic-aside">
          <div className="economic-aside-copy">
            <span>ISCRIZIONE / 02</span>
            <h1>Ciò che serve.<br /><em>Ciò che possiamo.</em></h1>
            <p>Il paniere iniziale evita di partire da zero. Modificalo affinché descriva bisogni, desideri e possibilità reali.</p>
          </div>
          <ol>
            {[
              ["Territorio", "Dove si organizza la domanda"],
              ["Paniere", "Beni, servizi e attività"],
              ["Lavoro e contributo", "Cosa vuoi e cosa puoi fare"],
              ["Sintesi", "La base del calcolo collettivo"],
            ].map(([title, copy], index) => (
              <li className={step === index + 1 ? "active" : step > index + 1 ? "done" : ""} key={title}>
                <i>{step > index + 1 ? "✓" : String(index + 1).padStart(2, "0")}</i>
                <span><b>{title}</b><small>{copy}</small></span>
              </li>
            ))}
          </ol>
          <small>I dati individuali restano privati. I portali usano soltanto il profilo personale e aggregazioni anonime.</small>
        </aside>

        <section className="economic-main">
          <header className="economic-progress">
            <div><span>PASSO {String(step).padStart(2, "0")} / 04</span><b>{step === 1 ? "Territorio" : step === 2 ? "Paniere personale" : step === 3 ? "Lavoro e contributo" : "Sintesi"}</b></div>
            <span><i style={{ width: `${step * 25}%` }} /></span>
          </header>

          <div className="economic-panel">
            {step === 1 && (
              <>
                <PanelTitle title="La domanda ha un territorio" text="Città, nucleo e distanza permettono di organizzare produzione, disponibilità e consegne senza confondere bisogni locali e generali." />
                <div className="economic-fields two">
                  <Field label="Città o comune"><input value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value })} required /></Field>
                  <Field label="CAP"><input value={draft.postalCode} onChange={(event) => setDraft({ ...draft, postalCode: event.target.value })} inputMode="numeric" required /></Field>
                  <Field label="Persone nel nucleo"><input type="number" min="1" max="20" value={draft.householdSize} onChange={(event) => setDraft({ ...draft, householdSize: Number(event.target.value) })} required /></Field>
                  <Field label="Raggio della rete locale">
                    <div className="economic-range"><input type="range" min="1" max="100" value={draft.radiusKm} onChange={(event) => setDraft({ ...draft, radiusKm: Number(event.target.value) })} /><b>{draft.radiusKm} km</b></div>
                  </Field>
                </div>
                <div className="economic-info"><i>i</i><p>Il raggio aiuta a proporre disponibilità e consegne vicine; non impedisce di accedere al resto dell’ecosistema.</p></div>
              </>
            )}

            {step === 2 && (
              <>
                <PanelTitle title="Un paniere già pronto, ma non imposto" text="Abbiamo inserito una base comune modificabile. Disattiva ciò che non ti serve, cambia quantità e frequenza, aggiungi ciò che manca." />
                <nav className="basket-tabs">
                  {domains.map((item) => (
                    <button type="button" className={domain === item.id ? "active" : ""} onClick={() => setDomain(item.id)} key={item.id}>
                      <i>{item.mark}</i><span><b>{item.label}</b><small>{item.copy}</small></span><em>{draft.basket.filter((entry) => entry.domain === item.id && entry.enabled).length}</em>
                    </button>
                  ))}
                </nav>
                <div className="basket-list">
                  {visibleEntries.map((entry) => (
                    <article className={entry.enabled ? "basket-entry active" : "basket-entry"} key={entry.id}>
                      <label className="entry-toggle"><input type="checkbox" checked={entry.enabled} onChange={(event) => updateEntry(entry.id, "enabled", event.target.checked)} /><i /></label>
                      <div className="entry-main">
                        <input className="entry-name" value={entry.item} onChange={(event) => updateEntry(entry.id, "item", event.target.value)} aria-label="Voce del paniere" required={entry.enabled} />
                        <input className="entry-category" value={entry.category} onChange={(event) => updateEntry(entry.id, "category", event.target.value)} aria-label="Categoria" required={entry.enabled} />
                      </div>
                      <div className="entry-measure">
                        <input type="number" min="0.01" step="0.01" value={entry.quantity} onChange={(event) => updateEntry(entry.id, "quantity", Number(event.target.value))} aria-label="Quantità" />
                        <select value={entry.unit} onChange={(event) => updateEntry(entry.id, "unit", event.target.value)} aria-label="Unità">
                          {(["pezzi", "kg", "litri", "confezioni", "ore"] as const).map((unit) => <option key={unit}>{unit}</option>)}
                        </select>
                      </div>
                      <select value={entry.cadence} onChange={(event) => updateEntry(entry.id, "cadence", event.target.value)} aria-label="Frequenza">
                        <option value="una-volta">Una volta</option><option value="settimanale">Ogni settimana</option><option value="mensile">Ogni mese</option><option value="trimestrale">Ogni tre mesi</option><option value="annuale">Ogni anno</option>
                      </select>
                      <select value={entry.priority} onChange={(event) => updateEntry(entry.id, "priority", event.target.value)} aria-label="Priorità">
                        <option value="essenziale">Essenziale</option><option value="importante">Importante</option><option value="utile">Utile</option>
                      </select>
                      <button className="entry-remove" type="button" onClick={() => removeEntry(entry.id)} aria-label="Rimuovi">×</button>
                    </article>
                  ))}
                </div>
                <button className="add-basket-entry" type="button" onClick={addEntry}>+ Aggiungi una voce a {domains.find((item) => item.id === domain)?.label}</button>
                {domain === "goods" && <div className="vegan-account-rule"><i>V</i><span><b>Alimentazione esclusivamente vegana</b><small>Le categorie alimentari del paniere e del Market non accettano prodotti di origine animale.</small></span></div>}
              </>
            )}

            {step === 3 && (
              <>
                <PanelTitle title="Cosa vuoi fare e come puoi contribuire" text="Il lavoro desiderato non coincide automaticamente con il contributo disponibile. Li definiamo separatamente per rispettare bisogni e possibilità." />
                <div className="economic-columns">
                  <section>
                    <header><span>DOMANDA DI LAVORO</span><b>Ciò che vuoi fare</b></header>
                    <Field label="Ambiti lavorativi desiderati"><input value={workAreas} onChange={(event) => setWorkAreas(event.target.value)} placeholder="es. agricoltura, sviluppo, didattica" /></Field>
                    <Field label="Competenze attuali"><input value={skills} onChange={(event) => setSkills(event.target.value)} placeholder="Separa con una virgola" /></Field>
                    <div className="economic-fields two compact-fields">
                      <Field label="Ore desiderate"><input type="number" min="0" max="80" value={draft.work.desiredHours} onChange={(event) => setDraft({ ...draft, work: { ...draft.work, desiredHours: Number(event.target.value) } })} /></Field>
                      <Field label="Modalità"><select value={draft.work.preferredMode} onChange={(event) => setDraft({ ...draft, work: { ...draft.work, preferredMode: event.target.value as GeneralEconomicProfile["work"]["preferredMode"] } })}><option value="indifferente">Indifferente</option><option value="presenza">In presenza</option><option value="ibrido">Ibrido</option><option value="remoto">Remoto</option></select></Field>
                    </div>
                    <Field label="Cosa vuoi imparare"><input value={learning} onChange={(event) => setLearning(event.target.value)} placeholder="Competenze o percorsi desiderati" /></Field>
                  </section>
                  <section>
                    <header><span>OFFERTA E CONTRIBUTO</span><b>Ciò che puoi mettere a disposizione</b></header>
                    <Field label="Attività che sai svolgere o produrre"><input value={activities} onChange={(event) => setActivities(event.target.value)} placeholder="es. cucinare, riparare bici, programmare" /></Field>
                    <Field label="Strumenti, spazi o risorse"><input value={resources} onChange={(event) => setResources(event.target.value)} placeholder="es. cargo bike, laboratorio, cucina" /></Field>
                    <div className="economic-fields two compact-fields">
                      <Field label="Ore disponibili"><input type="number" min="0" max="80" value={draft.contribution.hoursPerWeek} onChange={(event) => setDraft({ ...draft, contribution: { ...draft.contribution, hoursPerWeek: Number(event.target.value) } })} /></Field>
                      <Field label="Mobilità"><select value={draft.contribution.mobility} onChange={(event) => setDraft({ ...draft, contribution: { ...draft.contribution, mobility: event.target.value as GeneralEconomicProfile["contribution"]["mobility"] } })}><option value="nessuna">Nessun mezzo</option><option value="piedi-bici">A piedi o bici</option><option value="mezzo-leggero">Cargo bike o scooter</option><option value="auto-furgone">Auto o furgone</option></select></Field>
                    </div>
                    <Field label="Disponibilità concreta"><input value={draft.contribution.availability} onChange={(event) => setDraft({ ...draft, contribution: { ...draft.contribution, availability: event.target.value } })} placeholder="Giorni, orari o limiti" /></Field>
                  </section>
                </div>
                <div className="contribution-choice">
                  <span>AMBITI IN CUI PUOI CONTRIBUIRE</span>
                  <div>{contributionOptions.map((area) => <button type="button" className={draft.contribution.areas.includes(area) ? "active" : ""} onClick={() => toggleContribution(area)} key={area}><i>{draft.contribution.areas.includes(area) ? "✓" : "+"}</i>{area}</button>)}</div>
                </div>
                <label className="delivery-choice"><input type="checkbox" checked={draft.contribution.canDeliver} onChange={(event) => setDraft({ ...draft, contribution: { ...draft.contribution, canDeliver: event.target.checked } })} /><i /><span><b>Posso partecipare alle consegne della rete</b><small>È una disponibilità, non un’assegnazione automatica.</small></span></label>
              </>
            )}

            {step === 4 && (
              <>
                <PanelTitle title="La tua base per l’intero ecosistema" text="Queste preferenze alimentano Market, Servizi, Lavoro, Sport e Didattica. Potrai modificarle in ogni momento dal tuo account." />
                <div className="economic-summary">
                  <article><span>TERRITORIO</span><b>{draft.city || "Da indicare"}</b><p>{draft.householdSize} persone · raggio {draft.radiusKm} km</p></article>
                  <article><span>PANIERE ATTIVO</span><b>{enabledEntries.length} preferenze</b><p>{enabledEntries.filter((entry) => entry.priority === "essenziale").length} essenziali</p></article>
                  <article><span>LAVORO DESIDERATO</span><b>{draft.work.desiredHours} ore</b><p>alla settimana · {draft.work.preferredMode}</p></article>
                  <article><span>CONTRIBUTO POSSIBILE</span><b>{draft.contribution.hoursPerWeek} ore</b><p>{draft.contribution.areas.length} ambiti selezionati</p></article>
                </div>
                <div className="domain-summary">{domains.map((item) => <span key={item.id}><i>{item.mark}</i><b>{draft.basket.filter((entry) => entry.domain === item.id && entry.enabled).length}</b><small>{item.label}</small></span>)}</div>
                <div className="value-preview"><i>SV</i><span><b>Valore sociale: base informativa pronta</b><small>Per ora raccogliamo bisogni e possibilità. Nessun punto viene ancora assegnato.</small></span><em>NON ATTIVO</em></div>
                {error && <div className="error-banner" role="alert">{error}</div>}
              </>
            )}
          </div>

          <footer className="economic-actions">
            {step > 1 ? <button type="button" className="economic-back" onClick={() => setStep((current) => current - 1)}>← Indietro</button> : <span />}
            <button type="submit" className="economic-next" disabled={busy}>{busy ? "Salvataggio…" : step === 4 ? "Salva e continua" : "Continua"}<b>→</b></button>
          </footer>
        </section>
      </form>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="economic-field"><span>{label}</span>{children}</label>;
}

function PanelTitle({ title, text }: { title: string; text: string }) {
  return <header className="economic-panel-title"><h2>{title}</h2><p>{text}</p></header>;
}

function blankEntry(domain: PreferenceDomain): EconomicPreference {
  const defaults: Record<PreferenceDomain, { category: string; unit: string }> = {
    goods: { category: "casa-cucina", unit: "pezzi" },
    services: { category: "tecnica", unit: "ore" },
    work: { category: "lavoro", unit: "ore" },
    leisure: { category: "socialita", unit: "ore" },
    education: { category: "formazione", unit: "ore" },
  };
  return { id: crypto.randomUUID(), domain, category: defaults[domain].category, item: "", quantity: 1, unit: defaults[domain].unit, cadence: "mensile", priority: "importante", enabled: true, notes: "" };
}

function parseList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}
