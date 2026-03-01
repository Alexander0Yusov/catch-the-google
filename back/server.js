import http from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { Game } from "../game.js";
import { EventEmitter } from "../observer/EventEmitter.js";
import { GameDb } from "./db.js";

const PORT = Number(process.env.PORT || 3001);
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

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`HTTP+WS server started on port ${PORT}`);
});

let isShuttingDown = false;

async function shutdown() {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  // eslint-disable-next-line no-console
  console.log("Shutting down...");

  wss.close(() => {
    httpServer.close(async () => {
      await db.close();
      process.exit(0);
    });
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
