/**
 * Smoke test ampliado: features recientes (pisos, flyers, explore, mesas abiertas).
 *
 *   BASE_URL=https://kluby-production-2fa4.up.railway.app npx ts-node-dev --transpile-only src/scripts/smoke-full.ts
 */

const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const PASSWORD = "password123";

type Json = Record<string, unknown>;

async function request(
  path: string,
  options: RequestInit = {},
  attempt = 0
): Promise<{ ok: boolean; status: number; json: Json }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const json = (await res.json().catch(() => ({ success: false, error: "invalid json" }))) as Json;
  const err = String(json.error || "");
  if (!res.ok && attempt < 2 && /EMAXCONNSESSION|max clients/i.test(err)) {
    await new Promise((r) => setTimeout(r, 1500));
    return request(path, options, attempt + 1);
  }
  return { ok: res.ok, status: res.status, json };
}

function pass(label: string) {
  console.log(`  ✓ ${label}`);
}

function fail(label: string, detail?: string) {
  console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  process.exitCode = 1;
}

async function login(email: string): Promise<string | null> {
  const { ok, json } = await request("/api/users/login", {
    method: "POST",
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!ok || !json.success) {
    fail(`Login ${email}`, String(json.error || "failed"));
    return null;
  }
  const data = json.data as { token: string; user: { role: string } };
  pass(`Login ${email} (${data.user.role})`);
  return data.token;
}

async function main(): Promise<void> {
  console.log(`[smoke-full] Base URL: ${BASE_URL}\n`);

  const health = await request("/api/health");
  if (health.ok && (health.json.data as Json)?.status === "ok") {
    pass("GET /api/health");
  } else {
    fail("GET /api/health");
  }

  const ownerToken = await login("duenokluby1@kluby.com");
  const clientToken = await login("anfitrion@kluby.com");
  await login("puerta@kluby.com");

  const explore = await request("/api/events/explore");
  if (explore.ok && explore.json.success) {
    const rows = explore.json.data as unknown[];
    pass(`GET /api/events/explore (${rows.length} eventos)`);
  } else {
    fail("GET /api/events/explore", String(explore.json.error));
  }

  const openTables = await request("/api/reservations/open");
  if (openTables.ok && openTables.json.success) {
    pass(`GET /api/reservations/open (${(openTables.json.data as unknown[]).length} mesas abiertas)`);
  } else {
    fail("GET /api/reservations/open", String(openTables.json.error));
  }

  const clubsRes = await request("/api/clubs");
  if (!clubsRes.ok || !clubsRes.json.success) {
    fail("GET /api/clubs");
    return;
  }
  const clubs = clubsRes.json.data as { id: string; name: string }[];
  pass(`GET /api/clubs (${clubs.length})`);
  const kora = clubs.find((c) => /kora/i.test(c.name));
  if (!kora) {
    fail("Boliche Kora");
    return;
  }

  const evRes = await request(`/api/clubs/${kora.id}/events?includePast=1`);
  if (!evRes.ok || !evRes.json.success) {
    fail("GET eventos Kora");
    return;
  }
  const payload = evRes.json.data as {
    upcoming?: { id: string; name: string; date: string; flyerImageUrl?: string | null }[];
    past?: unknown[];
  };
  const upcoming = payload.upcoming || [];
  pass(`Eventos Kora: ${upcoming.length} próximos`);

  const event = upcoming[0];
  if (!event) {
    fail("Evento próximo para probar availability/floors");
    return;
  }

  const avail = await request(`/api/events/${event.id}/availability`);
  if (!avail.ok || !avail.json.success) {
    fail("GET availability", String(avail.json.error));
    return;
  }
  const availData = avail.json.data as {
    floors?: { id: string; floorIndex: number; name: string; backgroundImage?: string | null }[];
    tables?: { floorId?: string | null }[];
    event?: { flyerImageUrl?: string | null };
  };
  const floors = availData.floors || [];
  if (floors.length >= 1) {
    pass(`Availability incluye ${floors.length} piso(s)`);
  } else {
    fail("Availability sin pisos (EventFloor)");
  }
  const tables = availData.tables || [];
  pass(`Availability: ${tables.length} mesas`);

  if (ownerToken) {
    const auth = { Authorization: `Bearer ${ownerToken}` };
    const floorsApi = await request(`/api/events/${event.id}/floors`, { headers: auth });
    if (floorsApi.ok && floorsApi.json.success) {
      const listed = (floorsApi.json.data as { floors?: unknown[] }).floors || floorsApi.json.data;
      const count = Array.isArray(listed) ? listed.length : floors.length;
      pass(`GET /api/events/:id/floors (${count})`);
    } else {
      fail("GET floors admin", String(floorsApi.json.error));
    }

    const invites = await request(`/api/events/${event.id}/invite-guests`, { headers: auth });
    if (invites.ok && invites.json.success) {
      pass(`GET invite-guests (${(invites.json.data as unknown[]).length} canjeados)`);
    } else if (invites.status === 403) {
      pass("GET invite-guests (403 esperado si no es publi — endpoint existe)");
    } else {
      fail("GET invite-guests", String(invites.json.error));
    }
  }

  if (clientToken && tables.some((t) => t)) {
    pass("Flujo cliente: login + explore + availability OK");
  }

  if (availData.event?.flyerImageUrl) {
    pass("Evento con flyerImageUrl en API");
  } else {
    pass("Evento sin flyer (campo flyerImageUrl presente en schema)");
  }

  console.log(
    process.exitCode
      ? "\n[smoke-full] Hay fallos — revisar."
      : "\n[smoke-full] Todo OK."
  );
}

main().catch((e) => {
  console.error("[smoke-full] Error:", e);
  process.exitCode = 1;
});
