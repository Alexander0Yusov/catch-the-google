import { Game } from "../../domain/entities/game.entity.js";

export type GameSnapshotDto = Readonly<{
  status: string;
  settings: {
    pointsToWin: number;
    gridSize: {
      columns: number;
      rows: number;
    };
    googleJumpInterval: number;
    gameDurationMs: number;
  };
  player1: {
    id: 1;
    position: {
      x: number;
      y: number;
    };
  };
  player2: {
    id: 2;
    position: {
      x: number;
      y: number;
    };
  };
  google: {
    position: {
      x: number;
      y: number;
    };
  };
  score: {
    1: { points: number };
    2: { points: number };
  };
  startedAt: number | null;
  remainingTimeMs: number | null;
  sessionId: string | null;
  currentTurnPlayerId: 1 | 2;
}>;

export function gameSnapshotMapper(game: Game): GameSnapshotDto {
  const player1 = game.getPlayer(1);
  const player2 = game.getPlayer(2);
  const google = game.getGooglePosition();
  const gridSize = game.getGridSize();
  const settings = game.getSettings();
  const score = game.getScore();

  return {
    status: game.getStatus(),
    settings: {
      pointsToWin: settings.pointsToWin,
      googleJumpInterval: settings.googleJumpInterval,
      gameDurationMs: settings.gameDurationMs,
      gridSize: {
        columns: gridSize.columns,
        rows: gridSize.rows,
      },
    },
    player1: {
      id: 1,
      position: {
        x: player1.position.x,
        y: player1.position.y,
      },
    },
    player2: {
      id: 2,
      position: {
        x: player2.position.x,
        y: player2.position.y,
      },
    },
    google: {
      position: {
        x: google.x,
        y: google.y,
      },
    },
    score: {
      1: { points: score[1].points },
      2: { points: score[2].points },
    },
    startedAt: null,
    remainingTimeMs: null,
    sessionId: null,
    currentTurnPlayerId: 1,
  };
}
