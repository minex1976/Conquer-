const http=require("http");
const express=require("express");
const WebSocket=require("ws");
const crypto=require("crypto");
const path=require("path");
const app=express();const server=http.createServer(app);const wss=new WebSocket.Server({server});
const PORT=process.env.PORT||3000;
app.use(express.static(path.join(__dirname,"../Client")));
app.get("/health",(req,res)=>res.json({ok:true,service:"winzo-conquer",mode:"free-play"}));
const rooms=new Map(), sockets=new Map();
const SUITS=["♠","♥","♦","♣"], RANKS=["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function makeDeck(){const d=[];for(let deck=0;deck<2;deck++){for(const s of SUITS)for(const r of RANKS)d.push({id:crypto.randomUUID(),rank:r,suit:s});d.push({id:crypto.randomUUID(),rank:"JOKER",suit:"★"});}return shuffle(d);}
function send(ws,obj){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(obj));}
function error(ws,message){send(ws,{type:"error",message});}
function publicState(room,playerId){
 const p=room.players.find(x=>x.id===playerId);return {code:room.code,started:room.started,isHost:room.hostId===playerId,currentPlayerId:room.currentPlayerId,deckCount:room.deck.length,discardCount:room.discard.length,discardTop:room.discard.length?room.discard[room.discard.length-1]:null,hasDrawn:!!p?.hasDrawn,hand:p?p.hand:[],players:room.players.map(x=>({id:x.id,name:x.name,cardCount:x.hand.length}))};
}
function broadcast(room){for(const p of room.players){if(p.ws)send(p.ws,{type:"state",state:publicState(room,p.id)});}}
function newCode(){let c;do{c=crypto.randomBytes(3).toString("hex").toUpperCase()}while(rooms.has(c));return c;}
function current(room){return room.players.find(p=>p.id===room.currentPlayerId);}
function nextTurn(room){const i=room.players.findIndex(p=>p.id===room.currentPlayerId);room.currentPlayerId=room.players[(i+1)%room.players.length].id;const p=current(room);if(p)p.hasDrawn=false;}
function handle(ws,msg){
 if(!msg||typeof msg!=="object")return error(ws,"Invalid request.");
 if(msg.type==="create"||msg.type==="join"){
  const name=String(msg.name||"").trim().slice(0,18);if(!name)return error(ws,"Enter a player name.");
  let room;
  if(msg.type==="create"){const code=newCode();room={code,hostId:ws.playerId,players:[],deck:[],discard:[],started:false,currentPlayerId:null};rooms.set(code,room);}
  else{room=rooms.get(String(msg.code||"").toUpperCase());if(!room)return error(ws,"Room not found.");}
  if(room.started)return error(ws,"This game has already started.");
  if(room.players.length>=5)return error(ws,"This room is full.");
  if(room.players.some(p=>p.id===ws.playerId))return error(ws,"You are already in this room.");
  const p={id:ws.playerId,name,ws,hand:[],hasDrawn:false};room.players.push(p);ws.roomCode=room.code;broadcast(room);return;
 }
 const room=rooms.get(ws.roomCode);if(!room)return error(ws,"Join or create a room first.");
 const p=room.players.find(x=>x.id===ws.playerId);if(!p)return error(ws,"Player session not found.");
 if(msg.type==="start"){
  if(room.hostId!==p.id)return error(ws,"Only the room host can start the game.");
  if(room.started)return error(ws,"Game already started.");
  if(room.players.length!==5)return error(ws,"Exactly five players are required to start.");
  room.deck=makeDeck();room.discard=[];
  for(let n=0;n<13;n++)for(const player of room.players)player.hand.push(room.deck.pop());
  room.discard.push(room.deck.pop());room.started=true;room.currentPlayerId=room.players[0].id;broadcast(room);return;
 }
 if(!room.started)return error(ws,"The host has not started the game yet.");
 if(room.currentPlayerId!==p.id)return error(ws,"It is not your turn.");
 if(msg.type==="draw"){
  if(p.hasDrawn)return error(ws,"You have already drawn this turn.");
  if(!room.deck.length){if(room.discard.length<2)return error(ws,"No cards remain.");const top=room.discard.pop();room.deck=shuffle(room.discard);room.discard=[top];}
  p.hand.push(room.deck.pop());p.hasDrawn=true;broadcast(room);return;
 }
 if(msg.type==="discard"){
  if(!p.hasDrawn)return error(ws,"Draw a card before discarding.");
  const idx=p.hand.findIndex(c=>c.id===msg.cardId);if(idx<0)return error(ws,"That card is not in your hand.");
  const [card]=p.hand.splice(idx,1);room.discard.push(card);
  if(p.hand.length===0){room.winnerId=p.id;room.started=false;for(const player of room.players)send(player.ws,{type:"error",message:`${p.name} is the first player to go out. Round complete.`});broadcast(room);return;}
  nextTurn(room);broadcast(room);return;
 }
 error(ws,"Unknown action.");
}
wss.on("connection",ws=>{ws.playerId=crypto.randomUUID();sockets.set(ws.playerId,ws);send(ws,{type:"welcome",playerId:ws.playerId});ws.on("message",raw=>{try{handle(ws,JSON.parse(raw.toString()));}catch(e){console.error(e);error(ws,"Server could not process that action.");}});ws.on("close",()=>{sockets.delete(ws.playerId);const room=rooms.get(ws.roomCode);if(room){const p=room.players.find(x=>x.id===ws.playerId);if(p)p.ws=null;broadcast(room);}});});
server.listen(PORT,()=>console.log(`WINZO CONQUER free-play server listening on ${PORT}`));
