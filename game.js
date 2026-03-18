// ── Config ────────────────────────────────────────────────────────────────────
// Change this to your Render backend URL after deploying
const BOT_API_URL = "https://YOUR-RENDER-APP.onrender.com";

const LAYERS       = 9;
const NUM_HEXES    = 45;   // (9*10)/2
const TILES_EACH   = 22;   // tiles per player

// ── Colors ─────────────────────────────────────────────────────────────────────
const C = {
  bg:     "#0d0f1a",
  empty:  "#1e2240",
  hover:  "#2e3660",
  p1:     "#e05b5b",
  p2:     "#4caf78",
  hole:   "#090b14",
  border: "#3a4070",
  text:   "#d8daf0",
  gold:   "#f0c040",
};

// ── Board geometry ─────────────────────────────────────────────────────────────
const canvas  = document.getElementById("board");
const ctx     = canvas.getContext("2d");
const W = canvas.width, H = canvas.height;
const HEX_R   = 30;   // circle radius

function hexPositions() {
  const positions = [];
  const totalRows = LAYERS;
  const startY = 44;
  for (let r = 0; r < totalRows; r++) {
    const cols   = r + 1;
    const rowW   = cols * HEX_R * 2 + (cols - 1) * 4;
    const startX = (W - rowW) / 2 + HEX_R;
    const y      = startY + r * (HEX_R * 2 + 4);
    for (let c = 0; c < cols; c++) {
      positions.push({ x: startX + c * (HEX_R * 2 + 4), y });
    }
  }
  return positions;
}
const POS = hexPositions();

// ── Game State ─────────────────────────────────────────────────────────────────
let board        = [];   // [{player,value}] length 45
let tilesPlaced  = 0;
let humanPlayer  = 1;    // 1 or 2, set by dropdown
let modelName    = "v2";
let hoveredHex   = -1;
let gameOver     = false;
let waitingForBot = false;

function currentPlayer() { return (tilesPlaced % 2 === 0) ? 1 : 2; }
function currentTileVal() { return Math.floor(tilesPlaced / 2) + 1; }

function initGame() {
  board        = Array.from({ length: NUM_HEXES }, () => ({ player: 0, value: 0 }));
  tilesPlaced  = 0;
  gameOver     = false;
  waitingForBot = false;
  humanPlayer  = parseInt(document.getElementById("playerSelect").value);
  modelName    = document.getElementById("modelSelect").value;
  document.getElementById("scoreBox").style.display = "none";
  document.getElementById("overlay").style.display  = "none";
  render();
  updateSidebar();
  // If bot goes first
  if (currentPlayer() !== humanPlayer) {
    setTimeout(requestBotMove, 300);
  }
}

// ── Rendering ──────────────────────────────────────────────────────────────────
function render() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  POS.forEach(({ x, y }, i) => {
    const cell = board[i];
    let fill;
    if (cell.player === 0) {
      fill = (i === hoveredHex && !waitingForBot && !gameOver) ? C.hover : C.empty;
    } else if (cell.player === 1) {
      fill = C.p1;
    } else {
      fill = C.p2;
    }

    // Check if this will be the black hole (only 1 empty left)
    const emptyCells = board.filter(c => c.player === 0).length;
    const isLastEmpty = (cell.player === 0 && emptyCells === 1);
    if (isLastEmpty) fill = C.hole;

    // Circle
    ctx.beginPath();
    ctx.arc(x, y, HEX_R, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Label
    if (cell.value > 0) {
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = `bold ${HEX_R * 0.7}px 'Segoe UI', sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(cell.value, x, y);
    }
    if (isLastEmpty) {
      ctx.fillStyle = C.gold;
      ctx.font = `bold ${HEX_R * 0.65}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("⚫", x, y);
    }
  });
}

// ── Sidebar ────────────────────────────────────────────────────────────────────
function updateSidebar() {
  const cp = currentPlayer();
  const tv = currentTileVal();
  const statusEl = document.getElementById("status");
  const p1ValEl  = document.getElementById("p1TileVal");
  const p2ValEl  = document.getElementById("p2TileVal");

  if (gameOver) return;

  p1ValEl.textContent = cp === 1 ? tv : "—";
  p2ValEl.textContent = cp === 2 ? tv : "—";

  if (cp === humanPlayer) {
    statusEl.innerHTML = `<b>Your turn</b> — place tile <b style="color:${humanPlayer===1?C.p1:C.p2}">${tv}</b> on any empty hex.`;
  } else {
    statusEl.innerHTML = waitingForBot
      ? `<b>AI is thinking…</b>`
      : `<b>AI's turn</b> — waiting…`;
  }
}

// ── Bot request ────────────────────────────────────────────────────────────────
async function requestBotMove() {
  waitingForBot = true;
  updateSidebar();

  const body = {
    board: board.map(c => [c.player, c.value]),
    tiles_placed: tilesPlaced,
    model: modelName,
  };

  let action;
  try {
    const res  = await fetch(`${BOT_API_URL}/api/bot_move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    action = data.action;
  } catch (err) {
    console.error("Bot API error:", err);
    // Fallback: pick random valid move
    const valid = board.map((c, i) => c.player === 0 ? i : -1).filter(i => i >= 0);
    action = valid[Math.floor(Math.random() * valid.length)];
  }

  applyMove(action);
  waitingForBot = false;
  render();
  updateSidebar();
}

// ── Move logic ─────────────────────────────────────────────────────────────────
function applyMove(idx) {
  if (board[idx].player !== 0) return;
  const cp = currentPlayer();
  const tv = currentTileVal();
  board[idx] = { player: cp, value: tv };
  tilesPlaced++;

  const empty = board.filter(c => c.player === 0).length;
  if (empty === 1) {
    endGame();
  }
}

function endGame() {
  gameOver = true;
  const { winner, rings } = scoreBoard();
  showResult(winner, rings);
}

// ── Scoring ────────────────────────────────────────────────────────────────────
function buildAdj() {
  const adj = Array.from({ length: NUM_HEXES }, () => []);
  function idx(r, c) { return r * (r + 1) / 2 + c; }
  for (let r = 0; r < LAYERS; r++) {
    for (let c = 0; c <= r; c++) {
      const i = idx(r, c);
      if (c + 1 <= r) { const j = idx(r, c + 1); adj[i].push(j); adj[j].push(i); }
      if (r + 1 < LAYERS) {
        const j1 = idx(r + 1, c); const j2 = idx(r + 1, c + 1);
        adj[i].push(j1); adj[j1].push(i);
        adj[i].push(j2); adj[j2].push(i);
      }
    }
  }
  return adj.map(a => [...new Set(a)]);
}
const ADJ = buildAdj();

function scoreBoard() {
  const hole = board.findIndex(c => c.player === 0);
  const visited = new Array(NUM_HEXES).fill(false);
  visited[hole] = true;
  const queue = [[hole, 0]];
  const rings = {};
  let qi = 0;
  while (qi < queue.length) {
    const [node, dist] = queue[qi++];
    if (dist > 0) {
      if (!rings[dist]) rings[dist] = [0, 0];
      const { player, value } = board[node];
      rings[dist][player - 1] += value;
    }
    for (const nb of ADJ[node]) {
      if (!visited[nb]) { visited[nb] = true; queue.push([nb, dist + 1]); }
    }
  }
  let winner = 0;
  for (const ring of Object.keys(rings).map(Number).sort((a, b) => a - b)) {
    const [p1, p2] = rings[ring];
    if (p1 < p2) { winner = 1; break; }
    if (p2 < p1) { winner = 2; break; }
  }
  return { winner, rings };
}

// ── Result Modal ───────────────────────────────────────────────────────────────
function showResult(winner, rings) {
  const overlay   = document.getElementById("overlay");
  const title     = document.getElementById("modalTitle");
  const body      = document.getElementById("modalBody");
  const scoreBox  = document.getElementById("scoreBox");
  const scoreDetail = document.getElementById("scoreDetail");

  const humanWon = winner === humanPlayer;
  title.textContent  = winner === 0 ? "Draw!" : humanWon ? "You Win! 🎉" : "AI Wins 🤖";
  title.style.color  = winner === 0 ? "#aaa" : humanWon ? C.p2 : C.p1;
  body.textContent   = winner === 0
    ? "All rings were tied."
    : humanWon
      ? "Your tiles were closer to the Black Hole."
      : "The AI placed lower tiles near the Black Hole.";

  // Score breakdown
  let detail = "";
  for (const ring of Object.keys(rings).map(Number).sort((a, b) => a - b)) {
    const [p1, p2] = rings[ring];
    detail += `Ring ${ring}: You ${humanPlayer===1?p1:p2} | AI ${humanPlayer===1?p2:p1}<br>`;
  }
  scoreDetail.innerHTML = detail;
  scoreBox.style.display = "block";

  overlay.style.display = "flex";
  document.getElementById("status").textContent =
    winner === 0 ? "Draw!" : `${winner === humanPlayer ? "You" : "AI"} wins!`;
  render();
}

// ── Input ──────────────────────────────────────────────────────────────────────
canvas.addEventListener("mousemove", e => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  let found = -1;
  POS.forEach(({ x, y }, i) => {
    if (Math.hypot(mx - x, my - y) < HEX_R) found = i;
  });
  if (found !== hoveredHex) { hoveredHex = found; render(); }
});

canvas.addEventListener("click", e => {
  if (gameOver || waitingForBot || currentPlayer() !== humanPlayer) return;
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  POS.forEach(({ x, y }, i) => {
    if (Math.hypot(mx - x, my - y) < HEX_R && board[i].player === 0) {
      applyMove(i);
      render();
      updateSidebar();
      if (!gameOver && currentPlayer() !== humanPlayer) {
        setTimeout(requestBotMove, 200);
      }
    }
  });
});

document.getElementById("newGameBtn").addEventListener("click", initGame);
document.getElementById("modalBtn").addEventListener("click", initGame);

// ── Start ──────────────────────────────────────────────────────────────────────
initGame();
