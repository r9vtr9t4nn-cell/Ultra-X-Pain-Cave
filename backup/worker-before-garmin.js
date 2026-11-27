const APP_ORIGIN = "https://r9vtr9t4nn-cell.github.io";
const STRAVA_API = "https://www.strava.com/api/v3";

function json(data, status = 200, origin = APP_ORIGIN) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": origin,
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "vary": "Origin",
      "cache-control": "no-store"
    }
  });
}

function b64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function fromB64url(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(s + "=".repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));
}
async function keyFromSecret(secret, usage) {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", raw, usage === "sign" ? {name:"HMAC",hash:"SHA-256"} : "AES-GCM", false, usage === "sign" ? ["sign","verify"] : ["encrypt","decrypt"]);
}
async function encrypt(value, secret) {
  const key = await keyFromSecret(secret, "encrypt");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({name:"AES-GCM",iv}, key, data);
  return b64url(iv) + "." + b64url(ciphertext);
}
async function decrypt(value, secret) {
  const [iv, ciphertext] = value.split(".");
  const key = await keyFromSecret(secret, "encrypt");
  const plain = await crypto.subtle.decrypt({name:"AES-GCM",iv:fromB64url(iv)}, key, fromB64url(ciphertext));
  return JSON.parse(new TextDecoder().decode(plain));
}
async function signSession(athleteId, secret) {
  const payload = b64url(new TextEncoder().encode(JSON.stringify({athleteId, exp:Math.floor(Date.now()/1000)+60*60*24*30})));
  const key = await keyFromSecret(secret, "sign");
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return payload + "." + b64url(sig);
}
async function verifySession(request, secret) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const key = await keyFromSecret(secret, "sign");
  const ok = await crypto.subtle.verify("HMAC", key, fromB64url(signature), new TextEncoder().encode(payload));
  if (!ok) return null;
  const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
  if (!data.athleteId || data.exp < Date.now()/1000) return null;
  return data;
}
async function ensureTables(db) {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS oauth_states (state TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS oauth_handoffs (code TEXT PRIMARY KEY, session_cipher TEXT NOT NULL, expires_at INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS oauth_tokens (athlete_id INTEGER PRIMARY KEY, token_cipher TEXT NOT NULL, expires_at INTEGER NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS activities (activity_id INTEGER PRIMARY KEY, athlete_id INTEGER NOT NULL, name TEXT, sport_type TEXT, start_date TEXT, distance REAL, moving_time INTEGER, elapsed_time INTEGER, total_elevation_gain REAL, average_speed REAL, max_speed REAL, average_heartrate REAL, max_heartrate REAL, suffer_score INTEGER, imported_at TEXT DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS sync_state (athlete_id INTEGER PRIMARY KEY, last_activity_id INTEGER, last_sync_at TEXT, sync_status TEXT)")
  ]);
}
async function refreshToken(env, athleteId) {
  const row = await env.DB.prepare("SELECT token_cipher, expires_at FROM oauth_tokens WHERE athlete_id = ?").bind(athleteId).first();
  if (!row) throw new Error("Strava is not connected. Reconnect Strava.");
  let tokens = await decrypt(row.token_cipher, env.TOKEN_ENCRYPTION_KEY);
  if (Number(tokens.expires_at) <= Math.floor(Date.now()/1000) + 300) {
    const response = await fetch("https://www.strava.com/oauth/token", {
      method:"POST", headers:{"content-type":"application/json"},
      body:JSON.stringify({client_id:env.STRAVA_CLIENT_ID, client_secret:env.STRAVA_CLIENT_SECRET, grant_type:"refresh_token", refresh_token:tokens.refresh_token})
    });
    const fresh = await response.json();
    if (!response.ok) throw new Error("Strava token refresh failed: " + (fresh.message || response.status));
    tokens = fresh;
    await env.DB.prepare("UPDATE oauth_tokens SET token_cipher = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE athlete_id = ?")
      .bind(await encrypt(tokens, env.TOKEN_ENCRYPTION_KEY), tokens.expires_at, athleteId).run();
  }
  return tokens.access_token;
}
async function syncActivities(env, athleteId) {
  const accessToken = await refreshToken(env, athleteId);
  const state = await env.DB.prepare("SELECT last_activity_id FROM sync_state WHERE athlete_id = ?").bind(athleteId).first();
  const after = state?.last_activity_id ? 0 : 0;
  let page = 1, imported = 0, newest = Number(state?.last_activity_id || 0);
  while (page <= 5) {
    const url = new URL(STRAVA_API + "/athlete/activities");
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));
    if (after) url.searchParams.set("after", String(after));
    const response = await fetch(url, {headers:{authorization:"Bearer " + accessToken}});
    const list = await response.json();
    if (!response.ok) throw new Error("Strava activities request failed: " + (list.message || response.status));
    if (!Array.isArray(list) || list.length === 0) break;
    const statements = [];
    for (const a of list) {
      statements.push(env.DB.prepare(`INSERT OR REPLACE INTO activities
        (activity_id, athlete_id, name, sport_type, start_date, distance, moving_time, elapsed_time, total_elevation_gain, average_speed, max_speed, average_heartrate, max_heartrate, suffer_score, imported_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
        .bind(a.id, athleteId, a.name || "", a.sport_type || "", a.start_date || "", a.distance || 0, a.moving_time || 0, a.elapsed_time || 0, a.total_elevation_gain || 0, a.average_speed || 0, a.max_speed || 0, a.average_heartrate ?? null, a.max_heartrate ?? null, a.suffer_score ?? null));
      newest = Math.max(newest, Number(a.id));
    }
    if (statements.length) { await env.DB.batch(statements); imported += statements.length; }
    if (list.length < 100) break;
    page++;
  }
  await env.DB.prepare(`INSERT INTO sync_state (athlete_id,last_activity_id,last_sync_at,sync_status)
    VALUES (?,?,CURRENT_TIMESTAMP,'ok')
    ON CONFLICT(athlete_id) DO UPDATE SET last_activity_id=excluded.last_activity_id,last_sync_at=CURRENT_TIMESTAMP,sync_status='ok'`)
    .bind(athleteId, newest || null).run();
  return {imported, lastSyncAt:new Date().toISOString()};
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    if (request.method === "OPTIONS") return new Response(null,{status:204,headers:{
      "access-control-allow-origin":APP_ORIGIN,"access-control-allow-headers":"authorization, content-type",
      "access-control-allow-methods":"GET, POST, OPTIONS","access-control-max-age":"86400"}});
    try {
      if (!env.DB || !env.STRAVA_CLIENT_ID || !env.STRAVA_CLIENT_SECRET || !env.TOKEN_ENCRYPTION_KEY) {
        return json({error:"Worker configuration incomplete. Check DB binding and required variables."},500);
      }
      await ensureTables(env.DB);
      if (url.pathname === "/health") return json({ok:true,service:"The Long Game Strava connector"});
      if (url.pathname === "/auth/strava") {
        const state = b64url(crypto.getRandomValues(new Uint8Array(32)));
        await env.DB.prepare("INSERT INTO oauth_states (state, expires_at) VALUES (?, ?)")
          .bind(state, Math.floor(Date.now()/1000)+600).run();
        const redirect = new URL("https://www.strava.com/oauth/authorize");
        redirect.searchParams.set("client_id", env.STRAVA_CLIENT_ID);
        redirect.searchParams.set("redirect_uri", url.origin + "/oauth/callback");
        redirect.searchParams.set("response_type", "code");
        redirect.searchParams.set("approval_prompt", "auto");
        redirect.searchParams.set("scope", "read,activity:read_all");
        redirect.searchParams.set("state", state);
        return Response.redirect(redirect.toString(),302);
      }
      if (url.pathname === "/oauth/callback") {
        const state = url.searchParams.get("state");
        const code = url.searchParams.get("code");
        const saved = state ? await env.DB.prepare("SELECT state FROM oauth_states WHERE state = ? AND expires_at > ?").bind(state,Math.floor(Date.now()/1000)).first() : null;
        if (!saved || !code) return new Response("Invalid or expired Strava authorisation. Start again from the app.",{status:400});
        await env.DB.prepare("DELETE FROM oauth_states WHERE state = ?").bind(state).run();
        const response = await fetch("https://www.strava.com/oauth/token",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({client_id:env.STRAVA_CLIENT_ID,client_secret:env.STRAVA_CLIENT_SECRET,code,grant_type:"authorization_code"})});
        const tokens = await response.json();
        if (!response.ok) return new Response("Strava authorisation failed: "+(tokens.message || response.status),{status:400});
        const athleteId = Number(tokens.athlete?.id);
        if (!athleteId) return new Response("Strava did not return an athlete ID.",{status:400});
        await env.DB.prepare(`INSERT INTO oauth_tokens (athlete_id,token_cipher,expires_at,updated_at) VALUES (?,?,?,CURRENT_TIMESTAMP)
          ON CONFLICT(athlete_id) DO UPDATE SET token_cipher=excluded.token_cipher,expires_at=excluded.expires_at,updated_at=CURRENT_TIMESTAMP`)
          .bind(athleteId,await encrypt(tokens,env.TOKEN_ENCRYPTION_KEY),tokens.expires_at).run();
        const session = await signSession(athleteId,env.TOKEN_ENCRYPTION_KEY);
        const handoffCode = b64url(crypto.getRandomValues(new Uint8Array(24)));
        await env.DB.prepare("INSERT INTO oauth_handoffs (code,session_cipher,expires_at) VALUES (?,?,?)")
          .bind(handoffCode,await encrypt({session},env.TOKEN_ENCRYPTION_KEY),Math.floor(Date.now()/1000)+300).run();
        return Response.redirect(APP_ORIGIN+"/Ultra-X-Pain-Cave/strava-return.html?code="+encodeURIComponent(handoffCode),302);
      }
      if (url.pathname === "/api/exchange" && request.method === "POST") {
        if (origin && origin !== APP_ORIGIN) return json({error:"Origin not allowed"},403);
        const body = await request.json().catch(() => ({}));
        const code = typeof body.code === "string" ? body.code : "";
        if (!code || code.length > 100) return json({error:"Missing or invalid hand-off code."},400);
        const handoff = await env.DB.prepare("SELECT session_cipher FROM oauth_handoffs WHERE code = ? AND expires_at > ?").bind(code,Math.floor(Date.now()/1000)).first();
        if (!handoff) return json({error:"Connection hand-off expired or already used. Please connect Strava again."},400);
        await env.DB.prepare("DELETE FROM oauth_handoffs WHERE code = ?").bind(code).run();
        const saved = await decrypt(handoff.session_cipher,env.TOKEN_ENCRYPTION_KEY);
        return json({session:saved.session});
      }
      if (url.pathname.startsWith("/api/")) {
        if (origin && origin !== APP_ORIGIN) return json({error:"Origin not allowed"},403);
        const session = await verifySession(request,env.TOKEN_ENCRYPTION_KEY);
        if (!session) return json({error:"Not connected. Connect Strava again."},401);
        if (url.pathname === "/api/sync" && request.method === "POST") {
          const result = await syncActivities(env,session.athleteId);
          return json({ok:true,...result});
        }
        if (url.pathname === "/api/activities" && request.method === "GET") {
          const rows = await env.DB.prepare("SELECT activity_id,name,sport_type,start_date,distance,moving_time,elapsed_time,total_elevation_gain,average_speed,max_speed,average_heartrate,max_heartrate,suffer_score FROM activities WHERE athlete_id = ? ORDER BY start_date DESC LIMIT 500")
            .bind(session.athleteId).all();
          const state = await env.DB.prepare("SELECT last_sync_at,sync_status FROM sync_state WHERE athlete_id = ?").bind(session.athleteId).first();
          return json({activities:rows.results || [],sync:state || null});
        }
      }
      return json({error:"Not found"},404);
    } catch (error) {
      console.error(error);
      return json({error:"Server error",detail:error.message},500);
    }
  }
};