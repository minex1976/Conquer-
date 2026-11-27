const $=id=>document.getElementById(id);
let ws,state=null,selected=null,myId=null,roomCode=null;
const params=new URLSearchParams(location.search);
if(params.get("room"))$("roomCode").value=params.get("room");

function connect(){
  const proto=location.protocol==="https:"?"wss":"ws";
  const host=location.hostname==="localhost"||location.hostname==="127.0.0.1"?"localhost:3000":location.host;
  ws=new WebSocket(`${proto}://${host}`);
  ws.onopen=()=>{$("connection").textContent="Connected";};
  ws.onclose=()=>{$("connection").textContent="Disconnected · refresh to reconnect";};
  ws.onerror=()=>{$("connection").textContent="Connection error";};
  ws.onmessage=e=>{
    const m=JSON.parse(e.data);
    if(m.type==="welcome"){myId=m.playerId;return;}
    if(m.type==="error"){
      $("lobbyMessage").textContent=m.message;
      $("gameMessage").textContent=m.message;
      return;
    }
    if(m.type==="roundEnd"){
      $("gameMessage").textContent=m.message;
      return;
    }
    if(m.type==="state"){
      state=m.state;
      roomCode=state.code;
      render();
    }
  };
}
function send(type,data={}){
  if(ws?.readyState===1)ws.send(JSON.stringify({type,...data}));
}
function playerName(){
  const name=$("playerName").value.trim();
  if(!name){$("lobbyMessage").textContent="Enter your player name first.";return null;}
  return name;
}
function enter(action,extra={}){
  const name=playerName();
  if(!name)return;
  $("lobbyMessage").textContent="";
  send(action,{name,code:$("roomCode").value.trim().toUpperCase(),...extra});
}
$("createBtn").onclick=()=>enter("create");
$("joinBtn").onclick=()=>enter("join");
$("computerBtn").onclick=()=>enter("create",{botCount:Number($("botCount").value)});
$("startBtn").onclick=()=>send("start");
$("drawBtn").onclick=()=>send("draw");
$("discardBtn").onclick=()=>{
  if(selected!==null)send("discard",{cardId:selected});
  selected=null;
};
$("copyInvite").onclick=async()=>{
  const url=`${location.origin}${location.pathname}?room=${roomCode}`;
  try{await navigator.clipboard.writeText(url);$("gameMessage").textContent="Invitation link copied.";}
  catch{$("gameMessage").textContent=url;}
};
$("backBtn").onclick=()=>location.href=location.pathname;
function cardName(c){return c.rank==="JOKER"?"JOKER":`${c.rank}${c.suit}`;}
function render(){
  $("lobby").hidden=true;
  $("game").hidden=false;
  $("roomLabel").textContent=state.code;
  $("deckCount").textContent=state.deckCount;
  $("discardCount").textContent=state.discardCount;

  const current=state.players.find(p=>p.id===state.currentPlayerId);
  $("turnLabel").textContent=state.started
    ?(state.currentPlayerId===myId?"Your turn":`Waiting for ${current?.name||"player"}`)
    :`${state.players.length}/5 players joined`;

  $("startBtn").disabled=!state.isHost||state.started||state.players.length<2||state.players.length>5;
  $("startBtn").textContent=state.players.length<2?"Need 2 players to start":"Start game (host)";
  $("drawBtn").disabled=!state.started||state.currentPlayerId!==myId||state.hasDrawn;
  $("discardBtn").disabled=!state.started||state.currentPlayerId!==myId||!state.hasDrawn||selected===null;

  $("tableHint").textContent=state.started
    ?"Take one card, then discard one card on your turn."
    :(state.players.length<2
      ?"Waiting for at least one more player. The host can start with 2–5 players."
      :"The host can start the game now. Rooms support 2–5 players.");

  $("players").innerHTML=state.players.map((p,i)=>
    `<div class="player ${p.id===state.currentPlayerId&&state.started?"active":""}">`+
    `${escapeHtml(p.name)}${p.id===myId?" (You)":""}`+
    `<small>${p.isBot?"Computer opponent":"Human player"} · ${p.cardCount} cards · Seat ${i+1}</small></div>`
  ).join("");

  const top=state.discardTop;
  $("discardTop").className="pile-card "+(top?"face":"empty");
  $("discardTop").innerHTML=top
    ?`<span class="${top.suit==="♥"||top.suit==="♦"?"red":""}">${cardName(top)}</span>`
    :"—";

  const hand=$("hand");
  hand.innerHTML="";
  state.hand.forEach(c=>{
    const el=document.createElement("div");
    el.className="card "+((c.suit==="♥"||c.suit==="♦")?"red ":"")+
      (c.rank==="JOKER"?"joker ":"")+(selected===c.id?"selected":"");
    el.innerHTML=`<span>${cardName(c)}</span><span class="suit">${c.rank==="JOKER"?"★":c.suit}</span>`;
    el.onclick=()=>{selected=selected===c.id?null:c.id;render();};
    hand.appendChild(el);
  });
  $("handCount").textContent=`${state.hand.length} cards`;
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
connect();
