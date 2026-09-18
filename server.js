import express from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 10000);

// ========================================
// CONFIGURAÇÕES
// ========================================

const TRANSCRIPTS_DIR = path.join(
  __dirname,
  "website",
  "transcripts"
);

// Cria a pasta dos transcripts caso não exista
if (!fs.existsSync(TRANSCRIPTS_DIR)) {
  fs.mkdirSync(TRANSCRIPTS_DIR, {
    recursive: true
  });
}

// Permite receber JSON do BDFD
app.use(
  express.json({
    limit: "2mb"
  })
);

// ========================================
// CORS
// ========================================

app.use((req, res, next) => {
  res.header(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// ========================================
// ARQUIVOS DO SITE
// ========================================

const publicDir = path.join(
  __dirname,
  "public"
);

if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

// ========================================
// FUNÇÕES AUXILIARES
// ========================================

function getTranscriptPath(id) {
  return path.join(
    TRANSCRIPTS_DIR,
    `${id}.json`
  );
}

function generateTranscriptId() {
  return crypto.randomUUID();
}

function saveTranscript(transcript) {
  const filePath = getTranscriptPath(
    transcript.id
  );

  fs.writeFileSync(
    filePath,
    JSON.stringify(transcript, null, 2),
    "utf8"
  );
}

function loadTranscript(id) {
  const filePath = getTranscriptPath(id);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const file = fs.readFileSync(
      filePath,
      "utf8"
    );

    return JSON.parse(file);
  } catch (error) {
    console.error(
      "Erro ao ler transcript:",
      error
    );

    return null;
  }
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Sempre gera o link público HTTPS
function getTranscriptURL(req, id) {
  const host = req.get("host");

  return `https://${host}/transcript/${encodeURIComponent(id)}`;
}

function normalizeMessage(message) {
  const author = message.author || {};

  return {
    id: String(
      message.id ||
      crypto.randomUUID()
    ),

    author: {
      id: String(
        author.id ||
        message.authorId ||
        "desconhecido"
      ),

      username: String(
        author.username ||
        message.username ||
        message.authorName ||
        "Usuário desconhecido"
      )
    },

    content: String(
      message.content || ""
    ),

    attachments: Array.isArray(
      message.attachments
    )
      ? message.attachments.map(
          (attachment) => ({
            name: String(
              attachment.name ||
              "arquivo"
            ),

            url: String(
              attachment.url || ""
            )
          })
        )
      : [],

    timestamp:
      message.timestamp ||
      new Date().toISOString()
  };
}

// ========================================
// STATUS DA API
// ========================================

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "TranscriptCGEx",
    apiKeyRequired: false,
    message: "TranscriptCGEx online."
  });
});

// ========================================
// CRIAR TRANSCRIPT
// ========================================

app.post("/api/transcripts", (req, res) => {
  try {
    const body = req.body || {};

    const id = generateTranscriptId();

    const transcript = {
      id,

      title: String(
        body.title ||
        "Transcript de Ticket"
      ),

      channelId: String(
        body.channelId || ""
      ),

      channelName: String(
        body.channelName ||
        "ticket"
      ),

      guildId: String(
        body.guildId || ""
      ),

      guildName: String(
        body.guildName ||
        "Servidor"
      ),

      creatorId: String(
        body.creatorId || ""
      ),

      creatorName: String(
        body.creatorName || ""
      ),

      status: "open",

      createdAt:
        new Date().toISOString(),

      closedAt: null,

      closedBy: null,

      messages: []
    };

    saveTranscript(transcript);

    res.status(201).json({
      ok: true,

      message:
        "Transcript criado com sucesso.",

      id: transcript.id,

      url: getTranscriptURL(
        req,
        transcript.id
      ),

      transcript
    });
  } catch (error) {
    console.error(
      "Erro ao criar transcript:",
      error
    );

    res.status(500).json({
      ok: false,

      error:
        "Não foi possível criar o transcript."
    });
  }
});

// ========================================
// ADICIONAR MENSAGEM
// ========================================

app.post(
  "/api/transcripts/:id/messages",
  (req, res) => {
    try {
      const transcript = loadTranscript(
        req.params.id
      );

      if (!transcript) {
        return res.status(404).json({
          ok: false,

          error:
            "Transcript não encontrado."
        });
      }

      if (
        transcript.status === "closed"
      ) {
        return res.status(400).json({
          ok: false,

          error:
            "Este transcript já está fechado."
        });
      }

      const message = normalizeMessage(
        req.body || {}
      );

      if (
        !message.content &&
        message.attachments.length === 0
      ) {
        return res.status(400).json({
          ok: false,

          error:
            "A mensagem precisa conter texto ou anexo."
        });
      }

      transcript.messages.push(message);

      saveTranscript(transcript);

      res.status(201).json({
        ok: true,

        message:
          "Mensagem registrada.",

        transcriptId:
          transcript.id,

        registeredMessage:
          message
      });
    } catch (error) {
      console.error(
        "Erro ao registrar mensagem:",
        error
      );

      res.status(500).json({
        ok: false,

        error:
          "Não foi possível registrar a mensagem."
      });
    }
  }
);

// ========================================
// FECHAR TRANSCRIPT
// ========================================

app.post(
  "/api/transcripts/:id/close",
  (req, res) => {
    try {
      const transcript = loadTranscript(
        req.params.id
      );

      if (!transcript) {
        return res.status(404).json({
          ok: false,

          error:
            "Transcript não encontrado."
        });
      }

      if (
        transcript.status === "closed"
      ) {
        return res.json({
          ok: true,

          message:
            "Transcript já estava fechado.",

          id: transcript.id,

          url: getTranscriptURL(
            req,
            transcript.id
          ),

          transcript
        });
      }

      transcript.status = "closed";

      transcript.closedAt =
        new Date().toISOString();

      transcript.closedBy = String(
        req.body?.closedBy ||
        req.body?.closedByName ||
        "Sistema"
      );

      saveTranscript(transcript);

      res.json({
        ok: true,

        message:
          "Transcript fechado com sucesso.",

        id: transcript.id,

        url: getTranscriptURL(
          req,
          transcript.id
        ),

        transcript
      });
    } catch (error) {
      console.error(
        "Erro ao fechar transcript:",
        error
      );

      res.status(500).json({
        ok: false,

        error:
          "Não foi possível fechar o transcript."
      });
    }
  }
);

// ========================================
// CONSULTAR TRANSCRIPT EM JSON
// ========================================

app.get(
  "/api/transcripts/:id",
  (req, res) => {
    const transcript = loadTranscript(
      req.params.id
    );

    if (!transcript) {
      return res.status(404).json({
        ok: false,

        error:
          "Transcript não encontrado."
      });
    }

    res.json({
      ok: true,

      transcript
    });
  }
);

// ========================================
// PÁGINA HTML DO TRANSCRIPT
// ========================================

app.get(
  "/transcript/:id",
  (req, res) => {
    const transcript = loadTranscript(
      req.params.id
    );

    if (!transcript) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport"
              content="width=device-width, initial-scale=1.0">

            <title>Transcript não encontrado</title>
          </head>

          <body>
            <h1>Transcript não encontrado</h1>
            <p>O transcript solicitado não existe.</p>
          </body>
        </html>
      `);
    }

    const messagesHTML =
      transcript.messages.length > 0
        ? transcript.messages
            .map((message) => {
              const authorName =
                escapeHTML(
                  message.author.username
                );

              const authorId =
                escapeHTML(
                  message.author.id
                );

              const content =
                escapeHTML(
                  message.content
                );

              const timestamp =
                escapeHTML(
                  new Date(
                    message.timestamp
                  ).toLocaleString("pt-BR")
                );

              const attachmentsHTML =
                message.attachments
                  .filter(
                    (attachment) =>
                      attachment.url
                  )
                  .map(
                    (attachment) => `
                      <div class="attachment">
                        📎

                        <a
                          href="${escapeHTML(
                            attachment.url
                          )}"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          ${escapeHTML(
                            attachment.name
                          )}
                        </a>
                      </div>
                    `
                  )
                  .join("");

              return `
                <article class="message">
                  <div class="message-header">
                    <strong>
                      ${authorName}
                    </strong>

                    <span class="author-id">
                      ID: ${authorId}
                    </span>

                    <time>
                      ${timestamp}
                    </time>
                  </div>

                  <div class="message-content">
                    ${content.replace(
                      /\n/g,
                      "<br>"
                    )}
                  </div>

                  ${attachmentsHTML}
                </article>
              `;
            })
            .join("")
        : `
          <div class="empty">
            Nenhuma mensagem foi registrada
            neste transcript.
          </div>
        `;

    const statusLabel =
      transcript.status === "closed"
        ? "Fechado"
        : "Aberto";

    const closedInfo =
      transcript.closedAt
        ? `
          <p>
            <strong>Fechado em:</strong>
            ${escapeHTML(
              new Date(
                transcript.closedAt
              ).toLocaleString("pt-BR")
            )}
          </p>

          <p>
            <strong>Fechado por:</strong>
            ${escapeHTML(
              transcript.closedBy ||
              "Sistema"
            )}
          </p>
        `
        : "";

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">

          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          >

          <title>
            ${escapeHTML(
              transcript.title
            )}
          </title>

          <style>
            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              padding: 20px;
              background: #111827;
              color: #f9fafb;
              font-family: Arial, Helvetica, sans-serif;
            }

            .container {
              max-width: 1000px;
              margin: 0 auto;
            }

            .header {
              padding: 24px;
              background: #1f2937;
              border: 1px solid #374151;
              border-radius: 16px;
              margin-bottom: 20px;
            }

            h1 {
              margin: 0 0 12px;
              font-size: 26px;
              overflow-wrap: anywhere;
            }

            .info {
              color: #d1d5db;
              line-height: 1.6;
            }

            .status {
              display: inline-block;
              padding: 6px 12px;
              border-radius: 999px;
              background: ${
                transcript.status === "closed"
                  ? "#991b1b"
                  : "#166534"
              };
              color: #fff;
              font-size: 13px;
              font-weight: bold;
            }

            .message {
              background: #1f2937;
              border: 1px solid #374151;
              border-radius: 12px;
              padding: 16px;
              margin-bottom: 12px;
            }

            .message-header {
              display: flex;
              flex-wrap: wrap;
              align-items: center;
              gap: 8px;
              margin-bottom: 10px;
            }

            .message-header strong {
              color: #93c5fd;
            }

            .author-id {
              color: #9ca3af;
              font-size: 12px;
            }

            time {
              color: #9ca3af;
              font-size: 12px;
              margin-left: auto;
            }

            .message-content {
              white-space: normal;
              overflow-wrap: anywhere;
              color: #f3f4f6;
              line-height: 1.6;
            }

            .attachment {
              margin-top: 10px;
              padding: 8px;
              background: #111827;
              border-radius: 8px;
            }

            a {
              color: #60a5fa;
            }

            .empty {
              background: #1f2937;
              border-radius: 12px;
              padding: 24px;
              color: #d1d5db;
              text-align: center;
            }

            .footer {
              margin-top: 20px;
              text-align: center;
              color: #9ca3af;
              font-size: 12px;
            }

            @media (max-width: 600px) {
              body {
                padding: 10px;
              }

              .header {
                padding: 18px;
              }

              time {
                width: 100%;
                margin-left: 0;
              }
            }
          </style>
        </head>

        <body>
          <main class="container">
            <section class="header">
              <h1>
                📄
                ${escapeHTML(
                  transcript.title
                )}
              </h1>

              <span class="status">
                ${statusLabel}
              </span>

              <div class="info">
                <p>
                  <strong>Servidor:</strong>
                  ${escapeHTML(
                    transcript.guildName
                  )}
                </p>

                <p>
                  <strong>Canal:</strong>
                  ${escapeHTML(
                    transcript.channelName
                  )}
                </p>

                <p>
                  <strong>Criado em:</strong>
                  ${escapeHTML(
                    new Date(
                      transcript.createdAt
                    ).toLocaleString("pt-BR")
                  )}
                </p>

                ${closedInfo}
              </div>
            </section>

            <section>
              ${messagesHTML}
            </section>

            <footer class="footer">
              TranscriptCGEx •
              Sistema de registros do Emerson
            </footer>
          </main>
        </body>
      </html>
    `;

    res.type("html").send(html);
  }
);

// ========================================
// TRATAMENTO DE ERROS
// ========================================

app.use(
  (error, _req, res, _next) => {
    console.error(
      "Erro interno:",
      error
    );

    res.status(500).json({
      ok: false,

      error:
        "Erro interno do servidor."
    });
  }
);

// ========================================
// INICIAR SERVIDOR
// ========================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `TranscriptCGEx rodando na porta ${PORT}`
    );
  }
);

