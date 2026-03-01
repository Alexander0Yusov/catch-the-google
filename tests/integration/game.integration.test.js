import { describe, expect, it } from "vitest";
import { Game } from "../../game.js";
import { EventEmitter } from "../../observer/EventEmitter.js";

function samePosition(a, b) {
  return a.x === b.x && a.y === b.y;
}

function tryMovePlayer1(game) {
  const before = game.player1.position.clone();
  game.movePlayer1Up();
  if (!samePosition(before, game.player1.position)) return true;
  game.movePlayer1Down();
  if (!samePosition(before, game.player1.position)) return true;
  game.movePlayer1Left();
  if (!samePosition(before, game.player1.position)) return true;
  game.movePlayer1Right();
  if (!samePosition(before, game.player1.position)) return true;
  return false;
}

function movePlayer2AllDirections(game) {
  game.movePlayer2Up();
  game.movePlayer2Down();
  game.movePlayer2Left();
  game.movePlayer2Right();
}

describe("Game integration", () => {
  it("start creates unique units and switches status", async () => {
    const game = new Game(new EventEmitter());
    game.settings = {
      gridSize: { columns: 4, rows: 4 },
      googleJumpInterval: 10000,
    };

    await game.start();

    expect(game.status).toBe("in-progress");

    const p1 = game.player1.position;
    const p2 = game.player2.position;
    const google = game.google.position;

    expect(p1.equal(p2)).toBe(false);
    expect(p1.equal(google)).toBe(false);
    expect(p2.equal(google)).toBe(false);

    await game.stop();
  });

  it("turn order and turn delay are enforced", async () => {
    const game = new Game(new EventEmitter());
    game.settings = {
      gridSize: { columns: 5, rows: 5 },
      googleJumpInterval: 10000,
      turnDelayMs: 200,
      firstTurnPlayerId: 1,
    };

    await game.start();

    const beforeP2 = game.player2.position.clone();
    movePlayer2AllDirections(game);
    expect(game.player2.position.equal(beforeP2)).toBe(true);

    const p1Moved = tryMovePlayer1(game);
    expect(p1Moved).toBe(true);

    const afterP2Attempt = game.player2.position.clone();
    movePlayer2AllDirections(game);
    // p2 не может ходить мгновенно после p1, пока не пройдет turnDelayMs
    expect(game.player2.position.equal(afterP2Attempt)).toBe(true);

    await game.stop();
  });
});
