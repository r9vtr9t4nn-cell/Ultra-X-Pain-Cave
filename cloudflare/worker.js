const APP_ORIGIN = "https://r9vtr9t4nn-cell.github.io";
const GARMIN_BASE = "https://personal.connectapi.garmin.com";
const TOKEN_URL = GARMIN_BASE + "/personalapitoken-service/personal-api/personal-api-key/token";

function response(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: {
    "content-type":"application/json; charset=utf-8",
    "access-control-allow-origin":APP_ORIGIN,
    "access-control-allow-headers":"authorization, content-type",
    "access-control-allow-methods":"GET, POST, OPTIONS",
    "vary":"Origin", "cache-control":"no-store"
  }});
}
async function digest(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}
async function safeEqual(a,b) {
  const x=await digest(a), y=await digest(b);
  let diff=0; for(let i=0;i<x.length;i++) diff|=x[i]^y[i];
  return diff===0;
}
function activityArray(payload) {
  if(Array.isArray(payload)) return payload;
  if(Array.isArray(payload?.activities)) return payload.activities;
  if(Array.isArray(payload?.activityList)) return payload.activityList;
  return [];
}
function mapActivity(a) {
  const type = a.activityType?.typeKey || a.activityType?.typeName || a.activityType || "other";
  const date = a.startTimeLocal || a.startTimeGMT || a.startTime || "";
  return {
    id:String(a.activityId ?? a.activityUUID ?? ""),
    name:a.activityName || a.name || "Garmin activity",
    type:String(type),
    date:String(date).slice(0,10),
    distance:Number(a.distance ?? a.distanceInMeters ?? 0),
    duration:Number(a.duration ?? a.movingDuration ?? 0),
    elevation:Number(a.elevationGain ?? a.totalElevationGain ?? a.elevation_gain ?? 0),
    averageHr:Number(a.averageHR ?? a.averageHeartRate ?? a.avgHR ?? 0),
    maxHr:Number(a.maxHR ?? a.maxHeartRate ?? 0),
    averageSpeed:Number(a.averageSpeed ?? a.avgSpeed ?? 0),
    averageCadence:Number(a.averageRunningCadenceInStepsPerMinute ?? a.averageRunningCadence ?? a.avgRunningCadence ?? a.averageBikeCadence ?? 0),
    maxCadence:Number(a.maxRunningCadenceInStepsPerMinute ?? a.maxRunningCadence ?? a.maxBikeCadence ?? 0),
    calories:Number(a.calories ?? a.activeCalories ?? 0)
  };
}
async function ensureTables(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS garmin_activities (
    activity_id TEXT PRIMARY KEY, activity_name TEXT, activity_type TEXT, start_date TEXT,
    distance REAL, duration REAL, elevation_gain REAL, average_hr REAL,
    imported_at TEXT DEFAULT CURRENT_TIMESTAMP,
    max_hr REAL, average_speed REAL, average_cadence REAL, max_cadence REAL, calories REAL
  )`).run();
  for (const column of ["max_hr REAL","average_speed REAL","average_cadence REAL","max_cadence REAL","calories REAL"]) {
    try { await db.prepare("ALTER TABLE garmin_activities ADD COLUMN "+column).run(); } catch (_) {}
  }
  await db.prepare(`CREATE TABLE IF NOT EXISTS garmin_sync_state (
    id INTEGER PRIMARY KEY CHECK(id=1), last_sync_at TEXT, activity_count INTEGER
  )`).run();
}
async function getGarminToken(env) {
  const res=await fetch(TOKEN_URL,{method:"POST",headers:{Authorization:"ApiKey "+env.GARMIN_PERSONAL_API_KEY,Accept:"*/*"}});
  const body=await res.text();
  if(!res.ok) throw new Error("Garmin token request failed ("+res.status+"). Check that the Personal API key is valid and has not expired.");
  const token=body.trim().replace(/^"|"$/g,"");
  if(!token) throw new Error("Garmin did not return an access token.");
  return token;
}
async function syncGarmin(env) {
  const token=await getGarminToken(env);
  let start=0, total=0, pages=0;
  while(pages<200) {
    const url=new URL(GARMIN_BASE+"/activitylist-service/activities/search/activities");
    url.searchParams.set("start",String(start));
    url.searchParams.set("limit","100");
    const res=await fetch(url,{headers:{Authorization:"Bearer "+token,Accept:"*/*"}});
    const raw=await res.text();
    if(!res.ok) throw new Error("Garmin activity request failed ("+res.status+"). "+raw.slice(0,180));
    let payload; try{payload=JSON.parse(raw)}catch{throw new Error("Garmin returned an unreadable activity response.");}
    const list=activityArray(payload);
    if(!list.length) break;
    const statements=[];
    for(const item of list) {
      const a=mapActivity(item); if(!a.id) continue;
      statements.push(env.DB.prepare(`INSERT OR REPLACE INTO garmin_activities
        (activity_id,activity_name,activity_type,start_date,distance,duration,elevation_gain,average_hr,max_hr,average_speed,average_cadence,max_cadence,calories,imported_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`)
        .bind(a.id,a.name,a.type,a.date,a.distance,a.duration,a.elevation,a.averageHr||null,a.maxHr||null,a.averageSpeed||null,a.averageCadence||null,a.maxCadence||null,a.calories||null));
    }
    if(statements.length) { for(let i=0;i<statements.length;i+=100) await env.DB.batch(statements.slice(i,i+100)); total+=statements.length; }
    start+=list.length; pages++;
    if(list.length<1000) break;
  }
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO garmin_sync_state (id,last_sync_at,activity_count) VALUES (1,?,?)
    ON CONFLICT(id) DO UPDATE SET last_sync_at=excluded.last_sync_at,activity_count=excluded.activity_count`)
    .bind(now,total).run();
  return {imported:total,lastSyncAt:now};
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url), origin=request.headers.get("Origin");
    if(request.method==="OPTIONS") return new Response(null,{status:204,headers:{
      "access-control-allow-origin":APP_ORIGIN,
      "access-control-allow-headers":"authorization, content-type",
      "access-control-allow-methods":"GET, POST, OPTIONS",
      "access-control-max-age":"86400"
    }});
    if(origin && origin!==APP_ORIGIN) return response({error:"Origin not allowed"},403);
    if(url.pathname==="/health" && request.method==="GET") return response({ok:true,service:"The Long Game Garmin connector"});
    if(!env.DB || !env.GARMIN_PERSONAL_API_KEY || !env.LONGGAME_APP_PASSWORD)
      return response({error:"Worker configuration incomplete. Check DB binding and GARMIN_PERSONAL_API_KEY / LONGGAME_APP_PASSWORD secrets."},500);
    const auth=request.headers.get("authorization")||"";
    const supplied=auth.startsWith("Bearer ")?auth.slice(7):"";
    if(!supplied || !(await safeEqual(supplied,env.LONGGAME_APP_PASSWORD)))
      return response({error:"App passcode incorrect. Enter the passcode saved in your Cloudflare Worker settings."},401);
    try {
      await ensureTables(env.DB);
      if(url.pathname==="/api/sync" && request.method==="POST") {
        const result=await syncGarmin(env);
        return response({ok:true,...result});
      }
      if(url.pathname==="/api/activities" && request.method==="GET") {
        const rows=await env.DB.prepare(`SELECT activity_id,activity_name,activity_type,start_date,distance,duration,elevation_gain,average_hr,max_hr,average_speed,average_cadence,max_cadence,calories
          FROM garmin_activities ORDER BY start_date DESC LIMIT 2000`).all();
        const state=await env.DB.prepare("SELECT last_sync_at,activity_count FROM garmin_sync_state WHERE id=1").first();
        return response({activities:rows.results||[],sync:state||null});
      }
      return response({error:"Not found"},404);
    } catch(error) {
      console.error("Garmin connector error",error);
      return response({error:error.message||"Garmin connector error"},500);
    }
  }
};