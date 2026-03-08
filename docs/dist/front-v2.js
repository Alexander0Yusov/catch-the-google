// @ts-nocheck
import { GameRemoteProxy as Game } from "./game-remote-proxy.js";
import { EventEmitter } from "./observer/EventEmitter.js";
const gridSizeSelect = document.querySelector("#grid-size-select");
const pointsToWinSelect = document.querySelector("#points-to-win-select");
const timeSelect = document.querySelector("#time-select");
const playerRoleSelect = document.querySelector("#player-role-select");
const startButton = document.querySelector("#start-game-button");
const resetButton = document.querySelector("#reset-game-button");
const stopButton = document.querySelector("#stop-game-button");
const soundToggle = document.querySelector("#sound-toggle");
const catchValue = document.querySelector("#catch-value");
const enemyValue = document.querySelector("#enemy-value");
const timeValue = document.querySelector("#time-value");
const gridBody = document.querySelector("#grid-body");
const statusBar = document.querySelector("#status-bar");
const winModal = document.querySelector("#win-modal");
const loseModal = document.querySelector("#lose-modal");
const playAgainButtons = document.querySelectorAll("#play-again-win, #play-again-lose");
const eventEmitter = new EventEmitter();
const game = new Game(eventEmitter);
let timerIntervalId;
let ambientAudio = null;
let isConnected = false;
let localRemainingTimeMs = null;
let timerStopInProgress = false;
const toggleGameControls = (disabled) => {
    gridSizeSelect.disabled = disabled;
    pointsToWinSelect.disabled = disabled;
    timeSelect.disabled = disabled;
    playerRoleSelect.disabled = disabled;
    startButton.disabled = disabled;
    resetButton.disabled = false;
    stopButton.disabled = false;
};
const playerIcons = {
    google: "./img/icons/googleIcon.svg",
    player1: "./img/icons/man01.svg",
    player2: "./img/icons/man02.svg",
};
/**
 * Аудио-стратегия:
 * 1) Пытаемся проиграть локальный файл ./assets/audio/get-low.mp3 на тихой громкости.
 * 2) Если файл недоступен/заблокирован, fallback на синтезированный ambient tone.
 *
 * Это безопасно для деплоя: сайт не ломается без аудиофайла.
 */
const createAmbientAudio = () => {
    const audio = new Audio("./assets/audio/get-low.mp3");
    audio.loop = true;
    audio.volume = 0.08;
    audio.preload = "none";
    const context = new AudioContext();
    const gain = context.createGain();
    gain.gain.value = 0.02;
    gain.connect(context.destination);
    let oscillator = null;
    let noteIndex = 0;
    let intervalId = null;
    const notes = [220, 246.94, 261.63, 293.66];
    const start = async () => {
        let fileStarted = false;
        try {
            await audio.play();
            fileStarted = true;
        }
        catch {
            fileStarted = false;
        }
        if (fileStarted) {
            return;
        }
        if (context.state === "suspended") {
            await context.resume();
        }
        if (!oscillator) {
            oscillator = context.createOscillator();
            oscillator.type = "sine";
            oscillator.frequency.value = notes[noteIndex];
            oscillator.connect(gain);
            oscillator.start();
        }
        if (!intervalId) {
            intervalId = setInterval(() => {
                noteIndex = (noteIndex + 1) % notes.length;
                if (oscillator) {
                    oscillator.frequency.setTargetAtTime(notes[noteIndex], context.currentTime, 0.35);
                }
            }, 2000);
        }
    };
    const stop = () => {
        audio.pause();
        audio.currentTime = 0;
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
        if (oscillator) {
            oscillator.stop();
            oscillator.disconnect();
            oscillator = null;
        }
    };
    return { start, stop };
};
const toSettings = () => {
    const [columns, rows] = gridSizeSelect.value.split("x").map(Number);
    return {
        gridSize: {
            columns,
            rows,
        },
        pointsToWin: Number(pointsToWinSelect.value),
        gameDurationMs: Number(timeSelect.value),
    };
};
const pad = (value) => String(value).padStart(2, "0");
const formatMs = (ms) => {
    const totalSeconds = Math.max(Math.floor(ms / 1000), 0);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${pad(minutes)}:${pad(seconds)}`;
};
const hideModals = () => {
    winModal.classList.add("hidden");
    loseModal.classList.add("hidden");
};
const renderBoard = (state) => {
    gridBody.innerHTML = "";
    const rows = state.settings.gridSize.rows;
    const columns = state.settings.gridSize.columns;
    const showEntities = state.status !== "pending" && state.status !== "stopped";
    for (let y = 1; y <= rows; y += 1) {
        const trElement = document.createElement("tr");
        for (let x = 1; x <= columns; x += 1) {
            const tdElement = document.createElement("td");
            tdElement.className = "cell";
            if (showEntities && state.google?.position.x === x && state.google?.position.y === y) {
                const image = document.createElement("img");
                image.src = playerIcons.google;
                image.alt = "google";
                tdElement.appendChild(image);
            }
            if (showEntities && state.player1?.position.x === x && state.player1?.position.y === y) {
                const marker = document.createElement("span");
                marker.className = "player-marker player1";
                marker.textContent = "1";
                tdElement.appendChild(marker);
                const image = document.createElement("img");
                image.src = playerIcons.player1;
                image.alt = "player1";
                tdElement.appendChild(image);
            }
            if (showEntities && state.player2?.position.x === x && state.player2?.position.y === y) {
                const marker = document.createElement("span");
                marker.className = "player-marker player2";
                marker.textContent = "2";
                tdElement.appendChild(marker);
                const image = document.createElement("img");
                image.src = playerIcons.player2;
                image.alt = "player2";
                tdElement.appendChild(image);
            }
            trElement.appendChild(tdElement);
        }
        gridBody.appendChild(trElement);
    }
};
const updateScoreAndStatus = (state) => {
    const myPlayerId = state.myPlayerId || Number(playerRoleSelect.value) || 1;
    const enemyPlayerId = myPlayerId === 1 ? 2 : 1;
    catchValue.textContent = state.score?.[myPlayerId]?.points ?? 0;
    enemyValue.textContent = state.score?.[enemyPlayerId]?.points ?? 0;
    statusBar.textContent = `Status: ${state.status}`;
    const displayMs = localRemainingTimeMs ?? state.remainingTimeMs ?? state.settings.gameDurationMs;
    timeValue.textContent = formatMs(displayMs);
};
const createPreviewState = () => {
    const settings = toSettings();
    return {
        ...game.state,
        status: "pending",
        settings: {
            ...game.state.settings,
            ...settings,
        },
        score: { 1: { points: 0 }, 2: { points: 0 } },
        player1: { id: 1, position: { x: 1, y: 1 }, points: 0 },
        player2: {
            id: 2,
            position: { x: settings.gridSize.columns, y: settings.gridSize.rows },
            points: 0,
        },
        google: {
            position: {
                x: Math.min(2, settings.gridSize.columns),
                y: Math.min(2, settings.gridSize.rows),
            },
        },
        remainingTimeMs: settings.gameDurationMs,
    };
};
const renderPreview = () => {
    const preview = createPreviewState();
    game.state = preview;
    renderBoard(preview);
    updateScoreAndStatus(preview);
    statusBar.textContent = isConnected ? `Status: ${preview.status}` : "Status: pending (offline preview)";
};
const ensureConnected = async () => {
    if (isConnected) {
        return true;
    }
    try {
        await game.connect();
        await game.joinGame(Number(playerRoleSelect.value));
        isConnected = true;
        return true;
    }
    catch (error) {
        isConnected = false;
        const message = error instanceof Error ? error.message : "websocket error";
        statusBar.textContent = `Status: error - ${message}`;
        return false;
    }
};
const render = async () => {
    const state = await game.getSnapshot();
    renderBoard(state);
    updateScoreAndStatus(state);
};
const startTimer = () => {
    clearInterval(timerIntervalId);
    if (localRemainingTimeMs == null) {
        localRemainingTimeMs = game.state.settings?.gameDurationMs ?? 0;
    }
    timerIntervalId = setInterval(() => {
        if (game.state.status !== "in-progress") {
            return;
        }
        localRemainingTimeMs = Math.max((localRemainingTimeMs ?? 0) - 1000, 0);
        game.state.remainingTimeMs = localRemainingTimeMs;
        timeValue.textContent = formatMs(localRemainingTimeMs);
        if (localRemainingTimeMs > 0 || timerStopInProgress) {
            return;
        }
        timerStopInProgress = true;
        clearInterval(timerIntervalId);
        stopGame(true)
            .then(() => {
            showFinishModal(game.state);
        })
            .finally(() => {
            timerStopInProgress = false;
        });
    }, 1000);
};
const showFinishModal = (state) => {
    hideModals();
    const myPlayerId = state.myPlayerId || Number(playerRoleSelect.value) || 1;
    const p1 = state.score?.[1]?.points ?? 0;
    const p2 = state.score?.[2]?.points ?? 0;
    if (p1 === p2) {
        loseModal.classList.remove("hidden");
        return;
    }
    const winnerId = p1 > p2 ? 1 : 2;
    if (winnerId === myPlayerId) {
        winModal.classList.remove("hidden");
    }
    else {
        loseModal.classList.remove("hidden");
    }
};
const applySettings = async () => {
    if (!isConnected) {
        localRemainingTimeMs = Number(timeSelect.value);
        renderPreview();
        return;
    }
    await game.setSettings(toSettings());
    if (game.state.status !== "in-progress") {
        localRemainingTimeMs = game.state.settings?.gameDurationMs ?? null;
    }
    await render();
};
const restartGame = async () => {
    const connected = await ensureConnected();
    if (!connected) {
        return;
    }
    hideModals();
    // Явно останавливаем текущий матч перед новым стартом,
    // чтобы кнопка START GAME всегда запускала новый раунд.
    await game.stop();
    await applySettings();
    await game.start();
    localRemainingTimeMs = game.state.settings?.gameDurationMs ?? 0;
    game.state.remainingTimeMs = localRemainingTimeMs;
    await render();
    startTimer();
};
const stopGame = async (keepCurrentTime = false) => {
    const connected = await ensureConnected();
    if (!connected) {
        return;
    }
    await game.stop();
    clearInterval(timerIntervalId);
    if (!keepCurrentTime) {
        localRemainingTimeMs = game.state.settings?.gameDurationMs ?? null;
    }
    await render();
};
const resetToDefaults = async () => {
    hideModals();
    pointsToWinSelect.value = "10";
    timeSelect.value = "120000";
    localRemainingTimeMs = 120000;
    const connected = await ensureConnected();
    if (!connected) {
        renderPreview();
        return;
    }
    await game.setSettings(toSettings());
    await game.stop();
    clearInterval(timerIntervalId);
    await render();
};
const moveByKeys = async (code) => {
    const connected = await ensureConnected();
    if (!connected) {
        return;
    }
    const selectedPlayerId = game.state.myPlayerId ?? Number(playerRoleSelect.value) ?? 0;
    if (selectedPlayerId !== 1 && selectedPlayerId !== 2) {
        return;
    }
    const arrowPlayerId = selectedPlayerId;
    const wasdPlayerId = selectedPlayerId === 1 ? 2 : 1;
    if (code === "ArrowUp")
        await (arrowPlayerId === 1 ? game.movePlayer1Up() : game.movePlayer2Up());
    if (code === "ArrowDown")
        await (arrowPlayerId === 1 ? game.movePlayer1Down() : game.movePlayer2Down());
    if (code === "ArrowLeft")
        await (arrowPlayerId === 1 ? game.movePlayer1Left() : game.movePlayer2Left());
    if (code === "ArrowRight")
        await (arrowPlayerId === 1 ? game.movePlayer1Right() : game.movePlayer2Right());
    if (code === "KeyW")
        await (wasdPlayerId === 1 ? game.movePlayer1Up() : game.movePlayer2Up());
    if (code === "KeyS")
        await (wasdPlayerId === 1 ? game.movePlayer1Down() : game.movePlayer2Down());
    if (code === "KeyA")
        await (wasdPlayerId === 1 ? game.movePlayer1Left() : game.movePlayer2Left());
    if (code === "KeyD")
        await (wasdPlayerId === 1 ? game.movePlayer1Right() : game.movePlayer2Right());
};
const bootstrap = async () => {
    ambientAudio = createAmbientAudio();
    soundToggle.addEventListener("click", () => {
        soundToggle.classList.toggle("on");
        if (soundToggle.classList.contains("on")) {
            ambientAudio.start();
        }
        else {
            ambientAudio.stop();
        }
    });
    gridSizeSelect.addEventListener("change", async () => {
        await applySettings();
    });
    pointsToWinSelect.addEventListener("change", async () => {
        await applySettings();
    });
    timeSelect.addEventListener("change", async () => {
        await applySettings();
    });
    playerRoleSelect.addEventListener("change", async () => {
        const connected = await ensureConnected();
        if (!connected) {
            renderPreview();
            return;
        }
        await game.joinGame(Number(playerRoleSelect.value));
        await render();
    });
    playAgainButtons.forEach((button) => {
        button.addEventListener("click", async () => {
            await restartGame();
        });
    });
    window.addEventListener("keydown", async (event) => {
        const movementKeys = [
            "ArrowUp",
            "ArrowDown",
            "ArrowLeft",
            "ArrowRight",
            "KeyW",
            "KeyA",
            "KeyS",
            "KeyD",
        ];
        if (!movementKeys.includes(event.code)) {
            return;
        }
        // Блокируем нативный скролл страницы во время управления.
        event.preventDefault();
        if (game.state.status !== "in-progress") {
            return;
        }
        await moveByKeys(event.code);
    });
    eventEmitter.on("change", (state) => {
        toggleGameControls(state.status === "in-progress");
        if (state.status === "finished") {
            clearInterval(timerIntervalId);
        }
        if (state.status === "pending") {
            localRemainingTimeMs = state.settings?.gameDurationMs ?? localRemainingTimeMs;
        }
        renderBoard(state);
        updateScoreAndStatus(state);
    });
    eventEmitter.on("finished", async () => {
        await render();
        showFinishModal(game.state);
    });
    renderPreview();
    toggleGameControls(false);
    const connected = await ensureConnected();
    if (connected) {
        await applySettings();
        await render();
    }
    startButton.addEventListener("click", async () => {
        await restartGame();
    });
    resetButton.addEventListener("click", async () => {
        await resetToDefaults();
    });
    stopButton.addEventListener("click", async () => {
        await stopGame();
    });
};
bootstrap().catch((error) => {
    // Критичный лог для портфолио: если WebSocket недоступен,
    // в браузере сразу видно причину, а не "пустой" экран.
    // eslint-disable-next-line no-console
    console.error("Ошибка запуска игры:", error);
    statusBar.textContent = `Status: error - ${error.message}`;
});




