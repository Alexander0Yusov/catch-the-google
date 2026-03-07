const isLocalhost = window.location.hostname.includes("localhost");

window.GAME_WS_URL = isLocalhost
  ? "http://localhost:3001"
  : "https://catch-the-google-backend.onrender.com";
