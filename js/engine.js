/* ============================================================
   足球人生 · 核心仿真引擎
   ------------------------------------------------------------
   负责：游戏状态、属性成长、训练、比赛关键点、体能、
   赛季推进、身价、转会、成就判定、存档迁移。
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

function newGame(name, pos, firstTouchIdx){
  const ft=FIRST_TOUCH_EVENTS[firstTouchIdx]||FIRST_TOUCH_EVENTS[0];
  const base=ATTR_START[pos]||ATTR_START['中场'];
  const attr={}, xp={};
  ATTRS.forEach(k=>{ attr[k]=ri(base[k][0],base[k][1]); xp[k]=0; });
  for(const k in ft.stat) if(k in attr) attr[k]=clamp(attr[k]+ft.stat[k],1,20);
  G={
    seed:Date.now(),
    name: name||pick(FIRST_NAMES)+pick(GIVEN_NAMES),
    position: pos||pick(POSITIONS),
    age:16,
    season:1,
    attr, xp,
    potential:0,
    rep:ft.rep,
    form:0.5,
    morale:60,
    fitness:100,
    injuryWeeks:0,
    clubIdx: ri(0,3), clubTier:4,
    contractYears:2,
    salary:8,
    marketValue:15,
    seasonStats:{apps:0,goals:0,assists:0,ratings:[],motm:0},
    careerStats:{apps:0,goals:0,assists:0,cleanSheets:0,motm:0,ratings:[],seasons:[]},
    trophies:[],
    achievements:{},
    eventsLog:[],
    history:[],
    retired:false,
    offers:[],
    matchLog:[],
    month:1,
    trainInt:'normal',
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

/* 自动选择当前最薄弱、且与位置相关的训练模块 */
function autoTrainCategory(){
  if(!G) return TRAIN_CATS[0].id;
  let best=TRAIN_CATS[0].id, low=Infinity;
  TRAIN_CATS.forEach(c=>{
    const w=TRAIN_POS_WEIGHTS[c.id][G.position]||{};
    let s=0,t=0;
    for(const k in w){ s+=(G.attr[k]||0)*w[k]; t+=w[k]; }
    const avg=t?s/t:0;
    if(avg<low-0.0001){ low=avg; best=c.id; }
  });
  return best;
}

/* 比赛开场前的体能恢复：不训练 → 100；普通训练 → 95；强化 → 82 */
function prepareMatchFitness(){
  if(!G) return;
  if(G.roundTrained!==viewRound){ G.fitness=100; return; }
  const target=TRAIN_READY[G.trainInt||'normal']||95;
  G.fitness=Math.max(G.fitness,target);
}

function doTraining(catId, intId){
  if(!G) return {msg:'游戏尚未开始。',ok:false};
  if(G.retired) return {msg:'你已经退役了。',ok:false};
  if(viewRound>=fixtures.length) return {msg:'本赛季已经结束，先进行赛季结算吧。',ok:false};
  if(G.roundTrained===viewRound) return {msg:'本周已经安排过训练了，先出战比赛或结束赛季吧。',ok:false};
  if(G.injuryWeeks>0) return {msg:`伤病恢复中，还需 ${G.injuryWeeks} 周，暂时无法训练。`,ok:false};

  const cat=TRAIN_CATS.find(c=>c.id===catId)||TRAIN_CATS[0];
  const it=INTENSITIES.find(i=>i.id===intId)||INTENSITIES[1];
  const cost=Math.round(cat.cost*it.costMul);
  if(G.fitness<cost) return {msg:`体能不足：本次训练需要 ${cost} 点体能（当前 ${Math.round(G.fitness)}）。可以选择轻度训练或直接出战。`,ok:false};

  G.fitness=clamp(G.fitness-cost,0,100);
  const moraleF=G.morale<35?0.7:G.morale<55?0.9:G.morale>85?1.2:1;
  const base=24*it.xpMul*ageFactor(G.age)*moraleF;
  const weights=TRAIN_POS_WEIGHTS[cat.id][G.position]||{};
  const ups=[];
  for(const k in weights){
    const amt=base*weights[k]*potMul(k);
    gainXP(k,amt).forEach(u=>ups.push(u));
  }

  let msg=`${it.name} · ${cat.name}：体能 -${cost}。`;
  if(ups.length) msg+=ups.map(u=>` ${ATTR_LABEL[u.k]}升至 ${u.level} 级！`).join('');
  else msg+=' 属性稳步积累。';

  if(it.id==='hard'){
    const risk=0.055*(1+(100-G.fitness)/120);
    if(rnd()<risk){
      const w=ri(1,3);
      G.injuryWeeks=w;
      G.morale=clamp(G.morale-6,0,100);
      msg+=`\n训练过猛，受伤 ${w} 周！`;
    }
  }

  /* 先扣训练消耗，再恢复到下一场开场目标 */
  const ready=TRAIN_READY[it.id]||95;
  if(G.fitness<ready) G.fitness=ready;
  G.form=clamp(G.form+(it.id==='hard'?0.015:0.03),0,1);
  G.trainInt=it.id;
  G.roundTrained=viewRound;
  msg+=`\n下一场开场体能：${Math.round(G.fitness)}%。`;
  return {msg,ok:true,ups};
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
function eventSuccessProb(need, fit){
  const ability=eventAbility(need,fit);
  const league=LEAGUE_AVG[G.clubTier]||10;
  return clamp(0.52+(ability-league)*0.085,0.07,0.95);
}

function simMatch(G_, opp, isHome){
  const fitBefore=G_.fitness;
  const ff=fitnessFactor(fitBefore);
  const eff={};
  ATTRS.forEach(k=>{ eff[k]=(G_.attr[k]||0)*ff; });

  const rawCA=calcCA(G_);
  const w=ATTR_WEIGHTS[G_.position];
  let effCA=0; for(const k in w) effCA+=eff[k]*w[k];
  effCA=Math.round(effCA*10)/10;

  const formF=0.85+G_.form*0.3;              // 0.85 ~ 1.15
  const homeF=isHome?1.18:0.94;
  const oppBase=0.65+(4-G_.clubTier)*0.3;
  const defEff=eff.defense*0.55+eff.physical*0.25+eff.decisions*0.2;
  const defFactor=clamp(1.15-(defEff-8)*0.035,0.6,1.4);

  const myXG=(0.4+effCA*0.135)*formF*homeF;
  const oppXG=oppBase*defFactor*(0.8+rnd()*0.55)*(isHome?0.88:1.08);

  /* 首发概率；替补席上仍有机会替补登场 */
  let appsShare=clamp(0.6+(rawCA-8)/22,0.35,0.98);
  if(fitBefore<30) appsShare*=0.8;
  const starter=rnd()<appsShare;

  let benchOn=false, onMinute=0;
  if(!starter){
    const subChance=clamp(0.28+(rawCA-8)*0.035,0.12,0.66)*(fitBefore>=45?1:0.65);
    if(rnd()<subChance){ benchOn=true; onMinute=ri(56,80); }
  }

  /* 完全未登场：评分固定 6.0，不参与场均评分 */
  if(!starter && !benchOn){
    const tg=poisson(clamp(myXG,0.1,5));
    const og=poisson(clamp(oppXG,0.1,5));
    return {
      played:false,starter:false,benchOn:false,onMinute:0,
      goals:0,assists:0,keyPasses:0,saves:0,tackles:0,rating:6.0,motm:false,startRating:6.0,
      score:[tg,og],win:tg>og,draw:tg===og,opp,isHome,injured:0,
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
      if(fit<40 || lowTwo()){
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
      const special=POS_SPECIAL_EVENTS[G.position];
      const ev=pick((special&&special[type])?special[type]:MATCH_EVENTS[type]);
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

      if(!benchOn && halftimeDone && !subbed && (fit<40 || lowTwo())){
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

  if(win){ G_.morale=clamp(G_.morale+6,0,100); G_.form=clamp(G_.form+0.06,0,1); }
  else if(!draw){ G_.morale=clamp(G_.morale-5,0,100); G_.form=clamp(G_.form-0.05,0,1); }

  let injured=0;
  let ip=0.015+(fitBefore<40?0.08:0)+(G_.attr.physical<5?0.02:0);
  ip*=Math.max(0.4,minutes/90);
  if(rnd()<ip) injured=G_.fitness<30?ri(2,5):ri(1,3);

  beats.push({
    type:'fulltime',minute:90,score:[score[0],score[1]],rating,motm,
    minutes,goals,assists,keyPasses,saves,tackles,
    subbed,subMinute,injured,win,draw
  });

  return {
    played:true,starter,benchOn,onMinute,goals,assists,keyPasses,saves,tackles,rating,motm,startRating,
    score,win,draw,opp,isHome,injured,
    rawCA,effCA,fitBefore,fitAfter:fit,fitCost:Math.max(0,Math.round(fitBefore-fit)),
    minutes,subbed,beats
  };
}

/* ---------- 比赛经验 ---------- */
function matchXP(m){
  const focus={
    前锋:['attack','pace','composure'],
    中场:['passing','vision','technique'],
    后卫:['defense','heading','physical'],
    门将:['defense','decisions','composure']
  }[G.position]||['technique','passing','attack'];
  const base=m.rating>=7.5?8:m.rating>=6.5?5:3;
  const ups=[];
  focus.forEach((k,i)=>{ gainXP(k,base*(i===0?1:0.45)).forEach(u=>ups.push(u)); });
  gainXP('stamina',m.rating>=7.5?4:2).forEach(u=>ups.push(u));
  return ups;
}

/* ---------- 声望与身价 ---------- */
function updateValue(G_){
  const ca=calcCA(G_);
  const ageF = G_.age<=21?1.4 : G_.age<=24?1.25 : G_.age<=28?1.0 : G_.age<=31?0.6 : 0.3;
  const tierF=[1,2,3,4.2,6.5][5-G_.clubTier]||1;
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
  G_.careerStats.apps+=G_.seasonStats.apps;
  G_.careerStats.goals+=G_.seasonStats.goals;
  G_.careerStats.assists+=G_.seasonStats.assists;
  G_.careerStats.motm+=G_.seasonStats.motm||0;
  G_.careerStats.ratings=G_.careerStats.ratings.concat(G_.seasonStats.ratings);

  const ca=calcCA(G_);
  const tierP=[0.05,0.12,0.25,0.5];
  const championChance=tierP[4-G_.clubTier]*(ca/20)*(0.7+G_.form*0.6);
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
  if(standing===1 && G_.clubTier>1){ G_.clubTier--; seasonSummary.promoted=true; G_.rep=clamp(G_.rep+5,0,100); }
  else if(standing>=17 && G_.clubTier<4){ G_.clubTier++; seasonSummary.relegated=true; }

  G_.age++; G_.season++;
  G_.seasonStats={apps:0,goals:0,assists:0,ratings:[],motm:0};
  G_.fitness=100; G_.injuryWeeks=0; G_.form=0.5; G_.month=1; G_.roundTrained=-1; G_.trainInt='normal';

  if(G_.age>=30){
    const decay=G_.age>=34?ri(1,2):1;
    const keys=ATTRS.filter(k=>k!=='technique');
    const k=pick(keys);
    G_.attr[k]=clamp(G_.attr[k]-decay,1,20); G_.xp[k]=0;
    if(rnd()<0.45){ G_.attr.technique=clamp(G_.attr.technique-1,1,20); G_.xp.technique=0; }
  }
  if(G_.age>=32){
    const rp = G_.age>=38?0.95 : G_.age>=36?0.7 : G_.age>=34?0.4 : 0.18;
    if(rnd()<rp){ retire(G_); return {retired:true, summary:seasonSummary}; }
  }
  G_.contractYears--;
  if(G_.contractYears<=0) genOffers(G_);
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

/* ---------- 转会报价 ---------- */
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
    tier=clamp(tier,1,4);
    if(tier>G_.clubTier && rnd()<0.7) tier=G_.clubTier;
    tier=clamp(tier,1,4);
    const feeScale=0.8+rnd()*0.8+(5-tier)*0.15;
    G_.offers.push({
      club:clubName(tier,ri(0,7)), tier,
      fee:Math.max(10,Math.round(G_.marketValue*feeScale)),
      salary:Math.max(G_.salary+3,Math.round(G_.marketValue*0.012*(0.9+rnd()*0.6))+8),
      years:ri(2,4)
    });
  }
}

function acceptOffer(idx){
  const o=G.offers[idx]; if(!o) return;
  const oldTier=G.clubTier;
  G.clubTier=o.tier;
  G.clubIdx=CLUB_TIERS.find(c=>c.tier===o.tier).clubs.indexOf(o.club);
  if(G.clubIdx<0) G.clubIdx=0;
  G.salary=o.salary; G.contractYears=o.years;
  G.rep=clamp(G.rep+(o.tier<oldTier?8:2),0,100);
  G.offers=[];
  G.morale=clamp(G.morale+8,0,100);
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
  const ca=calcCA(G);
  if(ca>=16) add('ca16');
  if(ca>=18) add('ca18');
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

/* ---------- 存档 ---------- */
const SAVE_KEY='football_life_save_v1';
function saveGame(){
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify(G)); }catch(e){}
}
function migrateSave(S){
  if(!S) return S;
  if(!S.attr) S.attr={};
  const vals=Object.values(S.attr).map(Number).filter(v=>!isNaN(v));
  const oldScale=vals.length && Math.max.apply(null,vals)>20;
  if(oldScale){
    for(const k in S.attr) S.attr[k]=clamp(Math.round(S.attr[k]/5),1,20);
    S.potential=clamp(Math.round((S.potential||60)/5),8,20);
  }
  /* 旧版 6 属性存档 → 新版 12 属性 */
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
  if(!S.xp) S.xp={};
  ATTRS.forEach(k=>{
    if(typeof S.attr[k]!=='number') S.attr[k]=5;
    S.attr[k]=clamp(Math.round(S.attr[k]),1,20);
    if(typeof S.xp[k]!=='number') S.xp[k]=0;
  });
  if(oldScale){
    ATTRS.forEach(k=>{ S.xp[k]=Math.round(xpNeed(k,S.attr[k])*0.35); });
  }
  if(typeof S.potential!=='number' || !S.potential)
    S.potential=clamp(Math.ceil(calcCA(S))+5,10,20);
  if(typeof S.roundTrained!=='number') S.roundTrained=-1;
  if(!S.trainInt) S.trainInt='normal';
  if(!Array.isArray(S.matchLog)) S.matchLog=[];
  if(!S.seasonStats) S.seasonStats={apps:0,goals:0,assists:0,ratings:[],motm:0};
  return S;
}
function loadGame(){
  try{
    const s=localStorage.getItem(SAVE_KEY);
    if(s){ G=migrateSave(JSON.parse(s)); return true; }
  }catch(e){}
  return false;
}
function hasSave(){ try{ return !!localStorage.getItem(SAVE_KEY); }catch(e){ return false; } }
