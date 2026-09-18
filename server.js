const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const transcriptsPath = path.join(__dirname, "website", "transcripts");

fs.mkdirSync(transcriptsPath, { recursive: true });

app.use(express.json({ limit: "2mb" }));

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

app.get("/", (req, res) => {
  res.send(`
    <h1>TranscriptCGEx</h1>
    <p>O site está online.</p>
  `);
});

// Endpoint para criar um transcript.
// Proteja este endpoint com uma chave/API antes de usar em produção.
app.post("/api/transcripts", (req, res) => {
  const data = req.body;

  if (!data || !Array.isArray(data.messages)) {
    return res.status(400).json({
      error: "Envie um objeto com um array messages."
    });
  }

  const id = crypto.randomUUID();

  const transcript = {
    id,
    channelName: data.channelName || "ticket",
    guildName: data.guildName || "Servidor",
    createdAt: new Date().toISOString(),
    messages: data.messages
  };

  fs.writeFileSync(
    path.join(transcriptsPath, `${id}.json`),
    JSON.stringify(transcript, null, 2),
    "utf8"
  );

  const baseUrl = `${req.protocol}://${req.get("host")}`;

  res.status(201).json({
    id,
    url: `${baseUrl}/transcript/${id}`
  });
});

app.get("/transcript/:id", (req, res) => {
  const id = req.params.id;

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return res.status(400).send("ID inválido.");
  }

  const filePath = path.join(transcriptsPath, `${id}.json`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Transcript não encontrado.");
  }

  const transcript = JSON.parse(fs.readFileSync(filePath, "utf8"));

  const messagesHTML = transcript.messages.map((message) => {
    const attachments = (message.attachments || [])
      .map((attachment) =>
        `<a href="${escapeHTML(attachment.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(attachment.name || "Anexo")}</a>`
      )
      .join("<br>");

    return `
      <article class="message">
        <div class="author">
          ${escapeHTML(message.author || "Desconhecido")}
          <span>${escapeHTML(message.timestamp || "")}</span>
        </div>
        <div class="content">${escapeHTML(message.content || "")}</div>
        ${attachments}
      </article>
    `;
  }).join("");

  res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TranscriptCGEx</title>
  <style>
    body {
      margin: 0;
      background: #0f172a;
      color: #f8fafc;
      font-family: Arial, sans-serif;
    }
    .container {
      max-width: 900px;
      margin: 30px auto;
      padding: 20px;
    }
    .header, .message {
      background: #1e293b;
      border-radius: 12px;
      padding: 18px;
      margin-bottom: 12px;
    }
    .author {
      color: #60a5fa;
      font-weight: bold;
    }
    .author span {
      color: #94a3b8;
      font-size: 12px;
      font-weight: normal;
      margin-left: 8px;
    }
    .content {
      margin-top: 10px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    a {
      color: #93c5fd;
    }
  </style>
</head>
<body>
  <main class="container">
    <section class="header">
      <h1>📁 TranscriptCGEx</h1>
      <p>Ticket: ${escapeHTML(transcript.channelName)}</p>
      <p>Servidor: ${escapeHTML(transcript.guildName)}</p>
      <p>Data: ${escapeHTML(transcript.createdAt)}</p>
    </section>
    ${messagesHTML || "<p>Nenhuma mensagem registrada.</p>"}
  </main>
</body>
</html>
  `);
});

app.listen(PORT, () => {
  console.log(`TranscriptCGEx rodando na porta ${PORT}`);
});
