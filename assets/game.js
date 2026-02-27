const $ = (id) => document.getElementById(id);

let score = 0;
let power = 1;
let combo = 1;
let comboTimer = null;

let autoRate = 0;
let critChance = 0.03; // 3%
let fever = false;

let powerCost = 10;
let autoCost = 25;
let critCost = 40;

function fmt(n){
  if (n < 1000) return String(n);
  const units = ["K","M","B","T"];
  let u = -1;
  let x = n;
  while (x >= 1000 && u < units.length-1){ x/=1000; u++; }
  return `${x.toFixed(x<10?2:x<100?1:0)}${units[u]}`;
}

function toast(msg){
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(()=>t.classList.remove("show"), 900);
}

function setCombo(v){
  combo = v;
  $("combo").textContent = `x${combo}`;
}

function updateUI(){
  $("score").textContent = fmt(Math.floor(score));
  $("power").textContent = power;
  $("rate").textContent = `+${autoRate} / сек`;
  $("powerCost").textContent = fmt(powerCost);
  $("autoCost").textContent = fmt(autoCost);
  $("critCost").textContent = fmt(critCost);
}

function spawnFloatText(x,y,text,isCrit=false){
  const el = document.createElement("div");
  el.style.position="fixed";
  el.style.left = `${x}px`;
  el.style.top  = `${y}px`;
  el.style.transform = "translate(-50%,-50%)";
  el.style.fontWeight = "900";
  el.style.pointerEvents="none";
  el.style.zIndex="20";
  el.style.textShadow="0 10px 24px rgba(0,0,0,.65)";
  el.style.fontSize = isCrit ? "22px" : "16px";
  el.style.opacity="1";
  el.textContent = text;
  document.body.appendChild(el);

  const dx = (Math.random()*2-1)*18;
  const dy = -60 - Math.random()*30;
  const t0 = performance.now();

  function tick(t){
    const p = Math.min(1, (t - t0) / 650);
    el.style.transform = `translate(calc(-50% + ${dx*p}px), calc(-50% + ${dy*p}px)) scale(${1 + (isCrit?0.10:0.05)*(1-p)})`;
    el.style.opacity = String(1 - p);
    if (p < 1) requestAnimationFrame(tick);
    else el.remove();
  }
  requestAnimationFrame(tick);
}

function burstParticles(cx,cy,count=16){
  for(let i=0;i<count;i++){
    const p = document.createElement("div");
    p.style.position="fixed";
    p.style.left=`${cx}px`;
    p.style.top=`${cy}px`;
    p.style.width="6px";
    p.style.height="6px";
    p.style.borderRadius="999px";
    p.style.background = Math.random() < 0.5 ? "rgba(0,229,255,.95)" : "rgba(139,92,255,.95)";
    p.style.boxShadow="0 10px 30px rgba(0,0,0,.55)";
    p.style.pointerEvents="none";
    p.style.zIndex="19";
    document.body.appendChild(p);

    const ang = Math.random()*Math.PI*2;
    const spd = 90 + Math.random()*170;
    const vx = Math.cos(ang)*spd;
    const vy = Math.sin(ang)*spd;
    const t0 = performance.now();

    function tick(t){
      const dt = (t - t0)/1000;
      const g = 420;
      const x = cx + vx*dt;
      const y = cy + vy*dt + 0.5*g*dt*dt;
      const a = Math.max(0, 1 - dt/0.6);
      p.style.transform = `translate(-50%,-50%) scale(${0.8 + (1-a)*0.8})`;
      p.style.left = `${x}px`;
      p.style.top = `${y}px`;
      p.style.opacity = String(a);
      if (dt < 0.6) requestAnimationFrame(tick);
      else p.remove();
    }
    requestAnimationFrame(tick);
  }
}

function tapAt(clientX, clientY){
  const isCrit = Math.random() < critChance * (fever?1.8:1);
  const mult = combo * (fever?2:1);
  const gain = (isCrit ? power*8 : power) * mult;

  score += gain;

  // combo logic
  setCombo(Math.min(20, combo + 1));
  clearTimeout(comboTimer);
  comboTimer = setTimeout(()=>setCombo(1), 900);

  burstParticles(clientX, clientY, isCrit?26:16);
  spawnFloatText(clientX, clientY, `+${fmt(gain)}`, isCrit);
  updateUI();
}

function canBuy(cost){ return score >= cost; }

$("buyPower").addEventListener("click", ()=>{
  if (!canBuy(powerCost)) return toast("Не вистачає монет");
  score -= powerCost;
  power += 1;
  powerCost = Math.floor(powerCost * 1.55);
  toast("Сила +1");
  updateUI();
});

$("buyAuto").addEventListener("click", ()=>{
  if (!canBuy(autoCost)) return toast("Не вистачає монет");
  score -= autoCost;
  autoRate += 1;
  autoCost = Math.floor(autoCost * 1.7);
  toast("+1 / сек");
  updateUI();
});

$("buyCrit").addEventListener("click", ()=>{
  if (!canBuy(critCost)) return toast("Не вистачає монет");
  score -= critCost;
  critChance = Math.min(0.35, critChance + 0.02);
  critCost = Math.floor(critCost * 1.8);
  toast(`Крит: ${(critChance*100).toFixed(0)}%`);
  updateUI();
});

$("tapBtn").addEventListener("pointerdown", (e)=>{
  $("tapBtn").setPointerCapture(e.pointerId);
  tapAt(e.clientX, e.clientY);
});

// auto income
setInterval(()=>{
  if (autoRate <= 0) return;
  score += autoRate * (fever?2:1);
  updateUI();
}, 1000);

// occasional fever
setInterval(()=>{
  if (fever) return;
  if (Math.random() < 0.18){ // ~раз на 30-40с
    fever = true;
    document.documentElement.style.setProperty("--accent", "#FF4D6D");
    toast("FEVER x2 на 5 секунд!");
    setTimeout(()=>{
      fever = false;
      document.documentElement.style.setProperty("--accent", "#8B5CFF");
      toast("Fever закінчився");
    }, 5000);
  }
}, 4000);

updateUI();