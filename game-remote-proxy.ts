// @ts-nocheck
import { EventEmitter } from "./observer/EventEmitter.js";

export class GameRemoteProxy {
  constructor(eventEmitter, options = {}) {
    this.eventEmitter = eventEmitter;
    this.options = options;
    this.socket = null;
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

  async connect() {
    if (!this.socket || !this.socket.connected) {
      const socketUrl =
        this.options.wsUrl ||
        window.GAME_WS_URL ||
        window.location.origin;
      const normalizedSocketUrl = String(socketUrl)
        .replace(/^ws:\/\//, "http://")
        .replace(/^wss:\/\//, "https://");

      this.socket = globalThis.io(normalizedSocketUrl, {
        transports: ["websocket"],
      });

      await new Promise((resolve, reject) => {
        this.socket.once("connect", resolve);
        this.socket.once("connect_error", reject);
      });

      this.api = new Api(this.socket);

      this.api.on("event", (message) => {
        if (message.eventName === "change" && message.data?.state) {
          this.state = { ...this.state, ...message.data.state };
          this.eventEmitter.emit("change", this.state);
        }
      });

      this.api.on("game-started", (event) => {
        this.eventEmitter.emit("game-started", event);
      });

      this.api.on("google-jumped", (event) => {
        this.eventEmitter.emit("google-jumped", event);
      });

      this.api.on("google-caught", (event) => {
        this.eventEmitter.emit("google-caught", event);
      });

      this.api.on("game-finished", (event) => {
        this.eventEmitter.emit("game-finished", event);
        // Backward compatibility with current front.ts listener.
        this.eventEmitter.emit("finished", event);
      });
    }
  }

  async start() {
    await this.connect();
    const snapshot = await this.api.emitRequest("start");
    this.#mergeState(snapshot);
    this.eventEmitter.emit("change", this.state);

    return this.state;
  }

  async stop() {
    await this.connect();
    const snapshot = await this.api.emitRequest("stop");
    this.#mergeState(snapshot);
    this.eventEmitter.emit("change", this.state);
    return this.state;
  }

  async finishGame() {
    await this.connect();
    const snapshot = await this.api.emitRequest("finishGame");
    this.#mergeState(snapshot);
    this.eventEmitter.emit("change", this.state);
    return this.state;
  }

  async setSettings(settings) {
    await this.connect();
    const snapshot = await this.api.emitRequest("setSettings", settings);
    this.#mergeState(snapshot);
    this.eventEmitter.emit("change", this.state);
    return this.state;
  }

  async joinGame(preferredPlayerId) {
    await this.connect();
    const result = await this.api.emitRequest("joinGame", { preferredPlayerId });
    this.state.myPlayerId = result.playerId;
    return result;
  }

  async movePlayer1Right() {
    await this.connect();
    return this.api.emitRequest("movePlayer1Right");
  }

  async movePlayer1Left() {
    await this.connect();
    return this.api.emitRequest("movePlayer1Left");
  }

  async movePlayer1Up() {
    await this.connect();
    return this.api.emitRequest("movePlayer1Up");
  }

  async movePlayer1Down() {
    await this.connect();
    return this.api.emitRequest("movePlayer1Down");
  }

  async movePlayer2Right() {
    await this.connect();
    return this.api.emitRequest("movePlayer2Right");
  }

  async movePlayer2Left() {
    await this.connect();
    return this.api.emitRequest("movePlayer2Left");
  }

  async movePlayer2Up() {
    await this.connect();
    return this.api.emitRequest("movePlayer2Up");
  }

  async movePlayer2Down() {
    await this.connect();
    return this.api.emitRequest("movePlayer2Down");
  }

  async getSettings() {
    await this.connect();
    const result = await this.api.emitRequest("getSettings");
    this.state.settings = result;
    return result;
  }

  async getStatus() {
    await this.connect();
    const result = await this.api.emitRequest("getStatus");
    this.state.status = result;
    return result;
  }

  async getPlayer1() {
    await this.connect();
    const result = await this.api.emitRequest("getPlayer1");
    this.state.player1 = result;
    return result;
  }

  async getPlayer2() {
    await this.connect();
    const result = await this.api.emitRequest("getPlayer2");
    this.state.player2 = result;
    return result;
  }

  async getGoogle() {
    await this.connect();
    const result = await this.api.emitRequest("getGoogle");
    this.state.google = result;
    return result;
  }

  async getScore() {
    await this.connect();
    const result = await this.api.emitRequest("getScore");
    this.state.score = result;
    return result;
  }

  async getSnapshot() {
    await this.connect();
    const result = await this.api.emitRequest("getSnapshot");
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
  constructor(socket) {
    this.socket = socket;
    this.pending = new Map();
    this.events = new EventEmitter();

    this.socket.on("response", (message) => {
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
      }
    });

    this.socket.on("event", (message) => {
      this.events.emit("event", message);
    });

    this.socket.on("game-started", (event) => {
      this.events.emit("game-started", event);
    });
    this.socket.on("google-jumped", (event) => {
      this.events.emit("google-jumped", event);
    });
    this.socket.on("google-caught", (event) => {
      this.events.emit("google-caught", event);
    });
    this.socket.on("game-finished", (event) => {
      this.events.emit("game-finished", event);
    });

    this.socket.on("disconnect", () => {
      this.pending.forEach(({ reject }) => {
        reject(new Error("Socket.IO connection is closed"));
      });
      this.pending.clear();
    });
  }

  on(eventName, callback) {
    return this.events.on(eventName, callback);
  }

  emitRequest(procedure, payload = null) {
    if (!this.socket || !this.socket.connected) {
      return Promise.reject(new Error("Socket.IO is not connected"));
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
      this.socket.emit("request", request);
    });
  }
}
