require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || "change-this-secret";
const PANEL_PASSWORD = process.env.CGEX_PANEL_PASSWORD || "";
const BDFD_SECRET = process.env.BDFD_TRANSCRIPT_SECRET || "";

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "transcripts.json");

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]");

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

function readTranscripts() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeTranscripts(items) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2));
}

function sign(value) {
  return crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(value)
    .digest("hex");
}

function createSession() {
  const payload = Buffer.from(JSON.stringify({
    createdAt: Date.now(),
    expiresAt: Date.now() + 1000 * 60 * 60 * 12
  })).toString("base64url");

  return `${payload}.${sign(payload)}`;
}

function validSession(req) {
  const cookies = req.headers.cookie || "";
  const match = cookies.match(/cgex_session=([^;]+)/);
  if (!match) return false;

  const token = match[1];
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const expected = sign(payload);
  if (signature.length !== expected.length) return false;

  if (!crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  )) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.expiresAt > Date.now();
  } catch {
    return false;
  }
}

function requirePanelAuth(req, res, next) {
  if (!validSession(req)) {
    return res.status(401).json({ error: "Acesso não autorizado." });
  }
  next();
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "TranscriptCGEx" });
});

app.post("/api/auth/login", (req, res) => {
  if (!PANEL_PASSWORD) {
    return res.status(503).json({
      error: "CGEX_PANEL_PASSWORD não configurada no servidor."
    });
  }

  const password = String(req.body?.password || "");
  const expected = Buffer.from(PANEL_PASSWORD);
  const received = Buffer.from(password);

  if (
    expected.length !== received.length ||
    !crypto.timingSafeEqual(expected, received)
  ) {
    return res.status(401).json({ error: "Senha inválida." });
  }

  res.setHeader(
    "Set-Cookie",
    `cgex_session=${createSession()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`
  );

  res.json({ ok: true });
});

app.post("/api/auth/logout", (req, res) => {
  res.setHeader(
    "Set-Cookie",
    "cgex_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"
  );
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  res.json({ authenticated: validSession(req) });
});

app.get("/api/transcripts", requirePanelAuth, (req, res) => {
  const query = String(req.query.q || "").toLowerCase().trim();
  let transcripts = readTranscripts();

  if (query) {
    transcripts = transcripts.filter(item =>
      JSON.stringify(item).toLowerCase().includes(query)
    );
  }

  const summaries = transcripts.map(item => ({
    id: item.id,
    ticketId: item.ticketId,
    channelName: item.channelName,
    openedAt: item.openedAt,
    closedAt: item.closedAt,
    status: item.status,
    attendants: item.attendants || [],
    messageCount: Array.isArray(item.messages) ? item.messages.length : 0
  }));

  res.json(summaries);
});

app.get("/api/transcripts/:id", requirePanelAuth, (req, res) => {
  const item = readTranscripts().find(t => t.id === req.params.id);

  if (!item) {
    return res.status(404).json({ error: "Transcrição não encontrada." });
  }

  res.json(item);
});

app.post("/api/bdfd/transcripts", (req, res) => {
  if (!BDFD_SECRET) {
    return res.status(503).json({ error: "Segredo BDFD não configurado." });
  }

  const suppliedSecret = req.headers["x-bdfd-secret"];
  if (suppliedSecret !== BDFD_SECRET) {
    return res.status(403).json({ error: "Segredo inválido." });
  }

  const body = req.body || {};
  if (!body.ticketId || !Array.isArray(body.messages)) {
    return res.status(400).json({
      error: "ticketId e messages são obrigatórios."
    });
  }

  const transcript = {
    id: String(body.id || crypto.randomUUID()),
    ticketId: String(body.ticketId),
    channelName: String(body.channelName || ""),
    openedAt: body.openedAt || new Date().toISOString(),
    closedAt: body.closedAt || new Date().toISOString(),
    status: String(body.status || "closed"),
    author: body.author || null,
    attendants: Array.isArray(body.attendants) ? body.attendants : [],
    messages: body.messages
  };

  const transcripts = readTranscripts().filter(t => t.id !== transcript.id);
  transcripts.unshift(transcript);
  writeTranscripts(transcripts);

  res.status(201).json({ ok: true, id: transcript.id });
});

app.get("/cgex", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`TranscriptCGEx iniciado na porta ${PORT}`);
});
