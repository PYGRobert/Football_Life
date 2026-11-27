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
   联赛评级（FM CA 逻辑：不显示原始数值，显示相对联赛的星级）
   联赛球员质量服从正态分布；50% 分位 = 3★，每 10% 分位 = 半星。
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
/* 某属性在当前联赛的平均水平（含赛季 ±20% 波动与属性画像） */
function leagueMean(k,tier){
  return leagueQuality(tier).mean*seasonMeanMul()*(ATTR_NORM[k]||1);
}
function leagueSD(tier){ return leagueQuality(tier).sd; }
function leagueCAMean(tier){ return leagueQuality(tier).mean*seasonMeanMul(); }

function attrPercentile(k,value,tier){
  return normCdf((value-leagueMean(k,tier))/leagueSD(tier));
}
function caPercentile(ca,tier){
  /* 综合能力是多属性加权，分布更集中，方差略小 */
  return normCdf((ca-leagueCAMean(tier))/(leagueSD(tier)*0.8));
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

/* ---------- 新游戏 ---------- */
function newGame(name, pos, dutyIdx){
  const position=pos&&ATTRS_BY_POS[pos]?pos:pick(POSITIONS);
  const duties=FIRST_TOUCH_BY_POS[position]||FIRST_TOUCH_BY_POS['中场'];
  const ft=duties[dutyIdx]||duties[0];
  const keys=ATTRS_BY_POS[position];
  const base=ATTR_START[position];
  const attr={}, xp={};
  keys.forEach(k=>{ attr[k]=ri(base[k][0],base[k][1]); xp[k]=0; });
  for(const k in ft.stat) if(k in attr) attr[k]=clamp(attr[k]+ft.stat[k],1,20);
  G={
    seed:Date.now(),
    name: name||pick(FIRST_NAMES)+pick(GIVEN_NAMES),
    position,
    duty:ft.t,
    age:16,
    season:1,
    attr, xp,
    attrVersion:3,
    potential:0,
    rep:ft.rep,
    form:0.5,
    perfAvg:0,
    fitness:100,
    seasonMeanMul:1,
    clubIdx: ri(0,7), clubTier:3,
    contractYears:2,
    salary:8,
    marketValue:15,
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
  return G;
}


/* 综合能力（原始属性加权，1-20） */
function calcCA(G_){
  const w=ATTR_WEIGHTS[G_.position], a=G_.attr;
  let s=0; for(const k in w) s+=(a[k]||0)*w[k];
  return Math.round(s*10)/10;
}
/* 有效能力（乘以当前体能系数，比赛中实际发挥的水平） */
function calcEffCA(fit){
  const a=G.attr, w=ATTR_WEIGHTS[G.position];
  const ff=fitnessFactor(typeof fit==='number'?fit:G.fitness);
  let s=0; for(const k in w) s+=(a[k]||0)*ff*w[k];
  return Math.round(s*10)/10;
}
function potMul(k){
  const pot=G.potential||20, lv=G.attr[k];
  if(lv>=pot) return 0.08;
  if(lv>=pot-1) return 0.25;
  if(lv>=pot-3) return 0.55;
  return 1;
}
function gainXP(k, amount){
  if(!G || amount<=0) return [];
  if(!G.xp) G.xp={};
  if(typeof G.xp[k]!=='number') G.xp[k]=0;
  const cap=Math.min(20, G.potential||20);
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
    G.fitness=clamp(G.fitness+FIT_RECOVER_PER_DAY*WEEK_DAYS,0,100);
  }
}

/* ---------- 天数制训练（0~6 天） ----------
   通用逻辑：所有属性等权获得经验；TRAIN_FOCUS 命中的重点属性权重 ×FOCUS_BOOST。
   体能结算 = 上场剩余体能 + 休息恢复 − 训练消耗。 */
function doTraining(catId, days){
  if(!G) return {msg:'游戏尚未开始。',ok:false};
  if(G.retired) return {msg:'你已经退役了。',ok:false};
  if(viewRound>=fixtures.length) return {msg:'本赛季已经结束，先进行赛季结算吧。',ok:false};
  if(G.roundTrained===viewRound) return {msg:'本周已经安排过训练了，先出战比赛或结束赛季吧。',ok:false};

  days=clamp(Math.round(typeof days==='number'?days:3),0,WEEK_DAYS);
  const cats=TRAIN_CATS[G.position]||TRAIN_CATS['中场'];
  const cat=cats.find(c=>c.id===catId)||cats[0];
  const restDays=WEEK_DAYS-days;
  const cost=Math.round(cat.cost*TRAIN_COST_PER_DAY_MUL*days);
  const recover=FIT_RECOVER_PER_DAY*restDays;
  const before=G.fitness;
  G.fitness=clamp(before+recover-cost,0,100);

  const ups=[];
  let mul=0, lm=1;
  if(days>0){
    mul=dayXpMul(days);
    lm=learnMul(G);
    const focus=TRAIN_FOCUS[cat.id]||[];
    const keys=ATTRS_BY_POS[G.position]||[];
    const base=TRAIN_DAY_XP*mul*lm*ageFactor(G.age);
    keys.forEach(k=>{
      const w=focus.indexOf(k)>=0?FOCUS_BOOST:1;
      gainXP(k,base*w*potMul(k)).forEach(u=>ups.push(u));
    });
    G.form=clamp(G.form+FORM_TRAIN_DAY*days,0,1);
  }
  G.trainDays=days;
  G.roundTrained=viewRound;

  let msg=`${cat.name} · 训练 ${days} 天 / 休息 ${restDays} 天`;
  if(days>0){
    msg+=`：体能 ${Math.round(before)} → ${Math.round(G.fitness)}（恢复 +${recover}，消耗 −${cost}），成长 ×${fmt1(mul)}，学习 ×${fmt1(lm)}，状态 +${Math.round(FORM_TRAIN_DAY*days*100)}%。`;
  }else{
    msg+=`：休整一周，体能 ${Math.round(before)} → ${Math.round(G.fitness)}（+${recover}）。`;
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
/* 事件成功率 = 球员水平（关键属性）相对当前联赛平均水平 + 体能/状态修正 */
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
  return clamp((0.5+(ab-lm)*0.09)*formF,0.07,0.95);
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

  /* 关键点时间：首发每半场 5 次；替补按出场时间比例减少 */
  let keyTimes;
  if(benchOn){
    const count=clamp(Math.round((90-startMin)/9),2,7);
    const set=new Set(); while(set.size<count) set.add(ri(startMin+2,89));
    keyTimes=Array.from(set).sort((a,b)=>a-b);
  }else{
    keyTimes=[...sampleMinutes(5,4,44),...sampleMinutes(5,47,89)].sort((a,b)=>a-b);
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
  const lowTwo=()=>keyRatings.length>=2 && keyRatings[keyRatings.length-1]<6 && keyRatings[keyRatings.length-2]<6;

  const drainTo=m=>{
    if(subbed || !(starter||benchOn)) return;
    if(m>minuteNow){ fit=clamp(fit-perMinute*(m-minuteNow),0,100); minuteNow=m; }
  };
  const doSub=(min,why)=>{
    subbed=true; subMinute=min; minutes=min;
    beats.push({type:'sub',minute:min,text:`第 ${min} 分钟，教练做出换人调整：你被换下（${why}）。`,why});
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
        doSub(45, fit<40?'体能透支':'连续关键点评分过低');
        if(item.kind==='key') continue;
      }
    }

    if(item.kind==='key'){
      if(subbed) continue;
      if(item.minute-lastScene>=5){
        const sm=Math.max(startMin+1,item.minute-ri(1,4));
        beats.push({type:'scene',minute:sm,text:pick(FILLER_TEXTS)});
        lastScene=item.minute;
      }
      drainTo(item.minute);

      const type=pickWeighted(POS_EVENT_WEIGHTS[G.position]);
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

      if(type==='attack'){
        if(good){
          if(rnd()<0.22){
            goals++; score[0]++; delta=1.05; highlight='goal';
            outcome=`射入死角！比分 ${scoreTxt()}！`;
          }else{
            delta=0.2; highlight='good';
            outcome=pick(['门将飞身扑出！','皮球擦着立柱偏出。','后卫在门线前解围！']);
          }
        }else{
          delta=-0.13; highlight='bad';
          outcome=pick(['被后卫封堵。','射门打在边网上。','起脚稍慢，被门将没收。']);
        }
      }else if(type==='pass'){
        if(good){
          if(rnd()<0.16){
            assists++; score[0]++; delta=0.7; highlight='assist';
            outcome=`队友心领神会，推射破门！比分 ${scoreTxt()}！`;
          }else{
            keyPasses++; delta=0.2; highlight='good';
            outcome=pick(['队友接球后起脚，被门将扑出。','队友做球，进攻继续。','对方后卫仓促解围。']);
          }
        }else{
          delta=-0.13; highlight='bad';
          outcome=pick(['传球被断下。','队友没接到，球出了边线。','传球力量稍大，机会流失。']);
        }
      }else if(type==='defend'){
        if(good){
          tackles++; delta=0.38; highlight='block';
          outcome=pick(['你把球干净地断下。','你抢在对手之前将球解围。','你封住了射门角度。']);
        }else{
          delta=-0.25; highlight='bad';
          if(rnd()<0.22){
            score[1]++; delta-=0.2;
            outcome=`防守被突破，对手射门得手……比分 ${scoreTxt()}。`;
          }else{
            outcome=pick(['被对手抢先一步，幸好队友补防。','对手射门偏出。','你被迫犯规，送给对方任意球。']);
          }
        }
      }else{
        if(good){
          saves++; delta=0.45; highlight='save';
          outcome=pick(['你飞身将球扑出底线！','你稳稳把球抱在怀里！','你用指尖把球托出横梁！']);
        }else{
          delta=-0.25; highlight='bad';
          if(rnd()<0.30){
            score[1]++; delta-=0.2;
            outcome=`你没能阻止皮球入网……比分 ${scoreTxt()}。`;
          }else{
            outcome=pick(['扑救脱手，幸好后卫及时解围。','你判断对了方向但差了一点。','球击中门柱弹出！']);
          }
        }
      }

      rating=clamp(rating+delta,4.2,9.9);
      keyRatings.push(rating);
      beats.push({
        type:'key',minute:item.minute,kind:type,narrative:ev.txt,outcome,
        highlight,rating,fit,score:[score[0],score[1]],
        goals,assists,keyPasses,saves,tackles
      });

      /* 星级 ≥3.5（tier3）忽略评分与体能，尽量踢满全场 */
      if(!benchOn && halftimeDone && !subbed && plan.tier<3 && (fit<40 || lowTwo())){
        doSub(item.minute, fit<40?'体能不足40':'连续关键点评分低于6.0');
      }
    }else{
      if(subbed){ score[item.side]++; continue; }   // 被换下后比赛仍在继续，比分静默更新
      drainTo(item.minute);
      score[item.side]++;
      beats.push({
        type:'bg',minute:item.minute,side:item.side,
        text:item.side===0?'队友在禁区内抢点破门！':'对手抓住机会攻入一球……',
        score:[score[0],score[1]]
      });
    }
  }

  if(!subbed){ drainTo(90); minutes=starter?90:90-onMinute; }
  else minutes=subMinute;

  /* 结果与全场评分修正 */
  const win=score[0]>score[1], draw=score[0]===score[1];
  if(win) rating+=0.2; else if(!draw) rating-=0.15;
  rating=clamp(Math.round(rating*10)/10,4.0,10);
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
    minutes,subbed,beats
  };
}

/* ---------- 比赛通用成长：全属性等权 ----------
   6.0 评分 / 90 分钟 = MATCH_GROWTH_BASE × 1 天训练基准；按评分与出场时间线性缩放，
   并与训练一样乘学习倍率 learnMul 与 ageFactor。 */
function matchGrowth(m){
  if(!m.played || !(m.minutes>0)) return [];
  const keys=ATTRS_BY_POS[G.position]||ATTRS_BY_POS['中场'];
  const base=MATCH_GROWTH_BASE*TRAIN_DAY_XP
    *(m.rating/(MATCH_RATING_BASE||6.0))
    *(m.minutes/90)
    *ageFactor(G.age)
    *learnMul(G);
  const ups=[];
  keys.forEach(k=>{ gainXP(k,base*potMul(k)).forEach(u=>ups.push(u)); });
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

/* ---------- 声望与身价 ---------- */
function updateValue(G_){
  const ca=calcCA(G_);
  const ageF = G_.age<=21?1.4 : G_.age<=24?1.25 : G_.age<=28?1.0 : G_.age<=31?0.6 : 0.3;
  const tierF=[2.6,4.2,6.5][G_.clubTier-1]||1;
  const seasonGoals=G_.seasonStats.goals||0;
  let v=(Math.pow(Math.max(ca-4,1),2.3)*0.65)*ageF*tierF;
  v+=seasonGoals*seasonGoals*0.5*tierF*0.4;
  v=clamp(Math.round(v),5,20000);
  G_.marketValue=v;
  G_.salary=Math.max(5,Math.round(v*0.012)+8);
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
  G_.seasonMeanMul=0.8+rnd()*0.4;
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
    if(G.seasonStats.goals>=20) add('season_20');
    if(G.seasonStats.goals>=30) add('season_30');
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
  if(typeof S.potential!=='number' || !S.potential)
    S.potential=clamp(Math.ceil(calcCA(S))+5,10,20);
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
