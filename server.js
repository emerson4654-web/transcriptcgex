const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const app = express();

const PORT = process.env.PORT || 10000;
const API_KEY = process.env.TRANSCRIPT_API_KEY || "";

const transcriptsPath = path.join(
  __dirname,
  "website",
  "transcripts"
);

fs.mkdirSync(transcriptsPath, { recursive: true });

app.use(express.json({ limit: "2mb" }));

// ==============================
// FUNÇÕES AUXILIARES
// ==============================

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function checkKey(req, res, next) {
  if (!API_KEY) {
    return res.status(500).json({
      error: "TRANSCRIPT_API_KEY não configurada."
    });
  }

  const receivedKey =
    req.query.key || req.headers["x-api-key"];

  if (receivedKey !== API_KEY) {
    return res.status(401).json({
      error: "Chave de API inválida."
    });
  }

  next();
}

function readTranscript(id) {
  const filePath = path.join(
    transcriptsPath,
    `${id}.json`
  );

  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(
    fs.readFileSync(filePath, "utf8")
  );
}

function saveTranscript(transcript) {
  fs.writeFileSync(
    path.join(
      transcriptsPath,
      `${transcript.id}.json`
    ),
    JSON.stringify(transcript, null, 2),
    "utf8"
  );
}

// ==============================
// PÁGINA INICIAL
// ==============================

app.get("/", (req, res) => {
  res.send(`
    <h1>TranscriptCGEx</h1>
    <p>O site está online.</p>
  `);
});

// ==============================
// CRIAR TRANSCRIPT
// ==============================

app.post(
  "/api/transcripts",
  checkKey,
  (req, res) => {
    const id = crypto.randomUUID();

    const transcript = {
      id,
      channelName:
        req.body.channelName || "ticket",
      guildName:
        req.body.guildName || "Servidor",
      createdAt:
        new Date().toISOString(),
      closedAt: null,
      messages: []
    };

    saveTranscript(transcript);

    const baseUrl =
      `${req.protocol}://${req.get("host")}`;

    res.status(201).json({
      success: true,
      id,
      url: `${baseUrl}/transcript/${id}`
    });
  }
);

// ==============================
// ADICIONAR MENSAGEM
// ==============================

app.post(
  "/api/transcripts/:id/messages",
  checkKey,
  (req, res) => {
    const transcript =
      readTranscript(req.params.id);

    if (!transcript) {
      return res.status(404).json({
        error: "Transcript não encontrado."
      });
    }

    if (transcript.closedAt) {
      return res.status(409).json({
        error: "Transcript já fechado."
      });
    }

    const message = req.body;

    if (!message.author) {
      return res.status(400).json({
        error: "O campo author é obrigatório."
      });
    }

    if (
      !message.content &&
      !Array.isArray(message.attachments)
    ) {
      return res.status(400).json({
        error: "Envie content ou attachments."
      });
    }

    transcript.messages.push({
      author: String(message.author),
      content: String(
        message.content || ""
      ),
      timestamp:
        message.timestamp ||
        new Date().toISOString(),
      attachments:
        Array.isArray(message.attachments)
          ? message.attachments
          : []
    });

    saveTranscript(transcript);

    res.json({
      success: true,
      totalMessages:
        transcript.messages.length
    });
  }
);

// ==============================
// FECHAR TRANSCRIPT
// ==============================

app.post(
  "/api/transcripts/:id/close",
  checkKey,
  (req, res) => {
    const transcript =
      readTranscript(req.params.id);

    if (!transcript) {
      return res.status(404).json({
        error: "Transcript não encontrado."
      });
    }

    transcript.closedAt =
      new Date().toISOString();

    saveTranscript(transcript);

    const baseUrl =
      `${req.protocol}://${req.get("host")}`;

    res.json({
      success: true,
      url:
        `${baseUrl}/transcript/${transcript.id}`
    });
  }
);

// ==============================
// VISUALIZAR TRANSCRIPT
// ==============================

app.get(
  "/transcript/:id",
  (req, res) => {
    const id = req.params.id;

    if (
      !/^[0-9a-f-]{36}$/i.test(id)
    ) {
      return res.status(400).send(
        "ID inválido."
      );
    }

    const transcript =
      readTranscript(id);

    if (!transcript) {
      return res.status(404).send(
        "Transcript não encontrado."
      );
    }

    const messagesHTML =
      transcript.messages.map(
        (message) => {
          const attachments =
            (message.attachments || [])
              .map(
                (attachment) => `
                  <a
                    href="${escapeHTML(attachment.url)}"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    ${escapeHTML(
                      attachment.name || "Anexo"
                    )}
                  </a>
                `
              )
              .join("<br>");

          return `
            <article class="message">
              <div class="author">
                ${escapeHTML(
                  message.author
                )}

                <span>
                  ${escapeHTML(
                    message.timestamp
                  )}
                </span>
              </div>

              <div class="content">
                ${escapeHTML(
                  message.content
                )}
              </div>

              ${attachments}
            </article>
          `;
        }
      ).join("");

    res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">

      <head>
        <meta charset="UTF-8">

        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        >

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

          .header,
          .message {
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

            <p>
              Ticket:
              ${escapeHTML(
                transcript.channelName
              )}
            </p>

            <p>
              Servidor:
              ${escapeHTML(
                transcript.guildName
              )}
            </p>

            <p>
              Criado em:
              ${escapeHTML(
                transcript.createdAt
              )}
            </p>

            <p>
              Fechado em:
              ${escapeHTML(
                transcript.closedAt ||
                "Ainda aberto"
              )}
            </p>
          </section>

          ${
            messagesHTML ||
            "<p>Nenhuma mensagem registrada.</p>"
          }

        </main>
      </body>

      </html>
    `);
  }
);

// ==============================
// INICIAR SERVIDOR
// ==============================

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `TranscriptCGEx rodando na porta ${PORT}`
  );
});

