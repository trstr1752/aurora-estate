const path = require("path");
const http = require("http");
const express = require("express");
const { WebSocketServer } = require("ws");

const app = express();
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const rooms = new Map();
const COLORS = ["#e74c3c", "#3498db", "#2ecc71", "#f1c40f"];

const spaces = [
  {name:"출발", type:"start"},
  {name:"별빛 거리", type:"property", price:800, rent:120},
  {name:"보너스 상자", type:"event"},
  {name:"달빛 항구", type:"property", price:1000, rent:150},
  {name:"세금", type:"tax", amount:300},
  {name:"숲속 역", type:"property", price:1200, rent:180},
  {name:"행운의 카드", type:"event"},
  {name:"구름 언덕", type:"property", price:1400, rent:220},
  {name:"무료 휴식", type:"rest"},
  {name:"은하 시장", type:"property", price:1600, rent:250},
  {name:"보너스 상자", type:"event"},
  {name:"파도 마을", type:"property", price:1800, rent:280},
  {name:"특별 이동", type:"warp"},
  {name:"노을 광장", type:"property", price:2000, rent:320},
  {name:"세금", type:"tax", amount:500},
  {name:"별의 정원", type:"property", price:2200, rent:360},
  {name:"행운의 카드", type:"event"},
  {name:"새벽 도시", type:"property", price:2400, rent:400},
  {name:"무료 휴식", type:"rest"},
  {name:"하늘 성채", type:"property", price:2600, rent:440},
  {name:"보너스 상자", type:"event"},
  {name:"황금 해변", type:"property", price:2800, rent:480},
  {name:"특별 이동", type:"warp"},
  {name:"오로라 수도", type:"property", price:3200, rent:550}
];

function newRoom(code) {
  return {
    code,
    players: [],
    turn: 0,
    started: false,
    log: ["방이 만들어졌습니다. 최대 4명이 참가할 수 있어요."],
    spaces: spaces.map(s => ({...s, owner:null}))
  };
}
function publicState(room) {
  return {
    code: room.code,
    started: room.started,
    turn: room.turn,
    players: room.players.map(p => ({
      id:p.id, name:p.name, color:p.color, money:p.money, pos:p.pos,
      bankrupt:p.bankrupt, connected:p.ws && p.ws.readyState === 1
    })),
    spaces: room.spaces,
    log: room.log.slice(-14)
  };
}
function send(ws, data) {
  if (ws.readyState === 1) ws.send(JSON.stringify(data));
}
function broadcast(room) {
  const data = JSON.stringify({type:"state", state:publicState(room)});
  room.players.forEach(p => { if (p.ws) send(p.ws, data); });
}
function log(room, msg) {
  room.log.push(msg);
  if (room.log.length > 40) room.log.shift();
}
function dice() { return 1 + Math.floor(Math.random()*6); }
function activePlayers(room) { return room.players.filter(p => !p.bankrupt); }
function nextTurn(room) {
  if (!activePlayers(room).length) return;
  let tries = 0;
  do {
    room.turn = (room.turn + 1) % room.players.length;
    tries++;
  } while (room.players[room.turn].bankrupt && tries <= room.players.length);
}
function pay(room, payer, receiver, amount) {
  const actual = Math.min(amount, payer.money);
  payer.money -= actual;
  if (receiver) receiver.money += actual;
  if (payer.money <= 0) {
    payer.money = 0; payer.bankrupt = true;
    room.spaces.forEach(s => { if (s.owner === payer.id) s.owner = null; });
    log(room, `${payer.name}님이 파산했습니다.`);
  }
}
function resolveLanding(room, p) {
  const s = room.spaces[p.pos];
  if (s.type === "property") {
    if (!s.owner) {
      log(room, `${p.name}님이 ${s.name}에 도착했습니다. 구매할 수 있습니다.`);
    } else if (s.owner !== p.id) {
      const owner = room.players.find(x => x.id === s.owner);
      if (owner && !owner.bankrupt) {
        pay(room, p, owner, s.rent);
        log(room, `${p.name}님이 ${owner.name}님에게 통행료 ${s.rent}원을 냈습니다.`);
      }
    }
  } else if (s.type === "tax") {
    pay(room, p, null, s.amount);
    log(room, `${p.name}님이 세금 ${s.amount}원을 냈습니다.`);
  } else if (s.type === "event") {
    const amount = [200, 300, 400, -150][Math.floor(Math.random()*4)];
    if (amount >= 0) {
      p.money += amount;
      log(room, `${p.name}님이 이벤트 보상 ${amount}원을 받았습니다.`);
    } else {
      pay(room, p, null, -amount);
      log(room, `${p.name}님이 이벤트 비용 ${-amount}원을 냈습니다.`);
    }
  } else if (s.type === "warp") {
    const target = (p.pos + 6) % room.spaces.length;
    p.pos = target;
    log(room, `${p.name}님이 특별 이동으로 ${room.spaces[target].name}(으)로 이동했습니다.`);
    resolveLanding(room, p);
  }
}
function requirePlayer(room, ws) {
  return room.players.find(p => p.ws === ws);
}

wss.on("connection", ws => {
  ws.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === "join") {
      const code = String(msg.room || "").trim().toUpperCase().slice(0,8);
      const name = String(msg.name || "플레이어").trim().slice(0,12) || "플레이어";
      if (!code) return send(ws,{type:"error",message:"방 코드를 입력해주세요."});
      let room = rooms.get(code);
      if (!room) { room = newRoom(code); rooms.set(code, room); }
      if (room.started) return send(ws,{type:"error",message:"이미 시작된 방입니다."});
      if (room.players.length >= 4) return send(ws,{type:"error",message:"방이 가득 찼습니다."});
      if (room.players.some(p => p.name === name)) return send(ws,{type:"error",message:"같은 이름이 이미 있습니다."});
      const p = {id: Math.random().toString(36).slice(2,10), name, color:COLORS[room.players.length],
        money:10000, pos:0, bankrupt:false, ws};
      room.players.push(p);
      ws.room = room.code;
      ws.playerId = p.id;
      log(room, `${name}님이 입장했습니다.`);
      broadcast(room);
      return;
    }

    const room = rooms.get(ws.room);
    if (!room) return;
    const p = requirePlayer(room, ws);
    if (!p) return;

    if (msg.type === "start") {
      if (room.players.length < 2) return send(ws,{type:"error",message:"최소 2명이 필요합니다."});
      if (room.started) return;
      room.started = true;
      room.turn = 0;
      log(room, "게임이 시작되었습니다!");
      broadcast(room);
    }

    if (msg.type === "roll") {
      if (!room.started) return;
      if (room.players[room.turn]?.id !== p.id || p.bankrupt) return;
      const d1=dice(), d2=dice(), total=d1+d2;
      const old=p.pos;
      p.pos=(p.pos+total)%room.spaces.length;
      if (p.pos < old) { p.money += 1000; log(room, `${p.name}님이 출발을 지나 1,000원을 받았습니다.`); }
      log(room, `${p.name}님이 ${d1}+${d2} = ${total}칸 이동했습니다.`);
      resolveLanding(room,p);
      nextTurn(room);
      broadcast(room);
    }

    if (msg.type === "buy") {
      const s=room.spaces[p.pos];
      if (!room.started || room.players[room.turn]?.id !== p.id || s.type !== "property" || s.owner || p.money < s.price) return;
      p.money -= s.price; s.owner=p.id;
      log(room, `${p.name}님이 ${s.name}을 ${s.price}원에 구매했습니다.`);
      broadcast(room);
    }
  });

  ws.on("close", () => {
    const room = rooms.get(ws.room);
    if (!room) return;
    const p = requirePlayer(room, ws);
    if (p) { p.ws=null; log(room, `${p.name}님의 연결이 끊겼습니다.`); }
    broadcast(room);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Orbit Estate running on http://localhost:${PORT}`));
