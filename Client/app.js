const $=id=>document.getElementById(id);
let ws,state=null,selected=null,myId=null,roomCode=null;
let handOrder=[],draggedCardId=null,pendingDrawFlight=false,lastDiscardTopId=null,knownHandIds=new Set();
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
$("drawBtn").onclick=()=>{pendingDrawFlight=true;send("draw");};
$("discardBtn").onclick=()=>{
  if(selected!==null){animateDiscardFlight();send("discard",{cardId:selected});}
  if(selected!==null)handOrder=handOrder.filter(id=>id!==selected);
  selected=null;
};
$("moveLeftBtn").onclick=()=>moveSelected(-1);
$("moveRightBtn").onclick=()=>moveSelected(1);
$("copyInvite").onclick=async()=>{
  const url=`${location.origin}${location.pathname}?room=${roomCode}`;
  try{await navigator.clipboard.writeText(url);$("gameMessage").textContent="Invitation link copied.";}
  catch{$("gameMessage").textContent=url;}
};
$("backBtn").onclick=()=>location.href=location.pathname;
function cardName(c){return c.rank==="JOKER"?"JOKER":`${c.rank}${c.suit}`;}
function moveSelected(direction){
  if(!selected||!state)return;
  const index=handOrder.indexOf(selected);
  const target=index+direction;
  if(index<0||target<0||target>=handOrder.length)return;
  [handOrder[index],handOrder[target]]=[handOrder[target],handOrder[index]];
  render();
}
function reorderCard(draggedId,targetId,insertAfter){
  if(!draggedId||!targetId||draggedId===targetId)return;
  const from=handOrder.indexOf(draggedId);
  const target=handOrder.indexOf(targetId);
  if(from<0||target<0)return;
  handOrder.splice(from,1);
  const insertAt=handOrder.indexOf(targetId)+(insertAfter?1:0);
  handOrder.splice(insertAt,0,draggedId);
  render();
}
function animateCardFlight(sourceEl,targetEl,kind){
  if(!sourceEl||!targetEl)return;
  const from=sourceEl.getBoundingClientRect();
  const to=targetEl.getBoundingClientRect();
  const clone=sourceEl.cloneNode(true);
  clone.classList.add("flight-clone",kind==="draw"?"flight-draw":"flight-discard");
  Object.assign(clone.style,{
    position:"fixed",left:`${from.left}px`,top:`${from.top}px`,
    width:`${from.width}px`,height:`${from.height}px`,margin:"0",
    zIndex:"9999",pointerEvents:"none",transform:"translate(0,0) scale(1)"
  });
  document.body.appendChild(clone);
  const dx=(to.left+to.width/2)-(from.left+from.width/2);
  const dy=(to.top+to.height/2)-(from.top+from.height/2);
  const animation=clone.animate([
    {transform:"translate(0,0) scale(1)",opacity:1},
    {transform:`translate(${dx}px,${dy}px) scale(${kind==="draw"?.78:.62})`,opacity:kind==="draw"?1:.35}
  ],{duration:kind==="draw"?620:520,easing:"cubic-bezier(.22,.75,.25,1)",fill:"forwards"});
  animation.onfinish=()=>clone.remove();
}
function animateDiscardFlight(){
  const source=[...$("hand").querySelectorAll("[data-card-id]")].find(el=>el.dataset.cardId===selected);
  const target=$("discardTop");
  if(source&&target)animateCardFlight(source,target,"discard");
}
function animateNewlyDrawnCard(){
  if(!pendingDrawFlight)return;
  const newCard=state.hand.find(card=>!knownHandIds.has(card.id));
  pendingDrawFlight=false;
  if(!newCard)return;
  const target=[...$("hand").querySelectorAll("[data-card-id]")].find(el=>el.dataset.cardId===newCard.id);
  if(!target)return;
  target.scrollIntoView({behavior:"smooth",block:"nearest",inline:"end"});
  requestAnimationFrame(()=>{
    const drawPile=$("drawPile");
    if(drawPile)animateCardFlight(drawPile,target,"draw");
    target.classList.add("card-arrived");
    setTimeout(()=>target.classList.remove("card-arrived"),700);
  });
}
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

  const seatCount=state.players.length;
  const mySeat=Math.max(0,state.players.findIndex(player=>player.id===myId));
  $("players").innerHTML=state.players.map((p,i)=>{
    // Keep the local player at the bottom seat and distribute everyone else
    // evenly around the circular table.
    const seatOffset=(i-mySeat+seatCount)%seatCount;
    const angle=Math.PI/2+(seatOffset*2*Math.PI/seatCount);
    const x=50+39*Math.cos(angle);
    const y=50+37*Math.sin(angle);
    return `<div class="player ${p.id===state.currentPlayerId&&state.started?"active":""}" style="left:${x}%;top:${y}%">`+
      `${escapeHtml(p.name)}${p.id===myId?" (You)":""}`+
      `<small>${p.isBot?"Computer opponent":"Human player"} · ${p.cardCount} cards · Seat ${i+1}</small></div>`;
  }).join("");

  const top=state.discardTop;
  $("discardTop").className="pile-card "+(top?"face":"empty");
  $("discardTop").innerHTML=top
    ?`<span class="${top.suit==="♥"||top.suit==="♦"?"red":""}">${cardName(top)}</span>`
    :"—";
  if(top&&top.id!==lastDiscardTopId){
    $("discardTop").classList.remove("discard-arrived");
    void $("discardTop").offsetWidth;
    $("discardTop").classList.add("discard-arrived");
    lastDiscardTopId=top.id;
  }

  const hand=$("hand");
  hand.innerHTML="";
  const liveIds=new Set(state.hand.map(c=>c.id));
  handOrder=handOrder.filter(id=>liveIds.has(id));
  for(const c of state.hand){if(!handOrder.includes(c.id))handOrder.push(c.id);}
  const orderedHand=handOrder.map(id=>state.hand.find(c=>c.id===id)).filter(Boolean);
  orderedHand.forEach(c=>{
    const el=document.createElement("div");
    el.className="card "+((c.suit==="♥"||c.suit==="♦")?"red ":"")+
      (c.rank==="JOKER"?"joker ":"")+(selected===c.id?"selected":"");
    el.draggable=true;
    el.dataset.cardId=c.id;
    el.innerHTML=`<span>${cardName(c)}</span><span class="suit">${c.rank==="JOKER"?"★":c.suit}</span>`;
    el.onclick=()=>{selected=selected===c.id?null:c.id;render();};
    el.addEventListener("dragstart",event=>{
      draggedCardId=c.id;
      event.dataTransfer.effectAllowed="move";
      event.dataTransfer.setData("text/plain",c.id);
      requestAnimationFrame(()=>el.classList.add("dragging"));
    });
    el.addEventListener("dragend",()=>{draggedCardId=null;el.classList.remove("dragging");});
    el.addEventListener("dragover",event=>{event.preventDefault();event.dataTransfer.dropEffect="move";});
    el.addEventListener("drop",event=>{
      event.preventDefault();
      const movingId=draggedCardId||event.dataTransfer.getData("text/plain");
      const rect=el.getBoundingClientRect();
      reorderCard(movingId,c.id,event.clientX>rect.left+rect.width/2);
      draggedCardId=null;
    });
    hand.appendChild(el);
  });
  const selectedIndex=handOrder.indexOf(selected);
  $("moveLeftBtn").disabled=!selected||selectedIndex<=0;
  $("moveRightBtn").disabled=!selected||selectedIndex<0||selectedIndex>=handOrder.length-1;
  $("handCount").textContent=`${state.hand.length} cards`;
  animateNewlyDrawnCard();
  knownHandIds=new Set(state.hand.map(card=>card.id));
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
connect();
