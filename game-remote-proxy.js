import { EventEmitter } from "./observer/EventEmitter.js";

export class GameRemoteProxy {
  constructor(eventEmitter, options = {}) {
    this.eventEmitter = eventEmitter;
    this.options = options;
    this.ws = null;
    this.api = null;
    this.state = {
      status: "pending",
      settings: {
        pointsToWin: 10,
        gridSize: { columns: 4, rows: 4 },
        googleJumpInterval: 2000,
        gameDurationMs: 120000,
      },
      score: { 1: { points: 0 }, 2: { points: 0 } },
      player1: null,
      player2: null,
      google: null,
      sessionId: null,
      remainingTimeMs: 120000,
      myPlayerId: null,
    };
  }

  async start() {
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
      const wsUrl =
        this.options.wsUrl ||
        window.GAME_WS_URL ||
        (window.location.hostname.includes("localhost")
          ? "ws://localhost:3001"
          : "wss://RENDER_URL_HERE.onrender.com");

      this.ws = new WebSocket(wsUrl);

      await new Promise((resolve, reject) => {
        this.ws.addEventListener("open", resolve, { once: true });
        this.ws.addEventListener("error", reject, { once: true });
      });

      this.api = new Api(this.ws);

      // Важный момент: сервер шлет push-события о состоянии игры,
      // поэтому UI обновляется даже если действие сделал другой браузер.
      this.api.on("event", (message) => {
        if (message.eventName === "change" && message.data?.state) {
          this.state = { ...this.state, ...message.data.state };
          this.eventEmitter.emit("change", this.state);
        }

        if (message.eventName === "finished") {
          this.eventEmitter.emit("finished", message.data);
        }
      });
    }

    const snapshot = await this.api.send("start");
    this.#mergeState(snapshot);
    this.eventEmitter.emit("change", this.state);

    return this.state;
  }

  async stop() {
    const snapshot = await this.api.send("stop");
    this.#mergeState(snapshot);
    this.eventEmitter.emit("change", this.state);
    return this.state;
  }

  async finishGame() {
    const snapshot = await this.api.send("finishGame");
    this.#mergeState(snapshot);
    this.eventEmitter.emit("change", this.state);
    return this.state;
  }

  async setSettings(settings) {
    const snapshot = await this.api.send("setSettings", settings);
    this.#mergeState(snapshot);
    this.eventEmitter.emit("change", this.state);
    return this.state;
  }

  async joinGame(preferredPlayerId) {
    const result = await this.api.send("joinGame", { preferredPlayerId });
    this.state.myPlayerId = result.playerId;
    return result;
  }

  movePlayer1Right() {
    return this.api.send("movePlayer1Right");
  }

  movePlayer1Left() {
    return this.api.send("movePlayer1Left");
  }

  movePlayer1Up() {
    return this.api.send("movePlayer1Up");
  }

  movePlayer1Down() {
    return this.api.send("movePlayer1Down");
  }

  movePlayer2Right() {
    return this.api.send("movePlayer2Right");
  }

  movePlayer2Left() {
    return this.api.send("movePlayer2Left");
  }

  movePlayer2Up() {
    return this.api.send("movePlayer2Up");
  }

  movePlayer2Down() {
    return this.api.send("movePlayer2Down");
  }

  async getSettings() {
    const result = await this.api.send("getSettings");
    this.state.settings = result;
    return result;
  }

  async getStatus() {
    const result = await this.api.send("getStatus");
    this.state.status = result;
    return result;
  }

  async getPlayer1() {
    const result = await this.api.send("getPlayer1");
    this.state.player1 = result;
    return result;
  }

  async getPlayer2() {
    const result = await this.api.send("getPlayer2");
    this.state.player2 = result;
    return result;
  }

  async getGoogle() {
    const result = await this.api.send("getGoogle");
    this.state.google = result;
    return result;
  }

  async getScore() {
    const result = await this.api.send("getScore");
    this.state.score = result;
    return result;
  }

  async getSnapshot() {
    const result = await this.api.send("getSnapshot");
    this.#mergeState(result);
    return this.state;
  }

  get status() {
    return this.state.status;
  }

  get player1() {
    return this.state.player1;
  }

  get player2() {
    return this.state.player2;
  }

  get google() {
    return this.state.google;
  }

  get score() {
    return this.state.score;
  }

  get settings() {
    return this.state.settings;
  }

  #mergeState(snapshot) {
    if (!snapshot) {
      return;
    }

    this.state = { ...this.state, ...snapshot };
  }
}

class Api {
  constructor(ws) {
    this.ws = ws;
    this.pending = new Map();
    this.events = new EventEmitter();

    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);

      if (message.type === "response") {
        const resolver = this.pending.get(message.requestId);

        if (!resolver) {
          return;
        }

        this.pending.delete(message.requestId);

        if (message.error) {
          resolver.reject(new Error(message.error));
          return;
        }

        resolver.resolve(message.result);
        return;
      }

      if (message.type === "event") {
        this.events.emit("event", message);
      }
    });

    this.ws.addEventListener("close", () => {
      this.pending.forEach(({ reject }) => {
        reject(new Error("WebSocket соединение закрыто"));
      });
      this.pending.clear();
    });
  }

  on(eventName, callback) {
    return this.events.on(eventName, callback);
  }

  send(procedure, payload = null) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("WebSocket не подключен"));
    }

    const requestId =
      globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

    const request = {
      type: "request",
      requestId,
      procedure,
      payload,
    };

    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.ws.send(JSON.stringify(request));
    });
  }
}

