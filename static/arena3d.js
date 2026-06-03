let scene, camera, renderer, container;
let playerMeshes = {};
let bulletMeshes = {};
let healthBars = {};
let nameLabels = {};
let ws = null;
let playerId = null;
let arenaId = null;
let gameRunning = false;
let joystick = {active: false, dx: 0, dy: 0, el: null, thumb: null};
let shootBtn = null;
let animFrameId = null;

function init3D(cont, tgId, aId) {
  container = cont; playerId = tgId; arenaId = aId;
  container.style.position = 'relative';
  container.style.overflow = 'hidden';

  const w = container.clientWidth || 360;
  const h = container.clientHeight || 400;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a1a);

  camera = new THREE.PerspectiveCamera(55, w / h, 1, 300);
  camera.position.set(50, 70, 70);
  camera.lookAt(50, 0, 50);

  renderer = new THREE.WebGLRenderer({antialias: true});
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const amb = new THREE.AmbientLight(0x334466, 0.4);
  scene.add(amb);
  const dir = new THREE.DirectionalLight(0xffeedd, 0.7);
  dir.position.set(30, 80, 40);
  dir.castShadow = true;
  dir.shadow.mapSize.set(512, 512);
  dir.shadow.camera.left = -60;
  dir.shadow.camera.right = 60;
  dir.shadow.camera.top = 60;
  dir.shadow.camera.bottom = -60;
  scene.add(dir);

  const fill = new THREE.DirectionalLight(0x4488ff, 0.3);
  fill.position.set(-30, 30, -20);
  scene.add(fill);

  const gMat = new THREE.MeshStandardMaterial({color: 0x1a1a3a, roughness: 0.9, metalness: 0.1});
  const gPlane = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), gMat);
  gPlane.rotation.x = -Math.PI / 2;
  gPlane.position.set(50, -0.1, 50);
  gPlane.receiveShadow = true;
  scene.add(gPlane);

  const grid = new THREE.GridHelper(100, 10, 0x4444aa, 0x333388);
  grid.position.set(50, 0, 50);
  scene.add(grid);

  const bMat = new THREE.MeshStandardMaterial({color: 0x5555cc, emissive: 0x222266});
  for (const [x, z, w2, d] of [[0,0,100,0.5],[0,99.5,100,0.5],[0,0,0.5,100],[99.5,0,0.5,100]]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w2, 4, d), bMat);
    wall.position.set(x + w2/2, 2, z + d/2);
    wall.castShadow = true;
    scene.add(wall);
  }

  const glowMat = new THREE.MeshStandardMaterial({color: 0x6666ff, emissive: 0x4444aa, transparent: true, opacity: 0.3});
  const glow = new THREE.Mesh(new THREE.BoxGeometry(100.6, 0.5, 100.6), glowMat);
  glow.position.set(50, -0.05, 50);
  scene.add(glow);

  setupJoystick();
  setupShootBtn();
  connectWS();
  animate();
}

function createPlayerMesh(emoji, isMe) {
  const g = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({color: isMe ? 0xfbbf24 : 0x7c3aed, roughness: 0.3, metalness: 0.5});
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 2.8, 8), bodyMat);
  body.position.y = 1.4;
  body.castShadow = true;
  g.add(body);

  const headMat = new THREE.MeshStandardMaterial({color: isMe ? 0xf59e0b : 0x9b6aff, roughness: 0.2, metalness: 0.3});
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 8), headMat);
  head.position.y = 3.2;
  head.castShadow = true;
  g.add(head);

  const eyeMat = new THREE.MeshStandardMaterial({color: 0xffffff, emissive: 0x88ccff});
  for (const [dx, dz] of [[-0.4, 0.8], [0.4, 0.8]]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), eyeMat);
    eye.position.set(dx, 3.4, dz);
    g.add(eye);
  }

  const can = document.createElement('canvas');
  can.width = 64; can.height = 64;
  const ctx = can.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  ctx.font = '44px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 32, 34);
  const tex = new THREE.CanvasTexture(can);
  const sMat = new THREE.SpriteMaterial({map: tex, depthTest: false, transparent: true});
  const spr = new THREE.Sprite(sMat);
  spr.scale.set(3.5, 3.5, 1);
  spr.position.y = 5;
  g.add(spr);

  return g;
}

function createHB() {
  const div = document.createElement('div');
  div.style.cssText = 'position:absolute;width:44px;height:5px;background:rgba(0,0,0,.6);border-radius:3px;overflow:hidden;pointer-events:none;transform:translate(-50%,-100%)';
  const fill = document.createElement('div');
  fill.style.cssText = 'height:100%;border-radius:3px;transition:width .15s';
  div.appendChild(fill);
  return {div, fill};
}

function setupJoystick() {
  const j = document.createElement('div');
  j.style.cssText = 'position:absolute;bottom:70px;left:20px;width:110px;height:110px;border-radius:50%;background:rgba(255,255,255,.06);border:2px solid rgba(255,255,255,.12);touch-action:none;z-index:30';
  const t = document.createElement('div');
  t.style.cssText = 'position:absolute;top:50%;left:50%;width:48px;height:48px;margin:-24px 0 0 -24px;border-radius:50%;background:radial-gradient(circle,rgba(251,191,36,.7),rgba(251,191,36,.3));transition:transform .03s';
  j.appendChild(t);
  container.appendChild(j);
  joystick.el = j; joystick.thumb = t;

  let sx, sy, act = false;
  const st = e => {
    const p = e.touches ? e.touches[0] : e;
    const r = j.getBoundingClientRect();
    sx = r.left + r.width/2; sy = r.top + r.height/2;
    act = true; joystick.active = true;
  };
  const mv = e => {
    if (!act) return;
    e.preventDefault();
    const p = e.touches ? e.touches[0] : e;
    const dx = p.clientX - sx, dy = p.clientY - sy;
    const dist = Math.min(Math.hypot(dx, dy), 45);
    const ang = Math.atan2(dy, dx);
    t.style.transform = `translate(${Math.cos(ang)*dist-24}px, ${Math.sin(ang)*dist-24}px)`;
    joystick.dx = Math.cos(ang) * (dist / 45);
    joystick.dy = Math.sin(ang) * (dist / 45);
    sendMove();
  };
  const en = () => {
    act = false; joystick.active = false;
    joystick.dx = 0; joystick.dy = 0;
    t.style.transform = 'translate(-24px, -24px)';
    sendMove();
  };
  j.addEventListener('touchstart', st, {passive: true});
  j.addEventListener('touchmove', mv, {passive: false});
  j.addEventListener('touchend', en);
  j.addEventListener('mousedown', st);
  window.addEventListener('mousemove', mv);
  window.addEventListener('mouseup', en);
}

function setupShootBtn() {
  shootBtn = document.createElement('div');
  shootBtn.style.cssText = 'position:absolute;bottom:70px;right:20px;width:85px;height:85px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#ff6b6b,#dc2626);box-shadow:0 0 30px rgba(220,38,38,.5),inset 0 -3px 10px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:34px;touch-action:none;user-select:none;z-index:30;border:2px solid rgba(255,255,255,.15);cursor:pointer';
  shootBtn.textContent = '\u26A1';
  container.appendChild(shootBtn);

  const fire = e => {
    e.preventDefault();
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const me = playerMeshes[playerId];
    if (!me) return;
    let nearest = null, minD = Infinity;
    for (const [id, p] of Object.entries(playerMeshes)) {
      const s = stateCache[id];
      if (id == playerId || !s || !s.alive) continue;
      const d = Math.hypot(s.x - me.x, s.y - me.y);
      if (d < minD) { minD = d; nearest = s; }
    }
    if (nearest) {
      ws.send(JSON.stringify({type: 'shoot', target_x: nearest.x, target_y: nearest.y}));
      shootBtn.style.transform = 'scale(.85)';
      setTimeout(() => shootBtn.style.transform = '', 100);
    }
  };
  shootBtn.addEventListener('touchstart', fire, {passive: false});
  shootBtn.addEventListener('mousedown', fire);
}

let stateCache = {};

function sendMove() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({type: 'move', dx: joystick.dx, dy: joystick.dy}));
  }
}

function connectWS() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${window.location.host}/arena/ws/${arenaId}/${playerId}`;
  ws = new WebSocket(url);
  ws.onopen = () => {};
  ws.onclose = () => { if (gameRunning) setTimeout(connectWS, 1500); };
  ws.onmessage = e => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'state') updateState(msg);
      else if (msg.type === 'game_over') showGameOver(msg);
    } catch(err) {}
  };
}

function updateState(state) {
  const rIds = new Set();
  for (const p of state.players) {
    rIds.add(p.id);
    stateCache[p.id] = p;
    if (playerMeshes[p.id]) {
      playerMeshes[p.id].x = p.x;
      playerMeshes[p.id].y = p.y;
      playerMeshes[p.id].mesh.position.set(p.x, 0.1, p.y);
      playerMeshes[p.id].mesh.visible = p.alive;
      const hb = healthBars[p.id];
      if (hb) {
        const pct = p.max_hp > 0 ? (p.hp / p.max_hp) * 100 : 0;
        hb.fill.style.width = pct + '%';
        hb.fill.style.background = pct > 60 ? 'linear-gradient(90deg,#22c55e,#06b6d4)' : pct > 30 ? 'linear-gradient(90deg,#f97316,#fbbf24)' : 'linear-gradient(90deg,#ef4444,#f97316)';
        hb.div.style.display = p.alive ? 'block' : 'none';
      }
    } else {
      const mesh = createPlayerMesh(p.emoji, p.id == playerId);
      mesh.position.set(p.x, 0.1, p.y);
      scene.add(mesh);
      const hb = createHB();
      container.appendChild(hb.div);
      playerMeshes[p.id] = {mesh, x: p.x, y: p.y};
      healthBars[p.id] = hb;
    }
  }

  for (const id of Object.keys(playerMeshes)) {
    if (!rIds.has(parseInt(id))) {
      scene.remove(playerMeshes[id].mesh);
      healthBars[id]?.div?.remove();
      delete playerMeshes[id];
      delete healthBars[id];
      delete stateCache[id];
    }
  }

  const rBIds = new Set();
  for (const b of state.bullets) {
    rBIds.add(b.id);
    if (bulletMeshes[b.id]) {
      bulletMeshes[b.id].position.set(b.x, 0.5, b.y);
    } else {
      const bMat = new THREE.MeshStandardMaterial({color: 0xffdd44, emissive: 0xff6600});
      const bMesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 6), bMat);
      bMesh.position.set(b.x, 0.5, b.y);
      scene.add(bMesh);
      bulletMeshes[b.id] = bMesh;
    }
  }
  for (const id of Object.keys(bulletMeshes)) {
    if (!rBIds.has(parseInt(id))) {
      scene.remove(bulletMeshes[id]);
      delete bulletMeshes[id];
    }
  }
}

function showGameOver(msg) {
  gameRunning = false;
  if (ws) { ws.close(); ws = null; }

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(8px);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:50;animation:fadeIn .5s ease';
  overlay.innerHTML = `
    <style>@keyframes fadeIn{from{opacity:0}to{opacity:1}}</style>
    <div style="font-size:72px;margin-bottom:8px;animation:bounce .6s ease">${msg.winner?.emoji || '\uD83C\uDFC6'}</div>
    <div style="font-size:22px;font-weight:900;color:#fbbf24;margin-bottom:4px">\uD83C\uDFC6 ${msg.winner?.username || '\u041d\u0438\u0447\u044c\u044f'} \u043f\u043e\u0431\u0435\u0434\u0438\u043b!</div>
    <div style="font-size:13px;color:var(--tx2);margin-bottom:16px">\u0423\u0431\u0438\u0439\u0441\u0442\u0432: ${msg.winner?.kills || 0}</div>
    <button class="b b-g" onclick="this.closest('div[style]').remove();rA()" style="margin:0 auto">\uD83D\uDD04 \u0412\u0435\u0440\u043d\u0443\u0442\u044c\u0441\u044f</button>
  `;
  container.appendChild(overlay);
}

function animate() {
  animFrameId = requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

function destroy3D() {
  gameRunning = false;
  if (ws) { ws.close(); ws = null; }
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
  if (renderer) { renderer.dispose(); renderer.domElement?.remove(); }
  for (const id of Object.keys(playerMeshes)) {
    scene?.remove(playerMeshes[id].mesh);
    healthBars[id]?.div?.remove();
  }
  for (const id of Object.keys(bulletMeshes)) {
    scene?.remove(bulletMeshes[id]);
  }
  playerMeshes = {}; bulletMeshes = {}; healthBars = {}; stateCache = {};
  joystick.el?.remove(); shootBtn?.remove();
  joystick.el = null; shootBtn = null;
  container = null; scene = null; camera = null; renderer = null;
}
