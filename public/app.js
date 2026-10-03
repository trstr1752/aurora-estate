const $=id=>document.getElementById(id);
let ws=null, me=null, state=null;

function connect(){
  const proto=location.protocol==="https:"?"wss":"ws";
  ws=new WebSocket(`${proto}://${location.host}`);
  ws.onopen=()=>ws.send(JSON.stringify({type:"join",name:$("name").value||"플레이어",room:$("room").value||"AURORA"}));
  ws.onmessage=e=>{
    const m=JSON.parse(e.data);
    if(m.type==="error"){ $("error").textContent=m.message; return; }
    if(m.type==="state"){state=m.state; me=state.players.find(p=>p.id===me?.id)||state.players.find(p=>p.name===$("name").value); render();}
  };
  ws.onclose=()=>{if(state){$("status").textContent="연결이 끊어졌습니다. 페이지를 새로고침해 다시 입장하세요."}};
}
$("join").onclick=()=>{
  $("error").textContent="";
  if(!$("name").value.trim()||!$("room").value.trim()){$("error").textContent="닉네임과 방 코드를 입력해주세요.";return}
  $("lobby").classList.add("hidden");$("game").classList.remove("hidden");$("roomBadge").classList.remove("hidden");
  $("roomBadge").textContent="ROOM "+$("room").value.toUpperCase();
  connect();
};
$("start").onclick=()=>ws.send(JSON.stringify({type:"start"}));
$("roll").onclick=()=>ws.send(JSON.stringify({type:"roll"}));
$("buy").onclick=()=>ws.send(JSON.stringify({type:"buy"}));

function render(){
  const current=state.players[state.turn];
  $("status").innerHTML=state.started
    ? `현재 차례: <b style="color:${current?.color}">${current?.name||"-"}</b> · ${state.players.length}/4명`
    : `대기 중 · ${state.players.length}/4명`;
  $("start").disabled=state.started||state.players.length<2;
  $("roll").disabled=!state.started||!me||current?.id!==me.id||me.bankrupt;
  const space=state.spaces[me?.pos||0];
  $("buy").disabled=!state.started||!me||current?.id!==me.id||!space||space.type!=="property"||space.owner||me.money<space.price;
  renderPlayers(); renderBoard(); renderLog();
}

function renderPlayers(){
  $("players").innerHTML=state.players.map(p=>`
    <div class="player ${state.players[state.turn]?.id===p.id?'turn':''}">
      <span class="dot" style="background:${p.color}"></span>
      <div style="flex:1"><strong>${esc(p.name)} ${p.id===me?.id?'(나)':''}</strong><small>${p.bankrupt?'파산':'보유금 '+p.money.toLocaleString()+'원'} · ${esc(state.spaces[p.pos].name)}</small></div>
    </div>`).join("");
}
function renderBoard(){
  const cells=[];
  // perimeter positions: 0-5 top, 6-10 right, 11-15 bottom, 16-20 left,
  // remaining 21-23 are placed before center as compact inner edge cells.
  // To preserve all 24 spaces in a 6x6 board, map them around the perimeter.
  const coords=[];
  for(let c=1;c<=6;c++) coords.push([1,c]);
  for(let r=2;r<=6;r++) coords.push([r,6]);
  for(let c=5;c>=1;c--) coords.push([6,c]);
  for(let r=5;r>=2;r--) coords.push([r,1]);
  // This yields 20 cells; add four corner-adjacent "inner" slots.
  coords.push([2,2],[2,5],[5,5],[5,2]);
  const by=Array(36).fill(null);
  coords.forEach((rc,i)=>{by[(rc[0]-1)*6+(rc[1]-1)]=i});
  let html="";
  for(let i=0;i<36;i++){
    if(by[i]!==null){
      const n=by[i],s=state.spaces[n];
      const owners=s.owner?state.players.find(p=>p.id===s.owner):null;
      const tokens=state.players.filter(p=>p.pos===n&&!p.bankrupt).map(p=>`<span class="token" title="${esc(p.name)}" style="background:${p.color}"></span>`).join("");
      html+=`<div class="cell ${s.type}"><div class="cell-name">${esc(s.name)}</div>${s.price?`<div class="price">${s.price.toLocaleString()}원</div>`:""}${owners?`<div class="owner" style="background:${owners.color}"></div>`:""}<div class="tokens">${tokens}</div></div>`;
    } else if(i===8){
      html+=`<div class="center"><div><h2>✦ AURORA ESTATE</h2><p>친구들과 방 코드를 공유하고<br>가장 오래 살아남으세요.</p></div></div>`;
    } else html+="<div></div>";
  }
  $("board").innerHTML=html;
}
function renderLog(){ $("log").innerHTML=state.log.slice().reverse().map(x=>`<div>${esc(x)}</div>`).join(""); }
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
