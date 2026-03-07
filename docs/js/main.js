(function () {
  const gridSizeSelect = document.getElementById("grid-size-select");
  const pointsToWinSelect = document.getElementById("points-to-win-select");
  const timeSelect = document.getElementById("time-select");
  const playerRoleSelect = document.getElementById("player-role-select");
  const startButton = document.getElementById("start-game-button");
  const resetButton = document.getElementById("reset-game-button");
  const stopButton = document.getElementById("stop-game-button");
  const catchValue = document.getElementById("catch-value");
  const enemyValue = document.getElementById("enemy-value");
  const timeValue = document.getElementById("time-value");
  const statusBar = document.getElementById("status-bar");
  const gridBody = document.getElementById("grid-body");

  const DEFAULT_STATE = {
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
    myPlayerId: 1,
  };

  const state = { ...DEFAULT_STATE };
  const pending = new Map();

  // Required endpoint.
  const socket = io("https://catch-the-google-backend.onrender.com", {
    transports: ["websocket"],
  });

  socket.on("response", (message) => {
    if (!message || message.type !== "response") return;
    const req = pending.get(message.requestId);
    if (!req) return;
    pending.delete(message.requestId);
    if (message.error) {
      req.reject(new Error(message.error));
      return;
    }
    req.resolve(message.result);
  });

  socket.on("event", (message) => {
    if (message?.eventName === "change" && message?.data?.state) {
      Object.assign(state, message.data.state);
      render();
    }
  });

  socket.on("game-started", () => {
    statusBar.textContent = "Status: in-progress";
  });

  socket.on("google-jumped", () => {
    document.body.classList.remove("google-jumped");
    // Restart css animation hook.
    void document.body.offsetWidth;
    document.body.classList.add("google-jumped");
  });

  socket.on("google-caught", () => {
    render();
  });

  socket.on("game-finished", () => {
    statusBar.textContent = "Status: finished";
    render();
  });

  function emitRequest(procedure, payload) {
    const requestId =
      (globalThis.crypto && globalThis.crypto.randomUUID && globalThis.crypto.randomUUID()) ||
      `${Date.now()}-${Math.random()}`;

    const request = {
      type: "request",
      requestId,
      procedure,
      payload: payload || null,
    };

    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject });
      socket.emit("request", request);
    });
  }

  function toSettings() {
    const [columns, rows] = gridSizeSelect.value.split("x").map(Number);
    return {
      gridSize: { columns, rows },
      pointsToWin: Number(pointsToWinSelect.value),
      gameDurationMs: Number(timeSelect.value),
    };
  }

  function pad(v) {
    return String(v).padStart(2, "0");
  }

  function formatMs(ms) {
    const totalSeconds = Math.max(Math.floor((ms || 0) / 1000), 0);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${pad(minutes)}:${pad(seconds)}`;
  }

  function renderBoard() {
    gridBody.innerHTML = "";
    const rows = state.settings.gridSize.rows;
    const columns = state.settings.gridSize.columns;

    for (let y = 1; y <= rows; y += 1) {
      const tr = document.createElement("tr");

      for (let x = 1; x <= columns; x += 1) {
        const td = document.createElement("td");
        td.className = "cell";

        if (state.google && state.google.position.x === x && state.google.position.y === y) {
          const unit = document.createElement("span");
          unit.className = "unit unit-google";
          unit.textContent = "G";
          td.appendChild(unit);
        }

        if (state.player1 && state.player1.position.x === x && state.player1.position.y === y) {
          const unit = document.createElement("span");
          unit.className = "unit unit-player1";
          unit.textContent = "1";
          td.appendChild(unit);
        }

        if (state.player2 && state.player2.position.x === x && state.player2.position.y === y) {
          const unit = document.createElement("span");
          unit.className = "unit unit-player2";
          unit.textContent = "2";
          td.appendChild(unit);
        }

        tr.appendChild(td);
      }

      gridBody.appendChild(tr);
    }
  }

  function renderStats() {
    const myPlayerId = state.myPlayerId || Number(playerRoleSelect.value) || 1;
    const enemyPlayerId = myPlayerId === 1 ? 2 : 1;
    catchValue.textContent = String((state.score && state.score[myPlayerId] && state.score[myPlayerId].points) || 0);
    enemyValue.textContent = String((state.score && state.score[enemyPlayerId] && state.score[enemyPlayerId].points) || 0);
    timeValue.textContent = formatMs(
      state.remainingTimeMs != null ? state.remainingTimeMs : state.settings.gameDurationMs
    );
    statusBar.textContent = `Status: ${state.status}`;
  }

  function render() {
    renderBoard();
    renderStats();
  }

  async function joinRole() {
    const preferredPlayerId = Number(playerRoleSelect.value);
    const result = await emitRequest("joinGame", { preferredPlayerId });
    state.myPlayerId = result.playerId;
  }

  async function applySettings() {
    const snapshot = await emitRequest("setSettings", toSettings());
    Object.assign(state, snapshot || {});
    render();
  }

  async function restartGame() {
    await emitRequest("stop");
    await applySettings();
    const snapshot = await emitRequest("start");
    Object.assign(state, snapshot || {});
    render();
  }

  async function stopGame() {
    const snapshot = await emitRequest("stop");
    Object.assign(state, snapshot || {});
    render();
  }

  async function moveByKey(code) {
    if (state.status !== "in-progress") return;
    if (code === "ArrowUp") await emitRequest("movePlayer1Up");
    if (code === "ArrowDown") await emitRequest("movePlayer1Down");
    if (code === "ArrowLeft") await emitRequest("movePlayer1Left");
    if (code === "ArrowRight") await emitRequest("movePlayer1Right");
    if (code === "KeyW") await emitRequest("movePlayer2Up");
    if (code === "KeyS") await emitRequest("movePlayer2Down");
    if (code === "KeyA") await emitRequest("movePlayer2Left");
    if (code === "KeyD") await emitRequest("movePlayer2Right");
  }

  async function bootstrap() {
    socket.on("connect", async () => {
      await joinRole();
      await applySettings();
      const snapshot = await emitRequest("getSnapshot");
      Object.assign(state, snapshot || {});
      render();
    });

    playerRoleSelect.addEventListener("change", async () => {
      await joinRole();
      render();
    });

    gridSizeSelect.addEventListener("change", applySettings);
    pointsToWinSelect.addEventListener("change", applySettings);
    timeSelect.addEventListener("change", applySettings);

    startButton.addEventListener("click", restartGame);
    resetButton.addEventListener("click", restartGame);
    stopButton.addEventListener("click", stopGame);

    window.addEventListener("keydown", async (event) => {
      const keys = [
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
      ];
      if (!keys.includes(event.code)) return;
      event.preventDefault();
      await moveByKey(event.code);
    });
  }

  bootstrap().catch((error) => {
    statusBar.textContent = `Status: error - ${error.message}`;
    // eslint-disable-next-line no-console
    console.error(error);
  });
})();
