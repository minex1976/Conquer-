const http=require("http");
const express=require("express");
const WebSocket=require("ws");
const crypto=require("crypto");
const path=require("path");

const app=express();
const server=http.createServer(app);
const wss=new WebSocket.Server({server});
const PORT=process.env.PORT||3000;

app.use(express.static(path.join(__dirname,"../Client")));
app.get("/health",(req,res)=>res.json({ok:true,service:"winzo-conquer",mode:"free-play"}));

const rooms=new Map();
const sockets=new Map();
const SUITS=["♠","♥","♦","♣"];
const RANKS=["A","2","3","4","5","6","7","8","9","10","J","Q","K"];

function shuffle(a){
  for(let i=a.length-1;i>0;i--){
    const j=crypto.randomInt(i+1);
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}
function makeDeck(){
  const d=[];
  for(let deck=0;deck<2;deck++){
    for(const s of SUITS)for(const r of RANKS)d.push({id:crypto.randomUUID(),rank:r,suit:s});
    d.push({id:crypto.randomUUID(),rank:"JOKER",suit:"★"});
  }
  return shuffle(d);
}
function send(ws,obj){
  if(ws&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(obj));
}
function error(ws,message){send(ws,{type:"error",message});}
function publicState(room,playerId){
  const p=room.players.find(x=>x.id===playerId);
  return {
    code:room.code,
    started:room.started,
    isHost:room.hostId===playerId,
    currentPlayerId:room.currentPlayerId,
    deckCount:room.deck.length,
    discardCount:room.discard.length,
    discardTop:room.discard.length?room.discard[room.discard.length-1]:null,
    hasDrawn:!!p?.hasDrawn,
    hand:p?p.hand:[],
    players:room.players.map(x=>({id:x.id,name:x.name,cardCount:x.hand.length,isBot:!!x.isBot}))
  };
}
function broadcast(room){
  for(const p of room.players){
    if(p.ws)send(p.ws,{type:"state",state:publicState(room,p.id)});
  }
}
function newCode(){
  let c;
  do{c=crypto.randomBytes(3).toString("hex").toUpperCase();}while(rooms.has(c));
  return c;
}
function current(room){return room.players.find(p=>p.id===room.currentPlayerId);}
function nextTurn(room){
  const i=room.players.findIndex(p=>p.id===room.currentPlayerId);
  room.currentPlayerId=room.players[(i+1)%room.players.length].id;
  const p=current(room);
  if(p)p.hasDrawn=false;
  room.turnToken=(room.turnToken||0)+1;
}
function dealAndStart(room){
  if(room.started)return;
  if(room.players.length<2||room.players.length>5)return false;
  room.deck=makeDeck();
  room.discard=[];
  for(const player of room.players)player.hand=[];
  for(let n=0;n<13;n++){
    for(const player of room.players)player.hand.push(room.deck.pop());
  }
  room.discard.push(room.deck.pop());
  room.started=true;
  room.currentPlayerId=room.players[0].id;
  room.turnToken=(room.turnToken||0)+1;
  broadcast(room);
  scheduleBotTurn(room);
  return true;
}
function finishRound(room,winner){
  room.started=false;
  room.winnerId=winner.id;
  room.turnToken=(room.turnToken||0)+1;
  for(const player of room.players){
    send(player.ws,{type:"roundEnd",message:`${winner.name} is the first player to go out. Round complete.`,winnerId:winner.id});
  }
  broadcast(room);
}
function scheduleBotTurn(room){
  const bot=current(room);
  if(!room.started||!bot?.isBot)return;
  const token=room.turnToken;
  setTimeout(()=>{
    if(!room.started||room.turnToken!==token||current(room)?.id!==bot.id)return;
    if(!room.deck.length){
      if(room.discard.length<2)return;
      const top=room.discard.pop();
      room.deck=shuffle(room.discard);
      room.discard=[top];
    }
    bot.hand.push(room.deck.pop());
    bot.hasDrawn=true;
    broadcast(room);
    setTimeout(()=>{
      if(!room.started||room.turnToken!==token||current(room)?.id!==bot.id)return;
      if(!bot.hand.length)return;
      // Basic automatic opponent: choose a card at random, then use the
      // same server-side discard and turn-advance flow as a human player.
      const idx=crypto.randomInt(bot.hand.length);
      const [card]=bot.hand.splice(idx,1);
      room.discard.push(card);
      if(bot.hand.length===0){
        finishRound(room,bot);
        return;
      }
      nextTurn(room);
      broadcast(room);
      scheduleBotTurn(room);
    },450);
  },650);
}
function handle(ws,msg){
  if(!msg||typeof msg!=="object")return error(ws,"Invalid request.");

  if(msg.type==="create"||msg.type==="join"){
    const name=String(msg.name||"").trim().slice(0,18);
    if(!name)return error(ws,"Enter a player name.");
    let room;

    if(msg.type==="create"){
      const code=newCode();
      room={
        code,
        hostId:ws.playerId,
        players:[],
        deck:[],
        discard:[],
        started:false,
        currentPlayerId:null,
        turnToken:0,
        winnerId:null
      };
      rooms.set(code,room);
    }else{
      room=rooms.get(String(msg.code||"").toUpperCase());
      if(!room)return error(ws,"Room not found.");
    }

    if(room.started)return error(ws,"This game has already started.");
    if(room.players.length>=5)return error(ws,"This room is full.");
    if(room.players.some(p=>p.id===ws.playerId))return error(ws,"You are already in this room.");

    const player={id:ws.playerId,name,ws,hand:[],hasDrawn:false,isBot:false};
    room.players.push(player);
    ws.roomCode=room.code;

    if(msg.type==="create"){
      const rawCount=msg.botCount===undefined?0:Number(msg.botCount);
      if(!Number.isInteger(rawCount)||rawCount<0||rawCount>4){
        room.players.pop();
        rooms.delete(room.code);
        ws.roomCode=null;
        return error(ws,"Choose between zero and four computer opponents.");
      }
      if(rawCount>0){
        for(let i=1;i<=rawCount;i++){
          room.players.push({
            id:`bot-${crypto.randomUUID()}`,
            name:`Computer ${i}`,
            ws:null,
            hand:[],
            hasDrawn:false,
            isBot:true
          });
        }
      }
    }

    broadcast(room);
    if(room.players.length>=2&&room.players.some(x=>x.isBot))dealAndStart(room);
    return;
  }

  const room=rooms.get(ws.roomCode);
  if(!room)return error(ws,"Join or create a room first.");
  const p=room.players.find(x=>x.id===ws.playerId);
  if(!p)return error(ws,"Player session not found.");

  if(msg.type==="start"){
    if(room.hostId!==p.id)return error(ws,"Only the room host can start the game.");
    if(room.started)return error(ws,"Game already started.");
    if(room.players.length<2)return error(ws,"At least two players are required to start.");
    if(room.players.length>5)return error(ws,"A room can have no more than five players.");
    dealAndStart(room);
    return;
  }

  if(!room.started)return error(ws,"The host has not started the game yet.");
  if(room.currentPlayerId!==p.id)return error(ws,"It is not your turn.");

  if(msg.type==="draw"){
    if(p.hasDrawn)return error(ws,"You have already drawn this turn.");
    if(!room.deck.length){
      if(room.discard.length<2)return error(ws,"No cards remain.");
      const top=room.discard.pop();
      room.deck=shuffle(room.discard);
      room.discard=[top];
    }
    p.hand.push(room.deck.pop());
    p.hasDrawn=true;
    broadcast(room);
    return;
  }

  if(msg.type==="discard"){
    if(!p.hasDrawn)return error(ws,"Draw a card before discarding.");
    const idx=p.hand.findIndex(c=>c.id===msg.cardId);
    if(idx<0)return error(ws,"That card is not in your hand.");
    const [card]=p.hand.splice(idx,1);
    room.discard.push(card);
    if(p.hand.length===0){
      finishRound(room,p);
      return;
    }
    nextTurn(room);
    broadcast(room);
    scheduleBotTurn(room);
    return;
  }

  error(ws,"Unknown action.");
}

wss.on("connection",ws=>{
  ws.playerId=crypto.randomUUID();
  sockets.set(ws.playerId,ws);
  send(ws,{type:"welcome",playerId:ws.playerId});

  ws.on("message",raw=>{
    try{handle(ws,JSON.parse(raw.toString()));}
    catch(e){console.error(e);error(ws,"Server could not process that action.");}
  });

  ws.on("close",()=>{
    sockets.delete(ws.playerId);
    const room=rooms.get(ws.roomCode);
    if(room){
      const p=room.players.find(x=>x.id===ws.playerId);
      if(p)p.ws=null;
      broadcast(room);
    }
  });
});

server.listen(PORT,()=>console.log(`WINZO CONQUER free-play server listening on ${PORT}`));
