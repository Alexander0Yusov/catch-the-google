import { expect, test } from "@playwright/test";

test("start game, catch google via socket.io, and update score in DOM", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const win = window as any;
    // Force local backend for E2E instead of production config.js URL.
    win.GAME_WS_URL = "http://localhost:3001";
  });

  await page.goto("http://localhost:3000");
  await page.waitForSelector("#start-game-button");

  const scoreBeforeRaw = await page.locator("#enemy-value").textContent();
  const scoreBefore = Number(scoreBeforeRaw ?? "0");

  await page.click("#start-game-button");

  const result = await page.evaluate(async () => {
    const win = window as any;
    const socketUrl = String(win.GAME_WS_URL || window.location.origin)
      .replace(/^ws:\/\//, "http://")
      .replace(/^wss:\/\//, "https://");
    const socket = win.io(socketUrl, { transports: ["websocket"] });

    await new Promise((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });

    let caughtCount = 0;
    socket.on("google-caught", () => {
      caughtCount += 1;
    });

    const emitRequest = (procedure, payload = null) =>
      new Promise((resolve, reject) => {
        const requestId =
          globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

        const onResponse = (message) => {
          if (message.requestId !== requestId) {
            return;
          }

          socket.off("response", onResponse);

          if (message.error) {
            reject(new Error(message.error));
            return;
          }

          resolve(message.result);
        };

        socket.on("response", onResponse);
        socket.emit("request", {
          type: "request",
          requestId,
          procedure,
          payload,
        });
      });

    await emitRequest("joinGame", { preferredPlayerId: 2 });

    const movePlayer2TowardsGoogle = async () => {
      const snapshot = (await emitRequest("getSnapshot")) as any;
      const p = snapshot.player2?.position;
      const g = snapshot.google?.position;

      if (!p || !g) {
        return;
      }

      if (p.x < g.x) await emitRequest("movePlayer2Right");
      else if (p.x > g.x) await emitRequest("movePlayer2Left");
      else if (p.y < g.y) await emitRequest("movePlayer2Down");
      else if (p.y > g.y) await emitRequest("movePlayer2Up");
      else await emitRequest("movePlayer2Right").catch(() => {});
    };

    const startedAt = Date.now();

    while (Date.now() - startedAt < 15000 && caughtCount < 1) {
      await movePlayer2TowardsGoogle();
      await new Promise((resolve) => setTimeout(resolve, 60));
    }

    socket.disconnect();
    return { caughtCount };
  });

  expect(result.caughtCount).toBeGreaterThan(0);

  await expect
    .poll(async () => {
      const text = await page.locator("#enemy-value").textContent();
      return Number(text ?? "0");
    })
    .toBeGreaterThan(scoreBefore);
});
