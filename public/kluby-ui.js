/**
 * Kluby — UI compartida del sitio público (nav, footer, helpers).
 */
(function initKlubyMobileShell() {
  const cap = window.Capacitor;
  const isNative = cap?.isNativePlatform?.() === true;
  if (isNative) document.documentElement.classList.add("cap-native");
  if (isNative || window.matchMedia("(max-width: 768px)").matches) {
    document.documentElement.classList.add("mobile-ui");
  }
  if (isNative && cap.Plugins?.StatusBar) {
    const sb = cap.Plugins.StatusBar;
    Promise.resolve()
      .then(() => sb.setOverlaysWebView?.({ overlay: false }))
      .then(() => sb.setBackgroundColor?.({ color: "#050508" }))
      .then(() => sb.setStyle?.({ style: "DARK" }))
      .catch(() => {});
  }
})();

window.KlubyUI = (function () {
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  const fdatetime = (d) =>
    new Date(d).toLocaleString("es-AR", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  const fdate = (d) =>
    new Date(d).toLocaleDateString("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });

  function getSession() {
    try {
      const token = localStorage.getItem("kluby_token") || "";
      const user = JSON.parse(localStorage.getItem("kluby_user") || "null");
      return token && user ? { token, user } : null;
    } catch {
      return null;
    }
  }

  function appDest(user) {
    switch (user?.role) {
      case "SUPER_ADMIN":
      case "CLUB_ADMIN":
        return "/panel.html";
      case "STAFF":
        return "/publi.html";
      case "PUERTA":
        return "/staff.html";
      default:
        return "/app.html";
    }
  }

  const ADMIN_CLIENT_KEY = "kluby_admin_as_client";

  /** Admin/dueño eligió ver la app cliente desde el panel. */
  function markClientAppVisit() {
    sessionStorage.setItem(ADMIN_CLIENT_KEY, "1");
  }

  function clearClientAppVisit() {
    sessionStorage.removeItem(ADMIN_CLIENT_KEY);
  }

  /** Si el usuario no debería estar en app.html, devuelve la URL correcta. */
  function resolveAppEntry(user) {
    if (!user) return "/login.html?next=" + encodeURIComponent("/app.html");
    const home = appDest(user);
    if (home === "/app.html") return null;
    if (["SUPER_ADMIN", "CLUB_ADMIN"].includes(user.role) && sessionStorage.getItem(ADMIN_CLIENT_KEY)) {
      return null;
    }
    return home;
  }

  /** Tras login: respeta ?next= solo si es válido para el rol. */
  function redirectAfterAuth(user, nextUrl) {
    const home = appDest(user);
    if (nextUrl && nextUrl.startsWith("/")) {
      const wantsClient = nextUrl.startsWith("/app.html");
      const wantsPanel = nextUrl.startsWith("/panel.html");
      if (wantsClient && home !== "/app.html") return home;
      if (wantsPanel && !["SUPER_ADMIN", "CLUB_ADMIN"].includes(user.role)) return home;
      return nextUrl;
    }
    return home;
  }

  function captureInviteFromUrl() {
    const p = new URLSearchParams(location.search);
    const inv = p.get("invitacion");
    const eq = p.get("equipo");
    if (inv) localStorage.setItem("kluby_pending_event", inv.trim());
    if (eq) localStorage.setItem("kluby_pending_equipo", eq.trim());
    if (inv || eq) {
      const next = p.get("next");
      const q = next ? "?next=" + encodeURIComponent(next) : "";
      history.replaceState({}, "", location.pathname + q);
    }
  }

  function renderBg(container, opts = {}) {
    const orbs = opts.orbs !== false;
    container.innerHTML = `
      <div class="k-bg-glow"></div>
      ${orbs ? '<div class="k-orb a"></div><div class="k-orb b"></div><div class="k-orb c"></div>' : ""}
      <div class="k-scanlines"></div>`;
  }

  function renderNav(container, active) {
    const session = getSession();
    const links = [
      ["home", "/", "Inicio"],
      ["explorar", "/explorar.html", "Explorar"],
      ["app", "/#app-android", "App Android"],
    ];
    container.innerHTML = `
      <nav class="k-nav">
        <a class="brand" href="/">
          <div class="brand">
            <div class="logo">K</div>
            <div><h1 class="logo-text">KLUBY</h1><span>Nightlife · VIP</span></div>
          </div>
        </a>
        <div class="links">
          ${links.map(([id, href, label]) => `<a href="${href}" class="${active === id ? "active" : ""}">${label}</a>`).join("")}
        </div>
        <div class="actions">
          ${
            session
              ? `<a class="k-btn-ghost" href="${appDest(session.user)}">Mi panel</a>`
              : `<a class="k-btn-ghost" href="/login.html">Ingresar</a>`
          }
          <a class="k-btn-glow" href="${session ? "/app.html" : "/login.html?next=" + encodeURIComponent("/app.html")}">${session ? "Reservar" : "Empezar"}</a>
        </div>
      </nav>`;
  }

  function renderFooter(container) {
    container.innerHTML = `
      <footer class="k-footer">
        <p>© ${new Date().getFullYear()} Kluby · Plataforma de reservas VIP</p>
        <div class="links">
          <a href="/">Inicio</a>
          <a href="/explorar.html">Explorar</a>
          <a href="/login.html">Ingresar</a>
          <a href="/app.html">App cliente</a>
          <a href="/#app-android">Descargar app</a>
          <a href="/panel.html">Panel dueños</a>
        </div>
      </footer>`;
  }

  function mountPublicPage(active, opts = {}) {
    document.body.classList.add("kluby-public");
    const bg = document.getElementById("k-bg");
    const nav = document.getElementById("k-nav");
    const foot = document.getElementById("k-footer");
    if (bg) renderBg(bg, opts);
    if (nav) renderNav(nav, active);
    if (foot) renderFooter(foot);
  }

  function clubCoverHtml(club) {
    const initial = (club.name || "K").charAt(0).toUpperCase();
    if (club.imageUrl) {
      return `<img src="${esc(club.imageUrl)}" alt="" loading="lazy" />`;
    }
    return `<span class="initial">${initial}</span>`;
  }

  function clubCardHtml(club, href) {
    const url = href || `/boliche.html?id=${encodeURIComponent(club.id)}`;
    return `
      <a class="k-club-card" href="${url}">
        <div class="cover">${clubCoverHtml(club)}</div>
        <div class="body">
          <h3>${esc(club.name)}</h3>
          <div class="meta">📍 ${esc(club.address)}, ${esc(club.city)}</div>
          <div class="tags">
            ${club.musicGenre ? `<span class="tag">${esc(club.musicGenre)}</span>` : ""}
            <span class="tag cyan">Ver boliche</span>
          </div>
        </div>
      </a>`;
  }

  function clubCardAppHtml(club, mode) {
    const id = esc(club.id);
    const action =
      mode === "wizard"
        ? `wizardGo(2,{clubId:'${id}'})`
        : `go('club',{id:'${id}'})`;
    return `
      <div class="k-club-card" role="button" tabindex="0" onclick="${action}">
        <div class="cover">${clubCoverHtml(club)}</div>
        <div class="body">
          <h3>${esc(club.name)}</h3>
          <div class="meta">📍 ${esc(club.address)}, ${esc(club.city)}</div>
          <div class="tags">
            ${club.musicGenre ? `<span class="tag">${esc(club.musicGenre)}</span>` : ""}
            <span class="tag cyan">${mode === "wizard" ? "Elegir fecha" : "Ver fechas"}</span>
          </div>
        </div>
      </div>`;
  }

  function eventRowAppHtml(event, clubId, mode) {
    const eid = esc(event.id);
    const cid = esc(clubId);
    const btn =
      mode === "wizard"
        ? `<button type="button" class="k-btn-cyan" style="padding:10px 20px;font-size:13px;border:none;cursor:pointer" onclick="wizardGo(3,{clubId:'${cid}',eventId:'${eid}'})">Elegir mesa</button>`
        : `<button type="button" class="k-btn-cyan" style="padding:10px 20px;font-size:13px;border:none;cursor:pointer" onclick="go('event',{id:'${eid}',club:'${cid}'})">Ver mapa</button>`;
    return `
      <div class="k-event-row">
        <div class="info">
          <h4>${esc(event.name)}</h4>
          <small>🗓 ${fdatetime(event.date)}${event.musicGenre ? " · 🎵 " + esc(event.musicGenre) : ""}</small>
        </div>
        ${btn}
      </div>`;
  }

  function reserveUrl(clubId, eventId) {
    const dest = `/app.html?clubId=${encodeURIComponent(clubId)}&eventId=${encodeURIComponent(eventId)}`;
    const session = getSession();
    if (session && session.user.role === "CLIENT") return dest;
    return `/login.html?next=${encodeURIComponent(dest)}`;
  }

  function eventRowHtml(event, clubId) {
    const isPast = new Date(event.date) < new Date();
    return `
      <div class="k-event-row">
        <div class="info">
          <h4>${esc(event.name)}</h4>
          <small>🗓 ${fdatetime(event.date)}${event.musicGenre ? " · 🎵 " + esc(event.musicGenre) : ""}</small>
        </div>
        ${
          isPast
            ? '<span class="badge muted">Finalizado</span>'
            : `<a class="k-btn-cyan" href="${reserveUrl(clubId, event.id)}" style="padding:10px 20px;font-size:13px">Reservar mesa</a>`
        }
      </div>`;
  }

  async function fetchJson(path) {
    const res = await fetch("/api" + path);
    const json = await res.json().catch(() => ({ success: false }));
    if (!res.ok || !json.success) throw new Error(json.error || "Error al cargar datos");
    return json.data;
  }

  async function loadClubs(params = {}) {
    const qs = new URLSearchParams();
    if (params.search) qs.set("search", params.search);
    if (params.genre) qs.set("genre", params.genre);
    const q = qs.toString();
    return fetchJson("/clubs" + (q ? "?" + q : ""));
  }

  async function loadClub(id) {
    return fetchJson("/clubs/" + encodeURIComponent(id));
  }

  async function loadClubEvents(clubId) {
    const events = await fetchJson("/clubs/" + encodeURIComponent(clubId) + "/events");
    const now = new Date();
    return events
      .filter((e) => e.isActive !== false)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map((e) => ({ ...e, isPast: new Date(e.date) < now }));
  }

  return {
    esc,
    fdatetime,
    fdate,
    getSession,
    appDest,
    markClientAppVisit,
    clearClientAppVisit,
    resolveAppEntry,
    redirectAfterAuth,
    captureInviteFromUrl,
    renderBg,
    renderNav,
    renderFooter,
    mountPublicPage,
    clubCoverHtml,
    clubCardHtml,
    clubCardAppHtml,
    eventRowHtml,
    eventRowAppHtml,
    reserveUrl,
    fetchJson,
    loadClubs,
    loadClub,
    loadClubEvents,
  };
})();
