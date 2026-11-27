/* ============================================================
   足球人生 · 核心仿真引擎
   ------------------------------------------------------------
   负责：游戏状态、属性成长、训练、比赛关键点、体能、
   赛季推进、身价、转会、国家队、成就判定、存档迁移。
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
function gauss(mu,sigma){
  let u=0,v=0;
  while(u===0)u=rnd(); while(v===0)v=rnd();
  return mu+sigma*Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
}
function fmt1(v){ return (Math.round(v*10)/10).toFixed(1); }

/* ---------- 全局游戏状态 ---------- */
let G=null;
let viewRound=0;   // 当前赛季轮次（0-based，UI 与引擎共享）
let fixtures=[];   // 当前赛季赛程

function xpNeed(level){ return Math.round(XP_BASE*Math.pow(XP_GROWTH,Math.max(0,level-1))); }

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

function newGame(name, pos, birthNation, firstTouchIdx){
  const ft=FIRST_TOUCH_EVENTS[firstTouchIdx]||FIRST_TOUCH_EVENTS[0];
  const base=ATTR_START[pos]||ATTR_START['中场'];
  const attr={}, xp={};
  ATTRS.forEach(k=>{ attr[k]=ri(base[k][0],base[k][1]); xp[k]=0; });
  for(const k in ft.stat) if(k in attr) attr[k]=clamp(attr[k]+ft.stat[k],1,20);
  const nation=NATION_TIER.find(x=>x.n===birthNation)||pick(NATION_TIER);
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
    nation,
    caps:0, natGoals:0,
    seasonStats:{apps:0,goals:0,assists:0,ratings:[],motm:0,caps:0,natGoals:0},
    careerStats:{apps:0,goals:0,assists:0,cleanSheets:0,motm:0,ratings:[],seasons:[]},
    trophies:[],
    achievements:{},
    eventsLog:[],
    history:[],
    retired:false,
    offers:[],
    matchLog:[],
    month:1,
    roundTrained:-1
  };
  return G;
}


/* 综合能力（原始属性加权，1-20） */
function calcCA(G_){
  const w=ATTR_WEIGHTS[G_.position], a=G_.attr;
  let s=0; for(const k in w) s+=a[k]*w[k];
  return Math.round(s*10)/10;
}
/* 有效能力（乘以当前体能系数，比赛中实际发挥的水平） */
function calcEffCA(fit){
  const a=G.attr, w=ATTR_WEIGHTS[G.position];
  const ff=fitnessFactor(typeof fit==='number'?fit:G.fitness);
  let s=0; for(const k in w) s+=a[k]*ff*w[k];
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
  while(G.attr[k]<cap && G.xp[k]>=xpNeed(G.attr[k])){
    G.xp[k]-=xpNeed(G.attr[k]);
    G.attr[k]++;
    ups.push({k,level:G.attr[k]});
  }
  if(G.attr[k]>=cap) G.xp[k]=0;
  return ups;
}


function doTraining(catId, intId){
  if(!G) return {msg:'游戏尚未开始。',ok:false};
  if(G.retired) return {msg:'你已经退役了。',ok:false};
  if(viewRound>=fixtures.length) return {msg:'本赛季已经结束，先进行赛季结算吧。',ok:false};
  if(G.roundTrained===viewRound) return {msg:'本周已经安排过训练了，先出战比赛或结束赛季吧。',ok:false};
  const cat=TRAIN_CATS.find(c=>c.id===catId)||TRAIN_CATS[0];
  const it=INTENSITIES.find(i=>i.id===intId)||INTENSITIES[1];

  if(cat.id==='recovery'){
    const before=G.fitness;
    const restore=recRestore(it);
    G.fitness=clamp(G.fitness+restore,0,100);
    G.form=clamp(G.form+(it.id==='hard'?0.06:0.04),0,1);
    G.morale=clamp(G.morale+(it.id==='hard'?4:3),0,100);
    let inj='';
    if(G.injuryWeeks>0){
      const cut=it.id==='light'?0:it.id==='normal'?1:2;
      if(cut>0){ G.injuryWeeks=Math.max(0,G.injuryWeeks-cut); inj=` 伤情恢复加快 ${cut} 周。`; }
    }
    G.roundTrained=viewRound;
    return {msg:`${it.name} · 恢复训练：体能 +${Math.round(G.fitness-before)}${inj}`,ok:true};
  }

  if(G.injuryWeeks>0) return {msg:'伤病期间只能进行恢复训练。',ok:false};

  const cost=Math.round(cat.cost*it.costMul);
  if(G.fitness<cost) return {msg:`体能不足：本次训练需要 ${cost} 点体能（当前 ${Math.round(G.fitness)}）。先做恢复训练吧。`,ok:false};

  G.fitness=clamp(G.fitness-cost,0,100);
  const moraleF=G.morale<35?0.7:G.morale<55?0.9:G.morale>85?1.2:1;
  const base=30*it.xpMul*ageFactor(G.age)*moraleF;
  const ups=[];
  for(const k in cat.effects){
    const amt=base*cat.effects[k]*potMul(k);
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
  G.form=clamp(G.form+(it.id==='hard'?0.015:0.03),0,1);
  G.roundTrained=viewRound;
  return {msg,ok:true,ups};
}

/* ---------- 赛程 ---------- */
function tierName(t){ return CLUB_TIERS.find(c=>c.tier===t).name; }
function clubName(tier,idx){ return CLUB_TIERS.find(c=>c.tier===tier).clubs[idx]; }

function genFixture(G_){
  const clubs=CLUB_TIERS.find(c=>c.tier===G_.clubTier).clubs;
  const opps=clubs.filter((_,i)=>i!==G_.clubIdx);
  const rounds=[];
  for(let r=0;r<34;r++){
    rounds.push({ opp: opps[r%opps.length], home: r%2===0 });
  }
  return rounds;
}

/* ---------- 单场仿真：每半场 5 次关键点 ---------- */

/* 满场 90 分钟的体能消耗（位置与体能属性都会影响） */
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
  for(const k in need){ sum+=G.attr[k]*fitnessFactor(fit)*need[k]; total+=need[k]; }
  return total?sum/total:1;
}
function eventSuccessProb(need, fit){
  const ability=eventAbility(need,fit);
  const league=LEAGUE_AVG[G.clubTier]||10;
  return clamp(0.52+(ability-league)*0.085,0.07,0.95);
}

function simMatch(G_, opp, isHome){
  const ff=fitnessFactor(G_.fitness);
  const eff={};
  ATTRS.forEach(k=>{ eff[k]=G_.attr[k]*ff; });

  const rawCA=calcCA(G_);
  const w=ATTR_WEIGHTS[G_.position];
  let effCA=0; for(const k in w) effCA+=eff[k]*w[k];
  effCA=Math.round(effCA*10)/10;

  const formF=0.85+G_.form*0.3;              // 0.85 ~ 1.15
  const homeF=isHome?1.18:0.94;
  const tier=G_.clubTier;
  const oppBase=0.65+(4-tier)*0.3;
  const defEff=eff.defense*0.7+eff.physical*0.3;
  const defFactor=clamp(1.15-(defEff-8)*0.035,0.6,1.4);

  const myXG=(0.4+effCA*0.135)*formF*homeF;
  const oppXG=oppBase*defFactor*(0.8+rnd()*0.55)*(isHome?0.88:1.08);

  const fitBefore=G_.fitness;
  let appsShare=clamp(0.6+(rawCA-8)/22,0.35,0.98);
  if(fitBefore<30) appsShare*=0.8;
  const played=rnd()<appsShare;

  if(!played){
    const tg=poisson(clamp(myXG,0.1,5));
    const og=poisson(clamp(oppXG,0.1,5));
    return {
      played:false,goals:0,assists:0,rating:5.5,motm:false,
      score:[tg,og],win:tg>og,draw:tg===og,opp,isHome,injured:0,
      rawCA,effCA,fitBefore,fitAfter:fitBefore,fitCost:0,minutes:0,subbed:false,
      events:['═ 本场你坐在替补席上 ═',`最终比分 ${tg} : ${og}`]
    };
  }

  /* 关键点时间：每半场 5 次，分钟内不重复 */
  const sampleMinutes=(n,a,b)=>{
    const s=new Set(); while(s.size<n) s.add(ri(a,b));
    return Array.from(s).sort((x,y)=>x-y);
  };
  const keyTimes=[...sampleMinutes(5,4,44),...sampleMinutes(5,47,89)].sort((a,b)=>a-b);

  /* 非关键点背景进球（队友 / 对手） */
  const teamBg=poisson(clamp(myXG*0.32,0.05,2.5));
  const oppBg=poisson(clamp(oppXG*0.55,0.08,3));
  const timeline=[];
  keyTimes.forEach(m=>timeline.push({minute:m,kind:'key'}));
  for(let i=0;i<teamBg;i++) timeline.push({minute:ri(2,90),kind:'bg',side:0});
  for(let i=0;i<oppBg;i++) timeline.push({minute:ri(2,90),kind:'bg',side:1});
  timeline.sort((a,b)=>a.minute-b.minute || (a.kind==='key'?-1:1));

  const score=[0,0];
  const lines=[];
  let goals=0,assists=0,minutes=0,subbed=false,subMinute=0;
  let rating=G.position==='门将'?6.7:6.5;
  const keyRatings=[];
  let fit=fitBefore;
  let minuteNow=0;
  let halftimeDone=false;
  let lastFiller=-10;
  const perMinute=matchFullCost()/90;
  const scoreTxt=()=>`${score[0]}-${score[1]}`;
  const lowTwo=()=>keyRatings.length>=2 && keyRatings[keyRatings.length-1]<6 && keyRatings[keyRatings.length-2]<6;

  const drainTo=m=>{
    if(subbed) return;
    if(m>minuteNow){ fit=clamp(fit-perMinute*(m-minuteNow),0,100); minuteNow=m; }
  };
  const doSub=(min,why)=>{
    subbed=true; subMinute=min; minutes=min;
    lines.push(`第 ${min} 分钟，教练做出换人调整：你被换下（${why}）。`);
    lines.push('你在场边观战，比赛继续进行……');
  };

  lines.push('比赛开始，你首发出场。');
  if(effCA<rawCA-1.5) lines.push(`体能不足，你的有效能力只有 ${fmt1(effCA)}（综合 ${fmt1(rawCA)}），动作明显发沉。`);

  for(const item of timeline){
    if(subbed && item.kind==='key') continue;

    /* 半场节点 */
    if(!halftimeDone && item.minute>45){
      drainTo(45);
      halftimeDone=true;
      lines.push(`—— 半场结束：比分 ${scoreTxt()}，你的实时评分 ${rating.toFixed(1)}，体能 ${Math.round(fit)} ——`);
      if(fit<40 || lowTwo()){
        doSub(45, fit<40?'体能透支':'连续关键点评分过低');
        if(item.kind==='key') continue;
      }
    }

    if(item.kind==='key'){
      if(item.minute-lastFiller>=6){
        lines.push(`（非关键点）${item.minute}' 全力比赛中…${pick(FILLER_TEXTS)}`);
        lastFiller=item.minute;
      }
      drainTo(item.minute);

      const type=pickWeighted(POS_EVENT_WEIGHTS[G.position]);
      const special=POS_SPECIAL_EVENTS[G.position];
      const ev=pick((special&&special[type])?special[type]:MATCH_EVENTS[type]);
      const p=eventSuccessProb(ev.need,fit);
      const good=rnd()<p;
      let delta=0, outcome='';

      if(type==='attack'){
        if(good){
          if(rnd()<0.22){
            goals++; score[0]++; delta=1.05;
            outcome=`射入死角！比分 ${scoreTxt()}！`;
          }else{
            delta=0.2;
            outcome=pick(['门将飞身扑出！','皮球擦着立柱偏出。','后卫在门线前解围！']);
          }
        }else{
          delta=-0.13;
          outcome=pick(['被后卫封堵。','射门打在边网上。','起脚稍慢，被门将没收。']);
        }
      }else if(type==='pass'){
        if(good){
          if(rnd()<0.16){
            assists++; score[0]++; delta=0.65;
            outcome=`队友心领神会，推射破门！比分 ${scoreTxt()}！`;
          }else{
            delta=0.2;
            outcome=pick(['队友接球后起脚，被门将扑出。','队友做球，进攻继续。','对方后卫仓促解围。']);
          }
        }else{
          delta=-0.13;
          outcome=pick(['传球被断下。','队友没接到，球出了边线。','传球力量稍大，机会流失。']);
        }
      }else if(type==='defend'){
        if(good){
          delta=0.38;
          outcome=pick(['你把球干净地断下。','你抢在对手之前将球解围。','你封住了射门角度。']);
        }else{
          delta=-0.25;
          if(rnd()<0.22){
            score[1]++; delta-=0.2;
            outcome=`防守被突破，对手射门得手……比分 ${scoreTxt()}。`;
          }else{
            outcome=pick(['被对手抢先一步，幸好队友补防。','对手射门偏出。','你被迫犯规，送给对方任意球。']);
          }
        }
      }else{
        if(good){
          delta=0.45;
          outcome=pick(['你飞身将球扑出底线！','你稳稳把球抱在怀里！','你用指尖把球托出横梁！']);
        }else{
          delta=-0.25;
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
      lines.push(`（关键点）${item.minute}' ${ev.txt}：${outcome}（实时评分 ${rating.toFixed(1)} · 体能 ${Math.round(fit)}）`);

      if(halftimeDone && (fit<40 || lowTwo())){
        doSub(item.minute, fit<40?'体能不足40':'连续关键点评分低于6.0');
        continue;
      }
    }else{
      drainTo(item.minute);
      if(item.side===0){
        score[0]++;
        lines.push(`（非关键点）${item.minute}' 队友在禁区内抢点破门！比分 ${scoreTxt()}。`);
      }else{
        score[1]++;
        lines.push(`（非关键点）${item.minute}' 对手抓住机会攻入一球……比分 ${scoreTxt()}。`);
      }
    }
  }

  if(!subbed){ drainTo(90); minutes=90; }
  else if(!minutes) minutes=subMinute;

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

  lines.push(`—— 全场结束：比分 ${scoreTxt()}，你的评分 ${rating.toFixed(1)}${motm?' · 全场最佳':''} ——`);
  lines.push(subbed?`你出场 ${minutes} 分钟，第 ${subMinute} 分钟被换下。`:`你打满全场（${minutes} 分钟）。`);
  if(injured>0) lines.push(`赛后检查：肌肉不适，预计伤停 ${injured} 周。`);

  return {
    played:true,goals,assists,rating,motm,
    score,win,draw,opp,isHome,injured,
    rawCA,effCA,fitBefore,fitAfter:fit,fitCost:Math.max(0,Math.round(fitBefore-fit)),
    minutes,subbed,events:lines
  };
}

/* ---------- 比赛经验 ---------- */
function matchXP(m){
  const focus={
    前锋:['attack','technique','pace'],
    中场:['technique','stamina','attack'],
    后卫:['defense','physical','pace'],
    门将:['defense','technique','physical']
  }[G.position]||['technique','stamina','attack'];
  const base=m.rating>=7.5?7:m.rating>=6.5?5:3;
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
      Math.round(G_.seasonStats.ratings.reduce((a,b)=>a+b,0)/G_.seasonStats.ratings.length*10)/10 : 0,
    caps:G_.seasonStats.caps||0, natGoals:G_.seasonStats.natGoals||0,
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
  G_.seasonStats={apps:0,goals:0,assists:0,ratings:[],motm:0,caps:0,natGoals:0};
  G_.fitness=100; G_.injuryWeeks=0; G_.form=0.5; G_.month=1; G_.roundTrained=-1;

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
  score+=G_.caps*1.2;
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

/* ---------- 国家队 ---------- */
function tryNationalCallup(){
  const ca=calcCA(G);
  const t=G.nation.t;
  const need=[16,14.5,12][t-1];
  const formBonus=G.form*0.8;
  const repBonus=G.rep/40;
  if(G.injuryWeeks>0) return false;
  if(ca+formBonus+repBonus >= need && rnd()<0.55+(ca-need)/12){
    return true;
  }
  return false;
}

function simNationalSeason(){
  const res={caps:0,goals:0,ratings:[]};
  const ff=fitnessFactor(G.fitness);
  const ca=calcCA(G);
  const fin=(G.attr.attack*0.7+G.attr.technique*0.3)*ff;
  for(let i=0;i<5;i++){
    if(rnd()<clamp(0.45+(ca-10)/22,0.3,0.9)){
      res.caps++;
      const goals=poisson(0.35*clamp(fin/9,0.3,1.8));
      res.goals+=goals;
      res.ratings.push(clamp(6+goals*0.8+gauss(0,0.5),4,10));
    }
  }
  return res;
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
    if(m.rating>=8.5) add('motm_10');
    if(m.rating>=9.0) add('rating_9');
  }
  if(ctx.season){
    if(G.seasonStats.goals>=20) add('season_20');
    if(G.seasonStats.goals>=30) add('season_30');
  }
  if(ctx.trophy) add('first_trophy');
  if(ctx.trophy && G.clubTier===1) add('top_tier_champ');
  if(ctx.promoted) add('promoted');
  if(ctx.natCaps>0) add('national_debut');
  if(ctx.natGoals>0) add('nat_goal');
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
  if(!S.xp) S.xp={};
  ATTRS.forEach(k=>{
    if(typeof S.attr[k]!=='number') S.attr[k]=5;
    S.attr[k]=clamp(Math.round(S.attr[k]),1,20);
    if(typeof S.xp[k]!=='number') S.xp[k]=0;
  });
  if(oldScale){
    // 旧档能力换算后，给每项属性留一点进度，手感更自然
    ATTRS.forEach(k=>{ S.xp[k]=Math.round(xpNeed(S.attr[k])*0.35); });
  }
  if(typeof S.potential!=='number' || !S.potential)
    S.potential=clamp(Math.ceil(calcCA(S))+5,10,20);
  if(typeof S.roundTrained!=='number') S.roundTrained=-1;
  if(!Array.isArray(S.matchLog)) S.matchLog=[];
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

