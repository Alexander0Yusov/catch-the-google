import { GameRemoteProxy as Game } from "./game-remote-proxy.js";
import { EventEmitter } from "./observer/EventEmitter.js";

const gridSizeSelect = document.querySelector("#grid-size-select");
const pointsToWinSelect = document.querySelector("#points-to-win-select");
const timeSelect = document.querySelector("#time-select");
const playerRoleSelect = document.querySelector("#player-role-select");
const startButton = document.querySelector("#start-game-button");
const resetButton = document.querySelector("#reset-game-button");
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

const playerIcons = {
  google: "./img/icons/googleIcon.svg",
  player1: "./img/icons/man01.svg",
  player2: "./img/icons/man02.svg",
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

  for (let y = 1; y <= rows; y += 1) {
    const trElement = document.createElement("tr");

    for (let x = 1; x <= columns; x += 1) {
      const tdElement = document.createElement("td");
      tdElement.className = "cell";

      if (state.google?.position.x === x && state.google?.position.y === y) {
        const image = document.createElement("img");
        image.src = playerIcons.google;
        image.alt = "google";
        tdElement.appendChild(image);
      }

      if (state.player1?.position.x === x && state.player1?.position.y === y) {
        const image = document.createElement("img");
        image.src = playerIcons.player1;
        image.alt = "player1";
        tdElement.appendChild(image);
      }

      if (state.player2?.position.x === x && state.player2?.position.y === y) {
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
  timeValue.textContent = formatMs(state.remainingTimeMs ?? state.settings.gameDurationMs);
};

const render = async () => {
  const state = await game.getSnapshot();
  renderBoard(state);
  updateScoreAndStatus(state);
};

const startTimer = () => {
  clearInterval(timerIntervalId);

  timerIntervalId = setInterval(() => {
    if (game.state.status !== "in-progress") {
      return;
    }

    game.state.remainingTimeMs = Math.max((game.state.remainingTimeMs || 0) - 1000, 0);
    timeValue.textContent = formatMs(game.state.remainingTimeMs);
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
  } else {
    loseModal.classList.remove("hidden");
  }
};

const applySettings = async () => {
  await game.setSettings(toSettings());
  await render();
};

const restartGame = async () => {
  hideModals();
  // Явно останавливаем текущий матч перед новым стартом,
  // чтобы кнопка START GAME всегда запускала новый раунд.
  await game.stop();
  await applySettings();
  await game.start();
  await render();
  startTimer();
};

const moveByKeys = async (code) => {
  // Стрелки всегда двигают Player 1.
  if (code === "ArrowUp") await game.movePlayer1Up();
  if (code === "ArrowDown") await game.movePlayer1Down();
  if (code === "ArrowLeft") await game.movePlayer1Left();
  if (code === "ArrowRight") await game.movePlayer1Right();

  // WASD всегда двигают Player 2.
  if (code === "KeyW") await game.movePlayer2Up();
  if (code === "KeyS") await game.movePlayer2Down();
  if (code === "KeyA") await game.movePlayer2Left();
  if (code === "KeyD") await game.movePlayer2Right();
};

const bootstrap = async () => {
  soundToggle.addEventListener("click", () => {
    soundToggle.classList.toggle("on");
  });

  gridSizeSelect.addEventListener("change", applySettings);
  pointsToWinSelect.addEventListener("change", applySettings);
  timeSelect.addEventListener("change", applySettings);

  playerRoleSelect.addEventListener("change", async () => {
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
    renderBoard(state);
    updateScoreAndStatus(state);
  });

  eventEmitter.on("finished", async () => {
    await render();
    showFinishModal(game.state);
  });

  await game.connect();
  await game.joinGame(Number(playerRoleSelect.value));
  await applySettings();
  await render();

  startButton.addEventListener("click", async () => {
    await restartGame();
  });

  resetButton.addEventListener("click", async () => {
    await restartGame();
  });
};

bootstrap().catch((error) => {
  // Критичный лог для портфолио: если WebSocket недоступен,
  // в браузере сразу видно причину, а не "пустой" экран.
  // eslint-disable-next-line no-console
  console.error("Ошибка запуска игры:", error);
  statusBar.textContent = `Status: error - ${error.message}`;
});

