(() => {
// ------------------ Utilities & Saving ------------------
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

const SKEY = 'mb_save_v0_1';
const saveDefault = {
  gold: 100,
  tutorialSeen: false,
  firstPackGiven: false, // if false, first pack forces Common
  binder: {}, // id -> true (unlocked)
  monsters: {}, // id -> {name, rarity, stats:{atk,def,spd,hp, level, xp}}
  binderPage: 0,
};
let SAVE = load();

function load(){
  try{
    const raw = localStorage.getItem(SKEY);
    if (!raw) return JSON.parse(JSON.stringify(saveDefault));
    const obj = JSON.parse(raw);
    return Object.assign(JSON.parse(JSON.stringify(saveDefault)), obj);
  }catch(e){ return JSON.parse(JSON.stringify(saveDefault)); }
}
function persist(){ localStorage.setItem(SKEY, JSON.stringify(SAVE)); }
function addGold(n){ SAVE.gold = Math.max(0, Math.floor(SAVE.gold + n)); updateGold(); persist(); }
function spendGold(n){ if (SAVE.gold>=n){ SAVE.gold-=n; updateGold(); persist(); return true; } return false; }
function updateGold(){ $('#goldVal').textContent = SAVE.gold; }

// ------------------ Assets ------------------
const IMGS = {};
function loadImage(key, src){
  return new Promise((resolve,reject)=>{
    const img = new Image();
    img.onload = ()=>{ IMGS[key]=img; resolve(img); };
    img.onerror = reject;
    img.src = src;
  });
}
Promise.all([
  loadImage('moggy','assets/moggy_merchant.png'),
  loadImage('cardBack','assets/card_back_locked.png'),
  loadImage('pack_basic','assets/pack_basic.png'),
  loadImage('pack_premium','assets/pack_premium.png'),
  loadImage('pack_ultra','assets/pack_ultra.png'),
]).then(()=>{
  // draw moggy static image onto canvas (still allows bobbing later)
  drawMoggy(0);
}).catch(()=>{});

// ------------------ Game Data ------------------
const RARITY_BORDER = {
  common: 'border-common', rare: 'border-rare', epic: 'border-epic', legendary: 'border-legendary'
};
const RARITY_DUP_GOLD = { common:25, rare:75, epic:150, legendary:300 };
// 30 fixed checklist ids: 0-29 with rarity distribution: 16C, 8R, 4E, 2L
const MONSTER_INDEX = [];
(function buildIndex(){
  for (let i=0;i<16;i++) MONSTER_INDEX.push({id:i, rarity:'common'});
  for (let i=16;i<24;i++) MONSTER_INDEX.push({id:i, rarity:'rare'});
  for (let i=24;i<28;i++) MONSTER_INDEX.push({id:i, rarity:'epic'});
  for (let i=28;i<30;i++) MONSTER_INDEX.push({id:i, rarity:'legendary'});
})();

// Pack definitions
const PACKS = {
  basic:   { cost:100, odds:{common:0.70, rare:0.25, epic:0.05, legendary:0.00}, title:'Basic Pack', key:'pack_basic' },
  premium: { cost:250, odds:{common:0.40, rare:0.40, epic:0.15, legendary:0.05}, title:'Premium Pack', key:'pack_premium' },
  ultra:   { cost:500, odds:{common:0.20, rare:0.35, epic:0.30, legendary:0.15}, title:'Ultra Pack', key:'pack_ultra'  },
};

// ------------------ Name Generator (deterministic per id) ------------------
const PREFIX = ['Gloob','Chonk','Zap','Fang','Slime','Buzzle','Grub','Plop','Squelch','Fluff','Snarg','Munch','Zizzle','Gloop','Dribble'];
const SUFFIX = ['fang','toad','beast','munch','oose','zilla','wiggle','splat','nibble','jaw','snout','snack','claw','chomp','gobble'];
function seededRandom(seed){
  let t = (seed*9301 + 49297) % 233280;
  return () => { t = (t*9301 + 49297) % 233280; return t/233280; };
}
function nameFor(id){
  const rnd = seededRandom(id+12345);
  const p = PREFIX[Math.floor(rnd()*PREFIX.length)];
  const s = SUFFIX[Math.floor(rnd()*SUFFIX.length)];
  return p + s;
}

// ------------------ Stat & Leveling ------------------
function baseStatsFor(id, rarity){
  const rnd = seededRandom(id*7+99);
  const base = { atk: 5+Math.floor(rnd()*6), def: 5+Math.floor(rnd()*6), spd: 5+Math.floor(rnd()*6), hp: 22+Math.floor(rnd()*9) };
  const bonus = rarity==='rare'?2: rarity==='epic'?5: rarity==='legendary'?8: 0;
  return { atk:base.atk+bonus, def:base.def+bonus, spd:base.spd+bonus, hp:base.hp+bonus*2, level:1, xp:0 };
}
function levelUpIfNeeded(m){
  const thresholds = [0, 30, 80, 150, 240, 350];
  while (m.stats.level < thresholds.length && m.stats.xp >= thresholds[m.stats.level]) {
    m.stats.level++;
    m.stats.atk += 1; m.stats.def += 1; m.stats.spd += 1; m.stats.hp += 2;
    showToast(`${m.name} leveled up to ${m.stats.level}!`);
  }
}
function gainXP(id, amount){
  const m = SAVE.monsters[id];
  if (!m) return;
  m.stats.xp += amount;
  levelUpIfNeeded(m);
  persist();
  renderBinderPages();
}

// ------------------ Sounds (WebAudio) ------------------
const AudioFX = {
  ctx: null,
  ensure(){ if (this.ctx) return; const AC = window.AudioContext||window.webkitAudioContext; this.ctx = new AC(); },
  play(freq=440, dur=0.08, type='sine', gain=0.04){
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = gain;
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t+dur);
  },
  pop(){ this.play(520, .06, 'triangle', .04); },
  whoosh(){ this.play(220, .12, 'sawtooth', .03); },
  coin(){ this.play(880, .06, 'square', .05); setTimeout(()=>this.play(1320,.06,'square',.04), 70); },
  punch(){ this.play(160, .08, 'sawtooth', .05); },
  win(){ this.play(880, .12, 'triangle', .05); setTimeout(()=>this.play(1320,.12,'triangle',.05), 130); },
  lose(){ this.play(220, .2, 'sine', .04); },
};

// ------------------ UI Navigation ------------------
const screens = {
  menu: $('#screenMenu'),
  binder: $('#screenBinder'),
  shop: $('#screenShop'),
  battle: $('#screenBattle')
};
function show(screen){
  Object.values(screens).forEach(s=>s.classList.add('hidden'));
  screen.classList.remove('hidden');
}
$('#gotoBinder').onclick = ()=>show(screens.binder);
$('#gotoShop').onclick = ()=>{ show(screens.shop); maybeTutorial(); };
$('#gotoBattle').onclick = ()=>show(screens.battle);
$('#btnMenuBinder').onclick = ()=>show(screens.binder);
$('#btnMenuShop').onclick = ()=>{ show(screens.shop); maybeTutorial(); };
$('#btnMenuBattle').onclick = ()=>show(screens.battle);

show(screens.menu);
updateGold();

// ------------------ Binder Rendering ------------------
const PAGES_EL = $('#binderPages');
const PAGE_NUM = $('#pageNum');
const PAGE_MAX = $('#pageMax');
const PROGRESS_VAL = $('#progressVal');
const TOTAL = 30;
const PER_PAGE = 9;
const PAGE_COUNT = Math.ceil(TOTAL / PER_PAGE);
PAGE_MAX.textContent = PAGE_COUNT;

function renderBinderPages(){
  PROGRESS_VAL.textContent = Object.keys(SAVE.binder).length;
  PAGES_EL.innerHTML='';
  for (let p=0; p<PAGE_COUNT; p++){
    const page = document.createElement('div');
    page.className = 'page';
    page.style.transform = `translateX(${(p - SAVE.binderPage)*100}%)`;
    for (let i=0;i<PER_PAGE;i++){
      const globalIndex = p*PER_PAGE + i;
      const slot = document.createElement('div'); slot.className='card-slot';
      const card = document.createElement('div');
      if (globalIndex >= TOTAL) { page.appendChild(slot); continue; }
      const info = MONSTER_INDEX[globalIndex];
      const unlocked = !!SAVE.binder[info.id];
      const borderClass = unlocked ? RARITY_BORDER[info.rarity] : '';
      card.className = 'card ' + (unlocked?borderClass:'locked');
      const art = document.createElement('div'); art.className='art';
      const c = document.createElement('canvas'); c.width=160; c.height=120; art.appendChild(c);

      const meta = document.createElement('div'); meta.className='meta';
      const name = document.createElement('div'); name.className='name';

      if (unlocked){
        drawMonsterToCanvas(info.id, c.getContext('2d'));
        const mon = SAVE.monsters[info.id];
        name.textContent = mon.name + `  (Lv ${mon.stats.level})`;
        meta.appendChild(name);
        const stat = (k)=>{ const d=document.createElement('div'); d.textContent = `${k.toUpperCase()}: ${mon.stats[k]}`; return d; };
        meta.appendChild(stat('atk')); meta.appendChild(stat('def')); meta.appendChild(stat('spd')); meta.appendChild(stat('hp'));
      } else {
        drawCardBack(c.getContext('2d'));
        name.textContent = '???';
        meta.appendChild(name);
      }

      card.appendChild(art); card.appendChild(meta);
      slot.appendChild(card); page.appendChild(slot);
    }
    PAGES_EL.appendChild(page);
  }
  PAGE_NUM.textContent = (SAVE.binderPage+1);
}
renderBinderPages();

function flipPage(dir){
  SAVE.binderPage = clamp(SAVE.binderPage + dir, 0, PAGE_COUNT-1);
  persist();
  $$('.page').forEach((p,idx)=>{ p.style.transform = `translateX(${(idx - SAVE.binderPage)*100}%)`; });
  PAGE_NUM.textContent = (SAVE.binderPage+1);
  AudioFX.ensure(); AudioFX.whoosh();
}
$('#prevPage').onclick = ()=>flipPage(-1);
$('#nextPage').onclick = ()=>flipPage(1);

// ------------------ Card Back (locked) ------------------
function drawCardBack(ctx){
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.clearRect(0,0,W,H);
  const img = IMGS.cardBack;
  if (img){
    const scale = Math.min(W/img.width, H/img.height);
    const w = img.width*scale, h = img.height*scale;
    ctx.drawImage(img, (W-w)/2, (H-h)/2, w, h);
  } else {
    // fallback simple
    ctx.fillStyle = '#12162a'; ctx.fillRect(0,0,W,H);
  }
}

// ------------------ Monster Blob Art ------------------
function seededRandom(seed){ let t = (seed*9301 + 49297) % 233280; return ()=>{ t=(t*9301+49297)%233280; return t/233280; }; }
function drawMonsterToCanvas(id, ctx){
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.clearRect(0,0,W,H);
  const r = seededRandom(id*13+7);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i=0;i<20;i++){ ctx.beginPath(); ctx.arc(r()*W, r()*H, 1+r()*2, 0, Math.PI*2); ctx.fill(); }
  const hue = Math.floor(r()*360);
  ctx.fillStyle = `hsl(${hue} 70% 55%)`; ctx.strokeStyle = `hsl(${hue} 50% 30%)`;
  const cx=W/2, cy=H/2, rad=Math.min(W,H)*0.32;
  ctx.beginPath();
  const bumps = 6 + Math.floor(r()*5);
  for (let i=0;i<=bumps;i++){
    const a = (i/bumps)*Math.PI*2;
    const rr = rad*(0.8 + r()*0.6);
    const x = cx + Math.cos(a)*rr; const y = cy + Math.sin(a)*rr;
    i?ctx.lineTo(x,y):ctx.moveTo(x,y);
  }
  ctx.closePath(); ctx.fill(); ctx.lineWidth=4; ctx.stroke();
  const eyes = 1 + Math.floor(r()*3);
  for (let i=0;i<eyes;i++){
    const ex = cx + (r()*2-1)*rad*0.5; const ey = cy + (r()*2-1)*rad*0.2;
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(ex,ey,8+ r()*6,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#111'; ctx.beginPath(); ctx.arc(ex+(r()*4-2),ey+(r()*4-2),3+ r()*2,0,Math.PI*2); ctx.fill();
  }
  ctx.strokeStyle='#111'; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(cx-rad*0.4, cy+rad*0.25); ctx.quadraticCurveTo(cx, cy+rad*0.45, cx+rad*0.4, cy+rad*0.25); ctx.stroke();
  if (r()>0.5){
    ctx.fillStyle='#fff';
    for (let t=0;t<4+Math.floor(r()*4);t++){
      const tx = cx - rad*0.3 + t*(rad*0.15); const ty = cy+rad*0.25;
      ctx.beginPath(); ctx.moveTo(tx,ty); ctx.lineTo(tx+6,ty); ctx.lineTo(tx+3,ty+8); ctx.closePath(); ctx.fill();
    }
  }
}

// ------------------ Moggy the Merchant (draw image) ------------------
const moggyCanvas = $('#moggyCanvas');
const moggyCtx = moggyCanvas.getContext('2d');
let moggyT = 0, moggyState='idle';
function drawMoggy(dt){
  moggyT += dt;
  const ctx = moggyCtx, W=moggyCanvas.width, H=moggyCanvas.height;
  ctx.clearRect(0,0,W,H);
  const img = IMGS.moggy;
  if (img){
    // small bob
    const bob = Math.sin(moggyT*3)*6;
    ctx.drawImage(img, 0, bob, W, H);
  }
}
let lastTS=0;
function loopMoggy(ts){
  if (!lastTS) lastTS = ts;
  const dt = Math.min(0.033,(ts-lastTS)/1000); lastTS=ts;
  drawMoggy(dt);
  requestAnimationFrame(loopMoggy);
}
requestAnimationFrame(loopMoggy);

const speechEl = $('#speech');
function sayOnce(text, ms=3000){ speechEl.textContent = text; speechEl.classList.remove('hidden','fade'); setTimeout(()=>speechEl.classList.add('fade'), ms-400); setTimeout(()=>speechEl.classList.add('hidden'), ms); }

function tutorialSequence(){
  const lines = [
    "Oi! First time here, huh? Welcome to my shop!",
    "Buy packs with gold. New monsters fill your binder; duplicates give ya gold.",
    "Each pack has one monster. Rarer packs have better odds!"
  ];
  let idx = 0;
  const advance = ()=>{
    if (idx < lines.length){ speechEl.textContent = lines[idx++] + "  (Click)"; speechEl.classList.remove('hidden','fade'); }
    else { speechEl.classList.add('hidden'); SAVE.tutorialSeen = true; persist(); }
  };
  speechEl.onclick = advance;
  if (!SAVE.tutorialSeen) advance();
}
function maybeTutorial(){
  if (!SAVE.tutorialSeen) tutorialSequence();
  else sayOnce(["Step right up, best monsters in town!","Spend it while ya got it, hehe!","Pick a pack—any pack!"][Math.floor(Math.random()*3)]);
}

// ------------------ Pack Buying & Opening ------------------
let currentPack = null;
$$('.pack .buy').forEach(btn=>btn.addEventListener('click', e=>{
  const packEl = e.target.closest('.pack');
  const type = packEl.getAttribute('data-pack');
  const PK = PACKS[type];
  if (!spendGold(PK.cost)){ sayOnce("Not enough gold! Battle or find duplicates!"); return; }
  AudioFX.ensure(); AudioFX.pop();
  $('#packOpen').classList.remove('hidden');
  const img = $('#openingPackImg');
  img.src = IMGS[PK.key].src;
  currentPack = type;
  sayOnce("Ooooh! Let's see what you pulled!");
}));

$('#openPackBtn').onclick = ()=>{
  if (!currentPack) return;
  $('#openPackBtn').disabled = true;
  let rarity = rollRarity(currentPack);
  if (!SAVE.firstPackGiven){ rarity = 'common'; }
  revealCardAnimation(rarity).then(resultId=>{
    $('#closeReveal').classList.remove('hidden');
    $('#openPackBtn').disabled = false;
    SAVE.firstPackGiven = true; persist();
    const info = MONSTER_INDEX.find(m=>m.id===resultId);
    if (!SAVE.binder[resultId]){
      unlockMonster(resultId, info.rarity);
      sayOnce("A new one for the binder! Nice!");
    } else {
      const g = RARITY_DUP_GOLD[info.rarity];
      addGold(g); AudioFX.coin(); showToast(`Duplicate! +${g} gold`);
      sayOnce("Already got that fella? Here's some gold back!");
    }
    renderBinderPages();
  });
};

$('#closeReveal').onclick = ()=>{
  $('#packOpen').classList.add('hidden');
  $('#closeReveal').classList.add('hidden');
  currentPack = null;
};

function rollRarity(packType){
  const odds = PACKS[packType].odds;
  const r = Math.random();
  let sum = 0;
  for (const k of ['common','rare','epic','legendary']){
    sum += odds[k];
    if (r < sum) return k;
  }
  return 'common';
}

function unlockMonster(id, rarity){
  const name = nameFor(id);
  const stats = baseStatsFor(id, rarity);
  SAVE.monsters[id] = { id, name, rarity, stats };
  SAVE.binder[id] = true;
  persist();
}

function idPoolForRarity(r){ return MONSTER_INDEX.filter(m=>m.rarity===r).map(m=>m.id); }

function drawCardFaceTo(ctx, pick, rarity){
  // border color is handled in binder; for reveal we draw simple face with blob art + text
  const W = 240, H = 320;
  ctx.fillStyle = '#1b213b'; ctx.strokeStyle='#666'; ctx.lineWidth=6;
  ctx.fillRect(-W/2,-H/2,W,H); ctx.strokeRect(-W/2,-H/2,W,H);
  ctx.strokeStyle = rarity==='legendary'?'#ffd166':rarity==='epic'?'#b57aff':rarity==='rare'?'#56a5ff':'#9aa0a6';
  ctx.strokeRect(-W/2,-H/2,W,H);
  const sub = document.createElement('canvas'); sub.width=200; sub.height=140;
  drawMonsterToCanvas(pick, sub.getContext('2d'));
  ctx.drawImage(sub, -100, -120, 200, 140);
  ctx.fillStyle='#fff'; ctx.font='bold 18px Arial'; ctx.textAlign='center';
  ctx.fillText(nameFor(pick), 0, 40);
  const st = baseStatsFor(pick, rarity);
  ctx.font='12px Arial'; ctx.textAlign='left';
  ctx.fillText(`ATK: ${st.atk}`, -100, 66);
  ctx.fillText(`DEF: ${st.def}`, -20, 66);
  ctx.fillText(`SPD: ${st.spd}`,  60, 66);
  ctx.fillText(`HP:  ${st.hp}`,  -100, 84);
}

// Reveal animation & card creation (uses card_back asset on back)
function revealCardAnimation(rarity){
  return new Promise((resolve)=>{
    const canvas = $('#revealCanvas');
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0,0,W,H);
    const pool = idPoolForRarity(rarity);
    const pick = pool[Math.floor(Math.random()*pool.length)];
    let t=0; const dur=900;
    const glowColor = rarity==='legendary'?'rgba(255,217,102,0.75)':rarity==='epic'?'rgba(181,122,255,0.6)':rarity==='rare'?'rgba(86,165,255,0.5)':'rgba(255,255,255,0.25)';
    const start = performance.now();
    AudioFX.ensure(); AudioFX.whoosh();
    function step(now){
      t = now - start;
      ctx.clearRect(0,0,W,H);
      ctx.save();
      ctx.fillStyle = glowColor;
      ctx.beginPath(); ctx.arc(W/2,H/2, 40 + Math.min(140, t/3), 0, Math.PI*2); ctx.fill();
      ctx.restore();
      const prog = Math.min(1, t/dur);
      const scaleX = Math.cos(prog*Math.PI);
      ctx.save();
      ctx.translate(W/2,H/2);
      ctx.scale(Math.max(0.05, Math.abs(scaleX)),1);
      const CW=240, CH=320;
      if (scaleX>=0){
        // draw card back image
        const img = IMGS.cardBack;
        if (img){
          const scale = Math.min(CW/img.width, CH/img.height);
          const w = img.width*scale, h = img.height*scale;
          ctx.drawImage(img, -w/2, -h/2, w, h);
        } else {
          ctx.fillStyle='#0b0f1f'; ctx.fillRect(-CW/2,-CH/2,CW,CH);
        }
      } else {
        drawCardFaceTo(ctx, pick, rarity);
      }
      ctx.restore();
      if (t<dur+400){ requestAnimationFrame(step); } else { resolve(pick); }
    }
    requestAnimationFrame(step);
  });
}

// ------------------ Battle ------------------
function renderBattleRoster(){
  const hold = $('#battleRoster'); hold.innerHTML='';
  const ids = Object.keys(SAVE.binder).map(k=>+k);
  if (!ids.length){
    hold.innerHTML = '<div id="warn">You need at least one monster to battle. Visit the Shop.</div>';
    return;
  }
  ids.forEach(id=>{
    const div = document.createElement('div');
    div.className='pick';
    div.innerHTML = `<canvas width="160" height="110"></canvas><div><strong>${SAVE.monsters[id].name}</strong></div><div>Lv ${SAVE.monsters[id].stats.level}</div>`;
    div.onclick = ()=> beginBattle(id);
    hold.appendChild(div);
    drawMonsterToCanvas(id, div.querySelector('canvas').getContext('2d'));
  });
}
renderBattleRoster();
$('#btnMenuBattle').addEventListener('click', renderBattleRoster);
$('#gotoBattle').addEventListener('click', renderBattleRoster);

let battle = null;
function beginBattle(playerId){
  const aiCand = MONSTER_INDEX[Math.floor(Math.random()*MONSTER_INDEX.length)].id;
  battle = {
    playerId, aiId: aiCand,
    player: JSON.parse(JSON.stringify(SAVE.monsters[playerId])),
    ai: SAVE.monsters[aiCand] ? JSON.parse(JSON.stringify(SAVE.monsters[aiCand])) : { name:nameFor(aiCand), rarity: MONSTER_INDEX.find(m=>m.id===aiCand).rarity, stats: baseStatsFor(aiCand, MONSTER_INDEX.find(m=>m.id===aiCand).rarity) },
    turn: 'player',
    playerHP: SAVE.monsters[playerId].stats.hp,
    aiHP: (SAVE.monsters[aiCand] ? SAVE.monsters[aiCand].stats.hp : baseStatsFor(aiCand, MONSTER_INDEX.find(m=>m.id===aiCand).rarity).hp)
  };
  $('#battleSelect').classList.add('hidden');
  $('#battleStage').classList.remove('hidden');
  drawMonsterToCanvas(playerId, $('#playerMonCanvas').getContext('2d'));
  drawMonsterToCanvas(aiCand, $('#aiMonCanvas').getContext('2d'));
  $('#playerName').textContent = SAVE.monsters[playerId].name;
  $('#aiName').textContent = battle.ai.name;
  updateHPBars();
  $('#battleLog').textContent = 'A wild opponent appeared!';
}
function updateHPBars(){
  const pctP = clamp(battle.playerHP / SAVE.monsters[battle.playerId].stats.hp, 0, 1);
  const pctA = clamp(battle.aiHP / battle.ai.stats.hp, 0, 1);
  $('#hpPlayer').style.width = (pctP*100)+'%';
  $('#hpAI').style.width = (pctA*100)+'%';
}
function logLine(t){ const log=$('#battleLog'); log.textContent = t; }

$$('#battleActions button').forEach(b=> b.addEventListener('click', e=>{
  if (!battle || battle.turn!=='player') return;
  const act = e.currentTarget.getAttribute('data-act');
  playerAct(act);
}));

function playerAct(act){
  AudioFX.ensure();
  const you = SAVE.monsters[battle.playerId].stats;
  const them = battle.ai.stats;
  if (act==='attack'){
    const dmg = Math.max(1, Math.floor(you.atk*0.8 + Math.random()*you.atk) - Math.floor(them.def*0.5));
    battle.aiHP -= dmg; logLine(`${SAVE.monsters[battle.playerId].name} attacks for ${dmg}!`);
    AudioFX.punch();
  } else if (act==='defend'){
    const heal = Math.max(1, Math.floor(you.def*0.4));
    battle.playerHP = clamp(battle.playerHP + heal, 0, you.hp);
    logLine(`${SAVE.monsters[battle.playerId].name} defends and recovers ${heal} HP!`);
  } else if (act==='special'){
    if (Math.random()<0.5){
      const dmg = Math.max(1, you.atk + Math.floor(Math.random()*you.atk) - Math.floor(them.def*0.3));
      battle.aiHP -= dmg; logLine(`Special hits hard for ${dmg}!`);
      AudioFX.punch();
    } else {
      logLine('Special move fizzled!');
    }
  }
  updateHPBars();
  if (battle.aiHP<=0) return endBattle('win');
  battle.turn='ai';
  setTimeout(aiTurn, 500);
}

function aiTurn(){
  const you = SAVE.monsters[battle.playerId].stats;
  const ai = battle.ai.stats;
  const choice = Math.random();
  if (choice<0.65){
    const dmg = Math.max(1, Math.floor(ai.atk*0.8 + Math.random()*ai.atk) - Math.floor(you.def*0.5));
    battle.playerHP -= dmg; logLine(`${battle.ai.name} attacks for ${dmg}!`);
    AudioFX.punch();
  } else if (choice<0.8){
    const heal = Math.max(1, Math.floor(ai.def*0.4));
    battle.aiHP = clamp(battle.aiHP + heal, 0, ai.hp);
    logLine(`${battle.ai.name} defends and recovers ${heal} HP!`);
  } else {
    if (Math.random()<0.5){
      const dmg = Math.max(1, ai.atk + Math.floor(Math.random()*ai.atk) - Math.floor(you.def*0.3));
      battle.playerHP -= dmg; logLine(`${battle.ai.name} uses a special for ${dmg}!`);
      AudioFX.punch();
    } else {
      logLine(`${battle.ai.name}'s special failed!`);
    }
  }
  updateHPBars();
  if (battle.playerHP<=0) return endBattle('lose');
  battle.turn='player';
}

function endBattle(result){
  if (result==='win'){ addGold(50); AudioFX.win(); sayOnce("Victory! +50 gold"); gainXP(battle.playerId, 30); }
  else { addGold(10); AudioFX.lose(); sayOnce("Defeated... +10 gold"); gainXP(battle.playerId, 15); }
  $('#battleStage').classList.add('hidden');
  $('#battleSelect').classList.remove('hidden');
  battle = null;
}

// ------------------ Toasts ------------------
let toastTimer = null;
function showToast(text){
  let el = document.getElementById('toast');
  if (!el){ el = document.createElement('div'); el.id='toast'; document.body.appendChild(el); }
  el.textContent = text;
  el.style.position='fixed'; el.style.left='50%'; el.style.top='14px'; el.style.transform='translateX(-50%)';
  el.style.background='rgba(0,0,0,0.7)'; el.style.color='#fff'; el.style.padding='8px 12px'; el.style.borderRadius='10px'; el.style.border='1px solid rgba(255,255,255,0.2)';
  el.style.zIndex='100';
  el.style.opacity='1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ el.style.transition='opacity .3s'; el.style.opacity='0'; }, 1200);
}

// ------------------ Init ------------------
function init(){
  updateGold();
  renderBinderPages();
  show(screens.menu);
}
init();

})();