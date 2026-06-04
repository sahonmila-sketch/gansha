const BB = {
  COLS: 10, ROWS: 10, CELL: 0,
  grid: [], pieces: [], score: 0,
  canvas: null, ctx: null,
  dragPiece: null, dragOffX: 0, dragOffY: 0,
  placedCells: [],
  gameOver: false, timer: 0, maxTime: 120,
  onEnd: null, container: null,
  combo: 0,

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

  init(container, timeLimit, onEnd, rating, cardBonus) {
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
    this.rating = rating || 0;
    this.cardBonus = cardBonus || 1;
    this.obstacles = new Set();
    this._restartBtn = null;
    this.combo = 0;
    this._scorePopups = [];
    this._boardShake = 0;
    this._particles = [];
    this._hoverCell = null;
    this._endTimer = null;
    this._clearFlash = null;

    const rect = container.getBoundingClientRect();
    const size = Math.min(rect.width - 16, 360);
    this.CELL = Math.floor((size - 12) / this.COLS);

    const cw = this.CELL * this.COLS + 12;
    const ch = this.CELL * this.ROWS + 12 + 160;

    const cbHtml = this.cardBonus > 1 ? `<span style="font-size:11px;color:var(--gd);font-weight:700">\u2B50x${this.cardBonus}</span>` : '';
    const obsHtml = this.obstacles.size > 0 ? `<span style="font-size:11px;color:var(--tx2)">\uD83D\uDEE1 ${this.obstacles.size}</span>` : '';
    const timerHtml = this.hasTimer ? `<span style="font-size:15px;font-weight:700">\uD83E\uDE99 ${this.maxTime}s</span>` : '<span style="font-size:15px;font-weight:700;color:var(--gd)">\u221E</span>';
    container.innerHTML = `<div class=bb-wrap style="display:flex;flex-direction:column;align-items:center;padding:6px"><div class=bb-hdr style="display:flex;justify-content:space-between;align-items:center;width:${cw}px;padding:4px 8px;margin-bottom:4px"><span>${timerHtml} ${cbHtml} ${obsHtml}</span><span style="font-size:15px;font-weight:700;color:var(--gd)">\uD83C\uDFAF 0</span></div><canvas id=bbCanvas width=${cw} height=${ch} style="border-radius:10px;touch-action:none;cursor:pointer"></canvas></div>`;

    this.canvas = container.querySelector('#bbCanvas');
    this.ctx = this.canvas.getContext('2d');

    this.grid = Array.from({length: this.ROWS}, () => Array(this.COLS).fill(0));

    this._generateObstacles();
    this.spawnPieces();

    const c = this.canvas;
    c.addEventListener('touchstart', e => this.onTouch(e), {passive: false});
    c.addEventListener('touchmove', e => this.onTouch(e), {passive: false});
    c.addEventListener('touchend', e => this.onEndTouch(e), {passive: false});
    c.addEventListener('mousedown', e => this.onMouse(e));
    c.addEventListener('mousemove', e => this.onMouse(e));
    c.addEventListener('mouseup', e => this.onMouseUp(e));
    c.addEventListener('mouseleave', e => { this._hoverCell = null; if(this.dragPiece) { this.dragPiece = null; this.draw(); } else this.draw(); });

    this.draw();
    this.startTimer();
  },

  _generateObstacles() {
    const r = this.rating;
    const num = r < 1000 ? 0 : r < 5000 ? 5 : r < 15000 ? 10 : r < 50000 ? 16 : r < 100000 ? 22 : 30;
    let att = 0;
    while(this.obstacles.size < num && att < 500) {
      const or = Math.floor(Math.random() * this.ROWS);
      const oc = Math.floor(Math.random() * this.COLS);
      const key = or+','+oc;
      if(!this.obstacles.has(key)) {
        let adj = false;
        for(const ok of this.obstacles) {
          const [ar, ac] = ok.split(',').map(Number);
          if(Math.abs(ar - or) <= 1 && Math.abs(ac - oc) <= 1) { adj = true; break; }
        }
        if(!adj) this.obstacles.add(key);
      }
      att++;
    }
  },

  restart() {
    Sfx.click();
    clearTimeout(this._endTimer);
    this.destroy();
    this.init(this.container, this.maxTime, this.onEnd, this.rating, this.cardBonus);
  },

  startTimer() {
    if(!this.hasTimer || this._paused) return;
    this._timerInt = setInterval(() => {
      if(this._paused) return;
      this.timer--;
      const el = this.container.querySelector('.bb-hdr span:first-child');
      if(el) el.textContent = `\uD83E\uDE99 ${this.timer}s`;
      if(this.timer <= 0) {
        clearInterval(this._timerInt);
        this.gameOver = true;
        Sfx.gameOver();
        this.draw();
        if(this.onEnd) this._endTimer = setTimeout(() => this.onEnd(this.score), 500);
      }
    }, 1000);
  },

  pause() {
    this._paused = true;
    clearInterval(this._timerInt);
  },

  resume() {
    this._paused = false;
    requestAnimationFrame(() => {
      if(!this.canvas || !this.canvas.parentNode) {
        this.canvas = this.container && this.container.querySelector('#bbCanvas');
      }
      if(!this.canvas) return;
      this.ctx = this.canvas.getContext('2d');
      if(!this.ctx) return;
      this.startTimer();
      this.draw();
    });
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
      Sfx.gameOver();
      if(this.onEnd) this._endTimer = setTimeout(() => this.onEnd(this.score), 300);
    }
  },

  canPlace(piece, gridRow, gridCol) {
    for(const [r, c] of piece) {
      const nr = gridRow + r, nc = gridCol + c;
      if(nr < 0 || nr >= this.ROWS || nc < 0 || nc >= this.COLS) return false;
      if(this.grid[nr][nc] !== 0) return false;
      if(this.obstacles.has(nr+','+nc)) return false;
    }
    return true;
  },

  _showComboText() {
    if(typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.className = 'combo-text';
    el.innerHTML = '\u041A\u041E\u041C\u0411\u041E\u041E\u041E<span class=combo-mult>\u00D7' + this.combo + '</span>';
    document.body.appendChild(el);
    setTimeout(() => { if(el.parentNode) el.parentNode.removeChild(el); }, 800);
  }

  placePiece(piece, gridRow, gridCol, color) {
    for(const [r, c] of piece) {
      this.grid[gridRow + r][gridCol + c] = color;
    }
    Sfx.drop();
    const cleared = this.checkClears();
    if(cleared > 0) {
      this.combo++;
      if(this.combo >= 3) {
        Sfx.combo(this.combo);
        this._showComboText();
      } else if(this.combo >= 2) {
        Sfx.clearLine();
        Sfx.combo(this.combo);
        this._showComboText();
      } else {
        Sfx.clearLine();
      }
    } else {
      this.combo = 0;
      Sfx.place();
    }
    let base = cleared * 10 + (cleared > 1 ? cleared * 5 : 0);
    if(this.combo > 1 && cleared > 0) base = Math.round(base * (1 + (this.combo - 1) * 0.5));
    const gained = Math.round(base * (this.cardBonus || 1));
    this.score += gained;
    if(gained > 0) this._addScorePopup(gained);
    const sEl = this.container.querySelector('.bb-hdr span:last-child');
    if(sEl) sEl.textContent = `\uD83C\uDFAF ${this.score}`;
    this.pieces = [];
    this.pieceColors = [];
    this.spawnPieces();
  },

  _addScorePopup(amount) {
    const x = 50 + Math.random() * 20;
    const y = 30 + Math.random() * 15;
    this._scorePopups.push({x, y, text: '+' + amount, t: 0, combo: this.combo > 1 ? this.combo : 0});
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
    for(const r of rows) for(let c = 0; c < this.COLS; c++) if(!this.obstacles.has(r+','+c)) this.grid[r][c] = 0;
    for(const c of cols) for(let r = 0; r < this.ROWS; r++) if(!this.obstacles.has(r+','+c)) this.grid[r][c] = 0;
    cleared = rows.length + cols.length;
    if(cleared > 0) {
      this._clearFlash = {rows, cols, t: 0};
      this._boardShake = 5;
      this._spawnParticles(cleared);
      const flash = () => {
        if(!this._clearFlash) return;
        this._clearFlash.t += 0.04;
        this.draw();
        if(this._clearFlash.t < 1) requestAnimationFrame(flash);
        else { this._clearFlash = null; this.draw(); }
      };
      flash();
    }
    return cleared;
  },

  _spawnParticles(count) {
    if(!this._particles) this._particles = [];
    const colors = ['#fbbf24','#f59e0b','#a78bfa','#60a5fa','#22c55e','#ef4444','#ec4899','#06b6d4'];
    const off = 6; const gs = this.CELL * this.COLS;
    for(let i = 0; i < count * 15; i++) {
      this._particles.push({
        x: off + Math.random() * gs, y: off + Math.random() * gs,
        vx: (Math.random() - 0.5) * 4, vy: -Math.random() * 5 - 1,
        s: 2 + Math.random() * 4, c: colors[Math.floor(Math.random() * colors.length)], t: 0
      });
    }
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
      if(this.gameOver && this._restartBtn && t) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = this.canvas.width / rect.width;
        const sy = this.canvas.height / rect.height;
        const mx = (t.clientX - rect.left) * sx;
        const my = (t.clientY - rect.top) * sy;
        if(mx >= this._restartBtn.x && mx <= this._restartBtn.x + this._restartBtn.w &&
           my >= this._restartBtn.y && my <= this._restartBtn.y + this._restartBtn.h) {
          this.restart(); return;
        }
      }
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
      if(this.gameOver && this._restartBtn) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = this.canvas.width / rect.width;
        const sy = this.canvas.height / rect.height;
        const mx = (e.clientX - rect.left) * sx;
        const my = (e.clientY - rect.top) * sy;
        if(mx >= this._restartBtn.x && mx <= this._restartBtn.x + this._restartBtn.w &&
           my >= this._restartBtn.y && my <= this._restartBtn.y + this._restartBtn.h) {
          this.restart(); return;
        }
      }
      const pi = this.getPieceAt(e.clientX, e.clientY);
      if(pi !== null && !this.gameOver) {
        this.dragPiece = {idx: pi, piece: this.pieces[pi].map(p => [...p]), color: this.pieceColors[pi]};
        this.dragOffX = e.clientX; this.dragOffY = e.clientY;
        this._mouseDown = true;
      }
    }
    if(e.type === 'mousemove') {
      const gp = this.getGridPos(e.clientX, e.clientY);
      if(gp && gp.row >= 0 && gp.row < this.ROWS && gp.col >= 0 && gp.col < this.COLS) {
        this._hoverCell = {r: gp.row, c: gp.col};
      } else { this._hoverCell = null; }
      if(this._mouseDown && this.dragPiece) {
        this.dragOffX = e.clientX;
        this.dragOffY = e.clientY;
        this._mouseMoved = true;
      }
      this.draw();
    }
  },

  onMouseUp(e) {
    if(this._mouseDown && this.dragPiece) {
      if(!this._mouseMoved) { this.dragPiece = null; this._mouseDown = false; this._mouseMoved = false; this.draw(); return; }
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
    const gp = this.getGridPos(this.dragOffX, this.dragOffY);
    if(gp && this.canPlace(this.dragPiece.piece, gp.row, gp.col)) {
      this.placePiece(this.dragPiece.piece, gp.row, gp.col, this.dragPiece.color);
      if(!this.canAnyPlace()) { this.gameOver = true; clearInterval(this._timerInt); Sfx.gameOver(); this.draw(); if(this.onEnd) this._endTimer = setTimeout(() => this.onEnd(this.score), 500); }
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
    if(!this.canvas||!this.ctx)return;
    const ctx = this.ctx, cw = this.canvas.width, ch = this.canvas.height;

    if(this._boardShake > 0.1) {
      const sx = (Math.random() - 0.5) * this._boardShake * 2;
      const sy = (Math.random() - 0.5) * this._boardShake * 2;
      ctx.save(); ctx.translate(sx, sy);
    }

    ctx.clearRect(0, 0, cw, ch);

    const bgGrad = ctx.createRadialGradient(cw/2, ch/2, 0, cw/2, ch/2, cw*0.7);
    bgGrad.addColorStop(0, '#15152e');
    bgGrad.addColorStop(0.5, '#0f0f22');
    bgGrad.addColorStop(1, '#080814');
    ctx.fillStyle = bgGrad;
    ctx.beginPath();
    ctx.roundRect(0, 0, cw, ch, 10);
    ctx.fill();

    ctx.shadowColor = 'rgba(168,85,247,.15)';
    ctx.shadowBlur = 15;
    ctx.strokeStyle = 'rgba(168,85,247,.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(1, 1, cw-2, ch-2, 10);
    ctx.stroke();
    ctx.shadowBlur = 0;

    const off = 6;
    const cs = this.CELL;
    const gs = cs * this.COLS;

    ctx.strokeStyle = 'rgba(255,255,255,.03)';
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
        } else if(this._hoverCell && this._hoverCell.r === r && this._hoverCell.c === c) {
          ctx.fillStyle = 'rgba(255,255,255,.04)';
          ctx.beginPath();
          ctx.roundRect(off + c * cs + 1, off + r * cs + 1, cs - 2, cs - 2, 3);
          ctx.fill();
        }
      }
    }

    for(const key of this.obstacles) {
      const [or, oc] = key.split(',').map(Number);
      const x = off + oc * cs, y = off + or * cs;
      const og = ctx.createLinearGradient(x, y, x + cs, y + cs);
      og.addColorStop(0, '#2a2a3e');
      og.addColorStop(0.5, '#1a1a2e');
      og.addColorStop(1, '#0f0f1e');
      ctx.fillStyle = og;
      ctx.beginPath();
      ctx.roundRect(x + 1, y + 1, cs - 2, cs - 2, 3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.06)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.roundRect(x + 1, y + 1, cs - 2, cs - 2, 3);
      ctx.stroke();
      ctx.fillStyle = 'rgba(239,68,68,.08)';
      ctx.fillRect(x + 3, y + 3, cs * 0.8, 2);
      ctx.strokeStyle = 'rgba(239,68,68,.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 5, y + 5); ctx.lineTo(x + cs - 5, y + cs - 5);
      ctx.moveTo(x + cs - 5, y + 5); ctx.lineTo(x + 5, y + cs - 5);
      ctx.stroke();
    }

    if(this._clearFlash) {
      const t = Math.min(this._clearFlash.t, 1);
      const ease = 1 - (1 - t) * (1 - t);
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 30 * (1 - ease);
      ctx.fillStyle = `rgba(251,191,36,${0.25 * (1 - ease)})`;
      for(const r of this._clearFlash.rows) ctx.fillRect(off, off + r * cs, gs, cs);
      for(const c of this._clearFlash.cols) ctx.fillRect(off + c * cs, off, cs, gs);
      ctx.shadowBlur = 0;
    }

    if(this._particles) {
      for(const p of this._particles) {
        if(p.t >= 1) continue;
        p.t += 0.03; p.x += p.vx; p.y += p.vy; p.vy += 0.15;
        ctx.globalAlpha = 1 - p.t;
        ctx.fillStyle = p.c;
        ctx.shadowColor = p.c; ctx.shadowBlur = 8;
        ctx.fillRect(p.x, p.y, p.s, p.s);
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;
      this._particles = this._particles.filter(p => p.t < 1);
    }

    const gridBottom = off + gs;
    const sepGrad = ctx.createLinearGradient(off, gridBottom + 2, off + gs, gridBottom + 2);
    sepGrad.addColorStop(0, 'transparent');
    sepGrad.addColorStop(0.3, 'rgba(168,85,247,.2)');
    sepGrad.addColorStop(0.5, 'rgba(251,191,36,.3)');
    sepGrad.addColorStop(0.7, 'rgba(168,85,247,.2)');
    sepGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = sepGrad;
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

      ctx.fillStyle = 'rgba(255,255,255,.04)';
      ctx.beginPath();
      ctx.roundRect(px, py, pieceH, pieceH, 6);
      ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,.06)`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.roundRect(px, py, pieceH, pieceH, 6);
      ctx.stroke();

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

      const cells = p.map(([r, c]) => ({r, c}));
      const minR = Math.min(...cells.map(x => x.r));
      const minC = Math.min(...cells.map(x => x.c));

      if(placeOk && gp) {
        ctx.shadowColor = color; ctx.shadowBlur = 15;
        for(const [r, c] of p) {
          this.drawCell(ctx, off + (gp.col + c) * cs, off + (gp.row + r) * cs, cs, color, 0.55);
        }
        ctx.shadowBlur = 0;
      } else if(gp) {
        ctx.fillStyle = 'rgba(239,68,68,.15)';
        ctx.strokeStyle = 'rgba(239,68,68,.3)';
        ctx.lineWidth = 1;
        for(const [r, c] of p) {
          const cx = off + (gp.col + c) * cs + 1, cy = off + (gp.row + r) * cs + 1;
          ctx.beginPath(); ctx.roundRect(cx, cy, cs - 2, cs - 2, 3); ctx.fill(); ctx.stroke();
        }
      }

      const pieceW = (Math.max(...cells.map(x => x.c)) - minC + 1) * cs;
      const pieceH2 = (Math.max(...cells.map(x => x.r)) - minR + 1) * cs;
      const dx = mx - pieceW / 2;
      const dy = my - pieceH2 / 2;

      ctx.shadowColor = color; ctx.shadowBlur = 20;
      for(const [r, c] of p) {
        this.drawCell(ctx, dx + (c - minC) * cs + 2, dy + (r - minR) * cs + 2, cs - 4, color, 0.85);
      }
      ctx.shadowBlur = 0;
    }

    for(const pop of this._scorePopups) {
      if(pop.t >= 1) continue;
      pop.t += 0.03;
      const alpha = Math.max(0, 1 - pop.t);
      const yOff = -pop.t * 55;
      const scale = 1 + pop.t * 0.3;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(cw / 2 + (pop.x - 50), cw / 2 + (pop.y - 30) + yOff);
      ctx.scale(scale, scale);
      if(pop.combo > 1) {
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 20;
        ctx.fillText(pop.combo + 'x ' + pop.text, 0, 0);
      } else {
        ctx.fillStyle = '#22c55e';
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#22c55e'; ctx.shadowBlur = 12;
        ctx.fillText(pop.text, 0, 0);
      }
      ctx.restore();
    }
    this._scorePopups = this._scorePopups.filter(p => p.t < 1);

    if(this._boardShake > 0.1) {
      ctx.restore();
      this._boardShake *= 0.85;
    }

    if(this.gameOver) {
      ctx.fillStyle = 'rgba(0,0,0,.7)';
      ctx.fillRect(0, 0, cw, ch);
      ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 40;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 42px sans-serif';
      ctx.fillText('\uD83C\uDFAF', cw/2, ch/2 - 55);
      ctx.shadowBlur = 0;
      ctx.font = 'bold 36px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.shadowColor = 'rgba(251,191,36,.4)'; ctx.shadowBlur = 20;
      ctx.fillText('' + this.score, cw/2, ch/2);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.font = '13px sans-serif';
      ctx.fillText('\u0418\u0433\u0440\u0430 \u043e\u043a\u043e\u043d\u0447\u0435\u043d\u0430', cw/2, ch/2 + 38);
      const hs = parseInt(localStorage.getItem('bb_highscore')||'0');
      if(this.score >= hs && this.score > 0) {
        ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 18px sans-serif';
        ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 30;
        ctx.fillText('\uD83C\uDFC6 \u041D\u041E\u0412\u042B\u0419 \u0420\u0415\u041A\u041E\u0420\u0414!', cw/2, ch/2 + 70);
        ctx.shadowBlur = 0;
      }
      const bx = cw/2 - 90, by = ch/2 + 108, bw = 180, bh = 44;
      ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 20;
      const bg = ctx.createLinearGradient(bx, by, bx, by + bh);
      bg.addColorStop(0, '#fbbf24'); bg.addColorStop(0.5, '#f59e0b'); bg.addColorStop(1, '#f97316');
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 10); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#0f0f22'; ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('\uD83D\uDD04 \u0417\u0430\u043D\u043E\u0432\u043E', cw/2, by + bh/2);
      this._restartBtn = {x: bx, y: by, w: bw, h: bh};
    }
  },

  drawCell(ctx, x, y, size, color, alpha) {
    const a = alpha || 1;
    const pad = 1;
    ctx.globalAlpha = a;
    const grad = ctx.createLinearGradient(x, y, x + size, y + size);
    grad.addColorStop(0, this.lighten(color, 40));
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, this.darken(color, 30));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x + pad, y + pad, size - pad * 2, size - pad * 2, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.25)';
    ctx.fillRect(x + pad + 2, y + pad + 2, size * 0.4, 2);
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    ctx.fillRect(x + pad + 2, y + pad + 4, size * 0.25, 1);
    ctx.globalAlpha = 1;
    if(a > 0.7) {
      ctx.shadowColor = color;
      ctx.shadowBlur = size * 0.3;
      ctx.fillStyle = 'rgba(255,255,255,.05)';
      ctx.beginPath();
      ctx.roundRect(x + pad, y + pad, size - pad * 2, size - pad * 2, 3);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  },
  darken(hex, pct) {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, (num >> 16) - pct);
    const g = Math.max(0, ((num >> 8) & 0xFF) - pct);
    const b = Math.max(0, (num & 0xFF) - pct);
    return `rgb(${r},${g},${b})`;
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
    this.obstacles = new Set();
    this._restartBtn = null;
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
