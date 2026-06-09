#!/usr/bin/env node

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 8788);
const TOKEN = process.env.ANALYTICS_TOKEN || "";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://personality.kiraown.com";
const DATA_FILE = process.env.ANALYTICS_DATA_FILE || path.join(__dirname, "analytics-events.jsonl");
const SITE_ID = "workplace-personality";

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization"
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 64 * 1024) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function appendEvent(event) {
  fs.appendFileSync(DATA_FILE, `${JSON.stringify(event)}\n`, "utf8");
}

function readEvents() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return fs.readFileSync(DATA_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function isAuthorized(req, url) {
  if (!TOKEN) return false;
  const bearer = req.headers.authorization || "";
  const token = bearer.startsWith("Bearer ") ? bearer.slice(7) : url.searchParams.get("token");
  return token === TOKEN;
}

function distribution(events, getter) {
  const counts = new Map();
  for (const event of events) {
    const label = getter(event);
    if (!label) continue;
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0) || 1;
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, percent: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);
}

function summarize(siteId) {
  const events = readEvents().filter(event => event.siteId === siteId);
  const pageViews = events.filter(event => event.eventName === "page_view").length;
  const starts = events.filter(event => event.eventName === "assessment_started").length;
  const completedEvents = events.filter(event => event.eventName === "assessment_completed");
  const uniqueVisitors = new Set(events.map(event => event.visitorId).filter(Boolean)).size;

  const personas = distribution(completedEvents, event => {
    const detail = event.detail || {};
    const code = detail.personaCode || "";
    const title = detail.personaTitle || "";
    return code ? `${code} ${title}`.trim() : "";
  }).map(item => {
    const [code, ...title] = item.label.split(" ");
    return { code, title: title.join(" "), count: item.count, percent: item.percent };
  });

  const roles = distribution(completedEvents, event => (event.detail || {}).topRole)
    .map(item => ({ name: item.label, count: item.count, percent: item.percent }));

  const feasibility = distribution(completedEvents, event => (event.detail || {}).feasibilityLevel)
    .map(item => ({ level: item.label, count: item.count, percent: item.percent }));

  const recent = completedEvents.slice(-20).reverse().map(event => {
    const detail = event.detail || {};
    return {
      occurredAt: event.occurredAt,
      personaCode: detail.personaCode,
      topRole: detail.topRole,
      feasibilityLevel: detail.feasibilityLevel
    };
  });

  return {
    pageViews,
    uniqueVisitors,
    starts,
    completions: completedEvents.length,
    personas,
    roles,
    feasibility,
    recent
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    return sendJson(res, 204, {});
  }

  if (req.method === "POST" && url.pathname === "/event") {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body || "{}");
      const event = {
        siteId: payload.siteId || SITE_ID,
        eventName: payload.eventName,
        visitorId: payload.visitorId,
        path: payload.path,
        referrer: payload.referrer,
        userAgent: payload.userAgent,
        occurredAt: payload.occurredAt || new Date().toISOString(),
        detail: payload.detail || {}
      };
      if (!["page_view", "assessment_started", "assessment_completed"].includes(event.eventName)) {
        return sendJson(res, 400, { error: "Invalid eventName" });
      }
      appendEvent(event);
      return sendJson(res, 200, { ok: true });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (req.method === "GET" && url.pathname === "/stats") {
    if (!isAuthorized(req, url)) {
      return sendJson(res, 401, { error: "Unauthorized" });
    }
    const siteId = url.searchParams.get("siteId") || SITE_ID;
    return sendJson(res, 200, summarize(siteId));
  }

  sendJson(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`Analytics server running on http://localhost:${PORT}`);
});
