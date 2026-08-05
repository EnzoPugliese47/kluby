/**
 * Smoke test pre-demo de tesis. Verifica API, logins demo, Kora y chat.
 *
 * Uso:
 *   npm run smoke:tesis-demo
 *   BASE_URL=https://kluby-production-2fa4.up.railway.app npm run smoke:tesis-demo
 */

const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const PASSWORD = "password123";

const DEMO_USERS = [
  { email: "anfitrion@kluby.com", role: "CLIENT" },
  { email: "invitado1@kluby.com", role: "CLIENT" },
  { email: "duenokluby1@kluby.com", role: "CLUB_ADMIN" },
  { email: "puerta@kluby.com", role: "PUERTA" },
] as const;

type Json = Record<string, unknown>;

async function request(path: string, options: RequestInit = {}, attempt = 0): Promise<{ ok: boolean; status: number; json: Json }> {
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

async function login(email: string): Promise<{ token: string; userId: string } | null> {
  const { ok, json } = await request("/api/users/login", {
    method: "POST",
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!ok || !json.success) {
    fail(`Login ${email}`, String(json.error || "failed"));
    return null;
  }
  const data = json.data as { token: string; user: { id: string; role: string } };
  pass(`Login ${email} (${data.user.role})`);
  return { token: data.token, userId: data.user.id };
}

async function main(): Promise<void> {
  console.log(`[smoke] Base URL: ${BASE_URL}\n`);

  const health = await request("/api/health");
  if (health.ok && health.json.success && (health.json.data as Json)?.status === "ok") {
    pass("GET /api/health");
  } else {
    fail("GET /api/health", JSON.stringify(health.json));
  }

  const host = await login("anfitrion@kluby.com");
  await login("invitado1@kluby.com");
  await login("duenokluby1@kluby.com");
  await login("puerta@kluby.com");

  if (!host) {
    console.error("\n[smoke] Abortando checks que requieren anfitrión.");
    return;
  }

  const auth = { Authorization: `Bearer ${host.token}` };

  const clubsRes = await request("/api/clubs");
  if (!clubsRes.ok || !clubsRes.json.success) {
    fail("GET /api/clubs", String(clubsRes.json.error));
  } else {
    const clubs = clubsRes.json.data as { id: string; name: string }[];
    pass(`GET /api/clubs (${clubs.length} boliches)`);
    const kora = clubs.find((c) => /kora/i.test(c.name));
    if (!kora) {
      fail("Boliche Kora en listado");
    } else {
      pass(`Kora encontrado (${kora.name})`);
      const evRes = await request(`/api/clubs/${kora.id}/events`);
      if (evRes.ok && evRes.json.success) {
        const events = evRes.json.data as { id: string; name: string; date: string }[];
        const upcoming = events.filter((e) => new Date(e.date).getTime() >= Date.now());
        if (upcoming.length) {
          pass(`Evento futuro en Kora: ${upcoming[0]!.name}`);
        } else {
          fail("Evento futuro en Kora para demo");
        }
      } else {
        fail("GET eventos Kora", String(evRes.json.error));
      }
    }
  }

  const rsRes = await request(`/api/users/${host.userId}/reservations`, { headers: auth });
  if (rsRes.ok && rsRes.json.success) {
    pass(`Reservas anfitrión (${(rsRes.json.data as unknown[]).length})`);
  } else {
    fail("GET reservas anfitrión", String(rsRes.json.error));
  }

  const chatRes = await request(`/api/users/${host.userId}/chat-alerts`, { headers: auth });
  if (chatRes.ok && chatRes.json.success) {
    pass(`GET chat-alerts anfitrión (${(chatRes.json.data as unknown[]).length} alertas)`);
  } else {
    fail("GET chat-alerts", String(chatRes.json.error));
  }

  const loyaltyRes = await request(`/api/loyalty/users/${host.userId}`, { headers: auth });
  if (loyaltyRes.ok && loyaltyRes.json.success) {
    const rows = (loyaltyRes.json.data as { balanceByClub?: { balance: number }[] }).balanceByClub || [];
    const total = rows.reduce((s, r) => s + (r.balance || 0), 0);
    pass(`Kluby Points anfitrión (${total} pts)`);
  } else {
    fail("GET loyalty anfitrión", String(loyaltyRes.json.error));
  }

  console.log(process.exitCode ? "\n[smoke] Hay fallos — revisá antes del jueves." : "\n[smoke] Todo OK para demo.");
}

main().catch((err) => {
  console.error("[smoke] Error:", err);
  process.exitCode = 1;
});
