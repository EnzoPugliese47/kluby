/** Banner de sin conexión (web + APK). Incluir en páginas con kluby-ui u ops-native. */
(function initKlubyOfflineGuard() {
  if (document.getElementById("k-offline-banner")) return;

  const banner = document.createElement("div");
  banner.id = "k-offline-banner";
  banner.hidden = true;
  banner.setAttribute("role", "alert");
  banner.innerHTML =
    '<div class="k-offline-inner"><b>Sin conexión</b><span>No pudimos contactar al servidor. Revisá tu internet e intentá de nuevo.</span></div>';

  function mount() {
    if (!document.body) return;
    if (!document.getElementById("k-offline-banner")) document.body.prepend(banner);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }

  let pingTimer = null;

  function setOffline(on) {
    mount();
    banner.hidden = !on;
    document.documentElement.classList.toggle("k-offline", on);
  }

  async function ping() {
    if (!navigator.onLine) {
      setOffline(true);
      return;
    }
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch("/api/health", { cache: "no-store", signal: ctrl.signal });
      clearTimeout(t);
      const json = await res.json().catch(() => ({}));
      setOffline(!(res.ok && json.success && json.data?.status === "ok"));
    } catch {
      setOffline(true);
    }
  }

  window.addEventListener("offline", () => setOffline(true));
  window.addEventListener("online", () => { void ping(); });

  pingTimer = window.setInterval(() => { void ping(); }, 30000);
  void ping();

  window.KlubyOffline = { ping, setOffline, stop: () => clearInterval(pingTimer) };
})();
