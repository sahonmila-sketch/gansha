const BB = {
  COLS: 10, ROWS: 10, CELL: 0,
  grid: [], pieces: [], score: 0,
  canvas: null, ctx: null,
  dragPiece: null, dragOffX: 0, dragOffY: 0,
  placedCells: [],
  gameOver: false, timer: 0, maxTime: 120,
  onEnd: null, container: null,

  SHAPES: [
    [[0,0]],
    [[0,0],[0,1]],
    [[0,0],[1,0]],
    [[0,0],[0,1],[0,2]],
    [[0,0],[1,0],[2,0]],
    [[0,0],[0,1],[1,0],[1,1]],
    [[0,0],[0,1],[0,2],[1,2]],
    [[0,0],[1,0],[1,1],[1,2]],
    [[0,0],[0,1],[1,1]],
    [[0,0],[1,0],[0,1]],
    [[0,0],[1,0],[1,1]],
    [[0,0],[1,0],[2,0],[3,0]],
    [[0,0],[0,1],[0,2],[0,3]],
    [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2]],
    [[0,0],[0,1],[1,0],[1,1],[2,0],[2,1]],
    [[0,0],[0,1],[1,0]],
    [[0,0],[1,0],[2,0],[2,1]],
    [[0,0],[0,1],[0,2],[1,0]],
    [[0,0],[0,1],[0,2],[1,1]],
    [[0,0],[1,0],[1,1],[2,1]],
  ],

  COLORS: ['#60a5fa','#a78bfa','#fbbf24','#ef4444','#22c55e','#f97316','#ec4899','#06b6d4','#14b8a6','#eab308'],

  init(container, timeLimit, onEnd) {
    this.container = container;
    this.maxTime = timeLimit || 0;
    this.onEnd = onEnd;
    this.score = 0;
    this.gameOver = false;
    this.timer = this.maxTime;
    this.hasTimer = this.maxTime > 0;
    this.dragPiece = null;
    this.pieces = [];
    this.pieceColors = [];

    const rect = container.getBoundingClientRect();
    const size = Math.min(rect.width - 16, 360);
    this.CELL = Math.floor((size - 12) / this.COLS);

    const cw = this.CELL * this.COLS + 12;
    const ch = this.CELL * this.ROWS + 12 + 160;

    const timerHtml = this.hasTimer ? `<span style="font-size:15px;font-weight:700">\uD83E\uDE99 ${this.maxTime}s</span>` : '<span style="font-size:15px;font-weight:700;color:var(--gd)">\u221E</span>';
    container.innerHTML = `<div class=bb-wrap style="display:flex;flex-direction:column;align-items:center;padding:6px"><div class=bb-hdr style="display:flex;justify-content:space-between;width:${cw}px;padding:4px 8px;margin-bottom:4px">${timerHtml}<span style="font-size:15px;font-weight:700;color:var(--gd)">\uD83C\uDFAF 0</span></div><canvas id=bbCanvas width=${cw} height=${ch} style="border-radius:10px;touch-action:none;cursor:pointer"></canvas></div>`;

    this.canvas = container.querySelector('#bbCanvas');
    this.ctx = this.canvas.getContext('2d');

    this.grid = Array.from({length: this.ROWS}, () => Array(this.COLS).fill(0));

    this.spawnPieces();

    const c = this.canvas;
    c.addEventListener('touchstart', e => this.onTouch(e), {passive: false});
    c.addEventListener('touchmove', e => this.onTouch(e), {passive: false});
    c.addEventListener('touchend', e => this.onEndTouch(e), {passive: false});
    c.addEventListener('mousedown', e => this.onMouse(e));
    c.addEventListener('mousemove', e => this.onMouse(e));
    c.addEventListener('mouseup', e => this.onMouseUp(e));
    c.addEventListener('mouseleave', e => { if(this.dragPiece) { this.dragPiece = null; this.draw(); } });

    this.draw();
    this.startTimer();
  },

  startTimer() {
    if(!this.hasTimer) return;
    this._timerInt = setInterval(() => {
      this.timer--;
      const el = this.container.querySelector('.bb-hdr span:first-child');
      if(el) el.textContent = `\uD83E\uDE99 ${this.timer}s`;
      if(this.timer <= 0) {
        clearInterval(this._timerInt);
        this.gameOver = true;
        if(typeof Sfx !== 'undefined') Sfx.gameOver();
        this.draw();
        if(this.onEnd) setTimeout(() => this.onEnd(this.score), 500);
      }
    }, 1000);
  },

  spawnPieces() {
    this.pieces = [];
    this.pieceColors = [];
    for(let i = 0; i < 3; i++) {
      const idx = Math.floor(Math.random() * this.SHAPES.length);
      this.pieces.push(this.SHAPES[idx].map(p => [...p]));
      this.pieceColors.push(this.COLORS[Math.floor(Math.random() * this.COLORS.length)]);
    }
    if(!this.canAnyPlace()) {
      this.gameOver = true;
      clearInterval(this._timerInt);
      if(typeof Sfx !== 'undefined') Sfx.gameOver();
      if(this.onEnd) setTimeout(() => this.onEnd(this.score), 300);
    }
  },

  canPlace(piece, gridRow, gridCol) {
    for(const [r, c] of piece) {
      const nr = gridRow + r, nc = gridCol + c;
      if(nr < 0 || nr >= this.ROWS || nc < 0 || nc >= this.COLS) return false;
      if(this.grid[nr][nc] !== 0) return false;
    }
    return true;
  },

  placePiece(piece, gridRow, gridCol, color) {
    for(const [r, c] of piece) {
      this.grid[gridRow + r][gridCol + c] = color;
    }
    const cleared = this.checkClears();
    if(cleared > 0) { if(typeof Sfx !== 'undefined') Sfx.clearLine(); }
    else { if(typeof Sfx !== 'undefined') Sfx.place(); }
    this.score += cleared * 10 + (cleared > 1 ? cleared * 5 : 0);
    const sEl = this.container.querySelector('.bb-hdr span:last-child');
    if(sEl) sEl.textContent = `\uD83C\uDFAF ${this.score}`;
    this.pieces = [];
    this.pieceColors = [];
    this.spawnPieces();
  },

  checkClears() {
    let cleared = 0;
    const rows = [], cols = [];
    for(let r = 0; r < this.ROWS; r++) {
      if(this.grid[r].every(c => c !== 0)) rows.push(r);
    }
    for(let c = 0; c < this.COLS; c++) {
      let full = true;
      for(let r = 0; r < this.ROWS; r++) { if(this.grid[r][c] === 0) { full = false; break; } }
      if(full) cols.push(c);
    }
    for(const r of rows) for(let c = 0; c < this.COLS; c++) this.grid[r][c] = 0;
    for(const c of cols) for(let r = 0; r < this.ROWS; r++) this.grid[r][c] = 0;
    cleared = rows.length + cols.length;
    if(cleared > 0) this.drawClearEffect(rows, cols);
    return cleared;
  },

  drawClearEffect(rows, cols) {
    this._clearFlash = {rows, cols, t: 0};
    const flash = () => {
      if(!this._clearFlash) return;
      this._clearFlash.t += 0.05;
      this.draw();
      if(this._clearFlash.t < 1) requestAnimationFrame(flash);
      else { this._clearFlash = null; this.draw(); }
    };
    flash();
  },

  getGridPos(canvasX, canvasY) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = this.canvas.width / rect.width;
    const sy = this.canvas.height / rect.height;
    const x = (canvasX - rect.left) * sx - 6;
    const y = (canvasY - rect.top) * sy - 6;
    const col = Math.floor(x / this.CELL);
    const row = Math.floor(y / this.CELL);
    return {row, col, x, y};
  },

  getPieceAt(canvasX, canvasY) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = this.canvas.width / rect.width;
    const sy = this.canvas.height / rect.height;
    const mx = (canvasX - rect.left) * sx;
    const my = (canvasY - rect.top) * sy;
    const gridBottom = this.CELL * this.ROWS + 12;
    if(my < gridBottom + 10) return null;
    const areaW = this.CELL * this.COLS + 12;
    const pieceH = 48;
    const gap = 8;
    const totalW = this.pieces.length * (pieceH + gap) - gap;
    const startX = (areaW - totalW) / 2;
    for(let i = 0; i < this.pieces.length; i++) {
      const px = startX + i * (pieceH + gap);
      const py = gridBottom + 14;
      if(mx >= px && mx <= px + pieceH && my >= py && my <= py + pieceH) {
        return i;
      }
    }
    return null;
  },

  onTouch(e) {
    e.preventDefault();
    const t = e.touches[0];
    if(e.type === 'touchstart') {
      const pi = this.getPieceAt(t.clientX, t.clientY);
      if(pi !== null && !this.gameOver) {
        this.dragPiece = {idx: pi, piece: this.pieces[pi].map(p => [...p]), color: this.pieceColors[pi]};
        this.dragOffX = t.clientX; this.dragOffY = t.clientY;
      }
    }
    if(e.type === 'touchmove' && this.dragPiece) {
      this.dragOffX = t.clientX;
      this.dragOffY = t.clientY;
      this.draw();
    }
    if(e.type === 'touchend') this.tryPlace();
  },

  onMouse(e) {
    if(e.type === 'mousedown') {
      const pi = this.getPieceAt(e.clientX, e.clientY);
      if(pi !== null && !this.gameOver) {
        this.dragPiece = {idx: pi, piece: this.pieces[pi].map(p => [...p]), color: this.pieceColors[pi]};
        this.dragOffX = e.clientX; this.dragOffY = e.clientY;
        this._mouseDown = true;
      }
    }
    if(e.type === 'mousemove' && this._mouseDown && this.dragPiece) {
      this.dragOffX = e.clientX;
      this.dragOffY = e.clientY;
      this._mouseMoved = true;
      this.draw();
    }
  },

  onMouseUp(e) {
    if(this._mouseDown && this.dragPiece) {
      if(!this._mouseMoved) { this.dragPiece = null; this.draw(); return; }
      this.tryPlace();
    }
    this._mouseDown = false;
    this._mouseMoved = false;
  },

  onEndTouch(e) {
    this.tryPlace();
  },

  tryPlace() {
    if(!this.dragPiece) return;
    const rect = this.canvas.getBoundingClientRect();
    const sx = this.canvas.width / rect.width;
    const sy = this.canvas.height / rect.height;
    const mx = (this.dragOffX - rect.left) * sx;
    const my = (this.dragOffY - rect.top) * sy;
    const gp = this.getGridPos(this.dragOffX, this.dragOffY);
    if(gp && this.canPlace(this.dragPiece.piece, gp.row, gp.col)) {
      this.placePiece(this.dragPiece.piece, gp.row, gp.col, this.dragPiece.color);
      if(!this.canAnyPlace()) { this.gameOver = true; clearInterval(this._timerInt); if(typeof Sfx !== 'undefined') Sfx.gameOver(); this.draw(); if(this.onEnd) setTimeout(() => this.onEnd(this.score), 500); }
    }
    this.dragPiece = null;
    this.draw();
  },

  canAnyPlace() {
    for(const p of this.pieces) {
      for(let r = 0; r < this.ROWS; r++) {
        for(let c = 0; c < this.COLS; c++) {
          if(this.canPlace(p, r, c)) return true;
        }
      }
    }
    return false;
  },

  draw() {
    const ctx = this.ctx, cw = this.canvas.width, ch = this.canvas.height;
    ctx.clearRect(0, 0, cw, ch);

    ctx.fillStyle = '#0f0f22';
    ctx.beginPath();
    ctx.roundRect(0, 0, cw, ch, 10);
    ctx.fill();

    const off = 6;
    const cs = this.CELL;
    const gs = cs * this.COLS;

    ctx.strokeStyle = 'rgba(255,255,255,.04)';
    ctx.lineWidth = 0.5;
    for(let r = 0; r <= this.ROWS; r++) {
      ctx.beginPath(); ctx.moveTo(off, off + r * cs); ctx.lineTo(off + gs, off + r * cs); ctx.stroke();
    }
    for(let c = 0; c <= this.COLS; c++) {
      ctx.beginPath(); ctx.moveTo(off + c * cs, off); ctx.lineTo(off + c * cs, off + gs); ctx.stroke();
    }

    for(let r = 0; r < this.ROWS; r++) {
      for(let c = 0; c < this.COLS; c++) {
        if(this.grid[r][c] !== 0) {
          this.drawCell(ctx, off + c * cs, off + r * cs, cs, this.grid[r][c]);
        }
      }
    }

    if(this._clearFlash) {
      const t = this._clearFlash.t || 0;
      ctx.fillStyle = `rgba(255,255,255,${0.3 * (1 - t)})`;
      for(const r of this._clearFlash.rows) ctx.fillRect(off, off + r * cs, gs, cs);
      for(const c of this._clearFlash.cols) ctx.fillRect(off + c * cs, off, cs, gs);
    }

    const gridBottom = off + gs;
    ctx.fillStyle = 'rgba(255,255,255,.03)';
    ctx.fillRect(off, gridBottom + 2, gs, 2);

    const pieceH = 44;
    const gap = 8;
    const totalW = this.pieces.length * (pieceH + gap) - gap;
    const startX = (cw - totalW) / 2;
    const py = gridBottom + 12;

    for(let i = 0; i < this.pieces.length; i++) {
      const px = startX + i * (pieceH + gap);
      const p = this.pieces[i];
      const color = this.pieceColors[i];

      const cells = p.map(([r, c]) => ({r, c}));
      const minR = Math.min(...cells.map(x => x.r));
      const maxR = Math.max(...cells.map(x => x.r));
      const minC = Math.min(...cells.map(x => x.c));
      const maxC = Math.max(...cells.map(x => x.c));
      const ph = maxR - minR + 1, pw = maxC - minC + 1;
      const cellS = Math.floor((pieceH - 4) / Math.max(ph, pw));
      const innerW = pw * cellS, innerH = ph * cellS;
      const boxX = px + (pieceH - innerW) / 2;
      const boxY = py + (pieceH - innerH) / 2;

      for(const [r, c] of p) {
        this.drawCell(ctx, boxX + (c - minC) * cellS, boxY + (r - minR) * cellS, cellS - 2, color);
      }
    }

    if(this.dragPiece) {
      const p = this.dragPiece.piece;
      const color = this.dragPiece.color;
      const rect = this.canvas.getBoundingClientRect();
      const sx = this.canvas.width / rect.width;
      const sy = this.canvas.height / rect.height;
      const mx = (this.dragOffX - rect.left) * sx;
      const my = (this.dragOffY - rect.top) * sy;
      const gp = this.getGridPos(this.dragOffX, this.dragOffY);
      const placeOk = gp && this.canPlace(p, gp.row, gp.col);
      const cellS = cs - 2;
      const dx = mx - cs / 2, dy = my - cs / 2;

      if(placeOk && gp) {
        for(const [r, c] of p) {
          this.drawCell(ctx, off + (gp.col + c) * cs, off + (gp.row + r) * cs, cs, color, 0.6);
        }
      }

      const cells = p.map(([r, c]) => ({r, c}));
      const minR = Math.min(...cells.map(x => x.r));
      const minC = Math.min(...cells.map(x => x.c));
      for(const [r, c] of p) {
        this.drawCell(ctx, dx + (c - minC) * cs, dy + (r - minR) * cs, cs - 2, color, 0.9);
      }
    }

    if(this.gameOver) {
      ctx.fillStyle = 'rgba(0,0,0,.65)';
      ctx.fillRect(0, 0, cw, ch);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 36px sans-serif';
      ctx.fillText('\uD83C\uDFAF', cw/2, ch/2 - 40);
      ctx.font = 'bold 32px sans-serif';
      ctx.fillText('' + this.score, cw/2, ch/2 + 10);
      ctx.fillStyle = 'rgba(255,255,255,.4)';
      ctx.font = '14px sans-serif';
      ctx.fillText('\u0418\u0433\u0440\u0430 \u043e\u043a\u043e\u043d\u0447\u0435\u043d\u0430', cw/2, ch/2 + 50);
      const hs = parseInt(localStorage.getItem('bb_highscore')||'0');
      if(this.score >= hs && this.score > 0) {
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText('\uD83C\uDFC6 \u041D\u041E\u0412\u042B\u0419 \u0420\u0415\u041A\u041E\u0420\u0414!', cw/2, ch/2 + 80);
      }
    }
  },

  drawCell(ctx, x, y, size, color, alpha) {
    const a = alpha || 1;
    const pad = 1;
    ctx.globalAlpha = a;
    const grad = ctx.createLinearGradient(x, y, x + size, y + size);
    grad.addColorStop(0, this.lighten(color, 30));
    grad.addColorStop(1, color);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x + pad, y + pad, size - pad * 2, size - pad * 2, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.15)';
    ctx.fillRect(x + pad + 2, y + pad + 2, size * 0.3, 2);
    ctx.globalAlpha = 1;
  },

  lighten(hex, pct) {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, (num >> 16) + pct);
    const g = Math.min(255, ((num >> 8) & 0xFF) + pct);
    const b = Math.min(255, (num & 0xFF) + pct);
    return `rgb(${r},${g},${b})`;
  },

  destroy() {
    clearInterval(this._timerInt);
    this.canvas = null;
    this.ctx = null;
    this.grid = [];
    this.pieces = [];
    this.dragPiece = null;
  }
};

if(!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    if(r > w/2) r = w/2;
    if(r > h/2) r = h/2;
    this.moveTo(x + r, y);
    this.lineTo(x + w - r, y);
    this.quadraticCurveTo(x + w, y, x + w, y + r);
    this.lineTo(x + w, y + h - r);
    this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.lineTo(x + r, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - r);
    this.lineTo(x, y + r);
    this.quadraticCurveTo(x, y, x + r, y);
    this.closePath();
    return this;
  };
}
