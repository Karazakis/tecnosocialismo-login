const services = [
  { id: "home", name: "Tecnosocialismo", url: "https://tecnosocialismo.com", healthUrl: "https://www.tecnosocialismo.com" },
  { id: "login", name: "Account", url: "https://login.tecnosocialismo.com", healthUrl: "https://login.tecnosocialismo.com" },
  { id: "iskra", name: "Iskra", url: "https://iskra.tecnosocialismo.com", healthUrl: "https://iskra.tecnosocialismo.com/api/health" },
  { id: "rizoma", name: "Rizoma", url: "https://rizoma.tecnosocialismo.com", healthUrl: "https://rizoma.tecnosocialismo.com" },
  { id: "cloud", name: "Cloud", url: "https://cloud.tecnosocialismo.com", healthUrl: "https://cloud.tecnosocialismo.com/api/health" },
  { id: "mail", name: "Mail", url: "https://mail.tecnosocialismo.com", healthUrl: "https://mail.tecnosocialismo.com" },
  { id: "video", name: "Video", url: "https://video.tecnosocialismo.com", healthUrl: "https://video.tecnosocialismo.com" },
  { id: "social", name: "Social", url: "https://social.tecnosocialismo.com", healthUrl: "https://social.tecnosocialismo.com" },
  { id: "sport", name: "Sport", url: "https://sport.tecnosocialismo.com", healthUrl: "https://sport.tecnosocialismo.com" },
  { id: "market", name: "Market", url: "https://market.tecnosocialismo.com", healthUrl: "https://market.tecnosocialismo.com" },
  { id: "lavoro", name: "Lavoro", url: "https://lavoro.tecnosocialismo.com", healthUrl: "https://lavoro.tecnosocialismo.com" },
  { id: "azienda", name: "Azienda", url: "https://azienda.tecnosocialismo.com", healthUrl: "https://azienda.tecnosocialismo.com" },
  { id: "servizi", name: "Servizi", url: "https://servizi.tecnosocialismo.com", healthUrl: "https://servizi.tecnosocialismo.com" },
  { id: "biblioteca", name: "Biblioteca", url: "https://biblioteca.tecnosocialismo.com", healthUrl: "https://biblioteca.tecnosocialismo.com" },
  { id: "messaggi", name: "Messaggi", url: "https://messaggi.tecnosocialismo.com", healthUrl: "https://messaggi.tecnosocialismo.com/api/health" },
  { id: "militant", name: "Militant", url: "https://militant.tecnosocialismo.com", healthUrl: "https://militant.tecnosocialismo.com/api/health" },
];

export async function monitorServices() {
  const checkedAt = new Date().toISOString();
  const results = await Promise.all(services.map(async (service) => {
    const start = Date.now();
    try {
      const response = await fetch(service.healthUrl, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(7_000), headers: { "User-Agent": "Tecnosocialismo-Militant-Monitor/1.0" } });
      const latency = Date.now() - start;
      return { ...service, status: response.ok ? "online" : response.status < 500 ? "degraded" : "offline", httpStatus: response.status, latency, checkedAt };
    } catch {
      return { ...service, status: "offline", httpStatus: null, latency: Date.now() - start, checkedAt };
    }
  }));
  return results;
}
