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

  const CLUB_ZONES = [
    { id: "CABA", label: "CABA (Capital Federal)", short: "CABA" },
    { id: "ZONA_NORTE", label: "Zona Norte (GBA)", short: "Zona Norte" },
    { id: "ZONA_SUR", label: "Zona Sur (GBA)", short: "Zona Sur" },
    { id: "ZONA_OESTE", label: "Zona Oeste (GBA)", short: "Zona Oeste" },
    { id: "ZONA_ESTE", label: "Zona Este (GBA)", short: "Zona Este" },
  ];

  function zoneLabel(zone) {
    return CLUB_ZONES.find((z) => z.id === zone)?.label || zone || "";
  }

  function zoneShort(zone) {
    return CLUB_ZONES.find((z) => z.id === zone)?.short || zone || "";
  }

  function clubLocationMeta(club) {
    const parts = [];
    if (club.zone) parts.push(zoneShort(club.zone));
    if (club.city) parts.push(club.city);
    return parts.join(" · ") || club.address || "";
  }

  function zoneFilterOptions(selected) {
    return `<option value="">Todas las zonas</option>${CLUB_ZONES.map(
      (z) => `<option value="${z.id}"${selected === z.id ? " selected" : ""}>${z.label}</option>`
    ).join("")}`;
  }

  function datePresetOptions(selected) {
    const opts = [
      ["", "Cualquier fecha"],
      ["today", "Hoy"],
      ["weekend", "Este finde"],
      ["week", "Esta semana"],
    ];
    return opts
      .map(([v, l]) => `<option value="${v}"${selected === v ? " selected" : ""}>${l}</option>`)
      .join("");
  }

  function computeDateRange(preset) {
    if (!preset) return {};
    const now = new Date();
    if (preset === "today") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      return { from: start.toISOString(), to: end.toISOString() };
    }
    if (preset === "week") {
      const end = new Date(now);
      end.setDate(end.getDate() + 7);
      end.setHours(23, 59, 59, 999);
      return { to: end.toISOString() };
    }
    if (preset === "weekend") {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      const day = d.getDay();
      let friOffset;
      if (day === 0) friOffset = -2;
      else if (day === 6) friOffset = -1;
      else if (day === 5) friOffset = 0;
      else friOffset = 5 - day;
      const fri = new Date(d);
      fri.setDate(fri.getDate() + friOffset);
      const sun = new Date(fri);
      sun.setDate(sun.getDate() + 2);
      sun.setHours(23, 59, 59, 999);
      return { from: fri.toISOString(), to: sun.toISOString() };
    }
    return {};
  }

  /** Filtros compartidos explorar / app. prefix evita colision de ids (ej. "ex-" o "wz-"). */
  function exploreFiltersHtml(prefix, opts = {}) {
    const tab = opts.tab || "clubs";
    const showDate = tab === "events";
    const showUpcoming = tab === "clubs";
    return `
      <div class="k-filters k-explore-filters">
        <input id="${prefix}q" type="search" placeholder="Buscar..." autocomplete="off" />
        <input id="${prefix}genre" type="search" placeholder="Género musical..." autocomplete="off" list="${prefix}genres" />
        <datalist id="${prefix}genres">
          <option value="Electrónica"></option><option value="Reggaetón"></option><option value="Cumbia"></option>
          <option value="Pop"></option><option value="Rock"></option><option value="Techno"></option>
        </datalist>
        <select id="${prefix}zone" title="Zona">${zoneFilterOptions("")}</select>
        ${
          showDate
            ? `<select id="${prefix}date" title="Fecha">${datePresetOptions("")}</select>`
            : ""
        }
        ${
          showUpcoming
            ? `<label class="k-filter-check"><input type="checkbox" id="${prefix}upcoming" checked /> Solo con eventos próximos</label>`
            : ""
        }
      </div>`;
  }

  function readExploreFilters(prefix) {
    const q = document.getElementById(prefix + "q")?.value.trim() || "";
    const genre = document.getElementById(prefix + "genre")?.value.trim() || "";
    const zone = document.getElementById(prefix + "zone")?.value || "";
    const datePreset = document.getElementById(prefix + "date")?.value || "";
    const upcomingOnly = document.getElementById(prefix + "upcoming")?.checked;
    const range = computeDateRange(datePreset);
    return { q, genre, zone, upcomingOnly, ...range };
  }

  function clubsQueryString(filters) {
    const qs = new URLSearchParams();
    if (filters.q) qs.set("search", filters.q);
    if (filters.genre) qs.set("genre", filters.genre);
    if (filters.zone) qs.set("zone", filters.zone);
    if (filters.upcomingOnly) qs.set("upcomingOnly", "1");
    return qs.toString();
  }

  function eventsQueryString(filters) {
    const qs = new URLSearchParams();
    if (filters.q) qs.set("search", filters.q);
    if (filters.genre) qs.set("genre", filters.genre);
    if (filters.zone) qs.set("zone", filters.zone);
    if (filters.from) qs.set("from", filters.from);
    if (filters.to) qs.set("to", filters.to);
    return qs.toString();
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
          <div class="meta">📍 ${esc(clubLocationMeta(club))}</div>
          <div class="tags">
            ${club.zone ? `<span class="tag violet">${esc(zoneShort(club.zone))}</span>` : ""}
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
          <div class="meta">📍 ${esc(clubLocationMeta(club))}</div>
          <div class="tags">
            ${club.zone ? `<span class="tag violet">${esc(zoneShort(club.zone))}</span>` : ""}
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

  function exploreEventRowHtml(item) {
    const club = item.club || {};
    const cid = esc(club.id);
    const genre = item.musicGenre || club.musicGenre;
    const loc = clubLocationMeta(club);
    return `
      <div class="k-event-row k-explore-event-row">
        <div class="info">
          <h4>${esc(item.name)}</h4>
          <small>🗓 ${fdatetime(item.date)}${genre ? " · 🎵 " + esc(genre) : ""}</small>
          <small class="k-event-club-line">🏢 ${esc(club.name || "")}${loc ? " · 📍 " + esc(loc) : ""}</small>
        </div>
        <a class="k-btn-cyan" href="${reserveUrl(club.id, item.id)}" style="padding:10px 20px;font-size:13px;white-space:nowrap">Reservar mesa</a>
      </div>`;
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
    if (params.search || params.q) qs.set("search", params.search || params.q);
    if (params.genre) qs.set("genre", params.genre);
    if (params.zone) qs.set("zone", params.zone);
    if (params.upcomingOnly) qs.set("upcomingOnly", "1");
    const q = qs.toString();
    return fetchJson("/clubs" + (q ? "?" + q : ""));
  }

  async function loadExploreEvents(params = {}) {
    const qs = new URLSearchParams();
    if (params.search || params.q) qs.set("search", params.search || params.q);
    if (params.genre) qs.set("genre", params.genre);
    if (params.zone) qs.set("zone", params.zone);
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    const q = qs.toString();
    return fetchJson("/events/explore" + (q ? "?" + q : ""));
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
    CLUB_ZONES,
    zoneLabel,
    zoneShort,
    clubLocationMeta,
    zoneFilterOptions,
    datePresetOptions,
    computeDateRange,
    exploreFiltersHtml,
    readExploreFilters,
    clubsQueryString,
    eventsQueryString,
    exploreEventRowHtml,
    clubCoverHtml,
    clubCardHtml,
    clubCardAppHtml,
    eventRowHtml,
    eventRowAppHtml,
    reserveUrl,
    fetchJson,
    loadClubs,
    loadExploreEvents,
    loadClub,
    loadClubEvents,
  };
})();
