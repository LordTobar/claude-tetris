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
  applySkinOverrides();
  // el loop no corre en pausa/game over: repintar explícitamente
  if (current && next) { draw(); drawNext(); }
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
  SKINS[currentSkin].drawBlock(context, x, y, colorIndex, size, alpha ?? 1);
  // reset de estado para no contaminar siguientes bloques
  context.globalAlpha = 1;
  context.shadowBlur = 0;
  context.shadowColor = 'transparent';
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
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target === themeBtn && e.code === 'Space') return;
  if (e.target === skinSelect) return;
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

// ==== Skins ====
const skinSelect = document.getElementById('skin-select');

function roundRectPath(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

const SKINS = {
  retro: {
    colors: COLORS,
    drawBlock(context, x, y, i, size, alpha) {
      context.globalAlpha = alpha;
      context.fillStyle = this.colors[i];
      context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      context.fillStyle = shineColor;
      context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
    },
  },
  neon: {
    colors: [null, '#00f0ff', '#ffee00', '#d500f9', '#39ff14', '#ff1744', '#448aff', '#ff9100', '#c6a15b'],
    grid: '#1a1a2e',
    bg: '#000000',
    drawBlock(context, x, y, i, size, alpha) {
      const c = this.colors[i], px = x * size, py = y * size;
      context.globalAlpha = alpha;
      context.shadowColor = c;
      context.shadowBlur = 12;
      context.fillStyle = c;
      context.fillRect(px + 3, py + 3, size - 6, size - 6);
      context.shadowBlur = 0;
      context.fillStyle = 'rgba(0,0,0,0.45)';
      context.fillRect(px + 6, py + 6, size - 12, size - 12);
    },
  },
  pastel: {
    colors: [null, '#a8e6ef', '#fff1a8', '#d8b4e8', '#b5e8b8', '#f6b3b3', '#b4bdf0', '#fcd3a0', '#d7c4bb'],
    grid: '#efdfe6',
    bg: '#fff7fa',
    drawBlock(context, x, y, i, size, alpha) {
      const px = x * size, py = y * size;
      context.globalAlpha = alpha;
      context.fillStyle = this.colors[i];
      roundRectPath(context, px + 1.5, py + 1.5, size - 3, size - 3, 8);
      context.fill();
      context.fillStyle = 'rgba(255,255,255,0.45)';
      roundRectPath(context, px + 5, py + 4, size - 14, 5, 2.5);
      context.fill();
    },
  },
  pixel: {
    colors: [null, '#29b6c8', '#e6b800', '#9c3fb5', '#3d9e45', '#cc3b3b', '#4a56b5', '#e08a1e', '#8a6a5c'],
    drawBlock(context, x, y, i, size, alpha) {
      const px = x * size + 1, py = y * size + 1, s = size - 2;
      const t = Math.max(1, Math.floor(s / 7));
      context.globalAlpha = alpha;
      context.fillStyle = this.colors[i];
      context.fillRect(px, py, s, s);
      // textura de damero 7x7
      context.fillStyle = 'rgba(255,255,255,0.2)';
      for (let a = 0; a < 7; a++)
        for (let b = 0; b < 7; b++)
          if ((a + b) % 2 === 0) context.fillRect(px + a * t, py + b * t, t, t);
      // bordes claro/oscuro estilo 8 bits
      context.fillStyle = 'rgba(255,255,255,0.4)';
      context.fillRect(px, py, s, t);
      context.fillRect(px, py, t, s);
      context.fillStyle = 'rgba(0,0,0,0.4)';
      context.fillRect(px, py + s - t, s, t);
      context.fillRect(px + s - t, py, t, s);
    },
  },
};

function initialSkin() {
  let saved = null;
  try { saved = localStorage.getItem('skin'); } catch (e) {}
  return Object.prototype.hasOwnProperty.call(SKINS, saved) ? saved : 'retro';
}

let currentSkin = initialSkin();

// Se llama desde applyTheme: re-aplica fondo/rejilla del skin sobre los del tema
function applySkinOverrides() {
  const sk = SKINS[currentSkin];
  if (sk.grid) gridColor = sk.grid;
  canvas.style.background = sk.bg || '';
  nextCanvas.style.background = sk.bg || '';
}

function applySkin(name) {
  if (!Object.prototype.hasOwnProperty.call(SKINS, name)) name = 'retro';
  currentSkin = name;
  try { localStorage.setItem('skin', name); } catch (e) {}
  skinSelect.value = name;
  // applyTheme recalcula grid/shine, re-aplica override y repinta
  applyTheme(document.documentElement.dataset.theme);
}

skinSelect.value = currentSkin;
skinSelect.addEventListener('change', () => { applySkin(skinSelect.value); skinSelect.blur(); });

restartBtn.addEventListener('click', init);
themeBtn.addEventListener('click', () => { toggleTheme(); themeBtn.blur(); });

applyTheme(initialTheme());

init();
