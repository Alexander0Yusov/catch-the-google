import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createGameServer } from "../../back/server.js";

class WsTestClient {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.pending = new Map();
    this.events = [];

    this.ws.on("message", (raw) => {
      const message = JSON.parse(raw.toString());

      if (message.type === "response") {
        const resolver = this.pending.get(message.requestId);
        if (!resolver) return;
        this.pending.delete(message.requestId);

        if (message.error) {
          resolver.reject(new Error(message.error));
          return;
        }

        resolver.resolve(message.result);
        return;
      }

      if (message.type === "event") {
        this.events.push(message);
      }
    });
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.ws.once("open", resolve);
      this.ws.once("error", reject);
    });
  }

  request(procedure, payload = null) {
    const requestId = `${Date.now()}-${Math.random()}`;

    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.ws.send(
        JSON.stringify({
          type: "request",
          requestId,
          procedure,
          payload,
        })
      );
    });
  }

  close() {
    return new Promise((resolve) => {
      if (this.ws.readyState === WebSocket.CLOSED) {
        resolve();
        return;
      }

      this.ws.once("close", resolve);
      this.ws.close();
    });
  }
}

describe("WebSocket e2e", () => {
  let app;
  let baseUrl;

  beforeAll(async () => {
    process.env.DATABASE_URL = "";
    app = await createGameServer({ port: 0 });
    baseUrl = `ws://127.0.0.1:${app.port}`;
  });

  afterAll(async () => {
    await app.stop();
  });

  it("starts game via websocket request/response", async () => {
    const client = new WsTestClient(baseUrl);
    await client.open();

    await client.request("joinGame", { preferredPlayerId: 1 });
    await client.request("setSettings", {
      gridSize: { columns: 4, rows: 4 },
      turnDelayMs: 0,
      gameDurationMs: 60000,
    });

    const snapshot = await client.request("start");

    expect(snapshot.status).toBe("in-progress");
    expect(snapshot.player1).toBeTruthy();
    expect(snapshot.player2).toBeTruthy();
    expect(snapshot.google).toBeTruthy();

    await client.close();
  });

  it("assigns distinct roles for two clients", async () => {
    const client1 = new WsTestClient(baseUrl);
    const client2 = new WsTestClient(baseUrl);

    await client1.open();
    await client2.open();

    const role1 = await client1.request("joinGame", { preferredPlayerId: 1 });
    const role2 = await client2.request("joinGame", { preferredPlayerId: 2 });

    expect(role1.playerId).toBe(1);
    expect(role2.playerId).toBe(2);

    await client1.close();
    await client2.close();
  });
});
