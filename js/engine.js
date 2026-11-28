/* ============================================================
   足球人生 · 核心仿真引擎
   ------------------------------------------------------------
   负责：游戏状态、属性成长、天数制训练、状态(form)、比赛关键点、
   体能、联赛评级(星级)、赛季推进、身价、转会、成就、存档槽。
   本文件不直接操作 DOM。
   ============================================================ */
'use strict';

/* ---------- 随机工具 ---------- */
function rnd(){ return Math.random(); }
function ri(a,b){ return Math.floor(rnd()*(b-a+1))+a; }
function pick(arr){ return arr[ri(0,arr.length-1)]; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function poisson(lambda){
  const L=Math.exp(-lambda); let k=0,p=1;
  do{ k++; p*=rnd(); }while(p>L);
  return k-1;
}
function fmt1(v){ return (Math.round(v*10)/10).toFixed(1); }

/* ---------- 全局游戏状态 ---------- */
let G=null;
let viewRound=0;   // 当前赛季轮次（0-based，UI 与引擎共享）
let fixtures=[];   // 当前赛季赛程

/* 不同属性升级经验不同（界面不显示） */
function xpNeed(k,level){
  const base=ATTR_XP_BASE[k]||18;
  return Math.round(base*Math.pow(XP_GROWTH,Math.max(0,level-1)));
}

/* 体能 → 有效能力系数：体能越低，能发挥出的属性越低 */
function fitnessFactor(f){
  const x=clamp(f,0,100)/100;
  return 0.55+0.45*Math.pow(x,0.8);
}
function fitnessPct(f){ return Math.round(fitnessFactor(f)*100); }

function ageFactor(age){
  if(age<=20) return 1.15;
  if(age<=23) return 1.0;
  if(age<=26) return 0.78;
  if(age<=29) return 0.55;
  if(age<=31) return 0.38;
  return 0.2;
}

/* 学习倍率：随「所在联赛水平 vs 自身能力」的差距缩放（FM 式可提升空间）。
   3★（联赛平均）= 1.0 基准；能力越低学得越多（能学的多），能力越高学得越少。 */
function learnMul(G_){
  const st=caStars(calcCA(G_),G_.clubTier);
  return clamp(1+(3-st)*0.18,0.4,1.8);
}

/* ============================================================
   联赛评级（FM 标准 0~200 CA 体系）
   · CA = Σ(attr/20 × 位置权重) × 200，全 20 属性 → 200
   · 联赛 CA 均值：中乙 100 / 中甲 130 / 中超 150，sd=25
   · 星级 = CA 在本联赛的百分位：50% = 3★，每 10% 分位 = 半星
   ============================================================ */
function normCdf(z){
  const t=1/(1+0.2316419*Math.abs(z));
  const d=0.3989422804014327*Math.exp(-z*z/2);
  const p=d*t*(0.319381530+t*(-0.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));
  return z>0?1-p:p;
}
function seasonMeanMul(){
  return (G&&typeof G.seasonMeanMul==='number')?G.seasonMeanMul:1;
}
function leagueQuality(tier){
  const t=tier||(G?G.clubTier:3);
  return LEAGUE_QUALITY[t]||LEAGUE_QUALITY[3];
}
/* 某属性在当前联赛的平均水平（含赛季 ±20% 波动与属性画像）。
   联赛 CA 均值(0~200) 换算为 1~20 制属性均值：mean20 = CA均值/10 */
function leagueMean(k,tier){
  return leagueQuality(tier).mean/10*seasonMeanMul()*(ATTR_NORM[k]||1);
}
function leagueSD(tier){ return leagueQuality(tier).sd/10; }   /* 属性分布 sd（1~20 制）= CA sd/10 */
function leagueCAMean(tier){ return leagueQuality(tier).mean*seasonMeanMul(); }

function attrPercentile(k,value,tier){
  return normCdf((value-leagueMean(k,tier))/leagueSD(tier));
}
function caPercentile(ca,tier){
  /* CA 分布：sd=25（FM 风格，联赛内能力差距明显） */
  return normCdf((ca-leagueCAMean(tier))/25);
}
function starsFromPct(p){
  return clamp(Math.round((3+(p-0.5)*5)*2)/2,0.5,5);
}
function attrStars(k,value,tier){ return starsFromPct(attrPercentile(k,value,tier)); }
function caStars(v,tier){ return starsFromPct(caPercentile(v,tier)); }
function starsText(v){
  const n=Math.round(v*2)/2;
  return (Math.round(n*10)/10)+'★';
}
/* 声望文案的分层配色（与属性等级色阶同一套逻辑） */
function repClass(rep){
  return rep>=75?'lv-elite':rep>=55?'lv-good':rep>=35?'lv-normal':'lv-poor';
}

/* ============================================================
   出场定位：按联赛星级（综合评价）+ 近期表现
   tier 0: <1.5★ 边缘球员 —— 几乎没有机会
   tier 1: 1.5~2.5★ —— 开始有替补登场机会，表现好可竞争首发
   tier 2: 2.5~3.5★ —— 稳定首发
   tier 3: ≥3.5★ —— 忽略评分，尽量踢满全场
   ============================================================ */
/* perfAvg=0 表示尚无出场记录（首秀前显示 —），未首秀时回退 6.3 中性基准 */
function perfAvgOf(G_){ return (typeof G_.perfAvg==='number'&&G_.perfAvg>0)?G_.perfAvg:6.3; }
function perfBoost(G_){ return clamp((perfAvgOf(G_)-6.3)*0.22,-0.12,0.25); }

function appearancePlan(G_){
  const st=caStars(calcCA(G_));
  const pb=perfBoost(G_);
  let tier,startShare,subChance,role;
  if(st>=3.5){ tier=3; startShare=0.99; subChance=0; role='首发核心'; }
  else if(st>=2.5){ tier=2; startShare=clamp(0.88+pb,0.7,0.98); subChance=0; role='主力首发'; }
  else if(st>=1.5){
    tier=1;
    startShare=clamp(0.28+pb,0.15,0.6);
    subChance=clamp(0.6+pb,0.45,0.9);
    role=pb>0.08?'首发竞争':'替补待命';
  }else{ tier=0; startShare=0.12; subChance=0; role='边缘球员'; }
  /* 预期上场时间 = 首发概率 × 首发平均分钟 + (1−首发概率) × 替补登场率 × 替补平均分钟
     · 替补登场时间 U(56,80) → 平均第 68 分钟上场，实际踢 22 分钟；
     · 首发在 tier<3 时有被换下风险（半场体能/连续低分），按平均 85 分钟计；tier3 踢满 90。 */
  const starterMin=tier===3?90:85;
  const benchMin=22;
  let expect=startShare*starterMin+(1-startShare)*subChance*benchMin;
  expect=Math.round(expect/5)*5;
  return {st,tier,startShare,subChance,role,expectMinutes:clamp(expect,0,90)};
}

/* ---------- 新游戏（FM 式 0~200 CA 体系） ----------
   CA = Σ(attr/20 × 位置权重) × 200（全 20 属性 → 200）
   · 联赛均值：中乙 100 / 中甲 130 / 中超 150（sd 25）
   · 出身初始 CA 区随机（按 FM 星级分位）：
     家乡 中乙 2.5★(40%分位) → 88~100
     青训 中甲 1.5★(20%分位) → 104~116
     天才 中甲 1.0★(10%分位) → 96~108（偏科分布）
   · 属性 = CA 预算按权重分配：attr[k] = 20×CA份额/权重，允许短板 2~9
   · 特点领域属性保底 10~13（特点可辨，身份描述的一部分） */
const ORIGIN_CA={
  youth:   {ca:[104,116], tier:2},   /* 中甲 1.5★ */
  genius:  {ca:[96,108],  tier:2},   /* 中甲 1.0★（偏科分布） */
  hometown:{ca:[88,100],  tier:3}    /* 中乙 2.5★ */
};

/* 小幅随机扰动：±30% */
function budgetJitter(){
  return (rnd()*2-1)*0.3;
}

/* ---------- 属性领域（技术/精神/身体）与出身 CA 配比 ----------
   用户设定：目标 CA 按 三大领域 拆分（专项 = 玩家选的特点领域）：
   · 青训：专项 4，其余两项各 3（合计 10）
   · 天才：专项 6，其余两项合计 4（随机分配）—— 长板极长
   · 家乡：专项 3~5，其余两项合计 5~7（随机分配）—— 随机性大
   领域内属性再按位置 CA 权重分配具体数值。
   属性值域按出身联赛控制（用户指定）：
   · 中乙出身：1~10（低级别联赛不会有高属性）
   · 中甲出身：6~15（天才长板最多 15，天赋而非成品） */
const ORIGIN_RATIO={
  youth:   {special:4,  others:[3,3]},
  genius:  {special:6,  othersRandom:4},            /* 其余两项合计 4 随机分 */
  hometown:{special:[3,5], othersRandom:[5,7]}      /* 专项 3~5，其余合计 5~7 */
};
/* 出身 → 属性值域 */
function originAttrRange(origin){
  return origin==='hometown'?{min:1,max:10}:{min:6,max:15};
}
/* 属性 → 领域映射（与 TRAIT_OPTIONS 的 groups 同源） */
const ATTR_DOMAIN={
  technique:'tech',passing:'tech',finishing:'tech',heading:'tech',attack:'tech',
  reflexes:'tech',handling:'tech',
  composure:'mind',vision:'mind',decisions:'mind',offball:'mind',positioning:'mind',
  pace:'body',stamina:'body',physical:'body',aerial:'body',jumping:'body'
};

function genAttrByCA(skel){
  const position=skel.position;
  const keys=ATTRS_BY_POS[position];
  const w=ATTR_WEIGHTS[position];
  const origin=skel.origin;
  const trait=TRAIT_OPTIONS.find(t=>t.id===skel.trait)||null;
  const cfg=ORIGIN_CA[origin]||ORIGIN_CA.youth;
  const ratio=ORIGIN_RATIO[origin]||ORIGIN_RATIO.youth;
  const targetCA=ri(cfg.ca[0],cfg.ca[1]);
  const attr={};
  /* 属性值域按出身联赛控制（用户指定：中乙 1~10，中甲 6~15） */
  const rng=originAttrRange(origin);
  const VMIN=rng.min, VMAX=rng.max;
  /* 专项领域 = 玩家选的特点；无特点则按权重最高属性所在领域 */
  const specialDomain=trait?domainOfTrait(trait.id)
    :(ATTR_DOMAIN[sortedByW(position)[0]]||'tech');
  function sortedByW(pos){ return ATTRS_BY_POS[pos].slice().sort((a,b)=>(ATTR_WEIGHTS[pos][b]||0)-(ATTR_WEIGHTS[pos][a]||0)); }

  /* 1. 领域 CA 份额（合计 = targetCA），考虑领域承载上限：
     属性上限 VMAX → 领域最大承载 = dW×VMAX×10（CA 点）。
     超出部分回流给可承载的领域 */
  const share={tech:0,mind:0,body:0};
  const capOf=d=>{
    const dW=keys.filter(k=>(ATTR_DOMAIN[k]||'tech')===d)
      .reduce((s,k)=>s+(w[k]||0.05),0);
    return dW*VMAX*10;
  };
  if(origin==='genius'){
    share[specialDomain]=targetCA*ratio.special/10;
    const others=['tech','mind','body'].filter(d=>d!==specialDomain);
    const a=ri(0,4);
    share[others[0]]=targetCA*a/10;
    share[others[1]]=targetCA*(4-a)/10;
  }else if(origin==='hometown'){
    const sp=ri(ratio.special[0],ratio.special[1]);
    const restTotal=10-sp;
    share[specialDomain]=targetCA*sp/10;
    const others=['tech','mind','body'].filter(d=>d!==specialDomain);
    const a=ri(0,restTotal);
    share[others[0]]=targetCA*a/10;
    share[others[1]]=targetCA*(restTotal-a)/10;
  }else{
    share[specialDomain]=targetCA*ratio.special/10;
    const others=['tech','mind','body'].filter(d=>d!==specialDomain);
    share[others[0]]=targetCA*ratio.others[0]/10;
    share[others[1]]=targetCA*ratio.others[1]/10;
  }
  /* 承载上限溢出回流 */
  ['tech','mind','body'].forEach(d=>{
    const cap=capOf(d);
    if(share[d]>cap){
      const overflow=share[d]-cap;
      share[d]=cap;
      const receivers=['tech','mind','body'].filter(x=>x!==d&&share[x]<capOf(x));
      receivers.forEach(x=>{ share[x]+=overflow*(capOf(x)-share[x])/Math.max(1,receivers.reduce((s,y)=>s+capOf(y)-share[y],0)); });
    }
  });

  /* 2. 领域内属性分配
     领域 CA = Σ(v_k/20 × w_k) × 200 → 领域内等权重的属性等值：
     v_k = 领域CA × (w_k×noise/Σ(w×noise)) / (10 × w_k) */
  ['tech','mind','body'].forEach(d=>{
    const dKeys=keys.filter(k=>(ATTR_DOMAIN[k]||'tech')===d);
    if(!dKeys.length) return;
    const dW=dKeys.reduce((s,k)=>s+(w[k]||0.05),0);
    const noises={};
    let wn=0;
    dKeys.forEach(k=>{
      noises[k]=(w[k]||0.05)*(1+budgetJitter());
      wn+=noises[k];
    });
    dKeys.forEach(k=>{
      const wk=w[k]||0.05;
      const v=share[d]*(noises[k]/wn)/(10*wk);
      attr[k]=clamp(Math.round(v),VMIN,VMAX);
    });
  });
  /* 3. 校准到目标 CA（±1 微调，尊重出身值域） */
  const caOf=()=>keys.reduce((s,k)=>s+((attr[k]||0)/20)*(w[k]||0)*200,0);
  let diff=targetCA-caOf();
  for(let guard=0; guard<8 && Math.abs(diff)>1; guard++){
    const sorted=keys.slice().sort((a,b)=>attr[b]-attr[a]);
    const step=diff>0?1:-1;
    const k=step>0
      ?sorted.slice().reverse().find(k=>attr[k]<VMAX)||sorted[0]
      :sorted.find(k=>attr[k]>VMIN)||sorted[0];
    attr[k]=clamp(attr[k]+step,VMIN,VMAX);
    diff=targetCA-caOf();
  }
  return attr;
}
/* 特点 id → 领域名 */
function domainOfTrait(tid){
  return tid==='tech'?'tech':tid==='body'?'body':'mind';
}

function newGame(name, pos, originId, traitId){
  const position=pos&&ATTRS_BY_POS[pos]?pos:pick(POSITIONS);
  const origin=ORIGIN_OPTIONS.find(o=>o.id===originId)||ORIGIN_OPTIONS[0];
  const attr={}, xp={};
  ATTRS_BY_POS[position].forEach(k=>{ xp[k]=0; });

  /* 按出身目标 CA 与位置权重生成属性 */
  const genAttr=genAttrByCA({position,origin:origin.id,trait:traitId||null});
  ATTRS_BY_POS[position].forEach(k=>{ attr[k]=genAttr[k]; });

  G={
    seed:Date.now(),
    name: name||pick(FIRST_NAMES)+pick(GIVEN_NAMES),
    position,
    duty:origin.name,               /* duty 字段改存出身名（兼容存档展示） */
    origin:origin.id,
    trait:traitId||null,
    age:16,
    season:1,
    attr, xp,
    attrVersion:3,
    potential:0,
    rep:origin.id==='hometown'?1:2,
    form:0.5,
    perfAvg:0,
    fitness:100,
    seasonMeanMul:1,
    clubIdx: ri(0,7), clubTier:origin.tier,
    contractYears:2,
    salary:25,
    marketValue:60,
    seasonStats:{apps:0,goals:0,assists:0,ratings:[],motm:0},
    careerStats:{apps:0,goals:0,assists:0,cleanSheets:0,motm:0,ratings:[],seasons:0},
    trophies:[],
    achievements:{},
    eventsLog:[],
    history:[],
    retired:false,
    offers:[],
    matchLog:[],
    month:1,
    trainDays:3,
    saveSlot:null,
    roundTrained:-1
  };
  /* 潜力（PA，FM 式）：以当前 CA 为基础向上浮动（0~200 空间）。
     天才高潜上限 165~190，青训 155~180，家乡务实 145~170 */
  const ca=calcCA(G);
  const paCap=origin.id==='genius'?ri(165,190):origin.id==='youth'?ri(155,180):ri(145,170);
  G.potential=clamp(Math.max(paCap,ca+ri(15,35)),ca+10,200);
  return G;
}


/* 综合能力（FM 标准 0~200）：
   CA = Σ(attr/20 × 位置权重) × 200；全 20 属性且权重覆盖满 → 200 */
function calcCA(G_){
  const w=ATTR_WEIGHTS[G_.position], a=G_.attr;
  let s=0; for(const k in w) s+=(a[k]||0)/20*w[k];
  return Math.round(s*200);
}
/* 有效能力（乘以当前体能系数，比赛中实际发挥的水平，0~200） */
function calcEffCA(fit){
  const a=G.attr, w=ATTR_WEIGHTS[G.position];
  const ff=fitnessFactor(typeof fit==='number'?fit:G.fitness);
  let s=0; for(const k in w) s+=(a[k]||0)/20*ff*w[k];
  return Math.round(s*200);
}
/* 潜力（PA）：0~200 制。成长上限 = PA 换算回各属性上限：
   capAttr = 20 × PA/200 × (1/权重) 太复杂 —— 简化为全属性统一上限：
   cap = 20 × PA/200，即 PA 160 的球员属性最高 16 */
function paAttrCap(){
  return clamp(Math.round(20*((G.potential||200)/200)),6,20);
}
function potMul(k){
  const cap=paAttrCap(), lv=G.attr[k];
  if(lv>=cap) return 0.08;
  if(lv>=cap-1) return 0.25;
  if(lv>=cap-3) return 0.55;
  return 1;
}
function gainXP(k, amount){
  if(!G || amount<=0) return [];
  if(!G.xp) G.xp={};
  if(typeof G.xp[k]!=='number') G.xp[k]=0;
  const cap=paAttrCap();
  if(G.attr[k]>=cap){ G.xp[k]=0; return []; }
  G.xp[k]+=amount;
  const ups=[];
  while(G.attr[k]<cap && G.xp[k]>=xpNeed(k,G.attr[k])){
    G.xp[k]-=xpNeed(k,G.attr[k]);
    G.attr[k]++;
    ups.push({k,level:G.attr[k]});
  }
  if(G.attr[k]>=cap) G.xp[k]=0;
  return ups;
}

/* 训练 d 天的总成长倍率（第 1 天基准，之后边际递减） */
function dayXpMul(days){
  let s=0;
  for(let i=0;i<days&&i<DAY_XP_DECAY.length;i++) s+=DAY_XP_DECAY[i];
  return s;
}

/* 自动选择当前最薄弱、且与位置职能相关的训练模块 */
function autoTrainCategory(){
  if(!G) return TRAIN_CATS['中场'][0].id;
  const cats=TRAIN_CATS[G.position]||TRAIN_CATS['中场'];
  const keys=ATTRS_BY_POS[G.position]||[];
  let best=cats[0].id, low=Infinity;
  cats.forEach(c=>{
    const focus=TRAIN_FOCUS[c.id]||[];
    const ks=keys.filter(k=>focus.indexOf(k)>=0);
    if(!ks.length) return;
    let s=0; ks.forEach(k=>{ s+=(G.attr[k]||0); });
    const avg=s/ks.length;
    if(avg<low-0.0001){ low=avg; best=c.id; }
  });
  return best;
}

/* 比赛开场前的体能结算：本周未训练 → 按 6 个休息日全额恢复 */
function prepareMatchFitness(){
  if(!G) return;
  if(G.roundTrained!==viewRound){
    G.fitness=clamp(G.fitness+FIT_RECOVER_REST_DAY*WEEK_DAYS,0,100);
  }
}

/* ---------- 天数制训练（0~6 天） ----------
   FM 式 CA 权重成长：训练经验按位置 CA 权重分配——
   核心属性（高权重）涨得快，次要属性涨得慢；
   TRAIN_FOCUS 命中的专项属性再乘 FOCUS_BOOST。
   体能结算 = 上场剩余体能 + 训练日低系数恢复 + 休息日高系数恢复。 */
function doTraining(catId, days){
  if(!G) return {msg:'游戏尚未开始。',ok:false};
  if(G.retired) return {msg:'你已经退役了。',ok:false};
  if(viewRound>=fixtures.length) return {msg:'本赛季已经结束，先进行赛季结算吧。',ok:false};
  if(G.roundTrained===viewRound) return {msg:'本周已经安排过训练了，先出战比赛或结束赛季吧。',ok:false};

  days=clamp(Math.round(typeof days==='number'?days:3),0,WEEK_DAYS);
  const cats=TRAIN_CATS[G.position]||TRAIN_CATS['中场'];
  const cat=cats.find(c=>c.id===catId)||cats[0];
  const restDays=WEEK_DAYS-days;
  const trainRec=Math.round(FIT_RECOVER_TRAIN_DAY*days);
  const restRec=FIT_RECOVER_REST_DAY*restDays;
  const before=G.fitness;
  G.fitness=clamp(before+trainRec+restRec,0,100);

  const ups=[];
  let mul=0, lm=1;
  if(days>0){
    mul=dayXpMul(days);
    lm=learnMul(G);
    const focus=TRAIN_FOCUS[cat.id]||[];
    const w=ATTR_WEIGHTS[G.position];
    const keys=ATTRS_BY_POS[G.position]||[];
    const N=keys.length;
    const base=TRAIN_DAY_XP*mul*lm*ageFactor(G.age)*N;   /* 权重归一化补偿 */
    keys.forEach(k=>{
      /* CA 权重 ×N（归一化）：核心属性获得 N 倍于均值的经验 */
      let wt=(w[k]||0.05)*N;
      if(focus.indexOf(k)>=0) wt*=FOCUS_BOOST;
      gainXP(k,base*wt*potMul(k)).forEach(u=>ups.push(u));
    });
    G.form=clamp(G.form+FORM_TRAIN_DAY*days,0,1);
  }
  G.trainDays=days;
  G.roundTrained=viewRound;

  let msg=`${cat.name} · 训练 ${days} 天 / 休息 ${restDays} 天`;
  if(days>0){
    msg+=`：体能 ${Math.round(before)} → ${Math.round(G.fitness)}（训练日恢复 +${trainRec}，休息日恢复 +${restRec}），成长 ×${fmt1(mul)}，学习 ×${fmt1(lm)}，状态 +${Math.round(FORM_TRAIN_DAY*days*100)}%。`;
  }else{
    msg+=`：休整一周，体能 ${Math.round(before)} → ${Math.round(G.fitness)}（+${restRec}）。`;
  }
  if(ups.length) msg+=ups.map(u=>` ${ATTR_LABEL[u.k]}升至 ${u.level} 级！`).join('');
  else if(days>0) msg+=' 属性稳步积累。';
  if(G.fitness<30) msg+=`\n体能偏低（${Math.round(G.fitness)}），比赛发挥会受影响。`;
  return {msg,ok:true,ups,days};
}

/* ---------- 赛程 ---------- */
function tierName(t){ return CLUB_TIERS.find(c=>c.tier===t).name; }
function clubName(tier,idx){ return CLUB_TIERS.find(c=>c.tier===tier).clubs[idx]; }

function genFixture(G_){
  const clubs=CLUB_TIERS.find(c=>c.tier===G_.clubTier).clubs;
  const opps=clubs.filter((_,i)=>i!==G_.clubIdx);
  const rounds=[];
  for(let r=0;r<34;r++) rounds.push({ opp: opps[r%opps.length], home: r%2===0 });
  return rounds;
}

/* ---------- 单场仿真 ---------- */

/* 满场 90 分钟的体能消耗（位置与耐力属性都会影响） */
function matchFullCost(){
  const posF={门将:.75,后卫:1.0,中场:1.1,前锋:1.05}[G.position]||1;
  return clamp(Math.round(44*posF-G.attr.stamina*0.9),10,54);
}


function pickWeighted(weights){
  let r=rnd(), acc=0;
  for(const k in weights){ acc+=weights[k]; if(r<acc) return k; }
  return Object.keys(weights)[0];
}
function eventAbility(need, fit){
  let sum=0, total=0;
  for(const k in need){ sum+=(G.attr[k]||0)*fitnessFactor(fit)*need[k]; total+=need[k]; }
  return total?sum/total:1;
}
/* 事件成功率 = 球员水平（关键属性）相对当前联赛平均水平 + 体能/状态修正。
   斜率 0.13：属性优势显著转化为把握机会能力（18 终结 vs 联赛 10 → 成功率大幅领先） */
function eventSuccessProb(need, fit){
  let ab=0, lm=0, tw=0;
  for(const k in need){
    ab+=(G.attr[k]||0)*fitnessFactor(fit)*need[k];
    lm+=leagueMean(k)*need[k];
    tw+=need[k];
  }
  ab=tw?ab/tw:0;
  lm=tw?lm/tw:10;
  const formF=0.82+(G.form||0.5)*0.36;
  return clamp((0.5+(ab-lm)*0.13)*formF,0.07,0.95);
}
/* 射门/扑救转化率：机会转化为进球/得分的概率受相关核心属性加成。
   顶级终结者（18 终结 + 16 冷静）转化率可达 0.34，联赛平均约 0.17 */
function conversionProb(keys_){
  let v=0, n=0;
  keys_.forEach(k=>{ v+=(G.attr[k]||0); n++; });
  const mean=n?v/n:10;
  return clamp(0.12+(mean-10)*0.022,0.08,0.36);
}

function simMatch(G_, opp, isHome){
  const fitBefore=G_.fitness;
  const ff=fitnessFactor(fitBefore);
  const keys=ATTRS_BY_POS[G_.position]||ATTRS_BY_POS['中场'];
  const eff={};
  keys.forEach(k=>{ eff[k]=(G_.attr[k]||0)*ff; });

  const rawCA=calcCA(G_);
  const w=ATTR_WEIGHTS[G_.position];
  let effCA=0; for(const k in w) effCA+=(eff[k]||0)*w[k];
  effCA=Math.round(effCA*10)/10;

  const formF=0.82+(G_.form||0.5)*0.36;     // 状态决定发挥水平 0.82 ~ 1.18
  const homeF=isHome?1.18:0.94;
  const oppBase=0.65+(4-G_.clubTier)*0.3;
  const lmCA=leagueCAMean();
  const relCA=effCA-lmCA;

  /* 防守综合能力按位置取其可用属性，并与联赛平均比较 */
  const defNeed=POS_DEF_NEED[G_.position]||POS_DEF_NEED['中场'];
  let defEff=0, defLm=0, defW=0;
  for(const k in defNeed){
    defEff+=(eff[k]||0)*defNeed[k];
    defLm+=leagueMean(k)*defNeed[k];
    defW+=defNeed[k];
  }
  defEff=defW?defEff/defW:8;
  defLm=defW?defLm/defW:10;
  const defFactor=clamp(1.15-(defEff-defLm)*0.035,0.55,1.5);

  const myXG=clamp((1.05+relCA*0.13)*formF*homeF,0.15,4.5);
  const oppXG=oppBase*defFactor*(0.8+rnd()*0.55)*(isHome?0.88:1.08);

  /* 出场逻辑：星级档位 + 近期表现（appearancePlan）决定首发率与替补登场率 */
  const plan=appearancePlan(G_);
  let appsShare=plan.startShare;
  if(fitBefore<30) appsShare*=0.8;
  const starter=rnd()<appsShare;

  let benchOn=false, onMinute=0;
  if(!starter && plan.tier>=1){
    const subChance=plan.subChance*(fitBefore>=45?1:0.65);
    if(rnd()<subChance){ benchOn=true; onMinute=ri(56,80); }
  }

  /* 完全未登场：评分固定 6.0，不参与场均评分 */
  if(!starter && !benchOn){
    const tg=poisson(clamp(myXG,0.1,5));
    const og=poisson(clamp(oppXG,0.1,5));
    return {
      played:false,starter:false,benchOn:false,onMinute:0,
      goals:0,assists:0,keyPasses:0,saves:0,tackles:0,rating:6.0,motm:false,startRating:6.0,
      score:[tg,og],win:tg>og,draw:tg===og,opp,isHome,
      rawCA,effCA,fitBefore,fitAfter:fitBefore,fitCost:0,minutes:0,subbed:false,
      beats:[]
    };
  }

  const startMin=benchOn?onMinute:0;
  const sampleMinutes=(n,a,b)=>{
    const s=new Set(); while(s.size<n) s.add(ri(a,b));
    return Array.from(s).sort((x,y)=>x-y);
  };

  /* 关键点时间：身体决定机会数量（速度/耐力/力量 → 跑出/抢到关键点的频率），
     首发每半场基准 5 次，身体系数 ±2；替补按出场时间比例减少 */
  const phyKeys={前锋:['pace','stamina','physical'],中场:['pace','stamina','physical'],
                 后卫:['pace','stamina','physical'],门将:['stamina','physical']}[G_.position]||['stamina'];
  let phy=0, phyW=0;
  phyKeys.forEach(k=>{ phy+=(eff[k]||0); phyW++; });
  phy=phyW?phy/phyW:10;
  const phyMul=clamp(1+(phy-10)*0.02,0.7,1.3);   /* 联赛平均 10 → ×1.0 */
  let keyTimes;
  if(benchOn){
    const count=clamp(Math.round((90-startMin)/9),2,7);
    const set=new Set(); while(set.size<count) set.add(ri(startMin+2,89));
    keyTimes=Array.from(set).sort((a,b)=>a-b);
  }else{
    const perHalf=clamp(Math.round(5*phyMul),3,7);
    keyTimes=[...sampleMinutes(perHalf,4,44),...sampleMinutes(perHalf,47,89)].sort((a,b)=>a-b);
  }

  /* 背景进球（队友 / 对手），替补只从登场后开始 */
  const bgFrom=benchOn?startMin+1:2;
  const teamBg=poisson(clamp(myXG*0.32,0.05,2.5));
  const oppBg=poisson(clamp(oppXG*0.55,0.08,3));
  const timeline=[];
  keyTimes.forEach(m=>timeline.push({minute:m,kind:'key'}));
  for(let i=0;i<teamBg;i++) timeline.push({minute:ri(bgFrom,90),kind:'bg',side:0});
  for(let i=0;i<oppBg;i++) timeline.push({minute:ri(bgFrom,90),kind:'bg',side:1});
  timeline.sort((a,b)=>a.minute-b.minute || (a.kind==='key'?-1:1));

  const score=[0,0];
  const beats=[];
  let goals=0,assists=0,keyPasses=0,saves=0,tackles=0;
  let minutes=0,subbed=false,subMinute=0;
  const startRating=starter?(G.position==='门将'?6.7:6.5):6.4;
  let rating=startRating;
  const keyRatings=[];
  let fit=fitBefore;
  let minuteNow=startMin;
  let halftimeDone=false;
  let lastScene=-10;
  const perMinute=matchFullCost()/90;
  const scoreTxt=()=>`${score[0]}-${score[1]}`;
  const lowTwo=()=>keyRatings.length>=3 && keyRatings.slice(-3).every(r=>r<6);

  const drainTo=m=>{
    if(subbed || !(starter||benchOn)) return;
    if(m>minuteNow){ fit=clamp(fit-perMinute*(m-minuteNow),0,100); minuteNow=m; }
  };
  const doSub=(min,why)=>{
    subbed=true; subMinute=min; minutes=min;
    beats.push({type:'sub',minute:min,
      text:why==='体能不足'||why==='体能透支'
        ?`第 ${min} 分钟，教练做出换人调整：你被换下（体能不足）。`
        :`第 ${min} 分钟，教练做出换人调整：你由于表现不佳，被提前换下。`,why});
  };

  beats.push({
    type:'kickoff',minute:0,
    text: starter?'比赛开始，你首发出场。':'比赛开始，你在替补席上等待机会。'
  });
  if(benchOn){
    beats.push({type:'benchOn',minute:onMinute,text:`第 ${onMinute} 分钟，教练示意你替补登场。`});
  }

  for(const item of timeline){
    if(subbed && item.kind==='key') continue;

    /* 半场节点（仅首发） */
    if(!benchOn && !halftimeDone && item.minute>45){
      drainTo(45);
      halftimeDone=true;
      beats.push({type:'halftime',minute:45,score:[score[0],score[1]],rating,fit,
        text:`半场结束，比分 ${scoreTxt()}，你的实时评分 ${rating.toFixed(1)}。`});
      if(plan.tier<3 && (fit<40 || lowTwo())){
        doSub(45, fit<40?'体能透支':'表现不佳');
        if(item.kind==='key') continue;
      }
    }

    if(item.kind==='key'){
      if(subbed) continue;
      if(item.minute-lastScene>=5){
        /* 场景描述时间必须严格介于上一个已播放节拍与当前关键点之间，
           否则会出现时间回跳（如背景进球 83' 后场景倒回 78'）；放不下则跳过 */
        const prevMin=beats.length?(beats[beats.length-1].minute||0):0;
        const sm=clamp(item.minute-ri(1,4),startMin+1,item.minute-1);
        if(sm>prevMin){
          beats.push({type:'scene',minute:sm,text:pick(FILLER_TEXTS)});
          lastScene=item.minute;
        }
      }
      drainTo(item.minute);

      /* 事件类型抽取：精神好的球员更"嗅到"高光事件（进球/助攻/关键防守等重大节点）。
         精神均值（视野/决断/冷静/跑位/站位）相对联赛 → 高光事件权重放大 */
      const mindKeys=['vision','decisions','composure','offball','positioning']
        .filter(k=>(ATTRS_BY_POS[G.position]||[]).indexOf(k)>=0);
      let mind=0; mindKeys.forEach(k=>{ mind+=(G.attr[k]||0); });
      mind=mindKeys.length?mind/mindKeys.length:10;
      const mindMul=clamp(1+(mind-10)*0.018,0.82,1.18);   /* 联赛平均 10 → ×1.0 */
      const baseW=POS_EVENT_WEIGHTS[G.position];
      const HIGH_LIGHT={attack:1,asskey:0,keypass:1,defend:1,save:1};   /* 高光事件标记 */
      const adjW={};
      for(const t in baseW){
        /* attack/keypass/defend/save 属于高光事件，精神好权重放大 */
        adjW[t]=baseW[t]*(t==='attack'||t==='keypass'||t==='defend'||t==='save'?mindMul:1);
      }
      const type=pickWeighted(adjW);
      const posEvents=MATCH_EVENTS[G.position]||{};
      let pool=posEvents[type];
      if(!pool||!pool.length){
        const alts=Object.values(posEvents).filter(p=>p&&p.length);
        pool=alts.length?alts[0]:[{txt:'比赛继续进行。',need:{}}];
      }
      const ev=pick(pool);
      const p=eventSuccessProb(ev.need,fit);
      const good=rnd()<p;
      let delta=0, outcome='', highlight='';
      const RR=RATING_RULES[G.position]||RATING_RULES['中场'];
      /* setpiece 沿用 attack 的评分规则；其余按事件类型取规则 */
      const rules=(type==='setpiece')?RR.attack:(RR[type]||RR.attack||{good:.1,bad:-.1});
      const scoredBefore=score[0], concededBefore=score[1];
      /* 关键防守标记：防守成功时部分事件算"关键防守"（计入 tackles 统计） */
      const isKeyDef=good && (type==='defend'||type==='save') && rnd()<0.6;

      if(type==='offball'){
        /* 跑位：成功=跑出空当/吸引防守（涨分）；失败=隐身/失位（缓降） */
        delta=good?rules.good:rules.bad;
        highlight=good?'good':'bad';
        outcome=good
          ?pick(['你为球队拉开了进攻空间。','防守球员被你带走，队友获得机会。','你的跑位得到了队友的回应。'])
          :pick(['盯防球员始终跟着你，你没拿到球。','你跑进了越位位置，队友没有传。','整条防线把你限制得很好。']);
      }else if(type==='keypass'){
        /* 威胁球：成功=助攻或创造机会（大奖）；失败=被拦截但不罚（rules.bad=0） */
        if(good){
          if(rnd()<conversionProb(['passing','vision'])){
            assists++; score[0]++; delta=rules.assist; highlight='assist';
            outcome=`队友心领神会，推射破门！比分 ${scoreTxt()}！`;
          }else{
            keyPasses++; delta=rules.created; highlight='good';
            outcome=ev.hidden
              ?'你的跑位没有得到回应，进攻陷入停滞。'
              :pick(['队友接球起脚，形成威胁射门！','这脚传球直接打穿了防线！','队友获得绝佳射门机会，可惜稍偏。']);
          }
        }else{
          delta=rules.bad!=null?rules.bad:0; highlight=delta<0?'bad':'good';
          outcome=delta<0
            ?pick(['传球被对方后卫识破拦截。','出球时机稍慢，机会窗口关闭了。'])
            :pick(['威胁球被断，但你的意图没错。','队友没能理解你的传球意图。']);
        }
      }else if(type==='dribble'){
        /* 过人：成功=推进/创造空间；失败=被断（惩罚） */
        if(good){
          delta=rules.good; highlight='good';
          outcome=pick(['你过掉了防守球员，进攻继续推进！','你的盘带吸引了防守，为队友拉出空当。']);
        }else{
          delta=rules.bad; highlight='bad';
          outcome=pick(['尝试过人被断，球权易主。','你的突破被对方识破，被迫回传。']);
        }
      }else if(type==='attack'||type==='setpiece'){
        /* 结果文案按射门方式（kind）匹配，避免"点球被后卫解围"这类矛盾：
           penalty=点球必出结果（进/被扑/罚丢）；fk=任意球直接攻门；
           header=头球攻门；open=运动战射门（默认）。setpiece 评分规则沿用 attack。 */
        const shotKind=ev.kind||'open';
        const sRules=rules.attack||rules;   /* setpiece 池借用 attack 的评分规则 */
        const genericMiss=['皮球擦着立柱偏出。','射门稍稍高出横梁。','角度太正，被门将稳稳抱住。'];
        const genericBad=['起脚机会太差，射门被挡出底线。','仓促起脚，皮球打在边网上。','射门之前被干扰，机会错过了。'];
        if(shotKind==='penalty'){
          if(good){
            if(rnd()<conversionProb(['composure','finishing','technique'])+0.35){
              goals++; score[0]++; delta=sRules.goal; highlight='goal';
              outcome=`你冷静地将点球罚进！比分 ${scoreTxt()}！`;
            }else{
              const big=rnd()<(RR.missBigChance||0);
              delta=big?(sRules.missBig!=null?sRules.missBig:sRules.created):(sRules.created!=null?sRules.created:sRules.good);
              highlight=delta<0?'bad':'good';
              outcome=big
                ?pick(['你把点球射中了门柱弹出……','点球被门将判断对了方向，飞身扑出！'])
                :'点球被门将奋力扑出，但队友补射形成威胁。';
            }
          }else{
            delta=sRules.bad; highlight='bad';
            outcome=pick(['你把点球踢飞了……','点球射得太正，被门将直接没收。','门将判断对了方向，将点球扑出。']);
          }
        }else if(shotKind==='fk'){
          if(good){
            if(rnd()<conversionProb(['technique','composure'])+0.10){
              goals++; score[0]++; delta=sRules.goal; highlight='goal';
              outcome=`任意球绕过人墙直挂死角！比分 ${scoreTxt()}！`;
            }else{
              const big=rnd()<(RR.missBigChance||0);
              delta=big?(sRules.missBig!=null?sRules.missBig:sRules.created):(sRules.created!=null?sRules.created:sRules.good);
              highlight=delta<0?'bad':'good';
              outcome=big
                ?'任意球擦着门柱飞出，差之毫厘……'
                :pick(['任意球绕过人墙，被门将飞身托出横梁。','人墙挡出了你的任意球。','门将侧身将任意球扑出底线。']);
            }
          }else{
            delta=sRules.bad; highlight='bad';
            outcome=pick(['任意球被人墙挡出。','你的任意球高出横梁不少。','任意球打偏了，球门球。']);
          }
        }else if(shotKind==='header'){
          if(good){
            if(rnd()<conversionProb(['heading','physical','composure'])+0.04){
              goals++; score[0]++; delta=sRules.goal; highlight='goal';
              outcome=`你的头球势大力沉，直窜网窝！比分 ${scoreTxt()}！`;
            }else{
              const big=rnd()<(RR.missBigChance||0);
              delta=big?(sRules.missBig!=null?sRules.missBig:sRules.created):(sRules.created!=null?sRules.created:sRules.good);
              highlight=delta<0?'bad':'good';
              outcome=big
                ?pick(['近距离头球居然顶偏了……','面对空门头球攻门被门将摘下……'])
                :pick(['头球被门将单掌托出！','你的头球稍稍高出横梁。','后卫在门线前头球解围！']);
            }
          }else{
            delta=sRules.bad; highlight='bad';
            outcome=pick(['争顶时被后卫抢先，头球顶偏。','头球太软，被门将轻松没收。','起跳时机不对，没顶到皮球。']);
          }
        }else{
          /* 运动战射门：转化率受终结/冷静/技术加成 */
          if(good){
            if(rnd()<conversionProb(['finishing','composure','technique'])){
              goals++; score[0]++; delta=sRules.goal; highlight='goal';
              outcome=`射入死角！比分 ${scoreTxt()}！`;
            }else{
              const big=rnd()<(RR.missBigChance||0);
              delta=big?(sRules.missBig!=null?sRules.missBig:sRules.created):(sRules.created!=null?sRules.created:sRules.good);
              highlight=delta<0?'bad':'good';
              outcome=big
                ?pick(['绝佳机会！可惜射门稍稍偏出……','面对空门竟然打高了……','单刀被门将神勇扑出！'])
                :pick(['门将飞身扑出！',...genericMiss,'后卫在门线前解围！']);
            }
          }else{
            delta=sRules.bad; highlight='bad';
            outcome=pick(['被后卫封堵。',...genericBad]);
          }
        }
      }else if(type==='pass'){
        /* 简单串联：成功小幅稳定评分；失误（尤其是中场/后卫）惩罚 */
        if(good){
          if(rnd()<0.12){
            assists++; score[0]++; delta=rules.assist; highlight='assist';
            outcome=`队友心领神会，推射破门！比分 ${scoreTxt()}！`;
          }else{
            keyPasses++; delta=rules.good; highlight='good';
            outcome=pick(['传球流畅，进攻有序推进。','球权安全转移，节奏在掌控中。']);
          }
        }else{
          delta=rules.bad; highlight='bad';
          outcome=pick(['传球被断下。','队友没接到，球出了边线。','传球力量稍大，机会流失。']);
        }
      }else if(type==='defend'){
        if(good){
          if(isKeyDef) tackles++;
          delta=isKeyDef?rules.block:rules.good; highlight=isKeyDef?'block':'good';
          outcome=isKeyDef
            ?pick(['你把球干净地断下！','你抢在对手之前将球解围！','你封住了射门角度！'])
            :pick(['你干扰了对方的进攻组织。','对方被迫回传，攻势瓦解。']);
        }else{
          /* 防守被突破：对手得手概率受我方防守能力抑制 */
          if(rnd()<clamp(0.22-((defEff-defLm)*0.02),0.08,0.35)){
            score[1]++; delta=rules.concede;
            outcome=`防守被突破，对手射门得手……比分 ${scoreTxt()}。`;
          }else{
            delta=rules.bad;
            outcome=pick(['被对手抢先一步，幸好队友补防。','对手射门偏出。','你被迫犯规，送给对方任意球。']);
          }
        }
      }else{
        if(good){
          saves++; delta=rules.save; highlight='save';
          outcome=pick(['你飞身将球扑出底线！','你稳稳把球抱在怀里！','你用指尖把球托出横梁！']);
        }else{
          /* 失球概率受反应/手型加成降低 */
          const svConv=conversionProb(['reflexes','handling','positioning']);
          if(rnd()<clamp(0.30-(svConv-0.12)*0.8,0.12,0.42)){
            score[1]++; delta=rules.concede;
            outcome=`你没能阻止皮球入网……比分 ${scoreTxt()}。`;
          }else{
            delta=rules.bad;
            outcome=pick(['扑救脱手，幸好后卫及时解围。','你判断对了方向但差了一点。','球击中门柱弹出！']);
          }
        }
      }

      /* 非进球/失球事件随比分微调：落后追分或领先保住优势，幅度极小 */
      const goalEvent=(score[0]>scoredBefore)||(score[1]>concededBefore);
      if(!goalEvent){
        const diff=score[0]-score[1];
        delta+=clamp(-diff*0.01,-0.03,0.03);
      }

      rating=clamp(rating+delta,RR.min||4.5,9.9);
      keyRatings.push(rating);
      beats.push({
        type:'key',minute:item.minute,kind:type,narrative:ev.txt,outcome,
        highlight,rating,fit,score:[score[0],score[1]],
        goals,assists,keyPasses,saves,tackles
      });

      /* 星级 ≥3.5（tier3）忽略评分与体能，尽量踢满全场 */
      if(!benchOn && halftimeDone && !subbed && plan.tier<3 && (fit<40 || lowTwo())){
        doSub(item.minute, fit<40?'体能不足':'表现不佳');
      }
    }else{
      if(subbed){ score[item.side]++; continue; }   // 被换下后比赛仍在继续，比分静默更新
      drainTo(item.minute);
      score[item.side]++;
      /* 背景进球对评分的影响（幅度小）：丢球惩罚按位置差异化，球队进球小幅奖励 */
      const RRbg=RATING_RULES[G.position]||RATING_RULES['中场'];
      const defRules=RRbg.defend||RRbg.save||{concede:-0.15};
      if(item.side===1){
        rating=clamp(rating+(defRules.concede!=null?defRules.concede*0.4:-0.10),RRbg.min||4.5,9.9);
      }else{
        rating=clamp(rating+0.05,RRbg.min||4.5,9.9);
      }
      beats.push({
        type:'bg',minute:item.minute,side:item.side,
        text:item.side===0?'队友在禁区内抢点破门！':'对手抓住机会攻入一球……',
        score:[score[0],score[1]],rating
      });
    }
  }

  if(!subbed){ drainTo(90); minutes=starter?90:90-onMinute; }
  else minutes=subMinute;

  /* 结果与全场评分修正：赛果一次性奖惩（按净胜球），平局不变 */
  const win=score[0]>score[1], draw=score[0]===score[1];
  const RR2=RATING_RULES[G.position]||RATING_RULES['中场'];
  rating+=resultRatingAdj(score[0],score[1]);
  rating=clamp(Math.round(rating*10)/10,RR2.min||4.5,10);
  const motm=rating>=8.2 && rnd()<0.6;

  beats.push({
    type:'fulltime',minute:90,score:[score[0],score[1]],rating,motm,
    minutes,goals,assists,keyPasses,saves,tackles,
    subbed,subMinute,win,draw
  });

  return {
    played:true,starter,benchOn,onMinute,goals,assists,keyPasses,saves,tackles,rating,motm,startRating,
    score,win,draw,opp,isHome,
    rawCA,effCA,fitBefore,fitAfter:fit,fitCost:Math.max(0,Math.round(fitBefore-fit)),
    minutes,subbed,subMinute,beats
  };
}

/* ---------- 比赛通用成长（FM 式 CA 权重分配） ----------
   6.0 评分 / 90 分钟 = MATCH_GROWTH_BASE × 1 天训练基准；经验按位置 CA 权重分配，
   核心属性成长更快；按评分与出场时间线性缩放，并乘学习倍率 learnMul 与 ageFactor。 */
function matchGrowth(m){
  if(!m.played || !(m.minutes>0)) return [];
  const keys=ATTRS_BY_POS[G.position]||ATTRS_BY_POS['中场'];
  const w=ATTR_WEIGHTS[G.position];
  const base=MATCH_GROWTH_BASE*TRAIN_DAY_XP
    *(m.rating/(MATCH_RATING_BASE||6.0))
    *(m.minutes/90)
    *ageFactor(G.age)
    *learnMul(G)*keys.length;   /* 权重归一化补偿 */
  const ups=[];
  keys.forEach(k=>{
    const wt=(w[k]||0.05)*keys.length;
    gainXP(k,base*wt*potMul(k)).forEach(u=>ups.push(u));
  });
  return ups;
}

/* ---------- 比赛结果写入状态（赛季 + 生涯同步更新） ----------
   每场比赛结束后立即同步 careerStats，无需等到赛季结算。 */
function recordMatch(m){
  G.seasonStats.apps++;
  G.seasonStats.goals+=m.goals;
  G.seasonStats.assists+=m.assists;
  G.seasonStats.ratings.push(m.rating);
  if(m.motm) G.seasonStats.motm=(G.seasonStats.motm||0)+1;
  G.careerStats.apps++;
  G.careerStats.goals+=m.goals;
  G.careerStats.assists+=m.assists;
  if(m.motm) G.careerStats.motm++;
  G.careerStats.ratings.push(m.rating);
}

/* 状态(form)结算：训练天数 + 上场时间直接挂钩 */
function applyWeekResult(m, daysTrained){
  if(!(daysTrained>0)) G.form=clamp(G.form+FORM_NO_TRAIN,0,1);
  if(m.played){
    recordMatch(m);
    G.form=clamp(G.form+FORM_PLAY_PER_90*(m.minutes/90),0,1);
    /* 近期表现 EMA：影响替补登场稳定性与首发率；首秀直接取本场评分 */
    G.perfAvg=(G.perfAvg>0)?perfAvgOf(G)*0.55+m.rating*0.45:m.rating;
  }else{
    G.form=clamp(G.form+FORM_NO_PLAY,0,1);
    /* 尚未首秀 → 维持 0（界面显示 —） */
    if(G.perfAvg>0) G.perfAvg=perfAvgOf(G)*0.85+6.0*0.15;
  }
  G.fitness=m.fitAfter;
  G.roundTrained=-1;
  return m.played?matchGrowth(m):[];
}

/* ---------- 声望与身价 ----------
   身价单位：€万（真实场景感：中乙轮换 30~80万，中甲主力 100~300万，
   中超核心 500~1500万，顶级球星 3000万+） */
function updateValue(G_){
  const ca=calcCA(G_);
  const ageF = G_.age<=21?1.4 : G_.age<=24?1.25 : G_.age<=28?1.0 : G_.age<=31?0.6 : 0.3;
  /* 联赛曝光系数：级别越高身价溢价越高 */
  const tierF={3:0.25, 2:1.0, 1:2.8}[G_.clubTier]||1;
  const seasonGoals=G_.seasonStats.goals||0;
  /* CA 是主引擎：CA 100（中乙首发）≈ 55万；130（中甲上游）≈ 680万；150+（中超核心）≈ 3500万+ */
  let v=Math.pow(Math.max(ca-55,1)/45,2.6)*180*ageF*tierF;
  v+=seasonGoals*seasonGoals*6*tierF;
  v=clamp(Math.round(v),10,50000);
  G_.marketValue=v;
  /* 周薪（€万/年→显示为年薪万）：与身价挂钩，中乙 30~60，中超 200+ */
  G_.salary=Math.max(8,Math.round(v*0.06)+15);
}

/* ---------- 赛季推进 ---------- */
function advanceSeason(){
  const G_=G;
  const seasonSummary={
    season:G_.season, age:G_.age+1,
    club:clubName(G_.clubTier,G_.clubIdx), tier:G_.clubTier,
    apps:G_.seasonStats.apps, goals:G_.seasonStats.goals, assists:G_.seasonStats.assists,
    avgRating:G_.seasonStats.ratings.length?
      Math.round(G_.seasonStats.ratings.reduce((a,b)=>a+b,0)/G_.seasonStats.ratings.length*10)/10 : 0
  };
  G_.history.push(seasonSummary);
  /* 生涯数据已在每场比赛后同步（recordMatch），此处不再重复累加 */
  G_.careerStats.seasons=G_.history.length;

  const ca=calcCA(G_);
  const tierP=[0.06,0.16,0.38];
  const championChance=tierP[3-G_.clubTier]*(ca/20)*(0.7+G_.form*0.6);
  let standing;
  if(rnd()<championChance){ standing=1; }
  else if(rnd()<0.25) standing=ri(2,4);
  else standing=ri(5,18);
  seasonSummary.standing=standing;
  if(standing===1){
    const trophy={year:2026+G_.season-1, name:tierName(G_.clubTier)+'冠军'};
    G_.trophies.push(trophy);
    G_.rep=clamp(G_.rep+8+ri(0,6),0,100);
  } else if(standing<=3) G_.rep=clamp(G_.rep+4,0,100);
  else G_.rep=clamp(G_.rep+1,0,100);

  /* 命运结算：租借赛季只归队；正常赛季按「球队成绩 × 个人数据」判定 */
  if(G_.onLoan){
    seasonSummary.loanReturn=true;
    seasonSummary.parentClub=clubName(G_.onLoan.tier,G_.onLoan.idx);
    G_.clubTier=G_.onLoan.tier;
    G_.clubIdx=G_.onLoan.idx;
    G_.onLoan=null;
  }else{
    /* 个人数据三分：好（场均 ≥6.4 且出场 ≥5）/ 差（场均 <5.9 或出场 <5）/ 中性 */
    const avgR=seasonSummary.avgRating;
    const playerGood=seasonSummary.apps>=5 && avgR>=6.4;
    const playerBad=seasonSummary.apps<5 || avgR<5.9;
    const fate=seasonFate({standing, playerGood, playerBad, clubTier:G_.clubTier});
    if(fate.promoted){
      G_.clubTier--; seasonSummary.promoted=true;
      G_.rep=clamp(G_.rep+5,0,100);
    }
    if(fate.relegated){
      G_.clubTier++; seasonSummary.relegated=true;
    }
    if(fate.event){ seasonSummary.fateEvent=fate.event; }
  }
  if(G_.clubIdx>7) G_.clubIdx=0;

  G_.age++; G_.season++;
  /* 新赛季联赛平均水平 ±20% 随机波动 */
  G_.seasonMeanMul=0.97+rnd()*0.06;   /* 联赛水平小幅波动 ±3%（0~200 CA 体系下 ±20% 会造成星级乱跳） */
  G_.seasonStats={apps:0,goals:0,assists:0,ratings:[],motm:0};
  G_.fitness=100; G_.form=0.5; G_.month=1; G_.roundTrained=-1;

  if(G_.age>=30){
    const decay=G_.age>=34?ri(1,2):1;
    const keys=ATTRS_BY_POS[G_.position]||ATTRS_BY_POS['中场'];
    const core=POS_CORE_ATTR[G_.position];
    const pool=keys.filter(k=>k!==core);
    const k=pick(pool);
    G_.attr[k]=clamp(G_.attr[k]-decay,1,20); G_.xp[k]=0;
    if(rnd()<0.45 && core){ G_.attr[core]=clamp(G_.attr[core]-1,1,20); G_.xp[core]=0; }
  }
  if(G_.age>=32){
    const rp = G_.age>=38?0.95 : G_.age>=36?0.7 : G_.age>=34?0.4 : 0.18;
    if(rnd()<rp){ retire(G_); return {retired:true, summary:seasonSummary}; }
  }
  G_.contractYears--;
  /* 报价生成优先级：赛季命运事件 > 合同到期续约报价 */
  if(seasonSummary.fateEvent==='upgrade') genUpgradeOffer(G_);
  else if(seasonSummary.fateEvent==='sell') genSellOffers(G_);
  else if(G_.contractYears<=0) genOffers(G_);
  return {retired:false, summary:seasonSummary};
}

function retire(G_){
  G_.retired=true;
  G_.careerStats.seasons=G_.history.length;
  const ca=calcCA(G_);
  let score=0;
  score+=G_.trophies.length*12;
  score+=Math.min(G_.careerStats.goals,200)*0.5;
  score+=G_.careerStats.apps*0.4;
  score+=ca*3.5;
  score+=G_.rep*0.8;
  let grade;
  if(score>=260) grade='S 传奇巨星';
  else if(score>=190) grade='A 金球候选';
  else if(score>=130) grade='B 知名球星';
  else if(score>=80) grade='C 主力球员';
  else grade='D 平凡生涯';
  G_.legacy={score:Math.round(score),grade};
}

/* ---------- 赛季命运（升降级 + 球队事件） ----------
   规则（纯函数，便于测试）：
   · 球队成绩好（前 3）+ 你数据差 → 球队出售你 / 租借你（事件，玩家自选去留）
   · 球队成绩好 + 你数据不差 → 大概率随队升级（0.8）；冲超失败但你数据好 → 上级俱乐部求购
   · 球队成绩一般（4~14）+ 你数据好（场均评分）→ 高一级球队求购事件
   · 球队成绩差（≥15）+ 你数据差 → 一起降级（17 名起几乎必降）
   · 球队成绩差 + 你数据好 → 你个人扛队，降级概率显著降低
   本作评分标尺偏严（赛季场均中位 ≈5.9~6.4）：数据好 = 场均 ≥6.4 且出场 ≥5；
   数据差 = 场均 <5.9 或出场 <5；其余为中性。 */
function seasonFate(o){
  const standing=o.standing, good=!!o.playerGood, bad=!!o.playerBad, tier=o.clubTier;
  const f={promoted:false,relegated:false,event:null};
  if(standing<=3){
    if(bad){ f.event='sell'; }
    else if(tier>1){
      if(rnd()<0.8) f.promoted=true;
      else if(good) f.event='upgrade';   /* 冲超失败，个人表现吸引上级俱乐部 */
    }
  }else if(standing>=15){
    let p;
    if(bad) p=standing>=17?0.95:0.60;
    else if(good) p=standing>=17?0.55:0.25;
    else p=standing>=17?0.80:0.45;
    if(tier<3 && rnd()<p) f.relegated=true;
  }else{
    if(good && tier>1) f.event='upgrade';
  }
  return f;
}

/* 转会报价 */
function genOffers(G_){
  G_.offers=[];
  const ca=calcCA(G_);
  const n=ri(1,3);
  for(let i=0;i<n;i++){
    let tier;
    const roll=rnd()+(ca-10)/22+Math.min(G_.marketValue,3000)/3000;
    if(roll>0.95 && G_.clubTier>=2) tier=G_.clubTier-1;
    else if(roll>0.75) tier=G_.clubTier;
    else tier=G_.clubTier+(rnd()<0.3?-1:1);
    tier=clamp(tier,1,3);
    if(tier>G_.clubTier && rnd()<0.7) tier=G_.clubTier;
    tier=clamp(tier,1,3);
    const feeScale=0.8+rnd()*0.8+(4-tier)*0.15;
    G_.offers.push({
      kind:'contract',
      club:clubName(tier,ri(0,7)), tier,
      fee:Math.max(10,Math.round(G_.marketValue*feeScale)),
      salary:Math.max(G_.salary+3,Math.round(G_.marketValue*0.012*(0.9+rnd()*0.6))+8),
      years:ri(2,4)
    });
  }
}

/* 高一级球队求购（成绩一般/冲超失败 + 数据好 → 玩家选择去/不去） */
function genUpgradeOffer(G_){
  const tier=clamp(G_.clubTier-1,1,3);
  G_.offers=[{
    kind:'upgrade',
    club:clubName(tier,ri(0,7)), tier,
    fee:Math.max(10,Math.round(G_.marketValue*(1.2+rnd()*0.8))),
    salary:Math.max(G_.salary+6,Math.round(G_.marketValue*0.014*(1+rnd()*0.6))+10),
    years:ri(2,4)
  }];
}

/* 球队出售 / 租借你（球队成绩好 + 你数据差 → 玩家选择去/不去） */
function genSellOffers(G_){
  G_.offers=[];
  const n=ri(1,2);
  for(let i=0;i<n;i++){
    const loan=rnd()<0.45;
    /* 出售多去同级或略低级别；租借多去低半档争取出场 */
    let tier=G_.clubTier+(loan?(rnd()<0.7?1:-1):(rnd()<0.5?0:1));
    tier=clamp(tier,1,3);
    if(!loan && tier===G_.clubTier && rnd()<0.5) tier=clamp(G_.clubTier+(G_.clubTier>1?-1:1),1,3);
    G_.offers.push({
      kind:loan?'loan':'sell',
      club:clubName(tier,ri(0,7)), tier,
      fee:loan?0:Math.max(5,Math.round(G_.marketValue*(0.5+rnd()*0.6))),
      salary:Math.max(5,Math.round(G_.marketValue*0.01*(0.8+rnd()*0.5))+6),
      years:loan?1:ri(2,3)
    });
  }
}

function acceptOffer(idx){
  const o=G.offers[idx]; if(!o) return;
  const oldTier=G.clubTier;
  if(o.kind==='loan'){
    /* 租借：记下母队，赛季末归队；合同与薪资随母队保留 */
    G.onLoan={tier:G.clubTier,idx:G.clubIdx};
    G.clubTier=o.tier;
    G.clubIdx=CLUB_TIERS.find(c=>c.tier===o.tier).clubs.indexOf(o.club);
    if(G.clubIdx<0) G.clubIdx=0;
    G.rep=clamp(G.rep+2,0,100);
  }else{
    /* 永久转会：若正处租借期，接受即中断租借不再归队 */
    G.onLoan=null;
    G.clubTier=o.tier;
    G.clubIdx=CLUB_TIERS.find(c=>c.tier===o.tier).clubs.indexOf(o.club);
    if(G.clubIdx<0) G.clubIdx=0;
    G.salary=o.salary; G.contractYears=o.years;
    G.rep=clamp(G.rep+(o.tier<oldTier?8:2),0,100);
  }
  G.offers=[];
}

function checkAchievements(ctx){
  const A=G.achievements, unlocked=[];
  const add=id=>{ if(!A[id]){A[id]=true; unlocked.push(ACHIEVEMENTS.find(a=>a.id===id));} };
  if(ctx.match){
    const m=ctx.match;
    if(m.played&&m.goals>0){
      add('first_goal');
      if(m.goals>=3) add('hat_trick');
      if(m.goals>=5) add('five_goal');
    }
    if(m.played&&m.rating>=8.5) add('motm_10');
    if(m.played&&m.rating>=9.0) add('rating_9');
  }
  if(ctx.season){
    /* 赛季进球成就：以「达成时快照」为准（调用方传入达成本季成就时的进球数快照），
       因为 advanceSeason 会清空 seasonStats */
    const goals=ctx.seasonGoals!=null?ctx.seasonGoals:(G.seasonStats?G.seasonStats.goals:0);
    if(goals>=20) add('season_20');
    if(goals>=30) add('season_30');
  }
  if(ctx.trophy) add('first_trophy');
  if(ctx.trophy && G.clubTier===1) add('top_tier_champ');
  if(ctx.promoted) add('promoted');
  const st=caStars(calcCA(G));
  if(st>=4) add('ca16');
  if(st>=4.5) add('ca18');
  if(G.clubTier===1) add('big_club');
  if(G.careerStats.apps>=100) add('career_100');
  if(G.careerStats.goals>=50) add('career_50');
  if(G.retired && G.legacy && G.legacy.grade.startsWith('S')) add('legend');
  return unlocked;
}

function repLabel(rep){
  if(rep>=90) return '世界巨星';
  if(rep>=75) return '欧洲知名';
  if(rep>=55) return '国内球星';
  if(rep>=35) return '小有名气';
  if(rep>=15) return '初出茅庐';
  return '无名小卒';
}

/* ============================================================
   存档：5 个栏位 + 退出自动保存 + 旧档迁移
   ============================================================ */
const SAVE_PREFIX='football_life_slot_';
const LEGACY_SAVE_KEY='football_life_save_v1';
const SAVE_SLOTS=5;

function slotKey(i){ return SAVE_PREFIX+i; }

function saveGame(slot){
  if(!G) return false;
  const s=(typeof slot==='number')?slot:G.saveSlot;
  if(s==null||s<1||s>SAVE_SLOTS) return false;
  G.saveSlot=s;
  G.savedAt=Date.now();
  try{ localStorage.setItem(slotKey(s), JSON.stringify(G)); return true; }catch(e){ return false; }
}
function loadGame(slot){
  try{
    const raw=localStorage.getItem(slotKey(slot));
    if(!raw) return false;
    G=migrateSave(JSON.parse(raw));
    G.saveSlot=slot;
    return true;
  }catch(e){ return false; }
}
function slotInfo(i){
  try{
    const raw=localStorage.getItem(slotKey(i));
    if(!raw) return {idx:i,empty:true};
    const S=JSON.parse(raw);
    const tier=(typeof S.clubTier==='number'&&S.clubTier>=1&&S.clubTier<=3)?S.clubTier:3;
    const idx=(typeof S.clubIdx==='number'&&S.clubIdx>=0&&S.clubIdx<=7)?S.clubIdx:0;
    return {
      idx:i, empty:false,
      name:S.name||'—', position:S.position||'—',
      season:S.season||1, age:S.age||16,
      club:clubName(tier,idx),
      tier, retired:!!S.retired, savedAt:S.savedAt||0
    };
  }catch(e){ return {idx:i,empty:true}; }
}
function listSlots(){
  const a=[];
  for(let i=1;i<=SAVE_SLOTS;i++) a.push(slotInfo(i));
  return a;
}
function emptySlot(){
  for(let i=1;i<=SAVE_SLOTS;i++){
    try{ if(!localStorage.getItem(slotKey(i))) return i; }catch(e){}
  }
  return null;
}
function hasSave(){
  try{
    for(let i=1;i<=SAVE_SLOTS;i++) if(localStorage.getItem(slotKey(i))) return true;
    if(localStorage.getItem(LEGACY_SAVE_KEY)) return true;
  }catch(e){}
  return false;
}
/* 旧单档 → 槽 1 */
function importLegacySave(){
  try{
    const raw=localStorage.getItem(LEGACY_SAVE_KEY);
    if(!raw) return;
    if(!localStorage.getItem(slotKey(1))) localStorage.setItem(slotKey(1),raw);
    localStorage.removeItem(LEGACY_SAVE_KEY);
  }catch(e){}
}

function migrateSave(S){
  if(!S) return S;
  if(!S.attr) S.attr={};
  if(POSITIONS.indexOf(S.position)<0) S.position='中场';
  const vals=Object.values(S.attr).map(Number).filter(v=>!isNaN(v));
  const oldScale=vals.length && Math.max.apply(null,vals)>20;
  if(oldScale){
    for(const k in S.attr) S.attr[k]=clamp(Math.round(S.attr[k]/5),1,20);
    S.potential=clamp(Math.round((S.potential||60)/5),8,20);
  }
  /* 旧版 6 属性存档 → 旧版 12 属性 */
  if(!S.attrVersion || S.attrVersion<2){
    const a=S.attr;
    if(typeof a.passing!=='number') a.passing=Math.round((a.technique||5)*0.9);
    if(typeof a.dribbling!=='number') a.dribbling=a.technique||5;
    if(typeof a.heading!=='number') a.heading=a.physical||5;
    if(typeof a.vision!=='number') a.vision=a.technique||5;
    if(typeof a.decisions!=='number') a.decisions=a.defense||5;
    if(typeof a.composure!=='number') a.composure=Math.round(((a.technique||5)+(a.attack||5))/2);
    S.attrVersion=2;
  }
  /* 旧版 12 属性 → 新版按位置属性表（attrVersion 3） */
  if(S.attrVersion<3){
    const old=S.attr;
    const val=k=>typeof old[k]==='number'?old[k]:5;
    const MAP={
      前锋:{technique:val('technique'),finishing:val('attack'),composure:val('composure'),
            offball:Math.round((val('decisions')+val('vision'))/2),passing:val('passing'),
            vision:val('vision'),heading:val('heading'),pace:val('pace'),
            stamina:val('stamina'),physical:val('physical')},
      中场:{technique:val('technique'),passing:val('passing'),vision:val('vision'),
            decisions:val('decisions'),attack:val('attack'),composure:val('composure'),
            defense:val('defense'),pace:val('pace'),stamina:val('stamina'),physical:val('physical')},
      后卫:{technique:val('technique'),passing:val('passing'),decisions:val('decisions'),
            defense:val('defense'),positioning:val('decisions'),heading:val('heading'),
            composure:val('composure'),pace:val('pace'),stamina:val('stamina'),physical:val('physical')},
      门将:{reflexes:val('defense'),handling:val('technique'),aerial:val('heading'),
            positioning:val('decisions'),decisions:val('decisions'),passing:val('passing'),
            technique:val('technique'),composure:val('composure'),stamina:val('stamina'),physical:val('physical')}
    };
    S.attr=MAP[S.position];
    S.xp={};
    S.attrVersion=3;
  }
  if(!S.xp) S.xp={};
  if(typeof S.perfAvg!=='number') S.perfAvg=0;
  const keys=ATTRS_BY_POS[S.position];
  keys.forEach(k=>{
    if(typeof S.attr[k]!=='number') S.attr[k]=5;
    S.attr[k]=clamp(Math.round(S.attr[k]),1,20);
    if(typeof S.xp[k]!=='number') S.xp[k]=0;
  });
  /* 丢弃已不属于当前位置属性表的旧键，避免脏数据 */
  for(const k in S.attr) if(keys.indexOf(k)<0) delete S.attr[k];
  for(const k in S.xp) if(keys.indexOf(k)<0) delete S.xp[k];
  if(oldScale){
    keys.forEach(k=>{ S.xp[k]=Math.round(xpNeed(k,S.attr[k])*0.35); });
  }
  if(typeof S.potential!=='number' || !S.potential || S.potential<=20)
    S.potential=clamp(Math.ceil(calcCA(S))+ri(20,40),calcCA(S)+10,200);
  if(typeof S.roundTrained!=='number') S.roundTrained=-1;
  if(!Array.isArray(S.matchLog)) S.matchLog=[];
  if(!S.seasonStats) S.seasonStats={apps:0,goals:0,assists:0,ratings:[],motm:0};
  if(!S.careerStats) S.careerStats={apps:0,goals:0,assists:0,cleanSheets:0,motm:0,ratings:[],seasons:0};
  if(!Array.isArray(S.careerStats.ratings)) S.careerStats.ratings=[];
  /* 移除旧版字段：伤病 / 士气 / 强度 */
  delete S.morale;
  delete S.injuryWeeks;
  delete S.trainInt;
  if(typeof S.trainDays!=='number') S.trainDays=3;
  S.trainDays=clamp(Math.round(S.trainDays),0,WEEK_DAYS);
  if(typeof S.seasonMeanMul!=='number') S.seasonMeanMul=1;
  if(typeof S.form!=='number') S.form=0.5;
  S.form=clamp(S.form,0,1);
  if(typeof S.clubTier!=='number'||S.clubTier<1) S.clubTier=3;
  if(S.clubTier>3) S.clubTier=3;
  if(typeof S.clubIdx!=='number'||S.clubIdx<0||S.clubIdx>7) S.clubIdx=0;
  return S;
}
