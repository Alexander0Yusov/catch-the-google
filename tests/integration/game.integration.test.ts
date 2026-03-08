// @ts-nocheck
/**
 * TEST-CASE FILE
 * Этот файл документирует конкретные проверки для уровня: unit/integration/e2e.
 * Комментарии оставлены намеренно подробно для портфолио-защиты.
 */
import { describe, expect, it } from "vitest";
import { Game } from "../../src/modules/game/domain/entities/game.entity.js";
import { GameStatus } from "../../src/modules/game/domain/enums/game-status.enum.js";
import { Position } from "../../src/modules/game/domain/value-objects/position.value-object.js";

function createGame() {
  const gridSize = { columns: 4, rows: 4 };

  return new Game({
    gridSize,
    player1Start: Position.create(1, 1, gridSize),
    player2Start: Position.create(4, 4, gridSize),
    googleStart: Position.create(2, 2, gridSize),
    settings: {
      pointsToWin: 3,
      googleJumpInterval: 1000,
      gameDurationMs: 30000,
      turnDelayMs: 0,
    },
  });
}

describe("Game integration", () => {
  it("start switches status to in-progress", () => {
    const game = createGame();

    game.start();

    expect(game.getStatus()).toBe(GameStatus.InProgress);
  });

  it("players can move one after another without turn queue", () => {
    const game = createGame();
    game.start();

    game.move(1, "right");
    game.move(2, "left");

    expect(game.getPlayer(1).position.equals(Position.create(2, 1, game.getGridSize()))).toBe(
      true
    );
    expect(game.getPlayer(2).position.equals(Position.create(3, 4, game.getGridSize()))).toBe(
      true
    );
  });

  it("catch awards point and keeps game in-progress before pointsToWin", () => {
    const game = createGame();
    game.start();

    game.setGooglePosition(Position.create(2, 1, game.getGridSize()));
    game.move(1, "right");
    const caught = game.catch(1);

    expect(caught).toBe(true);
    expect(game.getScore()[1].points).toBe(1);
    expect(game.getStatus()).toBe(GameStatus.InProgress);
  });
});
