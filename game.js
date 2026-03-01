// @ts-nocheck
import { Google } from "./domain/Google.js";
import { NumberUtil } from "./domain/NumberUtil.js";
import { Player } from "./domain/Player.js";
import { Position } from "./domain/Position.js";
export class Game {
    #status = "pending";
    #settings = {
        pointsToWin: 10,
        gridSize: {
            columns: 4,
            rows: 4,
        },
        googleJumpInterval: 2000,
        gameDurationMs: 120000,
        firstTurnPlayerId: 1,
        turnDelayMs: 250,
    };
    #player1;
    #player2;
    #google;
    #score = {
        1: { points: 0 },
        2: { points: 0 },
    };
    #googleSetIntervalId;
    #finishTimeoutId;
    #startedAt;
    #sessionId;
    #currentTurnPlayerId = 1;
    #lastTurnAtMs = 0;
    constructor(eventEmitter) {
        this.eventEmitter = eventEmitter;
    }
    set settings(settings) {
        this.#settings = { ...this.#settings, ...settings };
        this.#settings.gridSize = settings.gridSize
            ? { ...this.#settings.gridSize, ...settings.gridSize }
            : this.#settings.gridSize;
    }
    get settings() {
        return this.#settings;
    }
    set score(score) {
        this.#score = score;
    }
    get score() {
        return this.#score;
    }
    get status() {
        return this.#status;
    }
    get player1() {
        return this.#player1;
    }
    get player2() {
        return this.#player2;
    }
    get google() {
        return this.#google;
    }
    async setSettings(settings) {
        this.settings = settings;
        // Если настройки меняются во время матча, перезапускаем раунд,
        // чтобы новое поле/таймер сразу начали работать консистентно.
        if (this.#status === "in-progress") {
            this.#validateGridSize();
            this.#resetScore();
            this.#createUnits();
            this.#startedAt = Date.now();
            this.#runGoogleJumpInterval();
            this.#runFinishTimeout(this.#settings.gameDurationMs);
            this.#resetTurnFlow();
        }
        this.#emitChange();
        return this.getSnapshot();
    }
    async getSettings() {
        return this.#settings;
    }
    async getStatus() {
        return this.#status;
    }
    async getPlayer1() {
        return this.#player1;
    }
    async getPlayer2() {
        return this.#player2;
    }
    async getGoogle() {
        return this.#google;
    }
    async getScore() {
        return this.#score;
    }
    async getSnapshot() {
        return {
            status: this.#status,
            settings: this.#settings,
            player1: this.#player1,
            player2: this.#player2,
            google: this.#google,
            score: this.#score,
            startedAt: this.#startedAt,
            remainingTimeMs: this.#getRemainingTimeMs(),
            sessionId: this.#sessionId,
            currentTurnPlayerId: this.#currentTurnPlayerId,
        };
    }
    async start() {
        if (this.#status === "in-progress") {
            return this.getSnapshot();
        }
        if (this.#status === "paused") {
            this.#status = "in-progress";
            this.#runGoogleJumpInterval();
            this.#runFinishTimeout(this.#getRemainingTimeMs());
            this.#emitChange();
            return this.getSnapshot();
        }
        this.#validateGridSize();
        this.#resetScore();
        this.#createUnits();
        this.#sessionId = `session-${Date.now()}`;
        this.#status = "in-progress";
        this.#startedAt = Date.now();
        this.#runGoogleJumpInterval();
        this.#runFinishTimeout(this.#settings.gameDurationMs);
        this.#resetTurnFlow();
        this.#emitChange();
        return this.getSnapshot();
    }
    async stop() {
        this.#clearTimers();
        this.#status = "stopped";
        this.#emitChange();
        return this.getSnapshot();
    }
    async finishGame() {
        return this.#finishGame();
    }
    async pause() {
        if (this.#status !== "in-progress") {
            return this.getSnapshot();
        }
        this.#clearTimers();
        this.#status = "paused";
        this.#emitChange();
        return this.getSnapshot();
    }
    async resume() {
        if (this.#status !== "paused") {
            return this.getSnapshot();
        }
        this.#status = "in-progress";
        this.#runGoogleJumpInterval();
        this.#runFinishTimeout(this.#getRemainingTimeMs());
        this.#emitChange();
        return this.getSnapshot();
    }
    movePlayer1Right() {
        this.#movePlayer(this.#player1, this.#player2, { x: 1 });
    }
    movePlayer1Left() {
        this.#movePlayer(this.#player1, this.#player2, { x: -1 });
    }
    movePlayer1Up() {
        this.#movePlayer(this.#player1, this.#player2, { y: -1 });
    }
    movePlayer1Down() {
        this.#movePlayer(this.#player1, this.#player2, { y: 1 });
    }
    movePlayer2Right() {
        this.#movePlayer(this.#player2, this.#player1, { x: 1 });
    }
    movePlayer2Left() {
        this.#movePlayer(this.#player2, this.#player1, { x: -1 });
    }
    movePlayer2Up() {
        this.#movePlayer(this.#player2, this.#player1, { y: -1 });
    }
    movePlayer2Down() {
        this.#movePlayer(this.#player2, this.#player1, { y: 1 });
    }
    #movePlayer(movingPlayer, anotherPlayer, delta) {
        if (this.#status !== "in-progress") {
            return;
        }
        if (!this.#canMoveByTurnRules(movingPlayer.id)) {
            return;
        }
        const isBorder = this.#checkBorders(movingPlayer, delta);
        const isAnotherPlayer = this.#checkOtherPlayer(movingPlayer, anotherPlayer, delta);
        if (isBorder || isAnotherPlayer) {
            return;
        }
        if (delta.x) {
            movingPlayer.position = new Position(movingPlayer.position.x + delta.x, movingPlayer.position.y);
        }
        if (delta.y) {
            movingPlayer.position = new Position(movingPlayer.position.x, movingPlayer.position.y + delta.y);
        }
        this.#checkGoogleCatching(movingPlayer);
        this.#registerTurn(anotherPlayer.id);
        this.#emitChange();
    }
    #checkBorders(player, delta) {
        const newPosition = player.position.clone();
        if (delta.x) {
            newPosition.x += delta.x;
        }
        if (delta.y) {
            newPosition.y += delta.y;
        }
        if (newPosition.x < 1 ||
            newPosition.x > this.#settings.gridSize.columns ||
            newPosition.y < 1 ||
            newPosition.y > this.#settings.gridSize.rows) {
            return true;
        }
        return false;
    }
    #checkOtherPlayer(movingPlayer, anotherPlayer, delta) {
        const newPosition = movingPlayer.position.clone();
        if (delta.x) {
            newPosition.x += delta.x;
        }
        if (delta.y) {
            newPosition.y += delta.y;
        }
        return anotherPlayer.position.equal(newPosition);
    }
    #checkGoogleCatching(player) {
        if (!player.position.equal(this.#google.position)) {
            return;
        }
        this.#score[player.id].points += 1;
        this.eventEmitter.emit("googleCaught", {
            playerId: player.id,
            score: this.#score,
            sessionId: this.#sessionId,
        });
        if (this.#score[player.id].points >= this.#settings.pointsToWin) {
            this.#finishGame(player.id);
            return;
        }
        clearInterval(this.#googleSetIntervalId);
        this.#moveGoogleToRandomPosition({ excludeGoogle: false, emitChange: false });
        this.#runGoogleJumpInterval();
    }
    async #finishGame(winnerId = null) {
        this.#clearTimers();
        this.#status = "finished";
        this.eventEmitter.emit("finished", {
            winnerId,
            score: this.#score,
            sessionId: this.#sessionId,
        });
        this.#emitChange();
        return this.getSnapshot();
    }
    #resetScore() {
        this.#score = {
            1: { points: 0 },
            2: { points: 0 },
        };
    }
    #runGoogleJumpInterval() {
        clearInterval(this.#googleSetIntervalId);
        this.#googleSetIntervalId = setInterval(() => {
            if (this.#status !== "in-progress") {
                return;
            }
            this.#moveGoogleToRandomPosition({ excludeGoogle: false, emitChange: true });
        }, this.#settings.googleJumpInterval);
    }
    #runFinishTimeout(timeoutMs) {
        clearTimeout(this.#finishTimeoutId);
        this.#finishTimeoutId = setTimeout(() => {
            if (this.#status === "in-progress") {
                this.#finishGame(null);
            }
        }, timeoutMs);
    }
    #createUnits() {
        const player1Position = this.#getRandomPosition([]);
        this.#player1 = new Player(1, player1Position);
        const player2Position = this.#getRandomPosition([player1Position]);
        this.#player2 = new Player(2, player2Position);
        this.#moveGoogleToRandomPosition({ excludeGoogle: true, emitChange: false });
    }
    #moveGoogleToRandomPosition({ excludeGoogle = false, emitChange = true }) {
        const excluded = [this.#player1.position, this.#player2.position];
        if (!excludeGoogle && this.#google?.position) {
            excluded.push(this.#google.position);
        }
        // Если свободных клеток для "нового" гугла нет (например 1x3),
        // разрешаем занять прежнюю позицию, чтобы не ломать цикл игры.
        const availableWithExclusion = this.#getAvailablePositions(excluded);
        const finalExcluded = availableWithExclusion.length > 0 ? excluded : [
            this.#player1.position,
            this.#player2.position,
        ];
        this.#google = new Google(this.#getRandomPosition(finalExcluded));
        if (emitChange) {
            this.eventEmitter.emit("unitChangePosition", {
                unit: "google",
                position: this.#google.position,
            });
            this.#emitChange();
        }
    }
    #getRandomPosition(excludedPositions) {
        const availablePositions = this.#getAvailablePositions(excludedPositions);
        if (availablePositions.length === 0) {
            throw new Error("Нет свободных клеток для размещения юнита");
        }
        const randomIndex = NumberUtil.getRandomNumber(availablePositions.length) - 1;
        return availablePositions[randomIndex];
    }
    #getAvailablePositions(excludedPositions) {
        const positions = [];
        for (let x = 1; x <= this.#settings.gridSize.columns; x += 1) {
            for (let y = 1; y <= this.#settings.gridSize.rows; y += 1) {
                const nextPosition = new Position(x, y);
                const isExcluded = excludedPositions.some((position) => position.equal(nextPosition));
                if (!isExcluded) {
                    positions.push(nextPosition);
                }
            }
        }
        return positions;
    }
    #validateGridSize() {
        const totalCells = this.#settings.gridSize.columns * this.#settings.gridSize.rows;
        if (totalCells < 3) {
            throw new Error("Размер поля должен быть минимум 3 клетки");
        }
    }
    #clearTimers() {
        clearInterval(this.#googleSetIntervalId);
        clearTimeout(this.#finishTimeoutId);
    }
    #getRemainingTimeMs() {
        if (!this.#startedAt) {
            return this.#settings.gameDurationMs;
        }
        const elapsed = Date.now() - this.#startedAt;
        return Math.max(this.#settings.gameDurationMs - elapsed, 0);
    }
    #emitChange() {
        this.eventEmitter.emit("change", {
            status: this.#status,
            score: this.#score,
            player1: this.#player1,
            player2: this.#player2,
            google: this.#google,
            settings: this.#settings,
            remainingTimeMs: this.#getRemainingTimeMs(),
            sessionId: this.#sessionId,
            currentTurnPlayerId: this.#currentTurnPlayerId,
        });
    }
    #resetTurnFlow() {
        this.#currentTurnPlayerId = this.#settings.firstTurnPlayerId;
        this.#lastTurnAtMs = 0;
    }
    #canMoveByTurnRules(playerId) {
        if (this.#currentTurnPlayerId !== playerId) {
            return false;
        }
        const elapsedMs = Date.now() - this.#lastTurnAtMs;
        return elapsedMs >= this.#settings.turnDelayMs;
    }
    #registerTurn(nextPlayerId) {
        this.#lastTurnAtMs = Date.now();
        this.#currentTurnPlayerId = nextPlayerId;
    }
}
