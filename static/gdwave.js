var GDWave = {
  state:'menu', level:0, score:0, coins:0, deaths:0, combo:0, maxCombo:0,
  px:0, py:0, pvy:0, psize:0, hold:false, scrollX:0, speed:0, objs:[],
  stars:[], progress:0, levelLen:0, flash:0, deadTimer:0,
  canRestart:false, collected:{}, unlocked:{}, trails:[], bgStars:[],
  particles:[], nebula:[], w:0, h:0, cx:null, can:null, con:null, onEnd:null,
  levelCoins:0, sfx:{}, _sndCtx:null, _sndVol:0.08,
  lvlNames:['Волна 1','Волна 2','Волна 3','Волна 4','Волна 5','Волна 6','Волна 7','Волна 8'],

  LEVELS:[
    {sp:2.5, len:1200, bg:['#0f0c29','#302b63','#24243e'], th:['#e74c3c','#c0392b'], coins:5, pat:'intro'},
    {sp:3.0, len:1400, bg:['#1a0a2e','#2d1b69','#16062b'], th:['#f39c12','#e67e22'], coins:7, pat:'zigzag'},
    {sp:3.5, len:1600, bg:['#0a1628','#1a3a5c','#0d2137'], th:['#3498db','#2980b9'], coins:8, pat:'tunnel'},
    {sp:4.0, len:1800, bg:['#1a0a1e','#3d1a4a','#1a0a1e'], th:['#9b59b6','#8e44ad'], coins:10, pat:'spiral'},
    {sp:4.5, len:2000, bg:['#0a1a0a','#1a3a1a','#0a1a0a'], th:['#2ecc71','#27ae60'], coins:12, pat:'chaos'},
    {sp:5.0, len:2200, bg:['#1a1a0a','#3a3a1a','#1a1a0a'], th:['#f1c40f','#d4ac0d'], coins:14, pat:'gauntlet'},
    {sp:5.5, len:2400, bg:['#0c0c0c','#2a1a1a','#0c0c0c'], th:['#e74c3c','#c0392b'], coins:16, pat:'inferno'},
    {sp:6.0, len:2800, bg:['#050510','#151530','#050510'], th:['#fff','#ddd'], coins:20, pat:'final'}
  ],

  SOUNDS:{
    jump:[220,0.08,'sine',0.3],
    coin:[880,0.06,'sine',0.3],
    die:[160,0.15,'sawtooth',0.5],
    win:[523,0.3,'sine',0.6]
  },

  COLS:{
    first:{n:'Первый шаг',d:'Пройди первый уровень',i:'🌊',r:'common'},
    speed:{n:'Скорость',d:'Пройди уровень 5',i:'⚡',r:'rare'},
    master:{n:'Мастер волны',d:'Пройди все 8 уровней',i:'🏆',r:'epic'},
    coins50:{n:'Коллекционер',d:'Собери 50 монет',i:'🪙',r:'rare'},
    coins100:{n:'Богатство',d:'Собери 100 монет',i:'💰',r:'epic'},
    deaths0:{n:'Идеально',d:'Пройди уровень без смертей',i:'✨',r:'rare'},
    combo10:{n:'Комбо 10',d:'Достигни комбо 10',i:'🔥',r:'rare'},
    combo20:{n:'Комбо 20',d:'Достигни комбо 20',i:'💥',r:'epic'}
  },

  _initSfx:function(){
    var s=this;
    try{s._sndCtx=new(window.AudioContext||window.webkitAudioContext);}catch(e){return}
    for(var k in s.SOUNDS){
      (function(key){
        var p=s.SOUNDS[key];
        s.sfx[key]=function(){
          var ctx=s._sndCtx;
          if(!ctx)return;
          if(ctx.state==='suspended')ctx.resume();
          if(!s._sndVol)return;
          var o=ctx.createOscillator(),g=ctx.createGain();
          o.connect(g);g.connect(ctx.destination);
          o.type=p[2];o.frequency.setValueAtTime(p[0],ctx.currentTime);
          g.gain.setValueAtTime(s._sndVol*p[3],ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+p[1]);
          o.start();o.stop(ctx.currentTime+p[1]);
        };
      })(k);
    }
  },

  _play:function(n){if(this.sfx[n])this.sfx[n]();},

  init:function(con,onEnd){
    var s=this; s.con=con; s.onEnd=onEnd;
    var r=con.getBoundingClientRect();
    s.w=Math.max(200,r.width-2);
    s.h=Math.max(200,Math.min(r.height-2,Math.round(s.w*0.56)));
    var ratio=window.devicePixelRatio||1;
    con.innerHTML='<div id=gdwContainer style="position:relative;width:100%;max-width:'+s.w+'px;margin:0 auto"><canvas id=gdwCanvas style="display:block;border-radius:0;touch-action:none;cursor:pointer;width:100%;height:100%"></canvas><div id=gdwUI style="position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center"></div></div>';
    s.can=con.querySelector('#gdwCanvas');
    s.can.width=s.w*ratio; s.can.height=s.h*ratio;
    s.cx=s.can.getContext('2d');
    s.cx.scale(ratio,ratio);
    s.psize=Math.max(10,s.w*0.025);
    s.px=Math.round(s.w*0.2);
    s.py=s.h*0.5;
    s._initSfx();
    s._load();
    s._bgStarsInit();
    s._bind();
    s._loop();
  },

  _bind:function(){
    var s=this;
    function down(e){e.preventDefault();s.hold=true;s._play('jump');if(s.state==='menu')s._startLevel();else if(s.state==='dead'&&s.canRestart)s._startLevel();else if(s.state==='won'){s.state='menu';s._menu();}}
    function up(e){e.preventDefault();s.hold=false;}
    s.can.addEventListener('touchstart',down,{passive:false});
    s.can.addEventListener('touchend',up,{passive:false});
    s.can.addEventListener('mousedown',down);
    s.can.addEventListener('mouseup',up);
    document.addEventListener('keydown',function(e){if(e.code==='Space'||e.code==='ArrowUp'){e.preventDefault();s.hold=true;s._play('jump');if(s.state==='menu')s._startLevel();else if(s.state==='dead'&&s.canRestart)s._startLevel();else if(s.state==='won'){s.state='menu';s._menu();}}});
    document.addEventListener('keyup',function(e){if(e.code==='Space'||e.code==='ArrowUp'){e.preventDefault();s.hold=false;}});
  },

  _load:function(){
    var s=this;
    try{
      var d=JSON.parse(localStorage.getItem('gdwave_data')||'{}');
      s.score=d.score||0; s.coins=d.coins||0; s.deaths=d.deaths||0;
      s.unlocked=d.unlocked||{}; s.collected=d.collected||{};
      s.maxCombo=d.maxCombo||0;
    }catch(e){}
  },

  _save:function(){
    var s=this;
    try{localStorage.setItem('gdwave_data',JSON.stringify({score:s.score,coins:s.coins,deaths:s.deaths,unlocked:s.unlocked,collected:s.collected,maxCombo:s.maxCombo}));}catch(e){}
  },

  _checkCol:function(id){
    var s=this,c=s.COLS[id];
    if(!c||s.collected[id])return false;
    s.collected[id]=true;s._save();return true;
  },

  _bgStarsInit:function(){
    var s=this; s.bgStars=[]; s.nebula=[];
    for(var i=0;i<60;i++)s.bgStars.push({x:Math.random()*s.w,y:Math.random()*s.h,sz:0.3+Math.random()*2.5,sp:0.05+Math.random()*0.2,ph:Math.random()*6.28,br:0.2+Math.random()*0.8});
    for(var i=0;i<12;i++)s.nebula.push({x:Math.random()*s.w,y:Math.random()*s.h,r:30+Math.random()*80,cr:'hsla('+(200+Math.random()*160)+',60%,40%,'+(0.02+Math.random()*0.04)+')',sp:0.02+Math.random()*0.08});
  },

  _rr:function(x,y,w,h,r){
    var cx=this.cx;
    cx.beginPath();cx.moveTo(x+r,y);cx.lineTo(x+w-r,y);cx.quadraticCurveTo(x+w,y,x+w,y+r);
    cx.lineTo(x+w,y+h-r);cx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    cx.lineTo(x+r,y+h);cx.quadraticCurveTo(x,y+h,x,y+h-r);
    cx.lineTo(x,y+r);cx.quadraticCurveTo(x,y,x+r,y);cx.closePath();
  },

  _menu:function(){
    var s=this;
    s.state='menu';
    var ui=document.getElementById('gdwUI');
    if(!ui)return;
    var anyUnl=false; for(var k in s.collected)anyUnl=true;
    var fs=Math.round(s.w*0.045),fs2=Math.round(s.w*0.02),fs3=Math.round(s.w*0.016);
    var h='<div style="text-align:center;padding:12px 8px;width:100%;pointer-events:auto">'+
      '<div style="font-size:'+fs+'px;font-weight:800;margin-bottom:2px;background:linear-gradient(90deg,#4ecdc4,#ffd700,#ff6b6b);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:1px">ВОЛНА</div>'+
      '<div style="font-size:'+fs2+'px;color:var(--tx2);margin-bottom:10px;opacity:.7">⬆ Зажми — вверх &nbsp;⬇ Отпусти — вниз</div>'+
      '<div style="display:flex;gap:6px;justify-content:center;margin-bottom:10px;flex-wrap:wrap">';
    for(var i=0;i<8;i++){
      var unl=s.unlocked['level_'+(i+1)]||i===0;
      var cur=s.level===i?' style="border:2px solid #fff;transform:scale(1.1);box-shadow:0 0 24px rgba(255,255,255,.2)"':'';
      h+='<div class=gdwLvl onclick="GDWave._pickLevel('+i+')" data-lvl="'+i+'"'+(cur||'')+' style="width:'+Math.round(s.w*0.09)+'px;padding:'+Math.round(s.w*0.006)+'px 0;background:'+(unl?'rgba(255,255,255,.06)':'rgba(255,255,255,.02)')+';border-radius:10px;text-align:center;cursor:'+(unl?'pointer':'default')+';pointer-events:auto;opacity:'+(unl?1:0.25)+';transition:all .25s;border:2px solid '+(cur?'rgba(255,255,255,.8)':'rgba(255,255,255,.06)')+';backdrop-filter:blur(4px)">'+
        '<div style="font-size:'+Math.round(s.w*0.026)+'px;line-height:1.4">'+(unl?['🌊','⚡','🔵','🟣','🟢','🟡','🔴','⚫'][i]:'🔒')+'</div>'+
        '<div style="font-size:'+fs3+'px;color:var(--tx);margin-top:1px">'+(unl?s.lvlNames[i]:'???')+'</div>'+
        '</div>';
    }
    h+='</div>'+
      '<div style="display:flex;gap:8px;justify-content:center;margin-bottom:8px;flex-wrap:wrap;pointer-events:auto">'+
      '<div style="background:rgba(255,255,255,.06);backdrop-filter:blur(6px);border-radius:10px;padding:5px 12px;font-size:'+fs3+'px;border:1px solid rgba(255,255,255,.05)"><span style="color:#ffd700">⭐</span> '+s.score+'</div>'+
      '<div style="background:rgba(255,255,255,.06);backdrop-filter:blur(6px);border-radius:10px;padding:5px 12px;font-size:'+fs3+'px;border:1px solid rgba(255,255,255,.05)"><span style="color:#4ecdc4">🪙</span> '+s.coins+'</div>'+
      '<div style="background:rgba(255,255,255,.06);backdrop-filter:blur(6px);border-radius:10px;padding:5px 12px;font-size:'+fs3+'px;border:1px solid rgba(255,255,255,.05)">💀 '+s.deaths+'</div>'+
      '</div>'+
      '<div style="margin-bottom:8px;pointer-events:auto">'+
      '<button class="bb bb-p" onclick="GDWave._startLevel()" style="font-size:'+fs2+'px;padding:10px 32px;pointer-events:auto;cursor:pointer;border:none;border-radius:12px;background:linear-gradient(135deg,#4ecdc4,#44a08d);color:#fff;font-weight:700;box-shadow:0 4px 24px rgba(78,205,196,.3)">🎮 Играть</button>'+
      '</div>';
    if(anyUnl){
      h+='<div style="max-height:'+Math.round(s.h*0.14)+'px;overflow-y:auto;width:88%;pointer-events:auto;background:rgba(255,255,255,.03);border-radius:10px;padding:6px;border:1px solid rgba(255,255,255,.04)">'+
        '<div style="font-size:'+fs3+'px;color:var(--tx2);margin-bottom:4px;text-align:center">🏅 Коллекции</div>';
      for(var k in s.COLS){
        var c=s.COLS[k];var got=s.collected[k];
        h+='<div style="display:flex;align-items:center;gap:4px;padding:3px 6px;background:'+(got?'rgba(78,205,196,.1)':'rgba(255,255,255,.02)')+';border-radius:6px;margin-bottom:2px;opacity:'+(got?1:0.35)+'">'+
          '<span>'+c.i+'</span>'+
          '<div style="flex:1;text-align:left;font-size:'+fs3+'px"><span style="color:var(--tx)">'+c.n+'</span> — <span style="color:var(--tx2)">'+c.d+'</span></div>'+
          (got?'<span style="color:#4ecdc4;font-size:'+Math.round(s.w*0.018)+'px">✅</span>':'<span style="color:var(--tx2);font-size:'+Math.round(s.w*0.015)+'px">🔒</span>')+
          '</div>';
      }
      h+='</div>';
    }
    ui.innerHTML=h;
  },

  _pickLevel:function(i){
    var s=this;
    if(!s.unlocked['level_'+(i+1)]&&i>0)return;
    s.level=i; s._menu();
  },

  _startLevel:function(){
    var s=this;
    var lv=s.LEVELS[s.level];
    s.state='playing'; s.scrollX=0; s.progress=0;
    s.levelLen=lv.len; s.speed=lv.sp;
    s.hold=false; s.deadTimer=0; s.canRestart=false;
    s.py=s.h*0.5; s.pvy=0; s.combo=0; s.flash=0;
    s.objs=[]; s.stars=[]; s.trails=[]; s.particles=[]; s.levelCoins=0;
    s._genLevel();
    var ui=document.getElementById('gdwUI');
    if(ui)ui.innerHTML='';
  },

  _genLevel:function(){
    var s=this,lv=s.LEVELS[s.level];
    var g=s.h*0.12,ceilY=g,floorY=s.h-g;
    var objs=[];
    var x=0,pat=lv.pat,seed=s.level*777;
    function rand(min,max){seed=(seed*9301+49297)%233280;return min+(max-min)*(seed/233280);}
    function fspike(){return{x:x,ty:'f',w:20+rand(0,2)*10};}
    function cspike(){return{x:x,ty:'c',w:20+rand(0,2)*10};}
    function block(hh){return{x:x,ty:'b',w:10+rand(0,1)*10,h:hh};}
    function star(){return{x:x,ty:'s',y:ceilY+20+rand(0,floorY-ceilY-40)};}
    var seg=0;
    while(x<lv.len){
      var left=lv.len-x;
      if(left<50){x+=left;break;}
      seg++;var rn=rand(0,1);
      if(pat==='intro'){
        if(seg%3===0){for(var i=0;i<2+Math.floor(rand(0,2));i++){objs.push(fspike());x+=20;}x+=40+rand(0,40);}
        else if(seg%4===0){for(var i=0;i<2+Math.floor(rand(0,2));i++){objs.push(cspike());x+=20;}x+=30;}
        else{x+=60+rand(0,60);}
        if(rand(0,1)<0.3&&s.levelCoins<lv.coins){objs.push(star());s.levelCoins++;}
      }else if(pat==='zigzag'){
        if(seg%2===0){
          for(var i=0;i<3+Math.floor(rand(0,3));i++){objs.push(fspike());x+=20;}
          for(var i=0;i<2+Math.floor(rand(0,2));i++){objs.push(cspike());x+=20;}
        }else{
          for(var i=0;i<3+Math.floor(rand(0,3));i++){objs.push(cspike());x+=20;}
          for(var i=0;i<2+Math.floor(rand(0,2));i++){objs.push(fspike());x+=20;}
        }
        x+=20+rand(0,30);
        if(rand(0,1)<0.25){objs.push(block(30+Math.floor(rand(0,2))*20));x+=15;}
        if(rand(0,1)<0.3){objs.push(star());}
      }else if(pat==='tunnel'){
        for(var i=0;i<4+Math.floor(rand(0,4));i++){objs.push(fspike());objs.push(cspike());x+=20;}
        var gap=60+rand(0,40);x+=gap;
        if(rand(0,1)<0.3){var bh=20+Math.floor(rand(0,3))*20;objs.push(block(bh));objs.push(block(bh));x+=20;}
        if(rand(0,1)<0.3){objs.push(star());}
      }else if(pat==='spiral'){
        if(seg%3===0){for(var i=0;i<2+Math.floor(rand(0,3));i++){objs.push(fspike());x+=20;}for(var i=0;i<2;i++){objs.push(cspike());x+=20;}}
        else{for(var i=0;i<2+Math.floor(rand(0,3));i++){objs.push(cspike());x+=20;}for(var i=0;i<2;i++){objs.push(fspike());x+=20;}}
        x+=15+rand(0,25);
        if(rand(0,1)<0.2){objs.push(block(40+Math.floor(rand(0,2))*30));x+=10;}
        if(rand(0,1)<0.35){objs.push(star());}
      }else if(pat==='chaos'){
        for(var i=0;i<5+Math.floor(rand(0,5));i++){objs.push(rand(0,1)<0.5?fspike():cspike());x+=15;}
        x+=10+rand(0,20);
        if(rand(0,1)<0.3){objs.push(block(30+Math.floor(rand(0,3))*20));x+=10;}
        if(rand(0,1)<0.35){objs.push(star());}
      }else if(pat==='gauntlet'){
        for(var i=0;i<8+Math.floor(rand(0,6));i++){objs.push(rand(0,1)<0.5?fspike():cspike());x+=12;}
        x+=5+rand(0,15);
        if(rand(0,1)<0.2){var bh2=20+Math.floor(rand(0,4))*20;objs.push(block(bh2));x+=10;}
        if(rand(0,1)<0.3){objs.push(star());}
      }else if(pat==='inferno'){
        for(var i=0;i<10+Math.floor(rand(0,8));i++){objs.push(rand(0,1)<0.5?fspike():cspike());x+=10;}
        x+=3+rand(0,10);
        if(rand(0,1)<0.15){var bh3=20+Math.floor(rand(0,5))*20;objs.push(block(bh3));x+=8;}
        if(rand(0,1)<0.2){objs.push(star());}
      }else{
        for(var i=0;i<3+Math.floor(rand(0,4));i++){objs.push(rand(0,1)<0.5?fspike():cspike());x+=18;}
        x+=20+rand(0,30);
        if(rand(0,1)<0.3){objs.push(star());}
      }
      if(x>lv.len)x=lv.len;
    }
    s.objs=objs;
  },

  _upd:function(){
    var s=this;
    if(s.state!=='playing')return;
    var lv=s.LEVELS[s.level];
    var g=s.h*0.12,ceilY=g,floorY=s.h-g;
    if(s.hold){s.pvy-=0.95;if(s.pvy<-8)s.pvy=-8;}
    else{s.pvy+=0.75;if(s.pvy>8)s.pvy=8;}
    s.py+=s.pvy;
    s.scrollX+=s.speed;
    s.progress=s.scrollX/s.levelLen;

    s.trails.push({x:s.px,y:s.py,life:1});
    if(s.trails.length>25)s.trails.shift();
    for(var i=0;i<s.trails.length;i++)s.trails[i].life-=0.05;

    if(s.py<ceilY){s.py=ceilY;s.pvy=0;}
    if(s.py>floorY){s.py=floorY;s.pvy=0;}

    var col=false;
    var pr=s.psize*0.4,cpx=s.px,cpy=s.py;
    for(var i=0;i<s.objs.length;i++){
      var o=s.objs[i];
      if(o.x<s.scrollX-100)continue;
      if(o.x>s.scrollX+s.w+100)break;
      var ox=o.x-s.scrollX;
      if(o.ty==='f'){if(cpy+pr>s.h-g-8&&ox<cpx+pr&&ox+o.w>cpx-pr){col=true;break;}
      }else if(o.ty==='c'){if(cpy-pr<g+8&&ox<cpx+pr&&ox+o.w>cpx-pr){col=true;break;}
      }else if(o.ty==='b'){var bh=o.h||40;if(ox<cpx+pr&&ox+o.w>cpx-pr&&cpy+pr>s.h-g-bh&&cpy-pr<s.h-g){col=true;break;}
      }else if(o.ty==='s'){
        if(Math.abs(ox+o.w/2-cpx)<14&&Math.abs(o.y-cpy)<14){
          s.stars.push({x:ox,y:o.y,life:1});
          s.objs.splice(i,1);i--;
          s.coins++;s.combo++;s.score+=10*s.combo;
          s._play('coin');
          if(s.combo>s.maxCombo)s.maxCombo=s.combo;
          for(var p=0;p<8;p++){var a2=Math.random()*6.28;var sp2=1+Math.random()*3;s.particles.push({x:ox,y:o.y,vx:Math.cos(a2)*sp2,vy:Math.sin(a2)*sp2,life:1,sz:2+Math.random()*3,cl:'#ffd700'});}
          var ci=s.COLS;
          if(s.combo>=20&&s._checkCol('combo20'))s._notify(ci.combo20.n);
          else if(s.combo>=10&&s._checkCol('combo10'))s._notify(ci.combo10.n);
          if(s.coins>=100&&s._checkCol('coins100'))s._notify(ci.coins100.n);
          else if(s.coins>=50&&s._checkCol('coins50'))s._notify(ci.coins50.n);
          s._save();
        }
      }
    }
    if(col){s._die();return;}

    if(s.progress>=1){
      s.state='won';var ci2=s.COLS;
      var lvlKey='level_'+(s.level+1);
      if(!s.unlocked[lvlKey]){s.unlocked[lvlKey]=true;s.score+=100*(s.level+1);s._save();}
      if(s.level+1<8)s.unlocked['level_'+(s.level+2)]=true;
      if(s.level===0&&s._checkCol('first'))s._notify(ci2.first.n);
      if(s.level>=4&&s._checkCol('speed'))s._notify(ci2.speed.n);
      var allUnl=true;for(var li=0;li<8;li++){if(!s.unlocked['level_'+(li+1)]){allUnl=false;break;}}
      if(allUnl&&s._checkCol('master'))s._notify(ci2.master.n);
      s._save();s._play('win');
      setTimeout(function(){s._showWin();},500);
    }
  },

  _die:function(){
    var s=this;
    s.state='dead';s.deaths++;s.deadTimer=0;s.canRestart=false;s.combo=0;
    s._save();s._play('die');
    for(var i=0;i<40;i++){var a=Math.random()*6.28,spd=2+Math.random()*8;s.trails.push({x:s.px+Math.cos(a)*s.psize*0.4,y:s.py+Math.sin(a)*s.psize*0.4,life:1,vx:Math.cos(a)*spd,vy:Math.sin(a)*spd,sz:2+Math.random()*5,cl:['#ff4444','#ff8800','#ffcc00','#fff','#ff6b6b'][Math.floor(Math.random()*5)]});}
    setTimeout(function(){s.canRestart=true;},500);
  },

  _showWin:function(){
    var s=this;
    var ui=document.getElementById('gdwUI');
    if(!ui)return;
    var fs=Math.round(s.w*0.06),fs2=Math.round(s.w*0.025),fs3=Math.round(s.w*0.018);
    ui.innerHTML='<div style="text-align:center;padding:20px;width:100%;pointer-events:auto;animation:gdwFadeIn .4s ease-out">'+
      '<div style="font-size:'+fs+'px;margin-bottom:4px">🎉</div>'+
      '<div style="font-size:'+fs2+'px;font-weight:700;background:linear-gradient(90deg,#ffd700,#ff6b6b);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Уровень пройден!</div>'+
      '<div style="font-size:'+fs3+'px;color:var(--tx2);margin:6px 0">Счёт: <span style="color:#ffd700">+'+((s.level+1)*100)+'</span></div>'+
      '<div style="display:flex;gap:10px;justify-content:center;margin-top:10px">'+
      (s.level<7?'<button class="bb bb-g" onclick="GDWave.level++;GDWave._startLevel()" style="pointer-events:auto;cursor:pointer;font-size:'+fs3+'px;padding:10px 24px;border:none;border-radius:10px;background:linear-gradient(135deg,#4ecdc4,#44a08d);color:#fff;font-weight:600;box-shadow:0 4px 20px rgba(78,205,196,.3)">➡️ Далее</button>':'')+
      '<button class="bb bb-p" onclick="GDWave.state=\'menu\';GDWave._menu()" style="pointer-events:auto;cursor:pointer;font-size:'+fs3+'px;padding:10px 24px;border:none;border-radius:10px;background:rgba(255,255,255,.08);color:var(--tx);font-weight:600;backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,.1)">🏠 Меню</button>'+
      '</div></div>';
  },

  _notify:function(txt){
    var s=this;
    var ui=document.getElementById('gdwUI');
    if(!ui)return;
    var el=document.createElement('div');
    el.style.cssText='position:absolute;top:28%;left:50%;transform:translate(-50%,-50%);background:rgba(78,205,196,.12);backdrop-filter:blur(8px);border:1px solid rgba(78,205,196,.25);border-radius:14px;padding:10px 20px;font-size:'+Math.round(s.w*0.022)+'px;font-weight:700;color:#4ecdc4;text-align:center;pointer-events:none;animation:gdwNot 1.8s ease-out forwards;z-index:10';
    el.textContent='🏅 '+txt;
    ui.appendChild(el);
    setTimeout(function(){if(el.parentNode)el.parentNode.removeChild(el);},1800);
  },

  _drawBg:function(cx,w,h,lv){
    var s=this;
    var bg=cx.createLinearGradient(0,0,0,h);
    var bgc=lv.bg;
    bg.addColorStop(0,bgc[0]);bg.addColorStop(0.5,bgc[1]);bg.addColorStop(1,bgc[2]);
    cx.fillStyle=bg;cx.fillRect(0,0,w,h);

    // Nebula blobs
    for(var i=0;i<s.nebula.length;i++){
      var nb=s.nebula[i];
      var nx=(nb.x-s.scrollX*nb.sp)%(w+nb.r*2)-nb.r;
      if(nx<-nb.r-w)nx+=w+nb.r*2;
      cx.fillStyle=nb.cr;
      cx.beginPath();cx.arc(nx,nb.y,nb.r,0,Math.PI*2);cx.fill();
    }

    // Grid lines
    cx.strokeStyle='rgba(255,255,255,.015)';cx.lineWidth=0.5;
    for(var gx=-(s.scrollX%50);gx<w;gx+=50){cx.beginPath();cx.moveTo(gx,0);cx.lineTo(gx,h);cx.stroke();}

    // Background stars
    for(var i=0;i<s.bgStars.length;i++){
      var bs=s.bgStars[i];
      var sx=(bs.x-s.scrollX*bs.sp)%(w+50);
      if(sx<-50)sx+=w+50;
      cx.globalAlpha=bs.br*(0.5+0.5*Math.sin(Date.now()*0.0008+bs.ph));
      cx.fillStyle='#fff';cx.beginPath();cx.arc(sx,bs.y,bs.sz,0,Math.PI*2);cx.fill();
    }
    cx.globalAlpha=1;
  },

  _drawPlayer:function(cx){
    var s=this;
    var pr=s.psize*0.5;
    cx.save();cx.translate(s.px,s.py);
    var angle=s.pvy*0.05;
    cx.rotate(angle);
    var clr=s.hold?'#4ecdc4':'#ff6b6b';
    var clrL=s.hold?'#7ef5e8':'#ff8a8a';
    var clrD=s.hold?'#1a8a7a':'#cc3333';

    // Outer glow
    cx.shadowColor=clr;cx.shadowBlur=25+Math.sin(Date.now()*0.004)*10;

    // Body - 3D diamond shape with gradient
    var gr=cx.createRadialGradient(-pr*0.2,-pr*0.2,0,0,0,pr);
    gr.addColorStop(0,clrL);
    gr.addColorStop(0.4,clr);
    gr.addColorStop(1,clrD);
    cx.fillStyle=gr;
    cx.beginPath();
    cx.moveTo(pr,0);
    cx.lineTo(0,-pr*0.8);
    cx.lineTo(-pr*0.8,0);
    cx.lineTo(0,pr*0.8);
    cx.closePath();cx.fill();

    // Core highlight
    cx.shadowBlur=0;
    cx.fillStyle='rgba(255,255,255,.25)';
    cx.beginPath();cx.moveTo(pr*0.3,0);cx.lineTo(0,-pr*0.2);cx.lineTo(-pr*0.1,0);cx.lineTo(0,pr*0.2);cx.closePath();cx.fill();

    // Wing details
    cx.strokeStyle='rgba(255,255,255,.08)';cx.lineWidth=1;
    cx.beginPath();cx.moveTo(-pr*0.1,0);cx.lineTo(-pr*0.7,-pr*0.4);cx.moveTo(-pr*0.1,0);cx.lineTo(-pr*0.7,pr*0.4);cx.stroke();

    cx.restore();
  },

  _drawTrail:function(cx){
    var s=this;
    for(var i=0;i<s.trails.length;i++){
      var t=s.trails[i];
      cx.globalAlpha=t.life*0.35;
      if(t.vx){
        cx.fillStyle=t.cl||'#ffd700';
        cx.beginPath();cx.arc(t.x,t.y,t.sz||3,0,Math.PI*2);cx.fill();
        t.x+=t.vx;t.y+=t.vy;t.vx*=0.95;t.vy*=0.95;
      }else{
        cx.fillStyle=s.hold?'#4ecdc4':'#ff6b6b';
        var sz=s.psize*0.18*t.life;
        cx.beginPath();cx.arc(t.x,t.y,sz,0,Math.PI*2);cx.fill();
      }
    }
    cx.globalAlpha=1;
  },

  _drawObstacles:function(cx,w,h,lv){
    var s=this;
    var g=s.h*0.12,ceilY=g,floorY=s.h-g;
    for(var i=0;i<s.objs.length;i++){
      var o=s.objs[i];
      var ox=o.x-s.scrollX;
      if(ox<-120||ox>w+120)continue;
      var th=lv.th||['#e74c3c','#c0392b'];
      if(o.ty==='f'){
        // 3D floor spikes
        cx.shadowColor=th[0];cx.shadowBlur=8;
        for(var si=0;si<o.w;si+=8){
          var grd=cx.createLinearGradient(ox+si,floorY,ox+si,floorY-14);
          grd.addColorStop(0,th[1]);grd.addColorStop(1,th[0]);
          cx.fillStyle=grd;
          cx.beginPath();cx.moveTo(ox+si,floorY);cx.lineTo(ox+si+4,floorY-14);cx.lineTo(ox+si+8,floorY);cx.closePath();cx.fill();
          // Highlight
          cx.fillStyle='rgba(255,255,255,.1)';
          cx.beginPath();cx.moveTo(ox+si+1,floorY-1);cx.lineTo(ox+si+4,floorY-12);cx.lineTo(ox+si+7,floorY-1);cx.closePath();cx.fill();
        }
        cx.shadowBlur=0;
      }else if(o.ty==='c'){
        cx.shadowColor=th[0];cx.shadowBlur=8;
        for(var si=0;si<o.w;si+=8){
          var grd=cx.createLinearGradient(ox+si,ceilY,ox+si,ceilY+14);
          grd.addColorStop(0,th[0]);grd.addColorStop(1,th[1]);
          cx.fillStyle=grd;
          cx.beginPath();cx.moveTo(ox+si,ceilY);cx.lineTo(ox+si+4,ceilY+14);cx.lineTo(ox+si+8,ceilY);cx.closePath();cx.fill();
          cx.fillStyle='rgba(255,255,255,.08)';
          cx.beginPath();cx.moveTo(ox+si+1,ceilY+1);cx.lineTo(ox+si+4,ceilY+12);cx.lineTo(ox+si+7,ceilY+1);cx.closePath();cx.fill();
        }
        cx.shadowBlur=0;
      }else if(o.ty==='b'){
        var bh=o.h||40;
        // 3D block with gradient
        var bg2=cx.createLinearGradient(ox,floorY-bh,ox+o.w,floorY);
        bg2.addColorStop(0,th[0]);bg2.addColorStop(0.5,th[1]);bg2.addColorStop(1,'#1a0a0a');
        cx.shadowColor=th[0];cx.shadowBlur=15;
        cx.fillStyle=bg2;
        s._rr(ox,floorY-bh,o.w,bh,4);cx.fill();
        cx.shadowBlur=0;
        // Top highlight
        cx.fillStyle='rgba(255,255,255,.08)';
        cx.fillRect(ox+2,floorY-bh+2,o.w-4,3);
        // Border glow
        cx.strokeStyle='rgba(255,255,255,.1)';cx.lineWidth=1;
        s._rr(ox,floorY-bh,o.w,bh,4);cx.stroke();
      }else if(o.ty==='s'){
        var sy=o.y;
        var pul=1+Math.sin((s.scrollX+o.x)*0.06)*0.2;
        cx.shadowColor='#ffd700';cx.shadowBlur=20;
        cx.save();cx.translate(ox+o.w/2,sy);
        cx.scale(pul,pul);
        // Star glow
        var sg=cx.createRadialGradient(0,0,0,0,0,10);
        sg.addColorStop(0,'rgba(255,215,0,.6)');sg.addColorStop(1,'rgba(255,215,0,0)');
        cx.fillStyle=sg;cx.beginPath();cx.arc(0,0,10,0,Math.PI*2);cx.fill();
        // Star icon
        cx.fillStyle='#ffd700';cx.font=Math.round(s.psize*0.7)+'px sans-serif';
        cx.textAlign='center';cx.textBaseline='middle';
        cx.fillText('⭐',0,0);
        cx.restore();
        cx.shadowBlur=0;
      }
    }
  },

  _drawParticles:function(cx){
    var s=this;
    for(var i=s.particles.length-1;i>=0;i--){
      var p=s.particles[i];
      p.life-=0.03;
      if(p.life<=0){s.particles.splice(i,1);continue;}
      p.x+=p.vx;p.y+=p.vy;p.vy+=0.05;
      cx.globalAlpha=p.life;
      cx.fillStyle=p.cl;
      cx.beginPath();cx.arc(p.x,p.y,p.sz*p.life,0,Math.PI*2);cx.fill();
    }
    cx.globalAlpha=1;
  },

  _drawUI:function(cx,w,h,lv){
    var s=this;
    var fs=s.psize*0.5;

    // Level name - glassmorphism
    cx.fillStyle='rgba(0,0,0,.4)';s._rr(w*0.015,h*0.015,w*0.24,h*0.055,8);cx.fill();
    cx.strokeStyle='rgba(255,255,255,.05)';cx.lineWidth=1;s._rr(w*0.015,h*0.015,w*0.24,h*0.055,8);cx.stroke();
    cx.fillStyle='#fff';cx.font='bold '+Math.round(fs)+'px sans-serif';
    cx.textAlign='left';cx.textBaseline='middle';
    cx.fillText(s.lvlNames[s.level],w*0.035,h*0.04);

    // Progress bar
    var pbW=w*0.24,pbH=4,pbX=w*0.5-pbW/2,pbY=h*0.022;
    cx.fillStyle='rgba(255,255,255,.06)';s._rr(pbX,pbY,pbW,pbH,2);cx.fill();
    cx.fillStyle=lv.th[0];s._rr(pbX,pbY,pbW*s.progress,pbH,2);cx.fill();

    // Score
    cx.fillStyle='rgba(0,0,0,.4)';s._rr(w*0.74,h*0.015,w*0.245,h*0.055,8);cx.fill();
    cx.strokeStyle='rgba(255,255,255,.05)';cx.lineWidth=1;s._rr(w*0.74,h*0.015,w*0.245,h*0.055,8);cx.stroke();
    cx.fillStyle='#ffd700';cx.font='bold '+Math.round(fs*0.9)+'px sans-serif';
    cx.textAlign='right';cx.textBaseline='middle';
    cx.fillText('⭐ '+s.score,w*0.97,h*0.04);
    cx.textAlign='left';

    // Coins
    cx.fillStyle='rgba(0,0,0,.4)';s._rr(w*0.74,h*0.078,w*0.245,h*0.04,6);cx.fill();
    cx.fillStyle='#4ecdc4';cx.font=Math.round(fs*0.7)+'px sans-serif';
    cx.textAlign='right';cx.textBaseline='middle';
    cx.fillText('🪙 '+s.coins,w*0.97,h*0.097);

    // Combo
    if(s.combo>=2){
      var pul=1+Math.sin(Date.now()*0.006)*0.05;
      cx.save();cx.translate(w*0.5,h*0.46);cx.scale(pul,pul);
      cx.fillStyle='rgba(0,0,0,.4)';s._rr(-w*0.1,-h*0.03,w*0.2,h*0.06,10);cx.fill();
      cx.shadowColor='#ffd700';cx.shadowBlur=12;
      cx.fillStyle='#ffd700';cx.font='bold '+Math.round(fs*1.1)+'px sans-serif';
      cx.textAlign='center';cx.textBaseline='middle';
      cx.fillText('🔥 x'+s.combo,0,0);
      cx.shadowBlur=0;cx.restore();
    }

    // Dead overlay
    if(s.state==='dead'){
      cx.fillStyle='rgba(0,0,0,.75)';cx.fillRect(0,0,w,h);
      if(s.canRestart){
        cx.shadowColor='#ff6b6b';cx.shadowBlur=25;
        cx.fillStyle='#ff6b6b';cx.font='bold '+Math.round(fs*1.3)+'px sans-serif';
        cx.textAlign='center';cx.textBaseline='middle';
        cx.fillText('💀 Разбился!',w*0.5,h*0.38);cx.shadowBlur=0;
        var pul2=0.6+Math.sin(Date.now()*0.003)*0.4;
        cx.globalAlpha=pul2;
        cx.fillStyle='#fff';cx.font=Math.round(fs*0.85)+'px sans-serif';
        cx.fillText('👆 Нажми чтобы продолжить',w*0.5,h*0.52);
        cx.globalAlpha=1;
      }
    }

    // Flash
    if(s.flash>0){cx.fillStyle='rgba(255,255,255,'+s.flash+')';cx.fillRect(0,0,w,h);s.flash-=0.04;}
  },

  _draw:function(){
    var s=this,cx=s.cx,w=s.w,h=s.h;
    var lv=s.LEVELS[s.level];
    s._drawBg(cx,w,h,lv);

    // Ground/ceiling neon lines
    var g=s.h*0.12,ceilY=g,floorY=s.h-g;
    var th=lv.th||['#e74c3c','#c0392b'];
    cx.shadowColor=th[0];cx.shadowBlur=12;
    cx.strokeStyle=th[0];cx.lineWidth=2;
    cx.beginPath();cx.moveTo(0,floorY);cx.lineTo(w,floorY);cx.stroke();
    cx.strokeStyle=th[0]+'44';cx.lineWidth=1;
    cx.beginPath();cx.moveTo(0,ceilY);cx.lineTo(w,ceilY);cx.stroke();
    cx.shadowBlur=0;

    s._drawObstacles(cx,w,h,lv);
    s._drawTrail(cx);
    s._drawPlayer(cx);
    s._drawParticles(cx);

    // Stars collected animation
    for(var i=0;i<s.stars.length;i++){
      var st=s.stars[i];st.life-=0.025;
      if(st.life<=0)continue;
      cx.globalAlpha=st.life;
      var ssz=s.psize*0.35*st.life;
      cx.fillStyle='#ffd700';
      cx.shadowColor='#ffd700';cx.shadowBlur=10;
      cx.beginPath();cx.arc(st.x,st.y,ssz,0,Math.PI*2);cx.fill();
      cx.shadowBlur=0;
    }
    cx.globalAlpha=1;

    s._drawUI(cx,w,h,lv);
  },

  _loop:function(){
    var s=this;
    function l(){
      if(!s.can||!s.cx)return;
      s._upd();
      s._draw();
      requestAnimationFrame(l);
    }
    l();
    s._menu();
  },

  destroy:function(){this.can=null;this.cx=null;this.con=null;}
};

// CSS
(function(){
  var st=document.createElement('style');
  st.textContent='@keyframes gdwNot{0%{opacity:0;transform:translate(-50%,-50%) scale(0.5)}15%{opacity:1;transform:translate(-50%,-50%) scale(1.1)}25%{transform:translate(-50%,-50%) scale(1)}70%{opacity:1}100%{opacity:0;transform:translate(-50%,-50%) translateY(-40px) scale(0.8)}}'+
    '@keyframes gdwFadeIn{0%{opacity:0;transform:scale(0.9)}100%{opacity:1;transform:scale(1)}}'+
    '.gdwLvl:hover{transform:scale(1.08)!important;border-color:rgba(255,255,255,.3)!important}'+
    '.bb{transition:all .2s;cursor:pointer}'+
    '.bb:hover{transform:translateY(-2px)}'+
    '.bb:active{transform:translateY(0)}';
  document.head.appendChild(st);
})();
