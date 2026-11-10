'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7986cb', // J - indigo
  '#ffb74d', // L - orange
  '#a1887f', // Tuerca - marrón
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Tuerca (3x3 con hueco)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeBtn = document.getElementById('theme-toggle');

let gridColor, shineColor;

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const style = getComputedStyle(document.documentElement);
  gridColor = style.getPropertyValue('--grid').trim();
  shineColor = style.getPropertyValue('--block-shine').trim();
  themeBtn.textContent = theme === 'light' ? '☀️ Claro' : '🌙 Oscuro';
  // el loop no corre en pausa/game over: repintar explícitamente
  if (current && next) { draw(); drawNext(); }
  else if (idle) drawIdle();
}

function toggleTheme() {
  const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  try { localStorage.setItem('theme', theme); } catch (e) {}
  applyTheme(theme);
}

function initialTheme() {
  let saved = null;
  try { saved = localStorage.getItem('theme'); } catch (e) {}
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * (PIECES.length - 1)) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
  trackCombo(cleared);
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = shineColor;
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
  recordsOnGameOver();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  recordsOnInit();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (recordsKey(e)) return;
  if (e.target === themeBtn && e.code === 'Space') return;
  if (e.code === 'KeyT') { toggleTheme(); return; }
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);
themeBtn.addEventListener('click', () => { toggleTheme(); themeBtn.blur(); });

// ==== Records ====
const RECORDS_KEY = 'tetrisRecords';
const NAME_KEY = 'tetrisLastName';
const TOP_N = 5;
const NAME_MAX = 12;

const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const startTable = document.getElementById('start-table');
const startStats = document.getElementById('start-stats');
const resetBtn = document.getElementById('reset-records-btn');
const resetConfirm = document.getElementById('reset-confirm');
const resetYes = document.getElementById('reset-yes');
const resetNo = document.getElementById('reset-no');
const overlayRecords = document.getElementById('overlay-records');
const recordForm = document.getElementById('record-form');
const recordMsg = document.getElementById('record-msg');
const recordName = document.getElementById('record-name');
const overlayTable = document.getElementById('overlay-table');
const overlayStats = document.getElementById('overlay-stats');

let idle = false;       // true mientras se muestra la pantalla de inicio
let comboRun = 0;       // piezas consecutivas que limpian líneas
let bestComboRun = 0;   // máximo combo de la partida actual
let pendingRecord = null; // { rank } si la partida actual entra al top y no se guardó

function defaultRecords() {
  return { top: [], bestCombo: 0, maxLines: 0 };
}

function nonNeg(n) {
  n = Number(n);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function sanitizeRecords(raw) {
  const rec = defaultRecords();
  if (!raw || typeof raw !== 'object') return rec;
  if (Array.isArray(raw.top)) {
    for (const t of raw.top) {
      if (!t || typeof t !== 'object') continue;
      rec.top.push({
        name: String(t.name ?? '').slice(0, NAME_MAX) || 'Anónimo',
        score: nonNeg(t.score),
        lines: nonNeg(t.lines),
        level: nonNeg(t.level) || 1,
        date: typeof t.date === 'string' ? t.date : '',
      });
    }
    rec.top.sort((a, b) => b.score - a.score);
    rec.top = rec.top.slice(0, TOP_N);
  }
  rec.bestCombo = nonNeg(raw.bestCombo);
  rec.maxLines = nonNeg(raw.maxLines);
  return rec;
}

function loadRecords() {
  try {
    return sanitizeRecords(JSON.parse(localStorage.getItem(RECORDS_KEY)));
  } catch (e) {
    return defaultRecords();
  }
}

function saveRecords(rec) {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(rec)); } catch (e) {}
}

function loadLastName() {
  try { return (localStorage.getItem(NAME_KEY) || '').slice(0, NAME_MAX); } catch (e) { return ''; }
}

function trackCombo(cleared) {
  if (cleared) {
    comboRun++;
    if (comboRun > bestComboRun) bestComboRun = comboRun;
  } else {
    comboRun = 0;
  }
}

// puesto (0-based) que ocuparía `s` en el top, o -1 si no entra
function rankFor(rec, s) {
  if (s <= 0) return -1;
  let i = 0;
  while (i < rec.top.length && rec.top[i].score >= s) i++;
  return i < TOP_N ? i : -1;
}

function renderTable(container, list, highlight) {
  container.textContent = '';
  if (!list.length) {
    const p = document.createElement('p');
    p.className = 'records-empty';
    p.textContent = 'Sin records';
    container.appendChild(p);
    return;
  }
  const table = document.createElement('table');
  table.className = 'records-table';
  list.forEach((t, i) => {
    const tr = document.createElement('tr');
    if (t === highlight) tr.className = 'record-new';
    const cells = [`${i + 1}.`, t.name, t.score.toLocaleString(), `${t.lines} L`];
    cells.forEach((txt, j) => {
      const td = document.createElement('td');
      td.textContent = txt;
      if (j >= 2) td.className = 'num';
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
  container.appendChild(table);
}

function statsText(rec) {
  return `Mejor combo: ${rec.bestCombo} · Líneas máx: ${rec.maxLines}`;
}

function drawIdle() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
}

function resetConfirmHide() {
  resetConfirm.hidden = true;
  resetBtn.hidden = false;
}

function showStartScreen() {
  idle = true;
  cancelAnimationFrame(animId);
  const rec = loadRecords();
  renderTable(startTable, rec.top);
  startStats.textContent = statsText(rec);
  resetConfirmHide();
  resetBtn.disabled = !rec.top.length && !rec.bestCombo && !rec.maxLines;
  overlay.classList.add('hidden');
  startScreen.classList.remove('hidden');
  drawIdle();
  startBtn.focus();
}

function recordsOnInit() {
  commitRecord(loadLastName()); // reiniciar sin pulsar Guardar: se guarda con el último nombre
  idle = false;
  comboRun = 0;
  bestComboRun = 0;
  pendingRecord = null;
  startScreen.classList.add('hidden');
  overlayRecords.hidden = true;
  recordForm.hidden = true;
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
}

function recordsOnGameOver() {
  const rec = loadRecords();
  if (bestComboRun > rec.bestCombo) rec.bestCombo = bestComboRun;
  if (lines > rec.maxLines) rec.maxLines = lines;
  saveRecords(rec);
  const rank = rankFor(rec, score);
  pendingRecord = rank >= 0 ? { rank, score, lines, level } : null;
  overlayRecords.hidden = false;
  overlayStats.textContent = statsText(rec);
  if (pendingRecord) {
    // vista previa con la fila actual resaltada
    const preview = { name: 'Tú', score, lines, level, date: '' };
    const list = rec.top.slice();
    list.splice(rank, 0, preview);
    renderTable(overlayTable, list.slice(0, TOP_N), preview);
    recordMsg.textContent = `¡Nuevo record! Puesto #${rank + 1}`;
    recordName.value = loadLastName();
    recordForm.hidden = false;
    // retraso: evita que teclas del juego aún pulsadas caigan en el input
    setTimeout(() => { if (pendingRecord) { recordName.focus(); recordName.select(); } }, 700);
  } else {
    recordForm.hidden = true;
    renderTable(overlayTable, rec.top);
  }
}

function commitRecord(name) {
  const p = pendingRecord;
  if (!p) return null;
  pendingRecord = null;
  name = name.trim().slice(0, NAME_MAX) || 'Anónimo';
  try { localStorage.setItem(NAME_KEY, name); } catch (err) {}
  const rec = loadRecords();
  const entry = { name, score: p.score, lines: p.lines, level: p.level, date: new Date().toISOString() };
  const rank = rankFor(rec, p.score);
  if (rank < 0) return null;
  rec.top.splice(rank, 0, entry);
  rec.top = rec.top.slice(0, TOP_N);
  saveRecords(rec);
  return { rec, entry };
}

function submitRecord(e) {
  e.preventDefault();
  if (!pendingRecord) return;
  const res = commitRecord(recordName.value);
  recordForm.hidden = true;
  renderTable(overlayTable, res ? res.rec.top : loadRecords().top, res ? res.entry : null);
  if (document.activeElement) document.activeElement.blur();
}

// true = tecla consumida (no llega al resto del handler)
function recordsKey(e) {
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  if (idle) {
    if (e.code === 'KeyT') return false;
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      if (e.target && e.target.tagName === 'BUTTON' && e.target !== startBtn) return true;
      e.preventDefault();
      init();
    }
    return true;
  }
  return false;
}

recordForm.addEventListener('submit', submitRecord);
startBtn.addEventListener('click', init);
resetBtn.addEventListener('click', () => { resetBtn.hidden = true; resetConfirm.hidden = false; resetNo.focus(); });
resetNo.addEventListener('click', () => { resetConfirmHide(); resetBtn.blur(); startBtn.focus(); });
resetYes.addEventListener('click', () => {
  try { localStorage.removeItem(RECORDS_KEY); } catch (e) {}
  showStartScreen();
});

applyTheme(initialTheme());

showStartScreen();
