import "dotenv/config";
import express from "express";
import fs from "fs";
import http from "http";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

/** Trouve un port libre entre start et end (inclus). */
function findAvailablePort(start: number, end: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const tryPort = (p: number) => {
      if (p > end) return reject(new Error("Aucun port libre"));
      const server = http.createServer();
      server.once("error", (err: NodeJS.ErrnoException) => {
        if (err?.code === "EADDRINUSE") tryPort(p + 1);
        else reject(err);
      });
      server.once("listening", () => {
        const port = (server.address() as { port: number })?.port ?? p;
        server.close(() => resolve(port));
      });
      server.listen(p, "0.0.0.0");
    };
    tryPort(start);
  });
}

const DEBUG_LOG_PATH = path.join(process.cwd(), "debug-471675.log");
function debugLog(payload: Record<string, unknown>) {
  try {
    fs.appendFileSync(DEBUG_LOG_PATH, JSON.stringify(payload) + "\n");
  } catch (_) {}
}

const PORT = Number(process.env.PORT) || 3000;
/** Port du serveur API quand on lance en mode API seul (dev avec Vite séparé). */
const API_PORT = Number(process.env.API_PORT) || 3001;
const apiOnly = process.env.API_ONLY === "1" || process.argv.includes("--api-only");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const XAI_API_KEY = process.env.XAI_API_KEY;

/** Fichier local pour les clés API (projet restant en local, data/ dans .gitignore). */
const LOCAL_API_KEYS_PATH = path.join(process.cwd(), "data", "api-keys.json");

function readLocalApiKeys(): Record<string, string> {
  try {
    const raw = fs.readFileSync(LOCAL_API_KEYS_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, string> | null;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalApiKeys(keys: Record<string, string>): void {
  try {
    const dir = path.dirname(LOCAL_API_KEYS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LOCAL_API_KEYS_PATH, JSON.stringify(keys, null, 2), "utf-8");
  } catch (err) {
    console.error("Erreur écriture data/api-keys.json:", err);
  }
}

async function startServer() {
  const app = express();

  // #region agent log
  app.use((req, _res, next) => {
    if (req.method === "PUT" && req.path === "/api/project") {
      try {
        fetch('http://127.0.0.1:7746/ingest/522b1550-7947-4472-ac1f-7d66b7d19da1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b4fbf3'},body:JSON.stringify({sessionId:'b4fbf3',location:'server.ts:PUT/api/project',message:'PUT /api/project request received (before body parse)',data:{contentLength:req.headers['content-length']},timestamp:Date.now(),hypothesisId:'H2,H3'})}).catch(()=>{});
      } catch (_) {}
    }
    next();
  });
  // #endregion

  app.use(express.json());

  // #region agent log
  app.post("/api/debug-log", (req, res) => {
    try {
      const payload = req.body && typeof req.body === "object" ? req.body : {};
      debugLog({ ...payload, timestamp: payload.timestamp ?? Date.now() });
    } catch (_) {}
    res.status(204).end();
  });
  app.use((req, _res, next) => {
    const p = req.path;
    if (req.method === "GET" && (p.startsWith("/src/") || p.endsWith(".tsx") || p.endsWith(".ts") || p === "/index.tsx")) {
      debugLog({ sessionId: "471675", location: "server.ts:getModuleRequest", message: "GET module-like path", data: { path: p }, timestamp: Date.now(), hypothesisId: "H4,H5" });
    }
    next();
  });
  // #endregion

  // No 404 for default favicon.ico request (real icon is /favicon.svg)
  app.get("/favicon.ico", (_req, res) => res.status(204).end());

  // --- API Routes ---

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Engine API health (v1.1 multimodèles)
  const engineModule = await import("./server/engine/v1.1/index.js");
  const { runEngineGenerateV11, runEngineGenerateStreamV11, ENGINE_DISPLAY_NAME, ENGINE_VERSION } = engineModule;
  app.get("/api/engine/health", (_req, res) => {
    res.json({ status: "ok", engine: true, name: ENGINE_DISPLAY_NAME, version: ENGINE_VERSION });
  });

  // --- Database API: project & settings (SQLite) ---
  let getProject: () => { id: number; title: string; content: string; context: string; chat_history: string | null; updated_at: number } | null;
  let saveProject: (p: { title: string; content: string; context: string; chatHistory: string | null }) => void;
  let getSetting: (key: string) => string | null;
  let setSetting: (key: string, value: string) => void;
  try {
    const dbModule = await import("./server/db/index.js");
    getProject = dbModule.getProject;
    saveProject = dbModule.saveProject;
    getSetting = dbModule.getSetting;
    setSetting = dbModule.setSetting;
  } catch (err) {
    console.warn("Database module unavailable, /api/project and /api/settings will use fallback:", (err as Error).message);
    getProject = () => null;
    saveProject = () => {};
    getSetting = () => null;
    setSetting = () => {};
  }

  app.get("/api/project", (_req, res) => {
    try {
      const row = getProject();
      if (!row) return res.status(404).json({ error: "Aucun projet" });
      const content = safeParseJson(row.content);
      const context = safeParseJson(row.context);
      const chatHistory = row.chat_history != null ? safeParseJson(row.chat_history) : undefined;
      if (content === undefined || context === undefined) return res.status(500).json({ error: "Données projet invalides" });
      res.json({
        title: row.title,
        content,
        context,
        updatedAt: row.updated_at,
        chatHistory: Array.isArray(chatHistory) ? chatHistory : undefined,
      });
    } catch (err) {
      console.error("GET /api/project:", err);
      res.status(500).json({ error: "Erreur base de données" });
    }
  });

  app.put("/api/project", (req, res) => {
    // #region agent log
    try {
      fetch('http://127.0.0.1:7746/ingest/522b1550-7947-4472-ac1f-7d66b7d19da1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b4fbf3'},body:JSON.stringify({sessionId:'b4fbf3',location:'server.ts:PUT handler',message:'PUT /api/project handler entered',data:{},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
    } catch (_) {}
    // #endregion
    try {
      const body = req.body;
      if (!body || typeof body !== "object") return res.status(400).json({ error: "Body invalide" });
      const title = typeof body.title === "string" ? body.title : "";
      const content = body.content !== undefined ? JSON.stringify(body.content) : "{}";
      const context = body.context !== undefined ? JSON.stringify(body.context) : "{}";
      const chatHistory = body.chatHistory !== undefined ? JSON.stringify(body.chatHistory) : null;
      saveProject({ title, content, context, chatHistory });
      res.status(200).end();
    } catch (err) {
      console.error("PUT /api/project:", err);
      res.status(500).json({ error: "Erreur base de données" });
    }
  });

  app.get("/api/settings", (_req, res) => {
    try {
      const localKeys = readLocalApiKeys();
      const apiKeysRaw = getSetting("api_keys");
      const preferredProvider = getSetting("preferred_provider") ?? "gemini";
      const engineConfigRaw = getSetting("engine_config");
      const dbKeys = apiKeysRaw != null ? safeParseJson(apiKeysRaw) : {};
      const apiKeysObj = typeof dbKeys === "object" && dbKeys !== null ? dbKeys : {};
      const engineConfig = engineConfigRaw != null ? safeParseJson(engineConfigRaw) : {};
      res.json({
        apiKeys: { ...localKeys, ...apiKeysObj },
        preferredProvider: typeof preferredProvider === "string" ? preferredProvider : "gemini",
        engineConfig: typeof engineConfig === "object" && engineConfig !== null ? engineConfig : {},
      });
    } catch (err) {
      console.error("GET /api/settings:", err);
      res.status(500).json({ error: "Erreur base de données" });
    }
  });

  app.put("/api/settings", (req, res) => {
    try {
      const body = req.body;
      if (!body || typeof body !== "object") return res.status(400).json({ error: "Body invalide" });
      if (body.apiKeys !== undefined) {
        const keys = typeof body.apiKeys === "object" && body.apiKeys !== null ? body.apiKeys : {};
        writeLocalApiKeys(keys as Record<string, string>);
        setSetting("api_keys", JSON.stringify(keys));
      }
      if (body.preferredProvider !== undefined) setSetting("preferred_provider", String(body.preferredProvider));
      if (body.engineConfig !== undefined) setSetting("engine_config", JSON.stringify(body.engineConfig));
      res.status(200).end();
    } catch (err) {
      console.error("PUT /api/settings:", err);
      res.status(500).json({ error: "Erreur base de données" });
    }
  });

  function safeParseJson(str: string): unknown {
    try {
      return JSON.parse(str);
    } catch {
      return undefined;
    }
  }

  /** Fusionne les clés API : client (priorité) puis fichier data/api-keys.json puis DB. Évite le 503 quand le client n'a pas encore envoyé de clés. */
  function mergeEnginePayloadApiKeys(body: Record<string, unknown>): Record<string, unknown> {
    const fromClient =
      body?.apiKeys && typeof body.apiKeys === "object" && body.apiKeys !== null
        ? (body.apiKeys as Record<string, unknown>)
        : {};
    const fromFile = readLocalApiKeys();
    const apiKeysRaw = getSetting("api_keys");
    const fromDb = apiKeysRaw != null ? safeParseJson(apiKeysRaw) : null;
    const dbKeys =
      typeof fromDb === "object" && fromDb !== null ? (fromDb as Record<string, unknown>) : {};
    const merged: Record<string, string> = {};
    const allKeys = new Set([
      ...Object.keys(fromClient),
      ...Object.keys(fromFile),
      ...Object.keys(dbKeys),
    ]);
    for (const key of allKeys) {
      const c = fromClient[key];
      const clientVal = typeof c === "string" ? c.trim() : "";
      if (clientVal) {
        merged[key] = clientVal;
        continue;
      }
      const f = fromFile[key];
      const fileVal = typeof f === "string" ? (f as string).trim() : "";
      if (fileVal) {
        merged[key] = fileVal;
        continue;
      }
      const d = dbKeys[key];
      const dbVal = typeof d === "string" ? (d as string).trim() : "";
      if (dbVal) merged[key] = dbVal;
    }
    return { ...body, apiKeys: merged };
  }

  // --- Unified AI API: appel direct par provider (usage expert ; la rédaction passe par /api/engine/generate) ---
  type AiProvider = "gemini" | "openrouter" | "openai" | "claude" | "mistral" | "grok";
  type AiPayload = {
    provider: AiProvider;
    apiKey?: string;
    contents: Array<{ role: string; parts: Array<{ text: string }> }>;
    config?: { systemInstruction?: string };
  };

  function toMessages(contents: AiPayload["contents"], systemInstruction?: string): Array<{ role: string; content: string }> {
    const messages = contents.map((c) => ({
      role: c.role as "user" | "assistant" | "system",
      content: c.parts.map((p) => p.text).join("\n"),
    }));
    if (systemInstruction?.trim()) {
      messages.unshift({ role: "system", content: systemInstruction.trim() });
    }
    return messages;
  }

  app.post("/api/ai/generate", async (req, res) => {
    const { provider, apiKey: clientApiKey, contents, config } = req.body as AiPayload;
    if (!provider || !contents || !Array.isArray(contents)) {
      return res.status(400).json({ error: "provider et contents requis" });
    }
    const envKeys: Record<AiProvider, string | undefined> = {
      gemini: GEMINI_API_KEY,
      openrouter: OPENROUTER_API_KEY,
      openai: OPENAI_API_KEY,
      claude: ANTHROPIC_API_KEY,
      mistral: MISTRAL_API_KEY,
      grok: XAI_API_KEY,
    };
    const apiKey = (clientApiKey && clientApiKey.trim()) || envKeys[provider];
    if (!apiKey) {
      return res.status(500).json({
        error: `Clé API manquante pour ${provider}. Configurez-la dans Paramètres ou via les variables d'environnement.`,
      });
    }
    const systemInstruction = config?.systemInstruction;
    const messages = toMessages(contents, systemInstruction);

    try {
      let text: string | null = null;

      if (provider === "gemini") {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents,
          config: config || {},
        });
        text = response.text ?? null;
      } else if (provider === "openrouter") {
        const systemMsg = messages.find((m) => m.role === "system");
        const chatMessages = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));
        const body: Record<string, unknown> = {
          model: "google/gemini-2.0-flash-001",
          messages: systemMsg ? [{ role: "system", content: systemMsg.content }, ...chatMessages] : chatMessages,
        };
        const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          const err = await r.text();
          throw new Error(err || `OpenRouter ${r.status}`);
        }
        const data = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
        text = data.choices?.[0]?.message?.content ?? null;
      } else if (provider === "openai") {
        const systemMsg = messages.find((m) => m.role === "system");
        const chatMessages = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));
        const body = {
          model: "gpt-4o-mini",
          messages: systemMsg ? [{ role: "system", content: systemMsg.content }, ...chatMessages] : chatMessages,
        };
        const r = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          const err = await r.text();
          throw new Error(err || `OpenAI ${r.status}`);
        }
        const data = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
        text = data.choices?.[0]?.message?.content ?? null;
      } else if (provider === "claude") {
        const systemMsg = messages.find((m) => m.role === "system");
        const chatMessages = messages.filter((m) => m.role !== "system");
        const body = {
          model: "claude-3-5-haiku-20241022",
          max_tokens: 4096,
          system: systemMsg?.content ?? "",
          messages: chatMessages.map((m) => ({ role: m.role, content: m.content })),
        };
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          const err = await r.text();
          throw new Error(err || `Anthropic ${r.status}`);
        }
        const data = (await r.json()) as { content?: Array<{ text?: string }> };
        text = data.content?.[0]?.text ?? null;
      } else if (provider === "mistral") {
        const systemMsg = messages.find((m) => m.role === "system");
        const chatMessages = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));
        const body = {
          model: "mistral-small-latest",
          messages: systemMsg ? [{ role: "system", content: systemMsg.content }, ...chatMessages] : chatMessages,
        };
        const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          const err = await r.text();
          throw new Error(err || `Mistral ${r.status}`);
        }
        const data = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
        text = data.choices?.[0]?.message?.content ?? null;
      } else if (provider === "grok") {
        const systemMsg = messages.find((m) => m.role === "system");
        const chatMessages = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));
        const body = {
          model: "grok-2-latest",
          messages: systemMsg ? [{ role: "system", content: systemMsg.content }, ...chatMessages] : chatMessages,
        };
        const r = await fetch("https://api.x.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          const err = await r.text();
          throw new Error(err || `xAI ${r.status}`);
        }
        const data = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
        text = data.choices?.[0]?.message?.content ?? null;
      } else {
        return res.status(400).json({ error: `Provider non supporté: ${provider}` });
      }

      res.json({ text });
    } catch (error: unknown) {
      console.error(`${provider} API Error:`, error);
      const message = error instanceof Error ? error.message : `${provider} request failed`;
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/engine/generate", async (req, res) => {
    const contents = req.body?.contents;
    const numMessages = Array.isArray(contents) ? contents.length : 0;
    console.log("[engine] POST /api/engine/generate", { numMessages });
    try {
      const payload = mergeEnginePayloadApiKeys(typeof req.body === "object" && req.body !== null ? req.body : {});
      const result = await runEngineGenerateV11(payload);
      console.log("[engine] generate done", { textLength: result?.text?.length ?? 0 });
      res.json(result);
    } catch (error: unknown) {
      console.error("[engine] generate error:", error);
      const message = error instanceof Error ? error.message : "Engine request failed";
      if (message.includes("contents requis")) {
        return res.status(400).json({ error: message });
      }
      if (
        message.includes("indisponible") ||
        message.includes("Aucun provider") ||
        message.includes("Contexte trop long")
      ) {
        return res.status(503).json({ error: message });
      }
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/engine/generate-stream", async (req, res) => {
    const contents = req.body?.contents;
    const numMessages = Array.isArray(contents) ? contents.length : 0;
    console.log("[engine] POST /api/engine/generate-stream", { numMessages });
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    try {
      const payload = mergeEnginePayloadApiKeys(typeof req.body === "object" && req.body !== null ? req.body : {});
      const fullText = await runEngineGenerateStreamV11(payload, (chunk) => {
        res.write("data: " + JSON.stringify({ chunk }) + "\n\n");
        res.flush?.();
      });
      res.write("data: " + JSON.stringify({ done: true, text: fullText }) + "\n\n");
      console.log("[engine] generate-stream done", { textLength: fullText?.length ?? 0 });
    } catch (error: unknown) {
      console.error("[engine] generate-stream error:", error);
      const message = error instanceof Error ? error.message : "Engine stream failed";
      res.write("data: " + JSON.stringify({ error: message }) + "\n\n");
    }
    res.end();
  });

  // Backward compatibility: Gemini-only endpoint
  app.post("/api/gemini/generate", async (req, res) => {
    const { contents, config, apiKey: clientApiKey } = req.body as {
      contents: Array<{ role: string; parts: Array<{ text: string }> }>;
      config?: { systemInstruction?: string };
      apiKey?: string;
    };
    const apiKey = (clientApiKey && clientApiKey.trim()) || GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "Clé API Gemini manquante. Configurez-la dans Paramètres (icône engrenage) ou GEMINI_API_KEY dans .env",
      });
    }
    if (!contents || !Array.isArray(contents)) {
      return res.status(400).json({ error: "contents array required" });
    }
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents,
        config: config || {},
      });
      const text = response.text ?? null;
      res.json({ text });
    } catch (error: unknown) {
      console.error("Gemini API Error:", error);
      const message = error instanceof Error ? error.message : "Gemini request failed";
      res.status(500).json({ error: message });
    }
  });

  if (apiOnly) {
    const server = app.listen(API_PORT, "0.0.0.0", () => {
      console.log(`API server on http://localhost:${API_PORT}`);
    });
    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err?.code === "EADDRINUSE") {
        console.error(
          `\nPort ${API_PORT} is already in use. Free it or use another port:\n` +
            `  Windows: netstat -ano | findstr :${API_PORT}  then  taskkill /PID <PID> /F\n` +
            `  Or set API_PORT=3002 (and restart Vite with API_PORT=3002 so the proxy matches).\n`
        );
        process.exit(1);
      }
      throw err;
    });
    return;
  }

  // --- Vite (dev) ou fichiers statiques (production) ---
  const isProduction = process.env.NODE_ENV === "production";
  // #region agent log
  debugLog({ sessionId: "471675", location: "server.ts:branch", message: "server mode", data: { NODE_ENV: process.env.NODE_ENV, isProduction }, timestamp: Date.now(), hypothesisId: "H1" });
  // #endregion
  let devPort: number | null = null;
  if (isProduction) {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // Fallback SPA : toute requête GET non gérée renvoie index.html
    app.get("*", (req, res) => {
      // #region agent log
      debugLog({ sessionId: "471675", location: "server.ts:spaFallback", message: "sending HTML for path", data: { path: req.path }, timestamp: Date.now(), hypothesisId: "H2" });
      // #endregion
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    devPort = await findAvailablePort(PORT, PORT + 9);
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  const tryListen = (port: number): Promise<ReturnType<express.Application["listen"]>> =>
    new Promise((resolve, reject) => {
      const s = app.listen(port, "0.0.0.0", () => resolve(s));
      s.once("error", reject);
    });

  const portsToTry = devPort !== null ? [devPort] : Array.from({ length: 10 }, (_, i) => PORT + i);
  let bound = false;
  for (const p of portsToTry) {
    try {
      const server = await tryListen(p);
      server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code !== "EADDRINUSE") throw err;
      });
      console.log(`Server running on http://localhost:${p}`);
      bound = true;
      break;
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err?.code === "EADDRINUSE") continue;
      throw e;
    }
  }
  if (!bound) {
    console.error(`\nAucun port libre entre ${PORT} et ${PORT + 9}. Fermez l'autre processus ou définissez PORT (ex: PORT=3010 npm run dev).`);
    process.exit(1);
  }
}

startServer();
