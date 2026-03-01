// @ts-nocheck
/**
 * DEPLOY-CRITICAL FILE
 * --------------------
 * Этот файл запускается в Render как entrypoint backend.
 * Важно:
 * 1) HTTP + WebSocket живут на одном порту (ограничение платформы Render).
 * 2) /health обязателен для health-check и стабильного статуса сервиса.
 * 3) Ошибки в этой точке ломают live-игру (кнопки на фронте перестают работать).
 */
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import { Game } from "../game.js";
import { EventEmitter } from "../observer/EventEmitter.js";
import { GameDb } from "./db.js";

export async function createGameServer(options = {}) {
  const port = Number(options.port ?? process.env.PORT ?? 3001);
  const openApiPath = path.resolve(process.cwd(), "docs", "api", "openapi.yaml");
  const asyncApiPath = path.resolve(process.cwd(), "docs", "api", "asyncapi.yaml");

  const eventEmitter = new EventEmitter();
  const game = new Game(eventEmitter);
  const db = new GameDb();
  await db.init();

  const httpServer = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, service: "catch-the-google-backend" }));
      return;
    }

    // HTTP-документация доступна прямо с deployed backend URL.
    if (req.url === "/api-docs") {
      const html = `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Catch The Google API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body style="margin:0;background:#0f172a;">
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: "/api-docs/openapi.yaml",
        dom_id: "#swagger-ui",
      });
    </script>
  </body>
</html>`;

      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    if (req.url === "/api-docs/openapi.yaml") {
      readFile(openApiPath, "utf8")
        .then((content) => {
          res.writeHead(200, { "content-type": "application/yaml; charset=utf-8" });
          res.end(content);
        })
        .catch(() => {
          res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
          res.end("openapi.yaml not found");
        });
      return;
    }

    if (req.url === "/ws-docs") {
      const html = `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Catch The Google WS Docs</title>
    <style>
      body { margin: 0; font-family: Arial, sans-serif; background: #0f172a; color: #e2e8f0; }
      main { max-width: 1100px; margin: 0 auto; padding: 24px; }
      h1 { margin-top: 0; }
      a { color: #67e8f9; }
      pre {
        width: 100%;
        min-height: 70vh;
        border: 1px solid #334155;
        background: #020617;
        color: #e2e8f0;
        padding: 16px;
        overflow: auto;
        white-space: pre;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>WebSocket / AsyncAPI docs</h1>
      <p>Raw spec: <a href="/ws-docs/asyncapi.yaml" target="_blank" rel="noreferrer">/ws-docs/asyncapi.yaml</a></p>
      <p>
        Swagger-подобный интерактивный просмотр:
        <a id="studio-link" href="#" target="_blank" rel="noreferrer">Open AsyncAPI Studio</a>
      </p>
      <pre id="asyncapi-content">Загрузка спецификации...</pre>
    </main>
    <script>
      const specUrl = "/ws-docs/asyncapi.yaml";
      const content = document.getElementById("asyncapi-content");
      const studioLink = document.getElementById("studio-link");
      const absoluteSpecUrl = window.location.origin + specUrl;

      if (studioLink) {
        studioLink.href =
          "https://studio.asyncapi.com/?url=" + encodeURIComponent(absoluteSpecUrl);
      }

      fetch(specUrl)
        .then((response) => {
          if (!response.ok) {
            throw new Error("HTTP " + response.status);
          }
          return response.text();
        })
        .then((text) => {
          if (content) {
            content.textContent = text;
          }
        })
        .catch((error) => {
          if (content) {
            content.textContent = "Не удалось загрузить AsyncAPI спецификацию: " + error.message;
          }
        });
    </script>
  </body>
</html>`;

      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    if (req.url === "/ws-docs/asyncapi.yaml") {
      readFile(asyncApiPath, "utf8")
        .then((content) => {
          res.writeHead(200, { "content-type": "application/yaml; charset=utf-8" });
          res.end(content);
        })
        .catch(() => {
          res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
          res.end("asyncapi.yaml not found");
        });
      return;
    }

    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("Catch The Google backend is running");
  });

  const wss = new WebSocketServer({ server: httpServer });
  const clients = new Set();
  const clientRoles = new Map();

  const playerOwners = {
    1: null,
    2: null,
  };

  const player1Methods = new Set([
    "movePlayer1Up",
    "movePlayer1Down",
    "movePlayer1Left",
    "movePlayer1Right",
  ]);

  const player2Methods = new Set([
    "movePlayer2Up",
    "movePlayer2Down",
    "movePlayer2Left",
    "movePlayer2Right",
  ]);

  const procedureHandlers = {
    start: () => game.start(),
    stop: () => game.stop(),
    finishGame: () => game.finishGame(),
    pause: () => game.pause(),
    resume: () => game.resume(),
    setSettings: (payload) => game.setSettings(payload),
    getSettings: () => game.getSettings(),
    getStatus: () => game.getStatus(),
    getPlayer1: () => game.getPlayer1(),
    getPlayer2: () => game.getPlayer2(),
    getGoogle: () => game.getGoogle(),
    getScore: () => game.getScore(),
    getSnapshot: () => game.getSnapshot(),
    movePlayer1Up: () => game.movePlayer1Up(),
    movePlayer1Down: () => game.movePlayer1Down(),
    movePlayer1Left: () => game.movePlayer1Left(),
    movePlayer1Right: () => game.movePlayer1Right(),
    movePlayer2Up: () => game.movePlayer2Up(),
    movePlayer2Down: () => game.movePlayer2Down(),
    movePlayer2Left: () => game.movePlayer2Left(),
    movePlayer2Right: () => game.movePlayer2Right(),
  };

  function isMoveProcedure(name) {
    return player1Methods.has(name) || player2Methods.has(name);
  }

  function send(ws, data) {
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }

    ws.send(JSON.stringify(data));
  }

  function broadcast(data) {
    const payload = JSON.stringify(data);

    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }

  function assignRole(ws, preferredPlayerId) {
    const preferred = Number(preferredPlayerId);

    if ((preferred === 1 || preferred === 2) && !playerOwners[preferred]) {
      playerOwners[preferred] = ws;
      clientRoles.set(ws, preferred);
      return preferred;
    }

    if (!playerOwners[1]) {
      playerOwners[1] = ws;
      clientRoles.set(ws, 1);
      return 1;
    }

    if (!playerOwners[2]) {
      playerOwners[2] = ws;
      clientRoles.set(ws, 2);
      return 2;
    }

    clientRoles.set(ws, 0);
    return 0;
  }

  function releaseRole(ws) {
    const role = clientRoles.get(ws);

    if (role === 1 && playerOwners[1] === ws) {
      playerOwners[1] = null;
    }

    if (role === 2 && playerOwners[2] === ws) {
      playerOwners[2] = null;
    }

    clientRoles.delete(ws);
  }

  function checkMovePermission(ws, procedure) {
    const role = clientRoles.get(ws) ?? 0;
    const wsOwnsAtLeastOnePlayer = playerOwners[1] === ws || playerOwners[2] === ws;
    const secondSeatIsFree = !playerOwners[1] || !playerOwners[2];

    // Удобный локальный режим: если в матче только один реальный игрок,
    // разрешаем ему управлять обоими персонажами (стрелки + WASD).
    if (wsOwnsAtLeastOnePlayer && secondSeatIsFree) {
      return;
    }

    if (player1Methods.has(procedure) && role !== 1) {
      throw new Error("Эта вкладка не управляет Player 1");
    }

    if (player2Methods.has(procedure) && role !== 2) {
      throw new Error("Эта вкладка не управляет Player 2");
    }
  }

  async function persistSessionStart(snapshot) {
    if (snapshot?.status === "in-progress") {
      await db.saveSessionStart(snapshot);
    }
  }

  // Ключевая часть WebSocket-архитектуры:
  // доменная модель эмитит события, сервер транслирует их всем клиентам.
  // Благодаря этому два браузера видят одно и то же состояние без polling.
  game.eventEmitter.on("change", async (state) => {
    await persistSessionStart(state);

    broadcast({
      type: "event",
      eventName: "change",
      data: {
        state,
      },
    });
  });

  game.eventEmitter.on("googleCaught", async (payload) => {
    await db.saveCatchEvent(payload);

    broadcast({
      type: "event",
      eventName: "googleCaught",
      data: payload,
    });
  });

  game.eventEmitter.on("finished", async (payload) => {
    await db.saveSessionFinish(payload);

    broadcast({
      type: "event",
      eventName: "finished",
      data: payload,
    });
  });

  wss.on("connection", (ws) => {
    clients.add(ws);
    clientRoles.set(ws, 0);

    ws.on("error", (error) => {
      // eslint-disable-next-line no-console
      console.error("WS error", error);
    });

    ws.on("message", async (rawData) => {
      const rawText = rawData.toString();

      try {
        const message = JSON.parse(rawText);

        if (message.type !== "request") {
          return;
        }

        const { requestId, procedure, payload } = message;

        if (procedure === "joinGame") {
          const playerId = assignRole(ws, payload?.preferredPlayerId);

          send(ws, {
            type: "response",
            requestId,
            procedure,
            result: { playerId },
          });

          return;
        }

        const handler = procedureHandlers[procedure];

        if (!handler) {
          throw new Error(`Неизвестная процедура: ${procedure}`);
        }

        if (isMoveProcedure(procedure)) {
          checkMovePermission(ws, procedure);
        }

        const maybeResult = await handler(payload);
        const result = maybeResult ?? (await game.getSnapshot());

        send(ws, {
          type: "response",
          requestId,
          procedure,
          result,
        });
      } catch (error) {
        const safeError = error instanceof Error ? error.message : "Unknown error";

        let requestData = {};
        try {
          requestData = JSON.parse(rawText);
        } catch {
          requestData = {};
        }

        send(ws, {
          type: "response",
          requestId: requestData.requestId,
          procedure: requestData.procedure,
          error: safeError,
        });
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
      releaseRole(ws);
    });

    game.getSnapshot().then((snapshot) => {
      send(ws, {
        type: "event",
        eventName: "change",
        data: { state: snapshot },
      });
    });
  });

  await new Promise((resolve) => {
    httpServer.listen(port, resolve);
  });

  const actualPort = httpServer.address().port;

  async function stop() {
    await new Promise((resolve) => {
      wss.close(() => {
        httpServer.close(async () => {
          await db.close();
          resolve();
        });
      });
    });
  }

  return {
    port: actualPort,
    stop,
    httpServer,
    wss,
  };
}

let runningServer = null;

async function startFromCli() {
  runningServer = await createGameServer();
  // eslint-disable-next-line no-console
  console.log(`HTTP+WS server started on port ${runningServer.port}`);
}

async function shutdown() {
  if (!runningServer) {
    process.exit(0);
    return;
  }

  // eslint-disable-next-line no-console
  console.log("Shutting down...");
  await runningServer.stop();
  process.exit(0);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  startFromCli();
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}


