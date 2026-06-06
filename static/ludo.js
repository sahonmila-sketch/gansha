var LUDO = {
  CANVAS_W: 0, CANVAS_H: 0, CELL: 0,
  B_SIZE: 15, OFF: 6,
  canvas: null, ctx: null, container: null,
  onEnd: null, rating: 0, cardBonus: 1,
  gameOver: false, currentPlayer: 0, diceValue: 0,
  diceRolled: false, canRoll: true, moveableTokens: [],
  selectedToken: -1, diceAnimating: false,
  players: [], tokens: [],
  isOnline: false, ws: null, roomId: null, playerIndex: 0,

  PATH: [
    [6,1],[6,2],[6,3],[6,4],[6,5],[6,6],
    [5,6],[4,6],[3,6],[2,6],[1,6],[0,6],
    [0,5],[0,4],[0,3],[0,2],[0,1],[0,0],
    [1,0],[2,0],[3,0],[4,0],[5,0],[6,0],
    [7,0],[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],
    [8,6],[8,7],[8,8],[8,9],[8,10],[8,11],[8,12],[8,13],
    [8,14],[9,14],[10,14],[11,14],[12,14],[13,14],[14,14],
    [14,13],[14,12],[14,11],[14,10],[14,9],[14,8]
  ],

  ENTRY: {0:0, 1:13, 2:26, 3:39},

  PCOL: ['#ef4444','#22c55e','#3b82f6','#eab308'],
  PLT: ['#fca5a5','#86efac','#93c5fd','#fde68a'],
  PDK: ['#991b1b','#166534','#1e40af','#854d0e'],
  PNAME: ['\u041A\u0440\u0430\u0441\u043D\u044B\u0439','\u0417\u0435\u043B\u0451\u043D\u044B\u0439','\u0421\u0438\u043D\u0438\u0439','\u0416\u0451\u043B\u0442\u044B\u0439'],

  HOME_STRETCH: {
    0: [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],
    1: [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],
    2: [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],
    3: [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]]
  },

  BASES: {
    0: [[13,1],[13,3],[14,1],[14,3]],
    1: [[0,11],[0,13],[1,11],[1,13]],
    2: [[13,11],[13,13],[14,11],[14,13]],
    3: [[0,1],[0,3],[1,1],[1,3]]
  },

  _p: [], _msg: null, _msgT: 0, _msgTO: null, _diceA: 0,
  _moveA: null, _diceB: 0, _pulse: 0, _intro: 1, _turnPulse: 0,
  SAFE: [0, 8, 13, 21, 26, 34, 39, 47],

  init: function(container, onEnd, rating, cardBonus, online, roomId, existingWs, pi) {
    var s = this;
    s.container = container;
    s.onEnd = onEnd;
    s.rating = rating||0;
    s.cardBonus = cardBonus||1;
    s.isOnline = online||false;
    s.roomId = roomId||null;
    s.gameOver = false;
    s.currentPlayer = 0;
    s.diceValue = 0;
    s.diceRolled = false;
    s.canRoll = true;
    s.selectedToken = -1;
    s.moveableTokens = [];
    s._p = []; s._msg = null; s._msgTO = null;
    s._moveA = null; s._diceB = 0; s._pulse = 0; s._intro = 1; s._turnPulse = 0;
    s.playerIndex = pi||0;
    s.ws = null;

    var r = container.getBoundingClientRect();
    var mw = Math.min(r.width-2, 480);
    s.CELL = Math.floor((mw-s.OFF*2)/s.B_SIZE);
    if(s.CELL<10) s.CELL=10;
    s.CANVAS_W = s.CELL*s.B_SIZE+s.OFF*2;
    s.CANVAS_H = s.CANVAS_W+Math.round(s.CELL*1.6);

    container.innerHTML='<div style="display:flex;flex-direction:column;align-items:center;padding:2px"><canvas id=ludoCanvas width='+s.CANVAS_W+' height='+s.CANVAS_H+' style="border-radius:12px;touch-action:none;display:block;box-shadow:0 0 50px rgba(0,0,0,.6),0 0 100px rgba(100,50,200,.08)"></canvas></div>';

    s.canvas = container.querySelector('#ludoCanvas');
    s.ctx = s.canvas.getContext('2d');

    s.tokens = [];
    for(var p=0;p<4;p++){s.tokens[p]=[];for(var t=0;t<4;t++)s.tokens[p][t]={state:'base',pos:-1,pathPos:-1,homeIdx:-1,x:0,y:0,player:p,ax:0,ay:0,bo:0};}
    s._placeBases();

    if(s.isOnline)s.players=[{id:0,name:s.PNAME[0],isHuman:true,tokensLeft:4},{id:1,name:s.PNAME[1],isHuman:true,tokensLeft:4},{id:2,name:s.PNAME[2],isHuman:false,tokensLeft:4},{id:3,name:s.PNAME[3],isHuman:false,tokensLeft:4}];
    else s.players=[{id:0,name:s.PNAME[0],isHuman:true,tokensLeft:4},{id:1,name:s.PNAME[1],isHuman:false,tokensLeft:4},{id:2,name:s.PNAME[2],isHuman:false,tokensLeft:4},{id:3,name:s.PNAME[3],isHuman:false,tokensLeft:4}];

    s.canvas.addEventListener('touchstart',function(e){e.preventDefault();},{passive:false});
    s.canvas.addEventListener('touchend',function(e){s.onTouch(e);},{passive:false});
    s.canvas.addEventListener('mousedown',function(e){s.onMouse(e);});
    s._loop();

    if(s.isOnline){
      if(existingWs){s.ws=existingWs;var s2=s;s.ws.onmessage=function(e){s2._onWS(e);};s.ws.onclose=function(){if(!s2.gameOver&&!s2._wsC)s2.msg('\u0421\u043E\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u0435 \u043F\u043E\u0442\u0435\u0440\u044F\u043D\u043E',3000);};}
      else if(s.roomId)s._cWS(s.roomId);
      else s._cWS('new');
      if(!existingWs)s.msg('\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435...',3000);
      s.draw();
    }else{
      s.msg(s.PNAME[0]+' \u0445\u043E\u0434\u0438\u0442',2000);
      s.draw();
    }
  },

  _placeBases: function(){
    var s=this;
    for(var p=0;p<4;p++)for(var t=0;t<4;t++){var o=s.tokens[p][t];o.state='base';o.pos=-1;o.pathPos=-1;o.homeIdx=-1;o.x=s.BASES[p][t][1]*s.CELL+s.OFF+s.CELL/2;o.y=s.BASES[p][t][0]*s.CELL+s.OFF+s.CELL/2;o.ax=o.x;o.ay=o.y;o.bo=0;}
  },

  _cWS: function(rid){
    var s=this;
    var p=window.location.protocol==='https:'?'wss:':'ws:';
    var u=p+'//'+window.location.host+'/ws/ludo/'+rid+'/'+window.uid;
    try{
      s.ws=new WebSocket(u);
      s.ws.onmessage=function(e){s._onWS(e);};
      s.ws.onclose=function(){if(!s.gameOver&&!s._wsC)s.msg('\u0421\u043E\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u0435 \u043F\u043E\u0442\u0435\u0440\u044F\u043D\u043E',3000);};
      s.ws.onerror=function(){if(!s.gameOver)s.msg('\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u043E\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u044F',3000);};
    }catch(e){s.msg('\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u044C\u0441\u044F',3000);}
  },

  _sWS: function(m){if(this.ws&&this.ws.readyState===WebSocket.OPEN)this.ws.send(JSON.stringify(m));},

  _onWS: function(e){
    var s=this;
    var m=JSON.parse(e.data);
    switch(m.type){
      case'room_created':s.roomId=m.room_id;s.msg('\u0420\u043E\u043E\u043C: '+m.room_id,60000);s.draw();if(s._onRC)s._onRC(m.room_id);break;
      case'room_ready':s.playerIndex=m.index;s.msg('\u0421\u043E\u043F\u0435\u0440\u043D\u0438\u043A \u043D\u0430\u0448\u0435\u043B\u0441\u044F!',1500);s.draw();if(s.playerIndex===0){setTimeout(function(){s._onLT();},2000);}else{s.msg('\u0425\u043E\u0434 \u0441\u043E\u043F\u0435\u0440\u043D\u0438\u043A\u0430...',2000);s.draw();}break;
      case'roll':s._onOR(m);break;
      case'move':s._onOM(m);break;
      case'end_turn':s._onET();break;
      case'game_over':s._onRGO(m);break;
      case'opponent_disconnected':case'opponent_left':s.msg('\u0421\u043E\u043F\u0435\u0440\u043D\u0438\u043A \u043E\u0442\u043A\u043B\u044E\u0447\u0438\u043B\u0441\u044F',3000);s.gameOver=true;s.draw();break;
      case'error':s.msg(m.message,3000);break;
    }
  },

  _onLT: function(){var s=this;if(s.gameOver)return;s._sfx('enter');s.msg('\u0422\u0432\u043E\u0439 \u0445\u043E\u0434!',1500);s.draw();},
  _onOR: function(m){var s=this;if(s.gameOver)return;s.diceValue=m.value;s.diceRolled=true;s.canRoll=false;s._diceB=8;s._sfx('dice');s.msg('\u0421\u043E\u043F\u0435\u0440\u043D\u0438\u043A \u0432\u044B\u043F\u0430\u043B: '+m.value,1000);s.draw();},
  _onOM: function(m){var s=this;if(s.gameOver)return;var o=s.tokens[m.player][m.token];var fx=o.x,fy=o.y;s._appMove(m.player,m.token,s.diceValue);if(o.state!=='home'){s._moveA={pl:m.player,ti:m.token,fx:fx,fy:fy,tx:o.x,ty:o.y,fr:0,tf:10,loc:false};o.x=fx;o.y=fy;o.ax=fx;o.ay=fy;}s.draw();if(s.diceValue===6){setTimeout(function(){s.msg('\u0421\u043E\u043F\u0435\u0440\u043D\u0438\u043A \u0431\u0440\u043E\u0441\u0430\u0435\u0442 \u0435\u0449\u0451...',1000);s.draw();},500);}else{s.currentPlayer=(s.currentPlayer+1)%2;s.diceRolled=false;s.canRoll=true;s.selectedToken=-1;s.moveableTokens=[];setTimeout(function(){s._sfx('enter');s.msg('\u0422\u0432\u043E\u0439 \u0445\u043E\u0434!',1500);s.draw();},700);}},
  _onET: function(){var s=this;if(s.gameOver)return;s.currentPlayer=(s.currentPlayer+1)%2;s.diceRolled=false;s.canRoll=true;s.selectedToken=-1;s.moveableTokens=[];s._sfx('enter');s.msg('\u0422\u0432\u043E\u0439 \u0445\u043E\u0434!',1500);s.draw();},
  _onRGO: function(m){var s=this;s.gameOver=true;s._sfx('victory');s.msg('\u0421\u043E\u043F\u0435\u0440\u043D\u0438\u043A \u043F\u043E\u0431\u0435\u0434\u0438\u043B!',5000);s.draw();setTimeout(function(){if(s.onEnd)s.onEnd(m.player,m.score||100);},2000);},

  msg: function(t,d){var s=this;s._msg=t;s._msgT=d||1500;if(s._msgTO)clearTimeout(s._msgTO);s._msgTO=setTimeout(function(){s._msg=null;s.draw();},s._msgT);s.draw();},

  _loop: function(){
    var s=this;
    function l(){
      if(!s.canvas)return;
      var nd=false,alive=false;
      for(var i=0;i<s._p.length;i++){var pt=s._p[i];pt.x+=pt.vx;pt.y+=pt.vy;pt.vy+=0.15;pt.life-=0.025;if(pt.life>0){nd=true;alive=true;}}
      var k=[];for(var i2=0;i2<s._p.length;i2++){if(s._p[i2].life>0)k.push(s._p[i2]);}s._p=k;
      if(!s.gameOver){
        if(s._moveA){var an=s._moveA;an.fr++;var pc=Math.min(an.fr/an.tf,1);var es=pc<0.5?2*pc*pc:-1+(4-2*pc)*pc;var to=s.tokens[an.pl][an.ti];to.ax=an.fx+(an.tx-an.fx)*es;to.ay=an.fy+(an.ty-an.fy)*es;if(pc>=1){to.ax=an.tx;to.ay=an.ty;to.x=an.tx;to.y=an.ty;to.bo=8;s._moveA=null;if(an.loc)setTimeout(function(){s._after();},200);}nd=true;}
        s._pulse+=0.03;
        if(s._diceB>0){s._diceB*=0.85;if(s._diceB<0.3)s._diceB=0;nd=true;}
        if(s._intro>0){s._intro-=0.015;if(s._intro<0)s._intro=0;nd=true;}
        s._turnPulse+=0.04;
        for(var bp=0;bp<4;bp++)for(var bt=0;bt<4;bt++){if(s.tokens[bp][bt].bo>0){s.tokens[bp][bt].bo*=0.75;if(s.tokens[bp][bt].bo<0.3)s.tokens[bp][bt].bo=0;nd=true;}}
      }else{
        // After game over: still animate particles, pulse
        s._pulse+=0.03;
        s._turnPulse+=0.04;
        if(alive)nd=true;
      }
      if(nd||k.length>0||alive)s.draw();
      requestAnimationFrame(l);
    }
    l();
  },

  rollDice: function(){
    var s=this;
    if(s.diceRolled||s.diceAnimating||s.gameOver)return;
    if(!s.players[s.currentPlayer].isHuman)return;
    if(s.isOnline&&s.currentPlayer!==s.playerIndex)return;
    s.diceAnimating=true;s._diceA=0;s._diceB=0;
    var ri=setInterval(function(){
      s.diceValue=Math.floor(Math.random()*6)+1;s._diceB=4+Math.random()*4;s.draw();s._diceA++;
      if(s._diceA>=12){clearInterval(ri);s.diceValue=Math.floor(Math.random()*6)+1;s.diceAnimating=false;s.diceRolled=true;s.canRoll=false;s._diceB=10;if(s.isOnline)s._sWS({type:'roll',value:s.diceValue,player:s.currentPlayer});s._sfx('dice');s.processDice();s.draw();}
    },55);
  },

  processDice: function(){
    var s=this;
    var p=s.currentPlayer,dv=s.diceValue;s.moveableTokens=[];
    for(var t=0;t<4;t++){if(s.getMoves(p,t,dv)>0)s.moveableTokens.push(t);}
    if(s.moveableTokens.length===0){s._sfx('error');s.msg('\u041D\u0435\u0442 \u0445\u043E\u0434\u0430!',1000);setTimeout(function(){s._after();},1200);return;}
    if(s.moveableTokens.length===1)s._doMove(p,s.moveableTokens[0],dv);
    else{s.selectedToken=-1;s.msg('\u0412\u044B\u0431\u0435\u0440\u0438 \u0444\u0438\u0448\u043A\u0443',800);s.draw();}
  },

  getMoves: function(pl,ti,st){
    var s=this;
    var o=s.tokens[pl][ti];if(o.state==='home')return 0;if(o.state==='base')return st===6?1:0;
    if(o.state==='path'){var np=o.pathPos+st;if(np>=52){var hs=np-52;if(hs<6&&!s._isHO(pl,hs))return 1;return 0;}var ci=np%52;var oc=s._getO(ci);if(oc&&oc.player===pl)return 0;return 1;}
    if(o.state==='home_stretch'){var ni=o.homeIdx+st;if(ni<6&&!s._isHO(pl,ni))return 1;return 0;}
    return 0;
  },

  _getO: function(pi){var s=this;for(var p=0;p<4;p++)for(var t=0;t<4;t++){var o=s.tokens[p][t];if(o.state==='path'&&o.pathPos%52===pi)return{player:p,token:t};}return null;},
  _isHO: function(pl,idx){var s=this;for(var t=0;t<4;t++){var o=s.tokens[pl][t];if(o.state==='home_stretch'&&o.homeIdx===idx)return true;}return false;},

  _doMove: function(pl,ti,st){
    var s=this;
    s.selectedToken=-1;s.moveableTokens=[];
    var o=s.tokens[pl][ti];var fx=o.x,fy=o.y,fs=o.state;
    s._appMove(pl,ti,st);
    if(s.isOnline&&pl===s.playerIndex)s._sWS({type:'move',player:pl,token:ti,steps:st});
    if(fs!=='home'&&o.state!=='home'&&(o.x!==fx||o.y!==fy)){s._moveA={pl:pl,ti:ti,fx:fx,fy:fy,tx:o.x,ty:o.y,fr:0,tf:10,loc:true};o.x=fx;o.y=fy;o.ax=fx;o.ay=fy;s._trail(fx,fy,s.PCOL[pl]);}else{s.draw();setTimeout(function(){s._after();},200);}
  },

  _trail: function(x,y,c){var s=this;for(var i=0;i<6;i++)s._p.push({x:x+(Math.random()-0.5)*12,y:y+(Math.random()-0.5)*12,vx:(Math.random()-0.5)*0.8,vy:-0.6-Math.random()*0.6,color:c,size:1.5+Math.random()*2.5,life:0.6});},

  _appMove: function(pl,ti,st){
    var s=this;
    var o=s.tokens[pl][ti];
    if(o.state==='base'&&st===6){s._sfx('enter');o.state='path';o.pathPos=s.ENTRY[pl];o.pos=o.pathPos;s._updPos(o);o.bo=10;s._checkCap(pl,o.pathPos);}
    else if(o.state==='path'){var np=o.pathPos+st;if(np>=52){var hi=np-52;o.state='home_stretch';o.homeIdx=hi;o.pathPos=-1;s._updPos(o);o.bo=8;if(hi>=6){o.state='home';s._sfx('home');s.players[pl].tokensLeft--;s._burst(o.x,o.y,s.PCOL[pl]);if(s.players[pl].tokensLeft<=0){s._win(pl);return;}}else s._sfx('move');}else{s._checkCap(pl,np);o.pathPos=np;o.pos=np;s._updPos(o);o.bo=7;s._sfx('move');}}
    else if(o.state==='home_stretch'){var ni=o.homeIdx+st;o.homeIdx=ni;s._updPos(o);o.bo=7;if(ni>=6){o.state='home';s._sfx('home');s.players[pl].tokensLeft--;s._burst(o.x,o.y,s.PCOL[pl]);if(s.players[pl].tokensLeft<=0){s._win(pl);return;}}else s._sfx('move');}
  },

  _updPos: function(o){
    var s=this;
    if(o.state==='path'&&o.pathPos>=0){var idx=o.pathPos%52;o.x=s.OFF+s.PATH[idx][1]*s.CELL+s.CELL/2;o.y=s.OFF+s.PATH[idx][0]*s.CELL+s.CELL/2;}
    else if(o.state==='home_stretch'&&o.homeIdx>=0){var hi=Math.min(o.homeIdx,5);o.x=s.OFF+s.HOME_STRETCH[o.player][hi][1]*s.CELL+s.CELL/2;o.y=s.OFF+s.HOME_STRETCH[o.player][hi][0]*s.CELL+s.CELL/2;}
  },

  _checkCap: function(pl,pi){var s=this;for(var p=0;p<4;p++){if(p===pl)continue;for(var t=0;t<4;t++){var o=s.tokens[p][t];if(o.state==='path'&&o.pathPos%52===pi){s._sfx('capture');s._burst(o.x,o.y,s.PCOL[p]);o.state='base';o.pathPos=-1;o.pos=-1;o.x=s.BASES[p][t][1]*s.CELL+s.OFF+s.CELL/2;o.y=s.BASES[p][t][0]*s.CELL+s.OFF+s.CELL/2;o.ax=o.x;o.ay=o.y;return;}}}},

  _after: function(){
    var s=this;
    if(s.gameOver)return;s.diceRolled=false;s.canRoll=true;s.selectedToken=-1;s.moveableTokens=[];
    if(s.diceValue===6){s.msg('\u0428\u0435\u0441\u0442\u0451\u0440\u043A\u0430! \u0415\u0449\u0451 \u0445\u043E\u0434!',800);if(s.isOnline&&s.currentPlayer!==s.playerIndex)return;if(!s.players[s.currentPlayer].isHuman){setTimeout(function(){s.aiTurn();},800);return;}s.rollDice();}
    else{if(s.isOnline){s._sWS({type:'end_turn'});var op=s.playerIndex===0?1:0;s.currentPlayer=op;s.msg('\u0425\u043E\u0434 \u0441\u043E\u043F\u0435\u0440\u043D\u0438\u043A\u0430...',2000);s.draw();}else s.nextTurn();}
  },

  nextTurn: function(){
    var s=this;
    if(s.isOnline)return;s.currentPlayer=(s.currentPlayer+1)%4;s.diceRolled=false;s.canRoll=true;s.selectedToken=-1;s.moveableTokens=[];
    if(s.players[s.currentPlayer].isHuman){s._sfx('enter');s.msg(s.PNAME[s.currentPlayer]+' \u0445\u043E\u0434\u0438\u0442',1000);s.draw();}
    else{s.msg(s.PNAME[s.currentPlayer]+' \u0434\u0443\u043C\u0430\u0435\u0442...',1200);setTimeout(function(){s.aiTurn();},1200);}
  },

  aiTurn: function(){
    var s=this;
    if(s.gameOver||s.players[s.currentPlayer].isHuman)return;
    s.diceValue=Math.floor(Math.random()*6)+1;s.diceRolled=true;s.canRoll=false;s._diceB=8;s.draw();
    var bi=-1,bs=-999;for(var t=0;t<4;t++){if(s.getMoves(s.currentPlayer,t,s.diceValue)>0){var sc=s._eval(s.currentPlayer,t,s.diceValue);if(sc>bs){bs=sc;bi=t;}}}
    if(bi>=0)s._doMove(s.currentPlayer,bi,s.diceValue);
    else{s._sfx('error');s.msg('\u041D\u0435\u0442 \u0445\u043E\u0434\u0430!',1000);setTimeout(function(){s.diceRolled=false;s.canRoll=true;s.nextTurn();},1200);}
  },

  _eval: function(pl,ti,st){
    var s=this;
    var o=s.tokens[pl][ti],sc=0;
    if(o.state==='base')sc+=50;
    if(o.state==='path'){var np=o.pathPos+st;if(np>=52)sc+=80;if(np>=52)sc+=(6-(np-52))*10;var occ=s._getO(np%52);if(occ&&occ.player!==pl)sc+=40;if(o.pathPos%52===s.ENTRY[pl])sc+=20;}
    if(o.state==='home_stretch'){sc+=60+o.homeIdx*5;if(o.homeIdx+st>=6)sc+=100;}
    for(var si=0;si<s.SAFE.length;si++){if(o.state==='path'&&o.pathPos%52===s.SAFE[si])sc+=15;}
    return sc;
  },

  _win: function(pl){
    var s=this;
    s.gameOver=true;s._sfx('victory');s.msg('\u0418\u0433\u0440\u043E\u043A '+s.PNAME[pl]+' \u043F\u043E\u0431\u0435\u0434\u0438\u043B!',5000);s.draw();
    var sc=(4-s.players[pl].tokensLeft)*100;for(var t=0;t<4;t++){if(s.tokens[pl][t].state==='home')sc+=25;}
    if(s.isOnline)s._sWS({type:'game_over',player:pl,score:sc});
    setTimeout(function(){if(s.onEnd)s.onEnd(pl,sc);},2000);
  },

  onTouch: function(e){var t=e.changedTouches[0];if(t)this._click(t.clientX,t.clientY);},
  onMouse: function(e){this._click(e.clientX,e.clientY);},

  _click: function(cx,cy){
    var s=this;
    if(s.gameOver||s.diceAnimating||s._moveA)return;
    if(s.isOnline&&s.currentPlayer!==s.playerIndex)return;
    var r=s.canvas.getBoundingClientRect();
    var mx=(cx-r.left)*(s.canvas.width/r.width);
    var my=(cy-r.top)*(s.canvas.height/r.height);
    if(!s.diceRolled&&s.canRoll){var ddw=s.CELL*1.6,ddx=s.CANVAS_W/2-ddw/2,ddy=s.CANVAS_H-s.CELL*1.55;if(mx>=ddx&&mx<=ddx+ddw&&my>=ddy&&my<=ddy+ddw){s.rollDice();return;}return;}
    if(s.diceRolled&&s.selectedToken<0){for(var mi=0;mi<s.moveableTokens.length;mi++){var ti=s.moveableTokens[mi];var o=s.tokens[s.currentPlayer][ti];var px=o.ax,py=o.ay,hs=s.CELL*0.5;if(mx>=px-hs&&mx<=px+hs&&my>=py-hs&&my<=py+hs){s.selectedToken=ti;s._doMove(s.currentPlayer,ti,s.diceValue);return;}}}
  },

  draw: function(){
    if(!this.canvas||!this.ctx)return;
    var s=this;
    try{
    var cx=s.ctx,cw=s.CANVAS_W,ch=s.CANVAS_H,off=s.OFF,cs=s.CELL,sp=s._pulse,tp=s._turnPulse;

    // --- Background ---
    cx.save();
    var bg=cx.createRadialGradient(cw/2,cw/2,0,cw/2,cw/2,cw*0.85);
    bg.addColorStop(0,'#1a1a3a');bg.addColorStop(0.4,'#0f0f28');bg.addColorStop(1,'#060612');
    cx.fillStyle=bg;cx.fillRect(0,0,cw,ch);
    cx.restore();

    // subtle grid pattern
    cx.save();cx.globalAlpha=0.03;cx.fillStyle='#aabbff';
    for(var gg=0;gg<cw;gg+=8){cx.fillRect(gg,0,1,ch);}
    for(var gg2=0;gg2<ch;gg2+=8){cx.fillRect(0,gg2,cw,1);}
    cx.restore();

    // --- Board shadow ---
    var bx=off-3,by=off-3,bw=cs*15+6,bh=cs*15+6;
    cx.shadowColor='rgba(0,0,0,.7)';cx.shadowBlur=40;cx.fillStyle='#0a0a22';s._rr(cx,bx,by,bw,bh,8);cx.fill();cx.shadowBlur=0;
    // Board border glow
    cx.shadowColor='rgba(100,60,200,.15)';cx.shadowBlur=20;cx.strokeStyle='rgba(120,80,220,.12)';cx.lineWidth=1.5;s._rr(cx,bx,by,bw,bh,8);cx.stroke();cx.shadowBlur=0;

    // --- Draw cells ---
    for(var r=0;r<15;r++)for(var c=0;c<15;c++){
      var ct=s._getCT(r,c);
      var cx2=off+c*cs,cy2=off+r*cs;
      if(ct.path){
        var pi=-1;for(var q=0;q<52;q++){if(s.PATH[q][0]===r&&s.PATH[q][1]===c){pi=q;break;}}
        var saf=false;for(var q=0;q<s.SAFE.length;q++){if(s.SAFE[q]===pi){saf=true;break;}}
        if(ct.home>=0){
          // Home stretch - gradient fill with player color
          var hgr=cx.createLinearGradient(cx2,cy2,cx2+cs,cy2+cs);
          hgr.addColorStop(0,s.PCOL[ct.home]+'88');hgr.addColorStop(0.5,s.PCOL[ct.home]+'bb');hgr.addColorStop(1,s.PCOL[ct.home]+'99');
          cx.fillStyle=hgr;s._rr(cx,cx2+1,cy2+1,cs-2,cs-2,3);cx.fill();
          cx.shadowColor=s.PCOL[ct.home];cx.shadowBlur=4;cx.strokeStyle=s.PCOL[ct.home]+'66';cx.lineWidth=0.8;s._rr(cx,cx2+1,cy2+1,cs-2,cs-2,3);cx.stroke();cx.shadowBlur=0;
        }else if(saf){
          // Safe cell - golden with pulse
          var spv=0.92+Math.sin(sp*0.8)*0.08;
          cx.save();cx.translate(cx2+cs/2,cy2+cs/2);cx.scale(spv,spv);cx.translate(-cs/2,-cs/2);
          cx.fillStyle='#2a2040';s._rr(cx,0,0,cs,cs,3);cx.fill();
          cx.shadowColor='#d4a017';cx.shadowBlur=12+Math.sin(sp)*5;cx.strokeStyle='rgba(212,160,23,.5)';cx.lineWidth=1.2;s._rr(cx,1,1,cs-2,cs-2,3);cx.stroke();cx.shadowBlur=0;
          cx.fillStyle='#ffd700';cx.font='bold '+(cs*0.32)+'px sans-serif';cx.textAlign='center';cx.textBaseline='middle';cx.shadowColor='#d4a017';cx.shadowBlur=15+Math.sin(sp)*6;cx.fillText('\u2605',cs/2,cs/2+1);cx.shadowBlur=0;
          cx.restore();
        }else{
          // Regular path cell - bright with bevel
          var pgr=cx.createLinearGradient(cx2,cy2,cx2,cy2+cs);
          pgr.addColorStop(0,'#f5ede0');pgr.addColorStop(0.5,'#f0e6d0');pgr.addColorStop(1,'#e0d4bc');
          cx.fillStyle=pgr;s._rr(cx,cx2+1,cy2+1,cs-2,cs-2,3);cx.fill();
          // Inner glow
          cx.shadowColor='rgba(255,240,210,.08)';cx.shadowBlur=2;cx.strokeStyle='rgba(180,160,130,.25)';cx.lineWidth=0.6;s._rr(cx,cx2+1,cy2+1,cs-2,cs-2,3);cx.stroke();cx.shadowBlur=0;
        }
      }else if(ct.home>=0){
        // Base area background
        cx.fillStyle=s.PCOL[ct.home]+'18';cx.fillRect(cx2,cy2,cs,cs);
        cx.strokeStyle=s.PCOL[ct.home]+'0a';cx.lineWidth=0.3;cx.strokeRect(cx2+0.5,cy2+0.5,cs-1,cs-1);
      }else{
        // Empty cell - very dark to contrast path
        cx.fillStyle='#0e0c22';cx.fillRect(cx2,cy2,cs,cs);
        cx.strokeStyle='rgba(255,255,255,.015)';cx.lineWidth=0.2;cx.strokeRect(cx2+0.5,cy2+0.5,cs-1,cs-1);
      }
    }

    // --- Base zone overlays (colored backgrounds with icon) ---
    var bi_arr=[{r:0,c:0,p:3},{r:0,c:11,p:1},{r:11,c:0,p:0},{r:11,c:11,p:2}];
    for(var b=0;b<4;b++){
      var bd=bi_arr[b],pl=bd.p;
      var bx2=off+bd.c*cs,by2=off+bd.r*cs,bsz=cs*4;
      var bgr=cx.createRadialGradient(bx2+bsz/2,by2+bsz/2,0,bx2+bsz/2,by2+bsz/2,bsz*0.7);
      bgr.addColorStop(0,s.PCOL[pl]+'25');bgr.addColorStop(1,s.PCOL[pl]+'08');
      cx.fillStyle=bgr;s._rr(cx,bx2+1,by2+1,bsz-2,bsz-2,8);cx.fill();
      cx.shadowColor=s.PCOL[pl];cx.shadowBlur=6;cx.strokeStyle=s.PCOL[pl]+'25';cx.lineWidth=1;s._rr(cx,bx2+1,by2+1,bsz-2,bsz-2,8);cx.stroke();cx.shadowBlur=0;
      // Player icon
      var icons=['\uD83D\uDD34','\uD83D\uDFE2','\uD83D\uDD35','\uD83D\uDFE1'];
      cx.shadowColor=s.PCOL[pl];cx.shadowBlur=12;cx.font=(cs*0.45)+'px sans-serif';cx.textAlign='center';cx.textBaseline='middle';cx.fillText(icons[pl],bx2+bsz/2,by2+bsz*0.3);cx.shadowBlur=0;
      cx.fillStyle='rgba(255,255,255,.35)';cx.font='bold '+(cs*0.12)+'px sans-serif';cx.fillText(s.PNAME[pl],bx2+bsz/2,by2+bsz*0.55);
      // Base dot indicators
      for(var tp=0;tp<4;tp++){var tcx=bx2+bsz/2+(tp%2===0?-1:1)*cs*0.55,tcy=by2+bsz*0.7+(tp<2?-1:1)*cs*0.4;var io=s.tokens[pl][tp];if(io.state==='base'){cx.fillStyle=s.PCOL[pl]+'60';cx.shadowColor=s.PCOL[pl];cx.shadowBlur=8;cx.beginPath();cx.arc(tcx,tcy,cs*0.1,0,Math.PI*2);cx.fill();cx.shadowBlur=0;}else{cx.fillStyle=s.PCOL[pl]+'15';cx.beginPath();cx.arc(tcx,tcy,cs*0.07,0,Math.PI*2);cx.fill();}}
    }

    // --- Home stretch overlays ---
    for(var pl=0;pl<4;pl++)for(var hi=0;hi<6;hi++){
      var hx=off+s.HOME_STRETCH[pl][hi][1]*cs,hy=off+s.HOME_STRETCH[pl][hi][0]*cs;
      var a=0.25+hi*0.07;
      var hgr2=cx.createLinearGradient(hx,hy,hx+cs,hy+cs);
      hgr2.addColorStop(0,s.PCOL[pl]+('0'+Math.floor(a*160).toString(16)).slice(-2));hgr2.addColorStop(1,s.PCOL[pl]+('0'+Math.floor((a+0.2)*180).toString(16)).slice(-2));
      cx.fillStyle=hgr2;s._rr(cx,hx+1,hy+1,cs-2,cs-2,3);cx.fill();
      cx.strokeStyle=s.PCOL[pl]+'44';cx.lineWidth=0.5;s._rr(cx,hx+2,hy+2,cs-4,cs-4,3);cx.stroke();
    }

    // --- Home stretch connecting lines ---
    for(var pl2=0;pl2<4;pl2++){
      cx.save();
      cx.shadowColor=s.PCOL[pl2];cx.shadowBlur=6;cx.strokeStyle=s.PCOL[pl2]+'60';cx.lineWidth=2;cx.lineCap='round';
      cx.beginPath();cx.moveTo(off+s.HOME_STRETCH[pl2][0][1]*cs+cs/2,off+s.HOME_STRETCH[pl2][0][0]*cs+cs/2);
      for(var h=1;h<6;h++)cx.lineTo(off+s.HOME_STRETCH[pl2][h][1]*cs+cs/2,off+s.HOME_STRETCH[pl2][h][0]*cs+cs/2);
      cx.stroke();cx.restore();
    }

    // --- Center star with rotation ---
    var ctc=off+7*cs+cs/2;
    var cst=0.95+Math.sin(sp*0.5)*0.05;
    cx.save();cx.translate(ctc,ctc);
    cx.shadowColor='rgba(0,0,0,.4)';cx.shadowBlur=30;cx.fillStyle='#1e1840';cx.beginPath();cx.arc(0,0,cs*0.85,0,Math.PI*2);cx.fill();cx.shadowBlur=0;
    cx.strokeStyle='rgba(212,160,23,.15)';cx.lineWidth=1;cx.beginPath();cx.arc(0,0,cs*0.85,0,Math.PI*2);cx.stroke();
    cx.scale(cst,cst);
    cx.shadowColor='#d4a017';cx.shadowBlur=40+Math.sin(sp*1.2)*15;cx.fillStyle='#ffd700';cx.font='bold '+(cs*0.55)+'px sans-serif';cx.textAlign='center';cx.textBaseline='middle';cx.fillText('\u2605',0,2);cx.shadowBlur=0;
    // ring around star
    cx.strokeStyle='rgba(212,160,23,'+(0.08+Math.sin(sp)*0.06)+')';cx.lineWidth=3;cx.setLineDash([4,6]);cx.lineDashOffset=-sp*20;cx.beginPath();cx.arc(0,0,cs*1.05,0,Math.PI*2);cx.stroke();cx.setLineDash([]);
    cx.restore();

    // --- Draw tokens (3D glass marbles) ---
    for(var p=0;p<4;p++)for(var t=0;t<4;t++){
      var to=s.tokens[p][t];if(to.state==='home')continue;s._updPos(to);
      var isA=s._moveA&&s._moveA.pl===p&&s._moveA.ti===t;
      var x=isA?to.ax:to.x,y=isA?to.ay:to.y,r=cs*0.40;
      var isS=s.selectedToken===t&&p===s.currentPlayer;
      var iM=false;if(s.diceRolled&&s.selectedToken<0&&p===s.currentPlayer)for(var m=0;m<s.moveableTokens.length;m++){if(s.moveableTokens[m]===t){iM=true;break;}}
      var bo=to.bo||0,bY=y-Math.abs(Math.sin(bo*0.3))*2.5;

      // Shadow
      cx.save();
      cx.shadowColor='rgba(0,0,0,.6)';cx.shadowBlur=isS?20:8;cx.fillStyle='rgba(0,0,0,.3)';
      cx.beginPath();cx.ellipse(x+1.5,bY+r*0.55,r*0.85,r*0.15,0,0,Math.PI*2);cx.fill();cx.shadowBlur=0;

      // 3D token body
      var gr=cx.createRadialGradient(x-r*0.35,bY-r*0.4,r*0.05,x,bY,r);
      gr.addColorStop(0,isS?'#ffffff':s.PLT[p]);gr.addColorStop(0.2,isS?'#f0f0ff':s.PCOL[p]);gr.addColorStop(0.6,s.PDK[p]);gr.addColorStop(1,'rgba(0,0,0,.35)');
      cx.fillStyle=gr;cx.beginPath();cx.arc(x,bY,r,0,Math.PI*2);cx.fill();

      // Specular highlight (arc-based for compat)
      cx.fillStyle='rgba(255,255,255,.25)';cx.beginPath();cx.ellipse(x-r*0.25,bY-r*0.28,r*0.35,r*0.25,-0.3,0,Math.PI*2);cx.fill();
      cx.fillStyle='rgba(255,255,255,.1)';cx.beginPath();cx.arc(x-r*0.4,bY-r*0.45,r*0.12,0,Math.PI*2);cx.fill();
      // rim light
      cx.strokeStyle='rgba(255,255,255,.08)';cx.lineWidth=0.8;cx.beginPath();cx.arc(x,bY,r-0.5,0,Math.PI*2);cx.stroke();

      // Selected glow ring
      if(isS){
        cx.shadowColor=s.PCOL[p];cx.shadowBlur=25;cx.strokeStyle='rgba(255,255,255,.8)';cx.lineWidth=2.5;cx.setLineDash([5,5]);cx.beginPath();cx.arc(x,bY,r+3.5,0,Math.PI*2);cx.stroke();cx.setLineDash([]);
        cx.shadowColor=s.PCOL[p];cx.shadowBlur=12;cx.fillStyle='rgba(255,255,255,.1)';cx.beginPath();cx.arc(x,bY,r+5,0,Math.PI*2);cx.fill();
      }
      cx.shadowBlur=0;

      // Number
      cx.fillStyle='rgba(255,255,255,.9)';cx.font='bold '+(cs*0.22)+'px sans-serif';cx.textAlign='center';cx.textBaseline='middle';cx.fillText(t+1,x,bY+0.5);

      // Moveable indicator — BIG glowing ring with arrow
      if(iM){
        cx.save();cx.translate(x,bY);
        var pr=r+3+Math.sin(sp*2+ti)*3;
        cx.shadowColor='#fff';cx.shadowBlur=25;cx.strokeStyle='rgba(255,255,255,.7)';cx.lineWidth=2.5;cx.setLineDash([5,7]);cx.lineDashOffset=-sp*40;cx.beginPath();cx.arc(0,0,pr,0,Math.PI*2);cx.stroke();cx.setLineDash([]);
        // outer glow
        cx.shadowColor=s.PCOL[p];cx.shadowBlur=20;cx.fillStyle='rgba(255,255,255,.05)';cx.beginPath();cx.arc(0,0,pr+4,0,Math.PI*2);cx.fill();cx.shadowBlur=0;
        // bouncing arrow hint
        var arrA=sp*1.5+ti*1.57;var arrOff=Math.sin(sp*3+ti)*4;
        cx.fillStyle='rgba(255,255,255,'+(0.35+Math.sin(sp*2+ti)*0.2)+')';cx.font='bold '+(cs*0.22)+'px sans-serif';cx.textAlign='center';cx.textBaseline='middle';cx.fillText('\u25B2',Math.cos(arrA)*(pr+arrOff),Math.sin(arrA)*(pr+arrOff));
        cx.restore();
      }
      cx.restore();
    }

    // --- Dice with 3D effect ---
    var canR=s.canRoll&&!s.gameOver&&!s.diceAnimating;
    var ds=cs*1.25,dx=cw/2-ds/2,dy=ch-cs*1.45,dr=ds*0.15;
    var bb=s._diceB||0,rot=s.diceAnimating?Math.sin(s._diceA*1.5)*0.2:0;
    // glow ring when can roll
    if(canR){cx.save();cx.shadowColor=s.PCOL[s.currentPlayer];cx.shadowBlur=40+Math.sin(sp*2)*15;cx.strokeStyle='rgba(255,255,255,.15)';cx.lineWidth=3;cx.beginPath();cx.arc(dx+ds/2,dy+ds/2,ds*0.75,0,Math.PI*2);cx.stroke();cx.shadowBlur=0;cx.restore();}
    // shadow
    cx.save();
    cx.translate(dx+ds/2,dy+ds/2+6+bb*0.3);
    cx.shadowColor='rgba(0,0,0,'+(0.4+bb*0.03)+')';cx.shadowBlur=15+bb;cx.fillStyle='rgba(0,0,0,.4)';cx.beginPath();cx.ellipse(0,0,ds*0.6+bb*0.3,ds*0.2+bb*0.1,0,0,Math.PI*2);cx.fill();cx.shadowBlur=0;
    cx.restore();

    // dice body with 3D bevel
    cx.save();cx.translate(dx+ds/2,dy+ds/2);cx.scale(Math.cos(rot),1);cx.translate(-ds/2,-ds/2);
    // main face
    var dgr=cx.createLinearGradient(0,0,ds,ds);
    dgr.addColorStop(0,'#f5f0eb');dgr.addColorStop(0.3,'#fffcf8');dgr.addColorStop(0.7,'#ede5dc');dgr.addColorStop(1,'#d9d0c5');
    cx.fillStyle=dgr;s._rr(cx,0,0,ds,ds,dr);cx.fill();
    // bevel
    cx.strokeStyle='rgba(0,0,0,.1)';cx.lineWidth=1.5;s._rr(cx,0.5,0.5,ds-1,ds-1,dr);cx.stroke();
    cx.strokeStyle='rgba(255,255,255,.3)';cx.lineWidth=1;s._rr(cx,1,1,ds-2,ds-2,dr);cx.stroke();
    // top edge highlight
    cx.strokeStyle='rgba(255,255,255,.5)';cx.lineWidth=1.5;cx.beginPath();cx.moveTo(dr+2,1.5);cx.lineTo(ds-dr-2,1.5);cx.stroke();

    // dots
    var dv=s.diceValue||1,dpos=[];
    if(dv===1)dpos=[[0,0]];else if(dv===2)dpos=[[-1,-1],[1,1]];else if(dv===3)dpos=[[-1,-1],[0,0],[1,1]];
    else if(dv===4)dpos=[[-1,-1],[-1,1],[1,-1],[1,1]];else if(dv===5)dpos=[[-1,-1],[-1,1],[0,0],[1,-1],[1,1]];
    else if(dv===6)dpos=[[-1,-1],[-1,0],[-1,1],[1,-1],[1,0],[1,1]];
    for(var di=0;di<dpos.length;di++){
      var dxi=ds/2+dpos[di][0]*ds/4,dyi=ds/2+dpos[di][1]*ds/4;
      cx.shadowColor='rgba(0,0,0,.1)';cx.shadowBlur=3;cx.fillStyle='#1a1628';cx.beginPath();cx.arc(dxi,dyi,ds*0.08,0,Math.PI*2);cx.fill();
      cx.shadowBlur=0;cx.fillStyle='#2a2648';cx.beginPath();cx.arc(dxi-0.5,dyi-0.5,ds*0.03,0,Math.PI*2);cx.fill();
    }
    cx.shadowBlur=0;cx.restore();

    // roll hint — BIG and visible
    if(canR){
      cx.save();
      cx.globalAlpha=0.5+Math.sin(sp*3)*0.2;
      cx.fillStyle=s.PCOL[s.currentPlayer];cx.font='bold '+(cs*0.15)+'px sans-serif';cx.textAlign='center';cx.textBaseline='top';
      cx.shadowColor=s.PCOL[s.currentPlayer];cx.shadowBlur=15;cx.fillText('\u25BC \u0411\u0440\u043E\u0441\u043E\u043A \u25BC',dx+ds/2,dy+ds+6);cx.shadowBlur=0;
      cx.restore();
    }

    // --- Turn indicator ---
    var iY=ch-cs*0.95,iW=cs*5.5,iH=cs*0.55;
    cx.save();
    cx.shadowColor='rgba(0,0,0,.4)';cx.shadowBlur=15;cx.fillStyle='rgba(10,8,20,.9)';s._rr(cx,cw/2-iW/2,iY-iH/2,iW,iH,8);cx.fill();cx.shadowBlur=0;
    cx.strokeStyle=s.PCOL[s.currentPlayer]+'50';cx.lineWidth=1.5;cx.shadowColor=s.PCOL[s.currentPlayer];cx.shadowBlur=8;s._rr(cx,cw/2-iW/2,iY-iH/2,iW,iH,8);cx.stroke();cx.shadowBlur=0;
    // pulsing dot
    cx.shadowColor=s.PCOL[s.currentPlayer];cx.shadowBlur=15+Math.sin(tp)*8;cx.fillStyle=s.PCOL[s.currentPlayer];
    cx.beginPath();cx.arc(cw/2-iW/2+cs*0.35,iY,cs*0.1+Math.sin(tp)*0.02,0,Math.PI*2);cx.fill();cx.shadowBlur=0;
    var lb=s.PNAME[s.currentPlayer];if(s.isOnline)lb=(s.currentPlayer===s.playerIndex?'\uD83D\uDC64 ':'\uD83D\uDC65 ')+lb;
    cx.fillStyle='#fff';cx.font='bold '+(cs*0.25)+'px sans-serif';cx.textAlign='left';cx.textBaseline='middle';cx.shadowColor='rgba(0,0,0,.4)';cx.shadowBlur=4;cx.fillText(lb,cw/2-iW/2+cs*0.6,iY);cx.shadowBlur=0;
    var hc=0;for(var tc=0;tc<4;tc++){if(s.tokens[s.currentPlayer][tc].state==='home')hc++;}
    cx.fillStyle='rgba(255,255,255,.3)';cx.font=(cs*0.17)+'px sans-serif';cx.textAlign='right';cx.textBaseline='middle';
    cx.shadowColor='rgba(0,0,0,.3)';cx.shadowBlur=3;cx.fillText('\uD83C\uDFC6 '+hc+'/4',cw/2+iW/2-cs*0.2,iY);cx.shadowBlur=0;
    cx.restore();

    // --- Game over overlay ---
    if(s.gameOver){
      cx.save();cx.fillStyle='rgba(0,0,0,.7)';cx.fillRect(0,0,cw,ch);
      cx.shadowColor='#d4a017';cx.shadowBlur=60;cx.fillStyle='#ffd700';cx.font='bold '+Math.round(cs*1.0)+'px sans-serif';cx.textAlign='center';cx.textBaseline='middle';cx.fillText('\uD83C\uDFC6',cw/2,ch*0.3);cx.shadowBlur=0;
      cx.fillStyle='#fff';cx.font='bold '+Math.round(cs*0.5)+'px sans-serif';cx.shadowColor='rgba(0,0,0,.5)';cx.shadowBlur=10;cx.fillText('\u041F\u043E\u0431\u0435\u0434\u0430!',cw/2,ch*0.4);cx.shadowBlur=0;
      cx.fillStyle='rgba(255,255,255,.5)';cx.font=(cs*0.2)+'px sans-serif';cx.fillText('\u0418\u0433\u0440\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430',cw/2,ch*0.47);
      cx.restore();
    }

    // --- Message box ---
    if(s._msg){
      cx.save();
      cx.shadowColor='rgba(0,0,0,.5)';cx.shadowBlur=25;cx.fillStyle='rgba(10,8,20,.88)';var mw=cs*5.5,mh=cs*0.8;s._rr(cx,cw/2-mw/2,ch*0.18-mh/2,mw,mh,10);cx.fill();cx.shadowBlur=0;
      cx.strokeStyle=s.PCOL[s.currentPlayer]+'35';cx.lineWidth=1;cx.shadowColor=s.PCOL[s.currentPlayer];cx.shadowBlur=5;s._rr(cx,cw/2-mw/2,ch*0.18-mh/2,mw,mh,10);cx.stroke();cx.shadowBlur=0;
      cx.fillStyle='#fff';cx.font='bold '+(cs*0.23)+'px sans-serif';cx.textAlign='center';cx.textBaseline='middle';cx.shadowColor='rgba(0,0,0,.3)';cx.shadowBlur=3;cx.fillText(s._msg,cw/2,ch*0.18);cx.shadowBlur=0;
      cx.restore();
    }

    // --- Particles ---
    cx.save();
    for(var pi=0;pi<s._p.length;pi++){var pt=s._p[pi];cx.globalAlpha=Math.max(0,pt.life);cx.fillStyle=pt.color;cx.shadowColor=pt.color;cx.shadowBlur=pt.size*1.5;cx.beginPath();cx.arc(pt.x,pt.y,pt.size,0,Math.PI*2);cx.fill();}
    cx.restore();

    // --- Intro fade-in ---
    if(s._intro>0){cx.save();cx.globalAlpha=s._intro;cx.fillStyle='#060612';cx.fillRect(0,0,cw,ch);cx.restore();}

    }catch(e){/* silent */}
  },

  _getCT: function(r,c){
    var s=this;
    var res={path:false,home:-1,safe:false};
    for(var p=0;p<52;p++){if(s.PATH[p][0]===r&&s.PATH[p][1]===c){res.path=true;break;}}
    for(var i=0;i<s.SAFE.length;i++){if(s.PATH[s.SAFE[i]][0]===r&&s.PATH[s.SAFE[i]][1]===c)res.safe=true;}
    for(var pl=0;pl<4;pl++){for(var h=0;h<6;h++){if(s.HOME_STRETCH[pl][h][0]===r&&s.HOME_STRETCH[pl][h][1]===c){res.home=pl;return res;}}for(var b=0;b<4;b++){if(s.BASES[pl][b][0]===r&&s.BASES[pl][b][1]===c){res.home=pl;return res;}}}
    return res;
  },

  _burst: function(x,y,c){
    var s=this;
    for(var i=0;i<40;i++){var a=Math.random()*Math.PI*2,sp=1.5+Math.random()*5;s._p.push({x:x,y:y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-3,color:c,size:2+Math.random()*5,life:1});}
    for(var j=0;j<15;j++){var a2=Math.random()*Math.PI*2,sp2=3+Math.random()*6;s._p.push({x:x,y:y,vx:Math.cos(a2)*sp2,vy:Math.sin(a2)*sp2-2,color:['#fff','#ffd700','#fff'][Math.floor(Math.random()*3)],size:1+Math.random()*3,life:0.8+Math.random()*0.4});}
    if(window.tg&&window.tg.HapticFeedback)window.tg.HapticFeedback.impactOccurred('heavy');
  },

  _rr: function(cx,x,y,w,h,r){if(r>w/2)r=w/2;if(r>h/2)r=h/2;cx.beginPath();cx.moveTo(x+r,y);cx.lineTo(x+w-r,y);cx.quadraticCurveTo(x+w,y,x+w,y+r);cx.lineTo(x+w,y+h-r);cx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);cx.lineTo(x+r,y+h);cx.quadraticCurveTo(x,y+h,x,y+h-r);cx.lineTo(x,y+r);cx.quadraticCurveTo(x,y,x+r,y);cx.closePath();},

  _sfx: function(eff){
    try{
      if(!LUDO._actx)LUDO._actx=new(window.AudioContext||window.webkitAudioContext)();
      if(LUDO._actx.state==='suspended')LUDO._actx.resume();
      var a=LUDO._actx,t=a.currentTime;
      function osc(f,s,d,v,ty){var oc=a.createOscillator(),g=a.createGain();oc.type=ty||'sine';oc.connect(g);g.connect(a.destination);oc.frequency.setValueAtTime(f,s);g.gain.setValueAtTime(v||0.1,s);g.gain.exponentialRampToValueAtTime(0.001,s+(d||0.1));oc.start(s);oc.stop(s+(d||0.1));}
      if(eff==='dice'){osc(300,t,0.04,0.1);osc(500,t+0.02,0.04,0.08);osc(400,t+0.04,0.03,0.06);}else if(eff==='move')osc(440,t,0.08,0.1,'triangle');
      else if(eff==='enter'){osc(523,t,0.06,0.15);osc(659,t+0.04,0.08,0.12);osc(784,t+0.08,0.06,0.08);}else if(eff==='capture'){osc(200,t,0.12,0.25,'square');osc(100,t+0.05,0.15,0.2,'sawtooth');osc(80,t+0.1,0.1,0.15,'sawtooth');}
      else if(eff==='home'){osc(600,t,0.08,0.15,'triangle');osc(800,t+0.06,0.1,0.12);osc(1000,t+0.12,0.12,0.1);}else if(eff==='victory'){osc(523,t,0.15,0.2);osc(659,t+0.12,0.2,0.15);osc(784,t+0.25,0.25,0.12);osc(1047,t+0.4,0.35,0.1);}
      else if(eff==='error')osc(180,t,0.2,0.12,'square');
    }catch(e){}
  },

  destroy: function(){var s=this;s._wsC=true;if(s.ws){try{s.ws.close()}catch(e){}s.ws=null;}s.canvas=null;s.ctx=null;s.tokens=[];s.players=[];s._p=[];if(s._msgTO)clearTimeout(s._msgTO);}
};
