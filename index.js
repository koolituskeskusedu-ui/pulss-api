// ============================================================
//  Õppeplatvorm · Cloudflare Worker API (Hono + D1 + R2)
//  Фаза 1: настройки, авторизация сотрудников, группы, студенты.
//  Следующие фазы добавят курсы/уроки/тесты, сдачи, встречи,
//  сертификаты (PDF в R2) и т.д.
// ============================================================
import { Hono } from "hono";

const app = new Hono();

/* ---------------- CORS (с поддержкой cookie-сессий) ---------------- */
// При работе через httpOnly-cookie Access-Control-Allow-Origin НЕ может быть "*",
// поэтому отражаем разрешённый origin и включаем credentials.
app.use("*", async (c, next) => {
  const allowed = c.env.ALLOWED_ORIGIN || "*";
  const reqOrigin = c.req.header("Origin") || "";
  const origin = allowed === "*" ? (reqOrigin || "*") : allowed;
  if (c.req.method === "OPTIONS") {
    return new Response(null, { headers: cors(origin) });
  }
  await next();
  Object.entries(cors(origin)).forEach(([k, v]) => c.res.headers.set(k, v));
});
function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
    "Access-Control-Max-Age": "86400",
  };
}
// Cookie сессии: httpOnly + Secure + SameSite=None (для фронтенда на другом домене).
const SESSION_MAXAGE = 30 * 24 * 60 * 60; // 30 дней, в секундах
function sessionCookie(token) {
  return `session=${token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${SESSION_MAXAGE}`;
}
function clearCookie() {
  return "session=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0";
}
function tokenFromReq(c) {
  const h = c.req.header("Authorization") || "";
  if (h.startsWith("Bearer ")) return h.slice(7);
  const cookie = c.req.header("Cookie") || "";
  const m = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  return m ? m[1] : null;
}

/* ---------------- Утилиты ---------------- */
const uid = (p = "") => p + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
const nowISO = () => new Date().toISOString();
// Эстонский viitenumber: базовое число + контрольная цифра 7-3-1.
function makeViitenumber(seq) {
  const base = String(seq).padStart(4, "0");
  const w = [7, 3, 1]; let sum = 0;
  for (let i = 0; i < base.length; i++) sum += (+base[base.length - 1 - i]) * w[i % 3];
  return base + ((10 - (sum % 10)) % 10);
}
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));

async function hashPassword(password, iterations = 100000) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
  return `pbkdf2$${iterations}$${b64(salt)}$${b64(bits)}`;
}
async function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith("pbkdf2$")) return false;
  const [, iterS, saltB64, hashB64] = stored.split("$");
  const salt = fromB64(saltB64);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: +iterS, hash: "SHA-256" }, key, 256);
  return b64(bits) === hashB64;
}

/* ---------------- Авторизация (сессии в D1) ---------------- */
async function auth(c) {
  const token = tokenFromReq(c);
  if (!token) return null;
  const row = await c.env.DB.prepare(
    "SELECT token, subject_id, role, expires_at FROM sessions WHERE token = ?"
  ).bind(token).first();
  if (!row) return null;
  if (row.expires_at < nowISO()) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    return null;
  }
  return { id: row.subject_id, role: row.role };
}
function requireRole(session, ...roles) {
  return session && roles.includes(session.role);
}

/* ---------------- Health ---------------- */
app.get("/api/health", async (c) => {
  const r = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM staff").first();
  return c.json({ ok: true, staff: r?.n ?? 0, time: nowISO() });
});

/* ---------------- Bootstrap первого админа ---------------- */
app.post("/api/setup", async (c) => {
  const cnt = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM staff").first();
  if ((cnt?.n ?? 0) > 0) return c.json({ error: "already_initialized" }, 409);
  const { name, login, password } = await c.req.json();
  if (!name || !login || !password) return c.json({ error: "missing_fields" }, 400);
  const hash = await hashPassword(password);
  const id = uid("u_");
  await c.env.DB.prepare(
    "INSERT INTO staff (id, name, login, password_hash, role, perms, scope_all) VALUES (?,?,?,?,?,?,1)"
  ).bind(id, name, login, hash, "admin", "{}").run();
  return c.json({ ok: true, id });
});

// Браузерная страница первичной настройки — создать администратора без терминала.
app.get("/setup", async (c) => {
  const cnt = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM staff").first();
  const done = (cnt?.n ?? 0) > 0;
  const html = `<!doctype html><html lang="et"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>pulss. · seadistus</title>
<style>body{font-family:system-ui,Arial,sans-serif;background:#F7F6F3;margin:0;padding:44px 16px;color:#12100E}
.card{max-width:420px;margin:0 auto;background:#fff;border:1px solid #E5E2DC;border-radius:14px;padding:28px}
.mark{font-weight:700;font-size:30px;letter-spacing:-1.2px}.mark span{color:#237F52}
h1{font-size:19px;margin:18px 0 4px}.sub{color:#6B675F;font-size:14px;margin-bottom:20px}
label{display:block;font-size:13px;font-weight:600;margin:12px 0 5px}
input{width:100%;box-sizing:border-box;padding:11px 13px;border:1px solid #D9D6D0;border-radius:8px;font-size:15px}
button{width:100%;margin-top:18px;padding:12px;border:0;border-radius:8px;background:#237F52;color:#fff;font-weight:600;font-size:15px;cursor:pointer}
.msg{margin-top:16px;font-size:14px;border-radius:8px;padding:12px 14px}
.ok{background:#EAF2ED;color:#17573A;border:1px solid #BEDCCB}.bad{background:#FBEEEC;color:#C0392B;border:1px solid #EFC9C3}</style>
<div class="card"><div class="mark">pulss<span>.</span></div>
${done?`<h1>Seadistus on juba tehtud</h1><div class="sub">Administraator on olemas. Seda lehte enam ei vajata.</div><div class="msg ok">✓ Süsteem on valmis. Logi sisse platvormil.</div>`
:`<h1>Esmane seadistus</h1><div class="sub">Loo esimene administraator. Seda saab teha ainult üks kord.</div>
<label>Nimi</label><input id="n" placeholder="Andrei Smagin">
<label>Kasutajanimi (login)</label><input id="l" placeholder="admin">
<label>Parool</label><input id="p" type="password" placeholder="••••••••">
<button onclick="go()">Loo administraator</button><div id="r"></div>`}</div>
<script>
async function go(){const n=document.getElementById('n').value.trim(),l=document.getElementById('l').value.trim(),p=document.getElementById('p').value;
const r=document.getElementById('r');if(!n||!l||!p){r.className='msg bad';r.textContent='Täida kõik väljad';return;}
r.className='msg';r.textContent='...';
const res=await fetch('/api/setup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:n,login:l,password:p})});
const d=await res.json();
if(d.ok){r.className='msg ok';r.innerHTML='✓ Administraator loodud! Nüüd saad platvormil sisse logida kasutajanimega <b>'+l+'</b>.';}
else{r.className='msg bad';r.textContent=d.error==='already_initialized'?'Administraator on juba olemas.':'Viga: '+(d.error||'tundmatu');}}
</script></html>`;
  return c.html(html);
});

/* ---------------- Login (сотрудник или ученик) ---------------- */
async function startSession(c, subjectId, role) {
  const token = uid("s_") + uid();
  const expires = new Date(Date.now() + 30 * 864e5).toISOString();
  await c.env.DB.prepare(
    "INSERT INTO sessions (token, subject_id, role, expires_at) VALUES (?,?,?,?)"
  ).bind(token, subjectId, role, expires).run();
  c.header("Set-Cookie", sessionCookie(token));
}
app.post("/api/login", async (c) => {
  const { login, password } = await c.req.json();
  const key = String(login || "").trim();
  // 1) сотрудник по login
  const u = await c.env.DB.prepare("SELECT * FROM staff WHERE login = ?").bind(key).first();
  if (u && (await verifyPassword(password, u.password_hash))) {
    await startSession(c, u.id, u.role);
    return c.json({ ok: true, role: u.role, user: { id: u.id, name: u.name, role: u.role, perms: JSON.parse(u.perms || "{}") } });
  }
  // 2) ученик по «Имя Фамилия»
  const st = await c.env.DB.prepare(
    "SELECT * FROM students WHERE LOWER(first_name || ' ' || last_name) = LOWER(?)"
  ).bind(key).first();
  if (st && (await verifyPassword(password, st.password_hash))) {
    if (st.archive_at && st.archive_at < nowISO().slice(0, 10)) return c.json({ error: "access_closed" }, 403);
    await startSession(c, st.id, "student");
    return c.json({ ok: true, role: "student", user: { id: st.id, first_name: st.first_name, last_name: st.last_name, email: st.email, group_id: st.group_id } });
  }
  return c.json({ error: "bad_credentials" }, 401);
});

app.post("/api/logout", async (c) => {
  const token = tokenFromReq(c);
  if (token) await c.env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
  c.header("Set-Cookie", clearCookie());
  return c.json({ ok: true });
});

// Восстановление сессии при перезагрузке фронтенда.
app.get("/api/me", async (c) => {
  const s = await auth(c);
  if (!s) return c.json({ error: "unauthorized" }, 401);
  if (s.role === "student") {
    const u = await c.env.DB.prepare("SELECT id, first_name, last_name, email, group_id FROM students WHERE id=?").bind(s.id).first();
    return c.json({ role: "student", user: u || { id: s.id } });
  }
  const u = await c.env.DB.prepare("SELECT id, name, login, role, perms FROM staff WHERE id=?").bind(s.id).first();
  return c.json({ role: s.role, user: u ? { ...u, perms: JSON.parse(u.perms || "{}") } : { id: s.id } });
});

/* ---------------- Настройки ---------------- */
app.get("/api/settings", async (c) => {
  const s = await c.env.DB.prepare("SELECT * FROM settings WHERE id = 1").first();
  const tpl = await c.env.DB.prepare("SELECT type, subject, body FROM email_templates").all();
  const templates = {};
  (tpl.results || []).forEach((t) => (templates[t.type] = { subject: t.subject, body: t.body }));
  return c.json({ ...s, templates });
});
app.put("/api/settings", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin")) return c.json({ error: "forbidden" }, 403);
  const b = await c.req.json();
  await c.env.DB.prepare(
    "UPDATE settings SET platform_name=?, default_quiz_pass=?, archive_days=?, default_lang=?, cert_valid_months=?, updated_at=? WHERE id=1"
  ).bind(b.platform_name, b.default_quiz_pass, b.archive_days, b.default_lang, b.cert_valid_months, nowISO()).run();
  return c.json({ ok: true });
});

/* ---------------- Группы ---------------- */
// Публично: список групп нужен на странице регистрации (до входа).
app.get("/api/groups", async (c) => {
  const r = await c.env.DB.prepare("SELECT id, name FROM groups ORDER BY name").all();
  return c.json(r.results || []);
});
app.post("/api/groups", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin")) return c.json({ error: "forbidden" }, 403);
  const { name } = await c.req.json();
  if (!name) return c.json({ error: "missing_name" }, 400);
  const id = uid("g_");
  await c.env.DB.prepare("INSERT INTO groups (id, name) VALUES (?,?)").bind(id, name).run();
  return c.json({ id, name });
});
app.put("/api/groups/:id", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin")) return c.json({ error: "forbidden" }, 403);
  const { name } = await c.req.json();
  await c.env.DB.prepare("UPDATE groups SET name=? WHERE id=?").bind(name, c.req.param("id")).run();
  return c.json({ ok: true });
});
app.delete("/api/groups/:id", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin")) return c.json({ error: "forbidden" }, 403);
  await c.env.DB.prepare("DELETE FROM groups WHERE id=?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

/* ---------------- Студенты ---------------- */
app.get("/api/students", async (c) => {
  const s = await auth(c);
  if (!s) return c.json({ error: "unauthorized" }, 401);
  const r = await c.env.DB.prepare(
    `SELECT s.id, s.first_name, s.last_name, s.isikukood, s.email, s.group_id,
            g.name AS group_name, s.status, s.last_active
       FROM students s LEFT JOIN groups g ON g.id = s.group_id
      ORDER BY s.last_name, s.first_name`
  ).all();
  return c.json(r.results || []);
});
app.post("/api/students", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin", "teacher")) return c.json({ error: "forbidden" }, 403);
  const b = await c.req.json();
  if (!b.first_name || !b.last_name || !b.isikukood) return c.json({ error: "missing_fields" }, 400);
  const created = await createStudent(c.env, b);
  return c.json(created); // { id, password } — пароль возвращается создателю один раз
});

function genPass() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const a = crypto.getRandomValues(new Uint32Array(8));
  let s = "";
  for (let i = 0; i < 8; i++) { s += chars[a[i] % chars.length]; if (i === 3) s += "-"; }
  return s;
}
async function queueCredsEmail(env, student, password) {
  const set = await env.DB.prepare("SELECT platform_name FROM settings WHERE id=1").first();
  const tpl = await env.DB.prepare("SELECT subject, body FROM email_templates WHERE type='cred'").first();
  const vars = {
    student: `${student.first_name} ${student.last_name}`,
    login: `${student.first_name} ${student.last_name}`,
    password, platform: set?.platform_name || "Kursused",
  };
  const render = (str) => String(str || "").replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  await env.DB.prepare("INSERT INTO outbox (id, to_email, subject, body, type) VALUES (?,?,?,?,?)")
    .bind(uid("em_"), student.email || "", render(tpl?.subject), render(tpl?.body), "cred").run();
}
// Создать ученика (общая логика для ручного добавления и одобрения заявки).
async function createStudent(env, b) {
  const id = uid("st_");
  const password = b.password || genPass();
  const hash = await hashPassword(password);
  await env.DB.prepare(
    "INSERT INTO students (id, first_name, last_name, isikukood, email, password_hash, group_id) VALUES (?,?,?,?,?,?,?)"
  ).bind(id, b.first_name, b.last_name, b.isikukood, b.email || "", hash, b.group_id || null).run();
  await queueCredsEmail(env, { id, ...b }, password);
  return { id, password };
}

/* ---------------- Заявки на регистрацию (Фаза 2) ---------------- */
// Самостоятельная подача заявки — публично, без авторизации.
app.post("/api/requests", async (c) => {
  const b = await c.req.json();
  if (!b.first_name || !b.last_name || !b.isikukood || !b.email) return c.json({ error: "missing_fields" }, 400);
  // Проверяем, что группа существует; иначе пишем null (защита от устаревшего id).
  let gid = b.group_id || null;
  if (gid) { const g = await c.env.DB.prepare("SELECT id FROM groups WHERE id=?").bind(gid).first(); if (!g) gid = null; }
  const id = uid("r_");
  await c.env.DB.prepare(
    "INSERT INTO requests (id, first_name, last_name, isikukood, email, group_id) VALUES (?,?,?,?,?,?)"
  ).bind(id, b.first_name, b.last_name, b.isikukood, b.email, gid).run();
  return c.json({ ok: true, id });
});
// Список заявок — для админа/учителя.
app.get("/api/requests", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin", "teacher")) return c.json({ error: "forbidden" }, 403);
  const r = await c.env.DB.prepare(
    `SELECT r.id, r.first_name, r.last_name, r.isikukood, r.email, r.group_id, r.date, g.name AS group_name
       FROM requests r LEFT JOIN groups g ON g.id = r.group_id ORDER BY r.date`
  ).all();
  return c.json(r.results || []);
});
// Одобрение заявки → создаётся ученик, заявка удаляется.
app.post("/api/requests/:id/approve", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin", "teacher")) return c.json({ error: "forbidden" }, 403);
  const req = await c.env.DB.prepare("SELECT * FROM requests WHERE id=?").bind(c.req.param("id")).first();
  if (!req) return c.json({ error: "not_found" }, 404);
  const created = await createStudent(c.env, req);
  await c.env.DB.prepare("DELETE FROM requests WHERE id=?").bind(req.id).run();
  return c.json({ ok: true, student_id: created.id });
});
// Отклонение заявки.
app.delete("/api/requests/:id", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin", "teacher")) return c.json({ error: "forbidden" }, 403);
  await c.env.DB.prepare("DELETE FROM requests WHERE id=?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

/* ---------------- Счета (Arved) ---------------- */
// Поиск предприятия в бизнес-регистре Эстонии по названию (прокси, чтобы обойти CORS браузера).
app.get("/api/company-search", async (c) => {
  if (!(await auth(c))) return c.json({ error: "unauthorized" }, 401);
  const q = c.req.query("q");
  if (!q || q.trim().length < 2) return c.json({ results: [] });
  try {
    const url = "https://ariregister.rik.ee/est/api/autocomplete?q=" + encodeURIComponent(q) + "&results_limit=8";
    const res = await fetch(url, { headers: { Accept: "application/json" }, cf: { cacheTtl: 3600 } });
    if (!res.ok) return c.json({ results: [], error: "register_http_" + res.status }, 200);
    const data = await res.json();
    const arr = Array.isArray(data) ? data : (data.data || data.results || data.items || []);
    const results = arr.map((x) => ({
      name: x.name || x.nimi || x.company_name || "",
      regCode: String(x.reg_code || x.ariregistri_kood || x.registrikood || x.code || ""),
      vatNo: x.vat_number || x.kmkr || "",
      address: x.aadress || x.address || x.ehak_nimetus || "",
    })).filter((x) => x.name);
    return c.json({ results });
  } catch (e) {
    return c.json({ results: [], error: "register_unreachable" }, 200);
  }
});

app.get("/api/invoices", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin", "teacher")) return c.json({ error: "forbidden" }, 403);
  const inv = await c.env.DB.prepare("SELECT * FROM invoices ORDER BY number DESC").all();
  const parts = await c.env.DB.prepare("SELECT * FROM invoice_participants").all();
  const items = await c.env.DB.prepare("SELECT * FROM invoice_items ORDER BY position").all();
  const byInv = (rows, id) => (rows.results || []).filter((r) => r.invoice_id === id);
  const out = (inv.results || []).map((iv) => ({
    ...iv, paid: !!iv.paid, priceIncludesVat: !!iv.price_includes_vat,
    participants: byInv(parts, iv.id).map((p) => ({ studentId: p.student_id, name: p.name, isikukood: p.isikukood })),
    items: byInv(items, iv.id).map((it) => ({ desc: it.descr, qty: it.qty, price: it.price })),
  }));
  return c.json(out);
});

app.post("/api/invoices", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin", "teacher")) return c.json({ error: "forbidden" }, 403);
  const b = await c.req.json();
  if (!b.buyer?.name) return c.json({ error: "missing_buyer" }, 400);
  if (!(b.participants || []).length) return c.json({ error: "no_participants" }, 400);
  // атомарно получаем следующий номер ESM#####
  await c.env.DB.prepare("UPDATE settings SET invoice_seq = invoice_seq + 1 WHERE id = 1").run();
  const seqRow = await c.env.DB.prepare("SELECT invoice_seq FROM settings WHERE id = 1").first();
  const number = seqRow.invoice_seq;
  const numberStr = "ESM" + String(number).padStart(5, "0");
  const viitenumber = makeViitenumber(number);
  const id = uid("inv_");
  await c.env.DB.prepare(
    `INSERT INTO invoices (id, number, number_str, viitenumber, kind, mode, group_id, course_id,
       buyer_name, buyer_regcode, buyer_vatno, buyer_address, buyer_email,
       vat_rate, price_includes_vat, note, date, due_date, paid) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`
  ).bind(id, number, numberStr, viitenumber, "invoice", b.mode || "group", b.groupId || null, b.courseId || null,
    b.buyer.name, b.buyer.regCode || "", b.buyer.vatNo || "", b.buyer.address || "", b.buyer.email || "",
    b.vatRate ?? 24, b.priceIncludesVat ? 1 : 0, b.note || "", b.date || nowISO().slice(0, 10), b.dueDate || null).run();
  for (const p of b.participants) {
    await c.env.DB.prepare("INSERT INTO invoice_participants (id, invoice_id, student_id, name, isikukood) VALUES (?,?,?,?,?)")
      .bind(uid("ip_"), id, p.studentId || null, p.name, p.isikukood || "").run();
  }
  let pos = 0;
  for (const it of (b.items || [])) {
    await c.env.DB.prepare("INSERT INTO invoice_items (id, invoice_id, descr, qty, price, position) VALUES (?,?,?,?,?,?)")
      .bind(uid("ii_"), id, it.desc || "", it.qty || 0, it.price || 0, pos++).run();
  }
  return c.json({ id, number, numberStr });
});

app.put("/api/invoices/:id/paid", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin", "teacher")) return c.json({ error: "forbidden" }, 403);
  const { paid } = await c.req.json();
  await c.env.DB.prepare("UPDATE invoices SET paid=?, paid_date=? WHERE id=?")
    .bind(paid ? 1 : 0, paid ? nowISO().slice(0, 10) : null, c.req.param("id")).run();
  return c.json({ ok: true });
});

app.delete("/api/invoices/:id", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin", "teacher")) return c.json({ error: "forbidden" }, 403);
  await c.env.DB.prepare("DELETE FROM invoices WHERE id=?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

// Кредит-счёт (сторно) для выставленного счёта.
app.post("/api/invoices/:id/credit", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin", "teacher")) return c.json({ error: "forbidden" }, 403);
  const orig = await c.env.DB.prepare("SELECT * FROM invoices WHERE id=?").bind(c.req.param("id")).first();
  if (!orig) return c.json({ error: "not_found" }, 404);
  if (orig.kind === "credit" || orig.credited_by) return c.json({ error: "already_credited" }, 409);
  await c.env.DB.prepare("UPDATE settings SET invoice_seq = invoice_seq + 1 WHERE id = 1").run();
  const seqRow = await c.env.DB.prepare("SELECT invoice_seq FROM settings WHERE id = 1").first();
  const number = seqRow.invoice_seq;
  const numberStr = "ESM" + String(number).padStart(5, "0");
  const id = uid("inv_");
  await c.env.DB.prepare(
    `INSERT INTO invoices (id, number, number_str, viitenumber, kind, credit_of, mode, group_id, course_id,
       buyer_name, buyer_regcode, buyer_vatno, buyer_address, buyer_email,
       vat_rate, price_includes_vat, note, date, due_date, paid, paid_date)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)`
  ).bind(id, number, numberStr, makeViitenumber(number), "credit", orig.id, orig.mode, orig.group_id, orig.course_id,
    orig.buyer_name, orig.buyer_regcode, orig.buyer_vatno, orig.buyer_address, orig.buyer_email,
    orig.vat_rate, orig.price_includes_vat, `Arve storno ${orig.number_str}`, nowISO().slice(0, 10), nowISO().slice(0, 10), nowISO().slice(0, 10)).run();
  // копируем строки/участников с отрицательными суммами
  const items = await c.env.DB.prepare("SELECT * FROM invoice_items WHERE invoice_id=? ORDER BY position").bind(orig.id).all();
  for (const it of (items.results || [])) {
    await c.env.DB.prepare("INSERT INTO invoice_items (id, invoice_id, descr, qty, price, position) VALUES (?,?,?,?,?,?)")
      .bind(uid("ii_"), id, it.descr, it.qty, -Math.abs(it.price), it.position).run();
  }
  const parts = await c.env.DB.prepare("SELECT * FROM invoice_participants WHERE invoice_id=?").bind(orig.id).all();
  for (const p of (parts.results || [])) {
    await c.env.DB.prepare("INSERT INTO invoice_participants (id, invoice_id, student_id, name, isikukood) VALUES (?,?,?,?,?)")
      .bind(uid("ip_"), id, p.student_id, p.name, p.isikukood).run();
  }
  await c.env.DB.prepare("UPDATE invoices SET credited_by=? WHERE id=?").bind(id, orig.id).run();
  return c.json({ id, number, numberStr });
});

/* ---------------- Реальная отправка почты ---------------- */
// Провайдер — Resend (https://resend.com). Задайте секреты:
//   wrangler secret put RESEND_API_KEY
// и переменную EMAIL_FROM (в wrangler.toml [vars] или settings.email_from).
async function sendEmail(env, msg) {
  const from = msg.from || env.EMAIL_FROM;
  const key = env.RESEND_API_KEY;
  if (!key || !from) throw new Error("email_not_configured");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, text: msg.body }),
  });
  if (!res.ok) throw new Error("resend_" + res.status + ": " + (await res.text()).slice(0, 200));
  return await res.json();
}
// Разослать всё, что в очереди (status='pending'). Вызывается вручную или по расписанию.
async function flushOutbox(env, limit = 50) {
  const rows = await env.DB.prepare(
    "SELECT * FROM outbox WHERE status='pending' ORDER BY ts LIMIT ?"
  ).bind(limit).all();
  let sent = 0, failed = 0;
  for (const m of (rows.results || [])) {
    try {
      await sendEmail(env, { to: m.to_email, subject: m.subject, body: m.body });
      await env.DB.prepare("UPDATE outbox SET sent=1, status='sent', sent_at=? WHERE id=?")
        .bind(nowISO(), m.id).run();
      sent++;
    } catch (e) {
      await env.DB.prepare("UPDATE outbox SET status='error', error=? WHERE id=?")
        .bind(String(e.message || e).slice(0, 300), m.id).run();
      failed++;
    }
  }
  return { sent, failed, picked: (rows.results || []).length };
}
app.post("/api/outbox/flush", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin")) return c.json({ error: "forbidden" }, 403);
  return c.json(await flushOutbox(c.env));
});
app.get("/api/outbox", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin", "teacher")) return c.json({ error: "forbidden" }, 403);
  const r = await c.env.DB.prepare("SELECT id, to_email, subject, type, ts, status, error, sent_at FROM outbox ORDER BY ts DESC LIMIT 100").all();
  return c.json(r.results || []);
});

/* ---------------- Публичная проверка сертификата ---------------- */
// Без авторизации. QR на дипломе ведёт на /verify?number=..&last=..
app.get("/api/verify", async (c) => {
  const number = c.req.query("number");
  const last = (c.req.query("last") || "").trim().toLowerCase();
  if (!number) return c.json({ ok: false, error: "no_number" });
  const ct = await c.env.DB.prepare(
    `SELECT ct.number, ct.date, ct.valid_until, s.first_name, s.last_name, s.isikukood, co.title AS course
       FROM certificates ct JOIN students s ON s.id=ct.student_id JOIN courses co ON co.id=ct.course_id
      WHERE ct.number = ?`
  ).bind(+number).first();
  if (!ct) return c.json({ ok: false });
  if (last && !String(ct.last_name || "").toLowerCase().includes(last)) return c.json({ ok: false });
  const expired = ct.valid_until && ct.valid_until < nowISO().slice(0, 10);
  return c.json({
    ok: true, number: ct.number, name: `${ct.first_name} ${ct.last_name}`,
    course: ct.course, date: ct.date, validUntil: ct.valid_until, expired: !!expired,
  });
});
// Публичная HTML-страница проверки (можно печатать её адрес в QR).
app.get("/verify", async (c) => {
  const number = c.req.query("number") || "";
  const last = c.req.query("last") || "";
  const html = `<!doctype html><html lang="et"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tunnistuse kontroll</title>
<style>body{font-family:system-ui,Arial,sans-serif;background:#f4f5f9;margin:0;padding:40px 16px;color:#111}
.card{max-width:440px;margin:0 auto;background:#fff;border-radius:16px;box-shadow:0 6px 30px rgba(0,0,0,.08);padding:28px}
h1{font-size:20px;margin:0 0 4px}.sub{color:#6b7280;font-size:14px;margin-bottom:18px}
input{width:100%;box-sizing:border-box;padding:11px 13px;border:1.5px solid #e5e7eb;border-radius:9px;font-size:15px;margin-bottom:10px}
button{width:100%;padding:12px;border:0;border-radius:9px;background:#4f46e5;color:#fff;font-weight:700;font-size:15px;cursor:pointer}
.res{margin-top:18px;border-radius:12px;padding:16px 18px;font-size:14px;line-height:1.6}
.ok{border:1.5px solid #16a34a;background:#f0fdf4}.bad{border:1.5px solid #dc2626;background:#fef2f2}
.k{color:#6b7280}.exp{color:#dc2626;font-weight:700}.val{color:#16a34a;font-weight:700}</style>
<div class="card"><h1>🎓 Tunnistuse kontroll</h1><div class="sub">Sisesta tunnistuse number ja perekonnanimi.</div>
<input id="n" placeholder="Number (nt 1)" value="${number.replace(/[^0-9]/g,"")}">
<input id="l" placeholder="Perekonnanimi" value="${(last||"").replace(/[<>"]/g,"")}">
<button onclick="chk()">Kontrolli</button><div id="r"></div></div>
<script>
async function chk(){const n=document.getElementById('n').value,l=document.getElementById('l').value;
const r=document.getElementById('r');r.innerHTML='...';
const res=await fetch('/api/verify?number='+encodeURIComponent(n)+'&last='+encodeURIComponent(l));const d=await res.json();
if(!d.ok){r.className='res bad';r.innerHTML='⛔ Tunnistust ei leitud või andmed ei klapi.';return;}
r.className='res ok';r.innerHTML='✅ <b>Kehtiv tunnistus</b><br><br>'+
'<span class="k">Nr:</span> <b>'+d.number+'</b><br><span class="k">Nimi:</span> <b>'+d.name+'</b><br>'+
'<span class="k">Koolitus:</span> <b>'+d.course+'</b><br><span class="k">Väljastatud:</span> '+d.date+'<br>'+
(d.expired?'<span class="exp">⛔ Kehtivus lõppenud ('+(d.validUntil||'')+')</span>':'<span class="val">🗓️ Kehtib kuni '+(d.validUntil||'—')+'</span>');}
if(document.getElementById('n').value)chk();
</script></html>`;
  return c.html(html);
});

/* ---------------- Оплата счетов (каркас, Montonio) ---------------- */
// Реальная интеграция требует ключей Montonio (MONTONIO_ACCESS_KEY / SECRET_KEY)
// и подписи JWT. Здесь — структура: создать ссылку и принять вебхук.
app.post("/api/invoices/:id/payment-link", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin", "teacher")) return c.json({ error: "forbidden" }, 403);
  const iv = await c.env.DB.prepare("SELECT * FROM invoices WHERE id=?").bind(c.req.param("id")).first();
  if (!iv) return c.json({ error: "not_found" }, 404);
  if (!c.env.MONTONIO_ACCESS_KEY) {
    // Заглушка: без ключей возвращаем понятный ответ, чтобы фронтенд не падал.
    return c.json({ ok: false, error: "payments_not_configured",
      hint: "Задайте MONTONIO_ACCESS_KEY / MONTONIO_SECRET_KEY" });
  }
  // TODO: сформировать и подписать заказ Montonio, вернуть paymentUrl.
  return c.json({ ok: true, paymentUrl: null, todo: "sign Montonio order here" });
});
app.post("/api/payments/webhook", async (c) => {
  // TODO: проверить подпись вебхука провайдера перед доверием телу запроса.
  const b = await c.req.json().catch(() => ({}));
  const ref = b.paymentReference || b.reference || b.merchant_reference;
  if (!ref) return c.json({ ok: false }, 400);
  // Находим счёт по viitenumber или номеру и помечаем оплаченным.
  const iv = await c.env.DB.prepare("SELECT id FROM invoices WHERE viitenumber=? OR number_str=?").bind(ref, ref).first();
  if (iv) await c.env.DB.prepare("UPDATE invoices SET paid=1, paid_date=? WHERE id=?").bind(nowISO().slice(0, 10), iv.id).run();
  return c.json({ ok: true });
});

/* ---------------- Fallback ---------------- */
app.get("/", (c) => c.json({ name: "lms-api", ok: true }));
app.all("*", (c) => c.json({ error: "not_found" }, 404));

export default {
  fetch: app.fetch,
  // Крон (см. wrangler.toml [triggers]) разбирает очередь писем.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(flushOutbox(env, 100).catch(() => {}));
  },
};
