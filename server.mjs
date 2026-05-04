import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const dataDir = process.env.DATA_DIR || path.join(__dirname, "data");
const statePath = path.join(dataDir, "states.json");
const itemsPath = path.join(publicDir, "items.json");
const port = Number(process.env.PORT || 4173);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

async function readStates() {
  try {
    return JSON.parse(await fs.readFile(statePath, "utf8"));
  } catch {
    return {};
  }
}

async function writeStates(states) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(states, null, 2), "utf8");
}

async function readItems() {
  return JSON.parse(await fs.readFile(itemsPath, "utf8"));
}

async function writeItems(items) {
  await fs.writeFile(itemsPath, `${JSON.stringify(items, null, 2)}\n`, "utf8");
}

function clientKey(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded || req.socket.remoteAddress || "local";
  return ip.split(",")[0].trim().replace(/^::ffff:/, "");
}

function normalizeCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 32);
}

function stateKey(req) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const headerCode = Array.isArray(req.headers["x-share-code"])
    ? req.headers["x-share-code"][0]
    : req.headers["x-share-code"];
  return normalizeCode(requestUrl.searchParams.get("code") || headerCode) || clientKey(req);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function slugify(value) {
  return String(value || "")
    .trim()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function sanitizeItem(item, index) {
  const mainCategory = item.mainCategory === "care" ? "care" : "hospital";
  const subCategory = ["산모", "아기", "보호자"].includes(item.subCategory) ? item.subCategory : "산모";
  const importance = ["★", "☆", "△"].includes(item.importance) ? item.importance : "★";
  const name = String(item.name || "").trim().slice(0, 80);
  if (!name) return null;
  const id =
    String(item.id || "").trim().slice(0, 140) ||
    `${mainCategory}-${slugify(subCategory)}-${slugify(name)}-${index}`;

  return {
    id,
    mainCategory,
    mainLabel: mainCategory === "hospital" ? "병원용" : "조리원용",
    subCategory,
    importance,
    name,
    description: String(item.description || "").trim().slice(0, 300),
    link: String(item.link || "").trim().slice(0, 1000),
    builtIn: true,
  };
}

async function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const safePath = requestUrl.pathname === "/" ? "/index.html" : decodeURIComponent(requestUrl.pathname);
  const filePath = path.normalize(path.join(publicDir, safePath));
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      ...(ext === ".json" ? { "Cache-Control": "no-store" } : {}),
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url?.startsWith("/api/items")) {
      if (req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        res.end(JSON.stringify(await readItems()));
        return;
      }

      if (req.method === "POST") {
        const body = await readBody(req);
        const payload = JSON.parse(body || "[]");
        const items = Array.isArray(payload)
          ? payload.map(sanitizeItem).filter(Boolean).slice(0, 1000)
          : [];
        await writeItems(items);
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: true, count: items.length }));
        return;
      }

      res.writeHead(405);
      res.end("Method not allowed");
      return;
    }

    if (req.url?.startsWith("/api/state")) {
      const states = await readStates();
      const key = stateKey(req);

      if (req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ...(states[key] || {}), shareCode: key }));
        return;
      }

      if (req.method === "POST") {
        const body = await readBody(req);
        const payload = JSON.parse(body || "{}");
        states[key] = {
          babyName: String(payload.babyName || ""),
          dueDate: String(payload.dueDate || ""),
          profileSaved: Boolean(payload.profileSaved),
          selectedMain: payload.selectedMain === "care" ? "care" : "hospital",
          selectedSub: ["산모", "아기", "보호자"].includes(payload.selectedSub) ? payload.selectedSub : "산모",
          selectedImportance: ["all", "★", "☆", "△"].includes(payload.selectedImportance)
            ? payload.selectedImportance
            : "all",
          checked: payload.checked && typeof payload.checked === "object" ? payload.checked : {},
          hiddenIds: Array.isArray(payload.hiddenIds) ? payload.hiddenIds : [],
          customItems: Array.isArray(payload.customItems) ? payload.customItems.slice(0, 300) : [],
          updatedAt: new Date().toISOString(),
        };
        await writeStates(states);
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      res.writeHead(405);
      res.end("Method not allowed");
      return;
    }

    await serveStatic(req, res);
  } catch (error) {
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: error.message }));
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Birth bag checklist running at http://localhost:${port}`);
});
