var GDWave = {
  state:'menu', level:0, score:0, coins:0, deaths:0, combo:0, maxCombo:0,
  px:0, py:0, pvy:0, psize:0, hold:false, scrollX:0, speed:0, objs:[],
  stars:[], progress:0, levelLen:0, flash:0, deadTimer:0, paused:false,
  canRestart:false, collected:{}, unlocked:{}, trails:[], bgStars:[],
  maxW:700, maxH:500, cx:null, can:null, con:null, onEnd:null,
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

  init:function(con,onEnd){
    var s=this; s.con=con; s.onEnd=onEnd;
    var r=con.getBoundingClientRect();
    s.maxW=Math.min(r.width-2,700);
    s.maxH=Math.min(r.height-2,560);
    con.innerHTML='<div id=gdwContainer style="position:relative;width:'+s.maxW+'px;margin:0 auto"><canvas id=gdwCanvas style="display:block;border-radius:12px;touch-action:none;cursor:pointer;width:100%"></canvas><div id=gdwUI style="position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center"></div></div>';
    s.can=con.querySelector('#gdwCanvas');
    s.can.width=s.maxW; s.can.height=s.maxH;
    s.cx=s.can.getContext('2d');
    s.psize=Math.max(8,s.maxW*0.022);
    s.px=s.maxW*0.2;
    s._load();
    s._bgStarsInit();
    s._bind();
    s._loop();
  },

  _bind:function(){
    var s=this;
    function down(e){e.preventDefault();s.hold=true;if(s.state==='menu')s._startLevel();else if(s.state==='dead'&&s.canRestart)s._startLevel();else if(s.state==='won'){s.state='menu';s._menu();}}
    function up(e){e.preventDefault();s.hold=false;}
    s.can.addEventListener('touchstart',down,{passive:false});
    s.can.addEventListener('touchend',up,{passive:false});
    s.can.addEventListener('mousedown',down);
    s.can.addEventListener('mouseup',up);
    document.addEventListener('keydown',function(e){if(e.code==='Space'||e.code==='ArrowUp'){e.preventDefault();s.hold=true;if(s.state==='menu')s._startLevel();else if(s.state==='dead'&&s.canRestart)s._startLevel();else if(s.state==='won'){s.state='menu';s._menu();}}});
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
    s.collected[id]=true;
    s._save();
    return true;
  },

  _bgStarsInit:function(){
    var s=this; s.bgStars=[];
    for(var i=0;i<40;i++)s.bgStars.push({x:Math.random()*s.maxW,y:Math.random()*s.maxH,sz:0.5+Math.random()*2,sp:0.1+Math.random()*0.3,ph:Math.random()*6.28,br:0.3+Math.random()*0.7});
  },

  _menu:function(){
    var s=this;
    s.state='menu';
    var ui=document.getElementById('gdwUI');
    if(!ui)return;
    var totalLocks=0; for(var i=0;i<8;i++){if(!s.unlocked['level_'+(i+1)]&&i>0)totalLocks++;}
    var anyUnl=false; for(var k in s.collected)anyUnl=true;
    var h='<div style="text-align:center;padding:6px;width:100%;pointer-events:auto">'+
      '<div style="font-size:'+Math.round(s.maxW*0.055)+'px;font-weight:700;margin-bottom:4px">🌊 Волна Челлендж</div>'+
      '<div style="font-size:'+Math.round(s.maxW*0.024)+'px;color:var(--tx2);margin-bottom:8px">Зажми — вверх, отпусти — вниз</div>'+
      '<div style="display:flex;gap:4px;justify-content:center;margin-bottom:8px;flex-wrap:wrap">';
    for(var i=0;i<8;i++){
      var unl=s.unlocked['level_'+(i+1)]||i===0;
      var cur=s.level===i?' style="border:2px solid #fff;transform:scale(1.08)"':'';
      h+='<div class=gdwLvl onclick="GDWave._pickLevel('+i+')" data-lvl="'+i+'"'+(cur||'')+' style="width:'+Math.round(s.maxW*0.095)+'px;padding:'+Math.round(s.maxW*0.008)+'px 0;background:'+(unl?'var(--sf2)':'var(--sf)')+';border-radius:8px;text-align:center;cursor:'+(unl?'pointer':'default')+';pointer-events:auto;opacity:'+(unl?1:0.3)+';transition:all .2s;border:2px solid '+(cur?'#fff':'transparent')+';box-shadow:'+(cur?'0 0 20px rgba(255,255,255,.15)':'none')+'">'+
        '<div style="font-size:'+Math.round(s.maxW*0.028)+'px">'+(unl?['🌊','⚡','🔵','🟣','🟢','🟡','🔴','⚫'][i]:'🔒')+'</div>'+
        '<div style="font-size:'+Math.round(s.maxW*0.016)+'px;color:var(--tx);margin-top:2px">'+(unl?s.lvlNames[i]:'???')+'</div>'+
        '</div>';
    }
    h+='</div>'+
      '<div style="display:flex;gap:6px;justify-content:center;margin-bottom:6px;flex-wrap:wrap;pointer-events:auto">'+
      '<div style="background:var(--sf2);border-radius:8px;padding:4px 10px;font-size:'+Math.round(s.maxW*0.016)+'px"><span style="color:var(--gd)">⭐</span> '+s.score+'</div>'+
      '<div style="background:var(--sf2);border-radius:8px;padding:4px 10px;font-size:'+Math.round(s.maxW*0.016)+'px"><span style="color:var(--cy)">🪙</span> '+s.coins+'</div>'+
      '<div style="background:var(--sf2);border-radius:8px;padding:4px 10px;font-size:'+Math.round(s.maxW*0.016)+'px">💀 '+s.deaths+'</div>'+
      '</div>'+
      '<div style="margin-bottom:6px;pointer-events:auto">'+
      '<button class="b b-g" onclick="GDWave._startLevel()" style="font-size:'+Math.round(s.maxW*0.022)+'px;padding:8px 24px;pointer-events:auto;cursor:pointer">🎮 Играть</button>'+
      '</div>';
    if(anyUnl){
      h+='<div style="max-height:'+Math.round(s.maxH*0.15)+'px;overflow-y:auto;width:90%;pointer-events:auto">'+
        '<div style="font-size:'+Math.round(s.maxW*0.018)+'px;color:var(--tx2);margin-bottom:4px">🏅 Коллекции</div>';
      for(var k in s.COLS){
        var c=s.COLS[k];
        var got=s.collected[k];
        h+='<div style="display:flex;align-items:center;gap:4px;padding:2px 6px;background:'+(got?'var(--g1)':'var(--sf)')+';border-radius:6px;margin-bottom:2px;opacity:'+(got?1:0.4)+'">'+
          '<span>'+c.i+'</span>'+
          '<div style="flex:1;text-align:left;font-size:'+Math.round(s.maxW*0.015)+'px">'+
          '<div style="font-weight:600;color:var(--tx)">'+c.n+'</div>'+
          '<div style="color:var(--tx2);font-size:'+Math.round(s.maxW*0.013)+'px">'+c.d+'</div></div>'+
          (got?'<span style="color:var(--gd);font-size:'+Math.round(s.maxW*0.018)+'px">✅</span>':'<span style="color:var(--tx2);font-size:'+Math.round(s.maxW*0.015)+'px">🔒</span>')+
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
    s.hold=false; s.paused=false; s.deadTimer=0; s.canRestart=false;
    s.py=s.maxH*0.5; s.pvy=0; s.combo=0; s.flash=0;
    s.objs=[]; s.stars=[]; s.trails=[];
    s._genLevel();
    var ui=document.getElementById('gdwUI');
    if(ui)ui.innerHTML='';
  },

  _genLevel:function(){
    var s=this,lv=s.LEVELS[s.level];
    var h=s.maxH,g=s.maxH*0.12,ceilY=g,floorY=s.maxH-g;
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
      seg++;
      var r=rand(0,1);
      if(pat==='intro'){
        if(seg%3===0){for(var i=0;i<2+Math.floor(rand(0,2));i++){objs.push(fspike());x+=20;}x+=40+rand(0,40);}
        else if(seg%4===0){for(var i=0;i<2+Math.floor(rand(0,2));i++){objs.push(cspike());x+=20;}x+=30;}
        else{x+=60+rand(0,60);}
        if(rand(0,1)<0.3&&s.coins<lv.coins){objs.push(star());s.coins++;}
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
        for(var i=0;i<5+Math.floor(rand(0,5));i++){
          if(rand(0,1)<0.5)objs.push(fspike());else objs.push(cspike());
          x+=15;
        }
        x+=10+rand(0,20);
        if(rand(0,1)<0.3){objs.push(block(30+Math.floor(rand(0,3))*20));x+=10;}
        if(rand(0,1)<0.35){objs.push(star());}
      }else if(pat==='gauntlet'){
        for(var i=0;i<8+Math.floor(rand(0,6));i++){
          objs.push(rand(0,1)<0.5?fspike():cspike());
          x+=12;
        }
        x+=5+rand(0,15);
        if(rand(0,1)<0.2){var bh2=20+Math.floor(rand(0,4))*20;objs.push(block(bh2));x+=10;}
        if(rand(0,1)<0.3){objs.push(star());}
      }else if(pat==='inferno'){
        for(var i=0;i<10+Math.floor(rand(0,8));i++){
          objs.push(rand(0,1)<0.5?fspike():cspike());
          x+=10;
        }
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

  _upd:function(dt){
    var s=this;
    if(s.state!=='playing')return;
    var lv=s.LEVELS[s.level];
    var h=s.maxH,g=s.maxH*0.12,ceilY=g,floorY=s.maxH-g;
    var sp=s.speed;

    // Player physics
    if(s.hold){
      s.pvy-=0.9;
      if(s.pvy<-7)s.pvy=-7;
    }else{
      s.pvy+=0.7;
      if(s.pvy>7)s.pvy=7;
    }
    s.py+=s.pvy;
    s.scrollX+=sp;
    s.progress=s.scrollX/s.levelLen;

    // Trail
    s.trails.push({x:s.px,y:s.py,life:1});
    if(s.trails.length>30)s.trails.shift();
    for(var i=0;i<s.trails.length;i++)s.trails[i].life-=0.04;

    // Bounds
    if(s.py<ceilY){s.py=ceilY;s.pvy=0;}
    if(s.py>floorY){s.py=floorY;s.pvy=0;}

    // Collision
    var col=false;
    var pr=s.psize*0.4,cx=s.px,cy=s.py;
    for(var i=0;i<s.objs.length;i++){
      var o=s.objs[i];
      if(o.x<s.scrollX-100)continue;
      if(o.x>s.scrollX+s.maxW+100)break;
      var ox=o.x-s.scrollX;
      if(o.ty==='f'){
        if(cy+pr>h-g-8&&ox<cx+pr&&ox+o.w>cx-pr){col=true;break;}
      }else if(o.ty==='c'){
        if(cy-pr<g+8&&ox<cx+pr&&ox+o.w>cx-pr){col=true;break;}
      }else if(o.ty==='b'){
        var bh=o.h||40;
        if(ox<cx+pr&&ox+o.w>cx-pr&&cy+pr>h-g-bh&&cy-pr<h-g){col=true;break;}
      }else if(o.ty==='s'){
        if(Math.abs(ox+o.w/2-cx)<12&&Math.abs(o.y-cy)<12){
          s.stars.push({x:ox,y:o.y,life:1});
          s.objs.splice(i,1); i--;
          s.coins++; s.combo++; s.score+=10*s.combo;
          if(s.combo>s.maxCombo)s.maxCombo=s.combo;
          var ci=s.COLS;
          if(s.combo>=20&&s._checkCol('combo20')){s._notify(ci.combo20.n);}
          else if(s.combo>=10&&s._checkCol('combo10')){s._notify(ci.combo10.n);}
          if(s.coins>=100&&s._checkCol('coins100')){s._notify(ci.coins100.n);}
          else if(s.coins>=50&&s._checkCol('coins50')){s._notify(ci.coins50.n);}
          s._save();
        }
      }
    }
    if(col){
      s._die(); return;
    }

    // Win
    if(s.progress>=1){
      s.state='won';
      var ci2=s.COLS;
      var lvlKey='level_'+(s.level+1);
      if(!s.unlocked[lvlKey]){
        s.unlocked[lvlKey]=true;
        s.score+=100*(s.level+1);
        s._save();
      }
      if(s.level+1<8)s.unlocked['level_'+(s.level+2)]=true;
      if(s.level===0&&s._checkCol('first')){s._notify(ci2.first.n);}
      if(s.level>=4&&s._checkCol('speed')){s._notify(ci2.speed.n);}
      var allUnl=true;for(var li=0;li<8;li++){if(!s.unlocked['level_'+(li+1)]){allUnl=false;break;}}
      if(allUnl&&s._checkCol('master')){s._notify(ci2.master.n);}
      s._save();
      setTimeout(function(){s._showWin();},400);
    }
  },

  _die:function(){
    var s=this;
    s.state='dead'; s.deaths++; s.deadTimer=0; s.canRestart=false; s.combo=0;
    s._save();
    for(var i=0;i<25;i++){var a=Math.random()*6.28,spd=2+Math.random()*6;s.trails.push({x:s.px+Math.cos(a)*s.psize*0.3,y:s.py+Math.sin(a)*s.psize*0.3,life:1,vx:Math.cos(a)*spd,vy:Math.sin(a)*spd,sz:2+Math.random()*4,cl:['#ff4444','#ff8800','#ffcc00','#fff'][Math.floor(Math.random()*4)]});}
    setTimeout(function(){s.canRestart=true;},500);
  },

  _showWin:function(){
    var s=this;
    var ui=document.getElementById('gdwUI');
    if(!ui)return;
    ui.innerHTML='<div style="text-align:center;padding:20px;width:100%;pointer-events:auto">'+
      '<div style="font-size:'+Math.round(s.maxW*0.07)+'px;margin-bottom:4px">🎉</div>'+
      '<div style="font-size:'+Math.round(s.maxW*0.035)+'px;font-weight:700;color:var(--gd)">Уровень пройден!</div>'+
      '<div style="font-size:'+Math.round(s.maxW*0.02)+'px;color:var(--tx2);margin:4px 0">Счёт: +'+((s.level+1)*100)+'</div>'+
      '<div style="display:flex;gap:8px;justify-content:center;margin-top:8px">'+
      (s.level<7?'<button class="b b-g" onclick="GDWave.level++;GDWave._startLevel()" style="pointer-events:auto;cursor:pointer;font-size:'+Math.round(s.maxW*0.02)+'px">➡️ Следующий</button>':'')+
      '<button class="b b-p" onclick="GDWave.state=\'menu\';GDWave._menu()" style="pointer-events:auto;cursor:pointer;font-size:'+Math.round(s.maxW*0.02)+'px">🏠 Меню</button>'+
      '</div></div>';
  },

  _notify:function(txt){
    var s=this;
    var ui=document.getElementById('gdwUI');
    if(!ui)return;
    var el=document.createElement('div');
    el.style.cssText='position:absolute;top:30%;left:50%;transform:translate(-50%,-50%);background:rgba(251,191,36,.15);border:2px solid var(--gd);border-radius:12px;padding:8px 16px;font-size:'+Math.round(s.maxW*0.025)+'px;font-weight:700;color:var(--gd);text-align:center;pointer-events:none;animation:gdwNot 1.5s ease-out forwards;z-index:10';
    el.textContent='🏅 '+txt;
    ui.appendChild(el);
    setTimeout(function(){if(el.parentNode)el.parentNode.removeChild(el);},1500);
  },

  _draw:function(){
    var s=this,cx=s.cx,w=s.maxW,h=s.maxH;
    var lv=s.LEVELS[s.level];
    var g=s.maxH*0.12,ceilY=g,floorY=s.maxH-g;

    // Background
    var bg=cx.createLinearGradient(0,0,0,h);
    var bgc=lv.bg;
    bg.addColorStop(0,bgc[0]);bg.addColorStop(0.5,bgc[1]);bg.addColorStop(1,bgc[2]);
    cx.fillStyle=bg;cx.fillRect(0,0,w,h);

    // Grid lines
    cx.strokeStyle='rgba(255,255,255,.02)';cx.lineWidth=0.5;
    for(var gx=-(s.scrollX%40);gx<w;gx+=40){cx.beginPath();cx.moveTo(gx,0);cx.lineTo(gx,h);cx.stroke();}

    // Ground/ceiling lines
    cx.shadowColor='rgba(255,255,255,.05)';cx.shadowBlur=10;
    cx.strokeStyle='rgba(255,255,255,.1)';cx.lineWidth=3;
    cx.beginPath();cx.moveTo(0,floorY);cx.lineTo(w,floorY);cx.stroke();
    cx.beginPath();cx.moveTo(0,ceilY);cx.lineTo(w,ceilY);cx.stroke();
    cx.shadowBlur=0;

    // Obstacles
    for(var i=0;i<s.objs.length;i++){
      var o=s.objs[i];
      var ox=o.x-s.scrollX;
      if(ox<-100||ox>w+100)continue;
      var th=lv.th||['#e74c3c','#c0392b'];
      if(o.ty==='f'){
        for(var si=0;si<o.w;si+=8){
          cx.fillStyle=th[si%2===0?0:1];
          cx.shadowColor=th[0];cx.shadowBlur=8;
          cx.beginPath();cx.moveTo(ox+si,floorY);cx.lineTo(ox+si+4,floorY-12);cx.lineTo(ox+si+8,floorY);cx.closePath();cx.fill();
        }
        cx.shadowBlur=0;
      }else if(o.ty==='c'){
        for(var si=0;si<o.w;si+=8){
          cx.fillStyle=th[si%2===0?0:1];
          cx.shadowColor=th[0];cx.shadowBlur=8;
          cx.beginPath();cx.moveTo(ox+si,ceilY);cx.lineTo(ox+si+4,ceilY+12);cx.lineTo(ox+si+8,ceilY);cx.closePath();cx.fill();
        }
        cx.shadowBlur=0;
      }else if(o.ty==='b'){
        var bh=o.h||40;
        cx.shadowColor=th[0];cx.shadowBlur=12;
        var bg2=cx.createLinearGradient(ox,0,ox+o.w,0);
        bg2.addColorStop(0,th[0]);bg2.addColorStop(1,th[1]);
        cx.fillStyle=bg2;
        cx.beginPath();cx.roundRect(ox,floorY-bh,o.w,bh,3);cx.fill();
        cx.shadowBlur=0;
        cx.strokeStyle='rgba(255,255,255,.15)';cx.lineWidth=1;cx.beginPath();cx.roundRect(ox,floorY-bh,o.w,bh,3);cx.stroke();
      }else if(o.ty==='s'){
        var sy=o.y;
        cx.shadowColor='#ffd700';cx.shadowBlur=15;
        cx.fillStyle='#ffd700';cx.font=Math.round(s.psize*0.65)+'px sans-serif';
        cx.textAlign='center';cx.textBaseline='middle';
        var pul=1+Math.sin((s.scrollX+o.x)*0.05)*0.15;
        cx.save();cx.translate(ox+o.w/2,sy);cx.scale(pul,pul);cx.fillText('⭐',0,0);cx.restore();
        cx.shadowBlur=0;
      }
    }

    // Trail
    for(var i=0;i<s.trails.length;i++){
      var t=s.trails[i];
      cx.globalAlpha=t.life*0.3;
      cx.fillStyle=s.hold?'#4ecdc4':'#ff6b6b';
      var sz=t.sz||(s.psize*0.15*t.life);
      cx.beginPath();cx.arc(t.x,t.y,sz,0,Math.PI*2);cx.fill();
    }
    cx.globalAlpha=1;

    // Player (wave)
    var pr=s.psize*0.5;
    cx.save();cx.translate(s.px,s.py);
    var angle=s.pvy*0.06;
    cx.rotate(angle);
    // Glow
    cx.shadowColor=s.hold?'#4ecdc4':'#ff6b6b';
    cx.shadowBlur=20+Math.sin(Date.now()*0.005)*8;
    // Body
    var gr=cx.createRadialGradient(0,0,0,0,0,pr);
    gr.addColorStop(0,s.hold?'#7ef5e8':'#ff8a8a');
    gr.addColorStop(0.5,s.hold?'#4ecdc4':'#ff6b6b');
    gr.addColorStop(1,s.hold?'#1a8a7a':'#cc3333');
    cx.fillStyle=gr;
    cx.beginPath();
    cx.moveTo(pr,0);cx.lineTo(-pr*0.6,-pr*0.7);cx.lineTo(-pr*0.2,0);cx.lineTo(-pr*0.6,pr*0.7);
    cx.closePath();cx.fill();
    cx.shadowBlur=0;
    // Inner highlight
    cx.fillStyle='rgba(255,255,255,.2)';
    cx.beginPath();cx.moveTo(pr*0.3,0);cx.lineTo(-pr*0.1,-pr*0.3);cx.lineTo(0,0);cx.lineTo(-pr*0.1,pr*0.3);cx.closePath();cx.fill();
    cx.restore();

    // Stars collected animation
    for(var i=0;i<s.stars.length;i++){
      var st=s.stars[i];st.life-=0.03;
      if(st.life<=0)continue;
      cx.globalAlpha=st.life;
      cx.fillStyle='#ffd700';
      var ssz=s.psize*0.3*st.life;
      cx.beginPath();cx.arc(st.x,st.y,ssz,0,Math.PI*2);cx.fill();
    }
    cx.globalAlpha=1;

    // UI overlay
    // Level name
    cx.fillStyle='rgba(0,0,0,.5)';cx.beginPath();cx.roundRect(w*0.02,h*0.02,w*0.25,h*0.05,6);cx.fill();
    cx.fillStyle='#fff';cx.font='bold '+Math.round(s.psize*0.55)+'px sans-serif';
    cx.textAlign='left';cx.textBaseline='middle';
    cx.fillText(s.lvlNames[s.level],w*0.03,h*0.043);

    // Progress bar
    var pbW=w*0.22,pbH=4,pbX=w*0.5-pbW/2,pbY=h*0.025;
    cx.fillStyle='rgba(255,255,255,.1)';cx.beginPath();cx.roundRect(pbX,pbY,pbW,pbH,2);cx.fill();
    cx.fillStyle=lv.th[0];cx.beginPath();cx.roundRect(pbX,pbY,pbW*s.progress,pbH,2);cx.fill();

    // Score
    cx.fillStyle='rgba(0,0,0,.5)';cx.beginPath();cx.roundRect(w*0.73,h*0.02,w*0.25,h*0.05,6);cx.fill();
    cx.fillStyle='#ffd700';cx.font='bold '+Math.round(s.psize*0.5)+'px sans-serif';
    cx.textAlign='right';cx.textBaseline='middle';
    cx.fillText('⭐ '+s.score,w*0.96,h*0.043);
    cx.textAlign='left';

    // Coins
    cx.fillStyle='rgba(0,0,0,.5)';cx.beginPath();cx.roundRect(w*0.73,h*0.08,w*0.25,h*0.04,6);cx.fill();
    cx.fillStyle='#4ecdc4';cx.font=Math.round(s.psize*0.4)+'px sans-serif';
    cx.textAlign='right';cx.textBaseline='middle';
    cx.fillText('🪙 '+s.coins,w*0.96,h*0.098);

    // Combo
    if(s.combo>=2){
      cx.fillStyle='rgba(0,0,0,.5)';cx.beginPath();cx.roundRect(w*0.4,h*0.45,w*0.2,h*0.06,8);cx.fill();
      cx.shadowColor='#ffd700';cx.shadowBlur=10;
      cx.fillStyle='#ffd700';cx.font='bold '+Math.round(s.psize*0.6)+'px sans-serif';
      cx.textAlign='center';cx.textBaseline='middle';
      cx.fillText('🔥 x'+s.combo,w*0.5,h*0.48);
      cx.shadowBlur=0;
    }

    // Dead overlay
    if(s.state==='dead'){
      cx.fillStyle='rgba(0,0,0,.7)';cx.fillRect(0,0,w,h);
      if(s.canRestart){
        cx.fillStyle='#ff6b6b';cx.font='bold '+Math.round(s.psize*0.7)+'px sans-serif';
        cx.textAlign='center';cx.textBaseline='middle';
        cx.shadowColor='#ff6b6b';cx.shadowBlur=20;
        cx.fillText('💀 Разбился!',w*0.5,h*0.4);cx.shadowBlur=0;
        var pul=0.7+Math.sin(Date.now()*0.004)*0.3;
        cx.globalAlpha=pul;
        cx.fillStyle='#fff';cx.font='bold '+Math.round(s.psize*0.45)+'px sans-serif';
        cx.fillText('👆 Нажми чтобы продолжить',w*0.5,h*0.52);
        cx.globalAlpha=1;
      }
    }

    // Flash
    if(s.flash>0){cx.fillStyle='rgba(255,255,255,'+s.flash+')';cx.fillRect(0,0,w,h);s.flash-=0.05;}
  },

  _loop:function(){
    var s=this;
    function l(){
      if(!s.can||!s.cx)return;
      s._upd(1);
      s._draw();
      requestAnimationFrame(l);
    }
    l();
    s._menu();
  },

  destroy:function(){this.can=null;this.cx=null;this.con=null;}
};

// CSS for notification
(function(){
  var st=document.createElement('style');
  st.textContent='@keyframes gdwNot{0%{opacity:0;transform:translate(-50%,-50%) scale(0.5)}20%{opacity:1;transform:translate(-50%,-50%) scale(1.1)}30%{transform:translate(-50%,-50%) scale(1)}70%{opacity:1}100%{opacity:0;transform:translate(-50%,-50%) translateY(-30px) scale(0.8)}}'+
    '.gdwLvl:hover{transform:scale(1.05)!important;border-color:rgba(255,255,255,.2)!important}';
  document.head.appendChild(st);
})();
