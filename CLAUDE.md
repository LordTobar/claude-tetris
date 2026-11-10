# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JS Tetris (HTML5 Canvas). No dependencies, no package.json, no build, no tests, no linter. README is in Spanish; UI strings are Spanish too.

## Run

Open `index.html` directly, or serve statically: `python -m http.server 8000` → http://localhost:8000.

## Architecture

Three files: `index.html` (DOM + canvases), `style.css`, `game.js` (all logic, single script, `'use strict'`, global state).

- Global mutable state in `game.js`: `board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId`. `init()` resets all of it; restart button calls `init()`.
- Board = `ROWS x COLS` matrix; 0 empty, 1–7 = piece type index into `COLORS`/`PIECES` (index 0 is `null` placeholder). Piece cells store their own type index, so shape matrices double as color data.
- Flow: `loop` (rAF, accumulates `dropAccum` vs `dropInterval`) → gravity or `lockPiece()` → `merge` → `clearLines` → `spawn`. `spawn` calls `endGame()` if new piece collides.
- `animId` rAF handle is cancelled in `endGame`, `togglePause`, `init`; resume path calls `loop` directly.
- Input: single `keydown` listener using `e.code`; `P` handled before the paused/gameOver guard.
- `clearLines` recomputes `level` and `dropInterval = max(100, 1000 - (level-1)*90)`; the `1000` initial value is duplicated in `init()`.
- Rotation: `rotateCW` + horizontal-only kicks `[0,-1,1,-2,2]` in `tryRotate` (no SRS tables).

- Skins: bloque `// ==== Skins ====` en `game.js`. `SKINS = {retro, neon, pastel, pixel}` con `colors[0..8]`, `grid?`, `bg?`, `drawBlock(ctx,x,y,i,size,alpha)`. `COLORS` es la paleta del skin retro. `drawBlock` global delega a `SKINS[currentSkin]` y resetea `globalAlpha/shadowBlur/shadowColor`. `applyTheme` llama `applySkinOverrides()` (grid + fondo de canvas). Preferencia en `localStorage.skin`; `<select id="skin-select">`.

## Gotchas

- Changing `COLS`/`ROWS`/`BLOCK` requires manually updating `width`/`height` of `<canvas id="board">` in `index.html` (`COLS*BLOCK` x `ROWS*BLOCK`). The next-piece canvas is 120x120 with hardcoded `NB = 30` in `drawNext`.
- DOM ids used by `game.js` (`board`, `next-canvas`, `score`, `lines`, `level`, `overlay`, `overlay-title`, `overlay-score`, `restart-btn`) must stay in sync with `index.html` (also `skin-select`).
- README claims `↑` or `X` rotates; the on-page controls list only shows `↑`.
