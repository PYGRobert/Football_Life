/* 足球人生 v3 回归测试：天数训练 / 星级评级 / 状态 / 生涯同步 / 存档槽 / 移除项 */
'use strict';
const fs=require('fs'), path=require('path'), vm=require('vm');
const ROOT=__dirname;

/* ---- localStorage / window 桩 ---- */
const store={};
global.localStorage={
  getItem:k=>(k in store?store[k]:null),
  setItem:(k,v)=>{ store[k]=String(v); },
  removeItem:k=>{ delete store[k]; },
  clear:()=>{ for(const k in store) delete store[k]; }
};
global.window={ addEventListener(){}, scrollTo(){}, innerHeight:800,
  onerror:null };

const load=f=>vm.runInThisContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'),{filename:f});
load('data.js'); load('engine.js');

let pass=0, fail=0;
const ok=(cond,msg)=>{ if(cond){pass++;} else {fail++; console.log('FAIL: '+msg);} };

/* ================= 1. 静态一致性 ================= */
ok(Math.abs(Object.values(ATTR_WEIGHTS['前锋']).reduce((a,b)=>a+b,0)-1)<1e-9,'前锋权重和=1');
ok(Math.abs(Object.values(ATTR_WEIGHTS['中场']).reduce((a,b)=>a+b,0)-1)<1e-9,'中场权重和=1');
ok(Math.abs(Object.values(ATTR_WEIGHTS['后卫']).reduce((a,b)=>a+b,0)-1)<1e-9,'后卫权重和=1');
ok(Math.abs(Object.values(ATTR_WEIGHTS['门将']).reduce((a,b)=>a+b,0)-1)<1e-9,'门将权重和=1');

POSITIONS.forEach(p=>{
  const keys=ATTRS_BY_POS[p];
  const w=ATTR_WEIGHTS[p];
  keys.forEach(k=>ok(typeof w[k]==='number',`${p} 权重覆盖 ${k}`));
  Object.keys(w).forEach(k=>ok(keys.indexOf(k)>=0,`${p} 权重无多余键 ${k}`));
  /* 事件池与事件类型权重 */
  const types=Object.keys(POS_EVENT_WEIGHTS[p]);
  types.forEach(t=>ok(Array.isArray(MATCH_EVENTS[p][t])&&MATCH_EVENTS[p][t].length>0,`${p} 事件池 ${t} 非空`));
  Object.keys(MATCH_EVENTS[p]).forEach(t=>ok(types.indexOf(t)>=0,`${p} 事件类型 ${t} 在权重表中`));
  types.forEach(t=>MATCH_EVENTS[p][t].forEach(ev=>{
    Object.keys(ev.need).forEach(k=>ok(keys.indexOf(k)>=0,`${p}/${t} 事件键 ${k} 在属性表内`));
  }));
  Object.keys(POS_DEF_NEED[p]).forEach(k=>ok(keys.indexOf(k)>=0,`${p} 防守键 ${k} 在属性表内`));
  /* 训练模块 / 重点属性 */
  TRAIN_CATS[p].forEach(c=>{
    ok(typeof TRAIN_FOCUS[c.id]==='object',`TRAIN_FOCUS[${c.id}] 存在`);
    (TRAIN_FOCUS[c.id]||[]).forEach(k=>{
      ok(typeof ATTR_LABEL[k]==='string',`重点属性 ${k} 有标签`);
    });
    const hit=(TRAIN_FOCUS[c.id]||[]).filter(k=>keys.indexOf(k)>=0);
    /* 综合训练（general）无重点属性 = 纯等权，其余模块至少 1 个命中 */
    ok(hit.length>=1||c.id==='general',`${p}/${c.id} 重点属性至少 1 个命中属性表`);
    if(c.id==='general') ok((TRAIN_FOCUS[c.id]||[]).length===0,`${p}/综合训练 无重点属性（纯等权）`);
  });
  ok(TRAIN_CATS[p].some(c=>c.id==='general'),`${p} 含综合训练模块`);
  /* 起点职责 */
  const duties=FIRST_TOUCH_BY_POS[p];
  ok(Array.isArray(duties)&&duties.length===3,`${p} 起点职责 3 个`);
  duties.forEach(d=>{
    let hits=0;
    Object.keys(d.stat).forEach(k=>{ if(keys.indexOf(k)>=0) hits++; });
    ok(hits>=3,`${p}/起点[${d.t}] 命中 ≥3 项加成（实际 ${hits}）`);
  });
  /* 属性分组覆盖全部属性表 */
  const grouped=new Set();
  ATTR_GROUPS_BY_POS[p].forEach(g=>g.keys.forEach(k=>grouped.add(k)));
  keys.forEach(k=>ok(grouped.has(k),`${p} 分组覆盖 ${k}`));
});
/* 事件权重（按位置，合计 1） */
POSITIONS.forEach(p=>{
  const w=POS_EVENT_WEIGHTS[p];
  ok(Math.abs(Object.values(w).reduce((a,b)=>a+b,0)-1)<1e-9,`${p} 事件权重和=1`);
});
ok(POS_EVENT_WEIGHTS['前锋'].defend===undefined
  &&Math.abs(POS_EVENT_WEIGHTS['前锋'].attack-0.6)<1e-9
  &&Math.abs(POS_EVENT_WEIGHTS['前锋'].pass-0.4)<1e-9,'前锋 进攻.60 组织.40（无防守事件）');
ok(Math.abs(POS_EVENT_WEIGHTS['中场'].pass-0.4)<1e-9
  &&Math.abs(POS_EVENT_WEIGHTS['中场'].attack-0.3)<1e-9
  &&Math.abs(POS_EVENT_WEIGHTS['中场'].defend-0.3)<1e-9,'中场 组.40 攻.30 防.30 不变');
ok(Math.abs(POS_EVENT_WEIGHTS['后卫'].attack-0.15)<1e-9
  &&Math.abs(POS_EVENT_WEIGHTS['后卫'].pass-0.10)<1e-9
  &&Math.abs(POS_EVENT_WEIGHTS['后卫'].defend-0.75)<1e-9,'后卫 攻.15 组.10 防.75');
ok(Object.keys(POS_EVENT_WEIGHTS['门将']).length===1&&POS_EVENT_WEIGHTS['门将'].save===1,
  '门将 扑救 1.0 单一事件');
ok(MATCH_EVENTS['前锋'].defend===undefined,'前锋防守事件池已移除');
ok(MATCH_EVENTS['门将'].pass===undefined&&MATCH_EVENTS['门将'].defend===undefined,'门将只保留扑救事件池');

ok(DAY_XP_DECAY.length>=WEEK_DAYS,'DAY_XP_DECAY 覆盖 6 天');
ok(Math.abs(DAY_XP_DECAY[0]-1)<1e-9,'第 1 天为基准 1.0');
ok(DAY_XP_DECAY[1]<DAY_XP_DECAY[0],'边际递减');
ok(Math.abs(dayXpMul(6)-4.55)<1e-9,`6 天合计 4.55×（实际 ${dayXpMul(6)}）`);
ok(Math.abs(dayXpMul(3)-2.6)<1e-9,`3 天合计 2.6×（实际 ${dayXpMul(3)}）`);
ok(dayXpMul(6)/6>0.7,'衰减温和：6 天日均 >0.7 基准');
ok(Object.keys(LEAGUE_QUALITY).length===3,'设计 3 级联赛');
ok(CLUB_TIERS.length===3,'CLUB_TIERS 3 级');
ok(typeof TRAIN_POS_WEIGHTS==='undefined','旧 TRAIN_POS_WEIGHTS 已移除');
ok(typeof INTENSITIES==='undefined','旧 INTENSITIES 已移除');
ok(typeof TRAIN_READY==='undefined','旧 TRAIN_READY 已移除');
ok(typeof LEAGUE_AVG==='undefined','旧 LEAGUE_AVG 已移除');
ok(typeof FIRST_TOUCH_EVENTS==='undefined','旧 FIRST_TOUCH_EVENTS 已移除');

/* ================= 2. 星级评级模型 ================= */
ok(Math.abs(attrPercentile('finishing',leagueMean('finishing',1),1)-0.5)<0.01,'联赛均值 → 50% 分位');
ok(Math.abs(starsFromPct(0.5)-3)<1e-9,'50% 分位 = 3★');
ok(Math.abs(starsFromPct(0.9)-5)<1e-9,'90% 分位 = 5★');
ok(Math.abs(starsFromPct(0.1)-1)<1e-9,'10% 分位 = 1★');
ok(attrStars('finishing',16,1)>attrStars('finishing',12,1),'高属性星级更高');
ok(attrStars('finishing',14,3)>attrStars('finishing',14,1),'同一属性在低级别联赛星级更高（如鱼得水）');
ok(caStars(14,3)>caStars(14,1),'高联赛均值下同 CA 星级更低（升班马难）');
ok(starsText(3.5)==='3.5★','星级文案 3.5★');
ok(starsText(4)==='4★','星级文案 4★');
/* 高斯 CDF 单调 + 边界 */
ok(normCdf(0)===0.5||Math.abs(normCdf(0)-0.5)<1e-9,'normCdf(0)=0.5');
ok(normCdf(1.96)>0.97&&normCdf(1.96)<0.98,'normCdf(1.96)≈0.975');
ok(normCdf(-3)<0.01&&normCdf(3)>0.99,'normCdf 尾部');

/* ================= 3. 四位置冒烟测试 ================= */
POSITIONS.forEach(pos=>{
  localStorage.clear();
  const g=newGame('测试'+pos,pos,0);
  g.potential=clamp(Math.round(calcCA(g))+8,10,20);   /* 模拟创建页的潜力 rolls */
  ok(g.position===pos,`${pos} 创建成功`);
  ok(g.attrVersion===3,`${pos} 新档 attrVersion=3`);
  ok(Object.keys(g.attr).length===ATTRS_BY_POS[pos].length,`${pos} 属性数量一致`);
  ok(typeof g.morale==='undefined',`${pos} 无士气字段`);
  ok(typeof g.injuryWeeks==='undefined',`${pos} 无伤病字段`);
  ok(ATTRS_BY_POS[pos].every(k=>typeof g.attr[k]==='number'),`${pos} 属性全为数字`);
  ok(g.duty===FIRST_TOUCH_BY_POS[pos][0].t,`${pos} 起点职责记录`);

  fixtures=genFixture(g); viewRound=0;

  /* 天数训练：3 天 */
  const fit0=g.fitness, form0=g.form;
  const catId=autoTrainCategory();
  const r3=doTraining(catId,3);
  ok(r3.ok,`${pos} 3 天训练成功`);
  ok(g.trainDays===3,`${pos} trainDays=3`);
  ok(g.roundTrained===viewRound,`${pos} roundTrained 标记`);
  ok(g.fitness<=100&&g.fitness>=0,`${pos} 体能在界内`);
  const catCost=(TRAIN_CATS[g.position].find(c=>c.id===catId)||{cost:13}).cost;
  const expect3=clamp(fit0+FIT_RECOVER_PER_DAY*3-Math.round(catCost*TRAIN_COST_PER_DAY_MUL*3),0,100);
  ok(Math.abs(g.fitness-expect3)<=1,`${pos} 体能 = 剩余+恢复-消耗（${g.fitness} vs ${expect3}）`);
  ok(g.form>form0,`${pos} 训练提升状态`);
  /* 重复训练被拒绝 */
  ok(!doTraining(autoTrainCategory(),3).ok,`${pos} 每周只能训练一次`);
  /* 训练提示含状态收益 */
  g.roundTrained=-1;
  const rMsg=doTraining(autoTrainCategory(),2);
  ok(rMsg.ok&&rMsg.msg.indexOf('状态 +')>=0,`${pos} 训练提示含状态收益`);

  /* 模拟 10 场：先拉高属性保证有出场机会（避免 tier0 边缘球员抽样为 0） */
  ATTRS_BY_POS[pos].forEach(k=>{ g.attr[k]=13; });
  let careerBefore=g.careerStats.apps;
  for(let i=0;i<10 && viewRound<fixtures.length;i++){
    const fx=fixtures[viewRound];
    const days=(g.roundTrained===viewRound)?g.trainDays:0;
    prepareMatchFitness();
    const m=simMatch(g,fx.opp,fx.home);
    viewRound++;
    applyWeekResult(m,days);
    g.roundTrained=-1;
    if(i<3) doTraining(autoTrainCategory(),ri(0,6));
  }
  ok(g.seasonStats.apps>0,`${pos} 赛季数据更新`);
  ok(g.careerStats.apps===g.seasonStats.apps,`${pos} 生涯出场与赛季同步（${g.careerStats.apps}）`);
  ok(g.careerStats.ratings.length===g.seasonStats.ratings.length,`${pos} 生涯评分数同步`);
  ok(g.form>=0&&g.form<=1,`${pos} 状态在 0~1`);
  ok(g.fitness>=0&&g.fitness<=100,`${pos} 体能在界内`);

  /* 状态逻辑：0 天训练 + 未登场 = 大量损失 */
  const formBefore=g.form;
  g.roundTrained=-1; g.trainDays=0;
  prepareMatchFitness();
  const m2=simMatch(g,'测试对手',true);
  applyWeekResult(m2,0);
  if(!m2.played){
    ok(g.form<=formBefore-0.15||g.form===0,`${pos} 0训练+未登场状态大降（${formBefore.toFixed(2)}→${g.form.toFixed(2)}）`);
  }else{
    ok(g.form!==formBefore||m2.minutes>0,`${pos} 状态随出场变化`);
  }

  /* 存档往返 */
  g.saveSlot=1;
  ok(saveGame(1),`${pos} 保存到槽1`);
  const snap=JSON.stringify(g);
  G=null;
  ok(loadGame(1),`${pos} 读取槽1`);
  ok(JSON.stringify(G)===snap,`${pos} 存档往返一致`);
  ok(G.saveSlot===1,`${pos} 槽位记忆`);

  /* 赛季推进 ×4 */
  for(let i=0;i<4;i++){
    fixtures=genFixture(G); viewRound=0;
    while(viewRound<fixtures.length){
      if(G.roundTrained!==viewRound) doTraining(autoTrainCategory(),3);
      prepareMatchFitness();
      const fx=fixtures[viewRound];
      const days=(G.roundTrained===viewRound)?G.trainDays:0;
      const mm=simMatch(G,fx.opp,fx.home);
      viewRound++;
      applyWeekResult(mm,days);
    }
    const res=advanceSeason();
    if(res.retired) break;
  }
  ok(G.season>=2,`${pos} 赛季推进（第${G.season}赛季）`);
  ok(typeof G.seasonMeanMul==='number'&&G.seasonMeanMul>=0.8&&G.seasonMeanMul<=1.2,`${pos} 联赛均值波动 ±20%（${G.seasonMeanMul.toFixed(2)}）`);
  ok(!('morale' in G)&&!('injuryWeeks' in G),`${pos} 推进后仍无士气/伤病`);
  ok(G.clubTier>=1&&G.clubTier<=3,`${pos} 联赛级别 1~3`);
});

/* ================= 4. 比赛成长基准 ================= */
localStorage.clear();
const g4=newGame('成长测试','前锋',1);
fixtures=genFixture(g4); viewRound=0;
/* 6.0 评分 / 90 分钟 = MATCH_GROWTH_BASE × 1 天训练基准 */
const baseOneDay=TRAIN_DAY_XP*DAY_XP_DECAY[0]*ageFactor(g4.age);
const expectMatch=MATCH_GROWTH_BASE*TRAIN_DAY_XP*(6.0/MATCH_RATING_BASE)*(90/90)*ageFactor(g4.age);
ok(Math.abs(expectMatch-MATCH_GROWTH_BASE*baseOneDay)<1e-9,'6.0/90 成长 = MATCH_GROWTH_BASE × 1天训练基准');
/* 评分/时间缩放 */
const scaled=MATCH_GROWTH_BASE*TRAIN_DAY_XP*(7.5/6.0)*(45/90)*ageFactor(g4.age);
ok(scaled<expectMatch,'评分高但时间短 → 成长低于满勤基准');

/* ================= 4b. 状态(form)确定性结算 ================= */
localStorage.clear();
const gF=newGame('状态','中场',0);
fixtures=genFixture(gF); viewRound=0;
gF.form=0.5;
/* 0 天训练 + 整场坐板凳 = 大量损失：0.5 − 0.09 − 0.08 = 0.33 */
applyWeekResult({played:false,minutes:0,fitAfter:gF.fitness,rating:6.0,goals:0,assists:0,motm:false},0);
ok(Math.abs(gF.form-0.33)<1e-9,`0训练+未登场：0.5 → 0.33（实际 ${gF.form.toFixed(2)}）`);
/* 训练 3 天 + 打满 90 分钟：0.5 + 0.055×3 + 0.07 = 0.735 */
gF.form=0.5;
gF.roundTrained=-1;
ok(doTraining(autoTrainCategory(),3).ok,'状态测试：3 天训练成功');
ok(Math.abs(gF.form-0.665)<1e-9,`3天训练状态 0.5 → 0.665（实际 ${gF.form.toFixed(3)}）`);
const fakeM={played:true,minutes:90,fitAfter:60,rating:6.5,goals:0,assists:0,motm:false};
const upsF=applyWeekResult(fakeM,3);
ok(Math.abs(gF.form-0.735)<1e-9,`3天训练+90分钟：0.5 → 0.735（实际 ${gF.form.toFixed(3)}）`);
ok(Array.isArray(upsF),'比赛产生通用成长');
ok(gF.careerStats.apps===1&&gF.seasonStats.apps===1,'单场后生涯/赛季同步为 1');
ok(gF.careerStats.ratings.length===1,'单场后生涯评分同步');

/* ================= 5. 事件成功率与联赛挂钩 ================= */
localStorage.clear();
const g5=newGame('联赛测试','中场',0);
G=g5; g5.clubTier=3;
const need={passing:.5,vision:.3,decisions:.2};
const pLow=eventSuccessProb(need,100);   // 低级别联赛
g5.clubTier=1;
const pHigh=eventSuccessProb(need,100);  // 高级别联赛
ok(pLow>pHigh,`同一球员低级别联赛成功率更高（${pLow.toFixed(2)} > ${pHigh.toFixed(2)}）`);
/* 高水平球员在低级别：拉满属性 */
g5.clubTier=3;
const keys5=ATTRS_BY_POS['中场'];
keys5.forEach(k=>{ g5.attr[k]=18; });
const pStar=eventSuccessProb(need,100);
keys5.forEach(k=>{ g5.attr[k]=6; });
const pWeak=eventSuccessProb(need,100);
ok(pStar>0.75&&pWeak<0.4,`明星在低级别碾压（${pStar.toFixed(2)} vs ${pWeak.toFixed(2)}）`);
ok(pStar<=0.95&&pWeak>=0.07,'成功率截断在 [0.07,0.95]');

/* ================= 5b. 出场定位（星级档位） ================= */
localStorage.clear();
const gA=newGame('出场','中场',0);
G=gA; gA.clubTier=1; gA.seasonMeanMul=1;
/* 全属性拉平 → CA = 属性值，顶级联赛（mean 13.4 / sd 2.0） */
const setAttrs=v=>ATTRS_BY_POS['中场'].forEach(k=>{ gA.attr[k]=v; });
setAttrs(5);
let planA=appearancePlan(gA);
ok(planA.tier===0&&planA.role==='边缘球员',`5 → tier0 边缘球员（${planA.tier}/${planA.role}）`);
ok(planA.subChance===0,'tier0 无替补登场机会');
ok(planA.expectMinutes===10,`tier0 预期 = 0.12×85 ≈ 10 分钟（实际 ${planA.expectMinutes}）`);
setAttrs(12);
planA=appearancePlan(gA);
ok(planA.tier===1,`12 → tier1 替补登场档（${planA.tier}）`);
ok(planA.subChance>=0.45&&planA.subChance<=0.9,'tier1 替补登场率 0.45~0.9');
ok(planA.expectMinutes===35,`tier1 预期 = 0.28×85 + 0.72×0.6×22 ≈ 35（实际 ${planA.expectMinutes}）`);
setAttrs(13);
planA=appearancePlan(gA);
ok(planA.tier===2,`13 → tier2 稳定首发（${planA.tier}）`);
ok(planA.expectMinutes===75,`tier2 预期 = 0.88×85 ≈ 75，非虚标 90（实际 ${planA.expectMinutes}）`);
setAttrs(15);
planA=appearancePlan(gA);
ok(planA.tier===3&&planA.startShare>=0.99,`15 → tier3 忽略评分踢满（${planA.tier}）`);
ok(planA.expectMinutes===90,'tier3 预期 90 分钟');
/* 近期表现提升 tier1 的首发竞争与替补稳定性 */
setAttrs(12); gA.perfAvg=6.3;
const planLow=appearancePlan(gA);
gA.perfAvg=7.6;
const planHigh=appearancePlan(gA);
ok(planHigh.startShare>planLow.startShare,'表现好 → 首发率提升');
ok(planHigh.subChance>planLow.subChance,'表现好 → 替补登场稳定性提升');
gA.perfAvg=6.3;
/* perfAvg EMA 迁移默认值（模拟旧档缺字段） */
const perfLegacy=JSON.parse(JSON.stringify({
  name:'旧',position:'中场',age:20,season:1,potential:15,rep:30,form:0.6,attrVersion:3,
  attr:{technique:8,passing:8,vision:7,decisions:7,attack:6,composure:6,defense:6,pace:6,stamina:7,physical:6},
  roundTrained:-1,trainDays:3,seasonMeanMul:1,
  seasonStats:{apps:0,goals:0,assists:0,ratings:[],motm:0},
  careerStats:{apps:0,goals:0,assists:0,cleanSheets:0,motm:0,ratings:[],seasons:0},
  trophies:[],achievements:{},history:[],matchLog:[],offers:[],retired:false,contractYears:2,clubTier:3,clubIdx:0,month:1
}));
const migPerf=migrateSave(perfLegacy);
ok(migPerf.perfAvg===0,'旧档补 perfAvg 默认 0（未首秀显示 —）');
/* 3.5★ 档不被换下：simMatch 内 plan.tier<3 守卫（源码级检查） */
const engSrc=fs.readFileSync(path.join(ROOT,'js','engine.js'),'utf8');
ok(engSrc.indexOf('plan.tier<3')>=0,'simMatch 换下逻辑含 tier<3 守卫（踢满全场）');
ok(engSrc.indexOf('const plan=appearancePlan')>=0,'simMatch 使用 appearancePlan');

/* ================= 6. 存档槽（5 槽 / 替换 / 放弃 / 迁移） ================= */
localStorage.clear();
ok(emptySlot()===1,'空槽从 1 开始');
for(let i=1;i<=5;i++){ G=newGame('球员'+i,'前锋',0); G.saveSlot=i; ok(saveGame(i),`写入槽 ${i}`); }
ok(emptySlot()===null,'5 槽写满后无空槽');
ok(hasSave()===true,'hasSave 为真');
const slots=listSlots();
ok(slots.length===5&&slots.every(s=>!s.empty),'列出 5 个已占用槽');
ok(slots[0].name==='球员1'&&slots[4].name==='球员5','槽位内容正确');
/* 替换槽 3 */
G=newGame('替换者','门将',0);
ok(saveGame(3),'替换槽 3');
ok(listSlots()[2].name==='替换者','槽 3 已被替换');
ok(listSlots()[0].name==='球员1','其他槽不受影响');
/* 读取 */
ok(loadGame(3)&&G.name==='替换者'&&G.position==='门将','读取槽 3');
/* 旧单档迁移 */
localStorage.clear();
const legacy=newGame('老玩家','后卫',1);
localStorage.setItem(LEGACY_SAVE_KEY,JSON.stringify(legacy));
importLegacySave();
ok(localStorage.getItem(LEGACY_SAVE_KEY)===null,'旧档键已清除');
ok(loadGame(1)&&G.name==='老玩家','旧档迁入槽 1');
ok(hasSave(),'迁移后 hasSave');
/* 旧档为第 4 级联赛（地区联赛）时，栏位信息仍可读 */
localStorage.clear();
const old4=newGame('旧四级','中场',0); old4.clubTier=4;
localStorage.setItem(slotKey(1),JSON.stringify(old4));
const si4=slotInfo(1);
ok(!si4.empty&&typeof si4.club==='string'&&si4.club.length>0,'旧四级档栏位信息可读');
localStorage.clear();

/* ================= 7. 存档迁移（v1/v2/v3 → 当前） ================= */
localStorage.clear();
/* v1：旧 6 属性、5 制数值、士气/伤病/强度字段 */
const v1={
  name:'旧档',position:'前锋',age:24,season:3,potential:60,rep:40,morale:70,injuryWeeks:2,
  attr:{technique:75,attack:80,passing:60,defense:50,pace:70,stamina:65},
  attrVersion:1,trainInt:'hard',roundTrained:2,form:0.7,
  seasonStats:{apps:5,goals:2,assists:1,ratings:[6.5],motm:0},
  careerStats:{apps:50,goals:20,assists:10,cleanSheets:5,motm:3,ratings:[],seasons:0},
  trophies:[],achievements:{},history:[],matchLog:[],offers:[],retired:false,contractYears:2,clubTier:2,clubIdx:0,month:1
};
const m1=migrateSave(JSON.parse(JSON.stringify(v1)));
ok(m1.attrVersion===3,'v1 → attrVersion 3');
ok(POSITIONS.indexOf(m1.position)>=0,'位置合法');
ok(Object.keys(m1.attr).length===ATTRS_BY_POS['前锋'].length,'v1 → 前锋属性表完整');
ok(typeof m1.morale==='undefined','移除士气');
ok(typeof m1.injuryWeeks==='undefined','移除伤病');
ok(typeof m1.trainInt==='undefined','移除强度');
ok(m1.trainDays===3,'默认训练天数 3');
ok(m1.seasonMeanMul===1,'默认联赛均值系数');
ok(m1.clubTier>=1&&m1.clubTier<=3,'联赛级别收敛到 1~3');
/* v2：12 属性 */
const v2={
  name:'中档',position:'门将',age:20,season:1,potential:16,rep:20,form:0.6,
  attr:{technique:8,passing:7,vision:6,decisions:7,attack:5,defense:9,heading:6,
        composure:7,pace:6,stamina:7,physical:6,reflexes:10},
  attrVersion:2,roundTrained:-1,trainInt:'normal',
  seasonStats:{apps:0,goals:0,assists:0,ratings:[],motm:0},
  trophies:[],achievements:{},history:[],matchLog:[],offers:[],retired:false,contractYears:2,clubTier:3,clubIdx:1,month:1
};
const m2b=migrateSave(JSON.parse(JSON.stringify(v2)));
ok(m2b.attrVersion===3,'v2 → attrVersion 3');
ok(typeof m2b.attr.reflexes==='number'&&typeof m2b.attr.handling==='number','门将新属性键存在');
ok(Object.keys(m2b.attr).length===ATTRS_BY_POS['门将'].length,'门将属性表完整');
/* v3 当前档只需字段补全 */
const v3={
  name:'新档',position:'中场',age:18,season:2,potential:15,rep:30,form:0.8,
  attr:{technique:9,passing:10,vision:8,decisions:8,attack:7,composure:7,defense:6,pace:6,stamina:8,physical:5},
  attrVersion:3,roundTrained:0,trainDays:5,seasonMeanMul:0.93,
  seasonStats:{apps:3,goals:1,assists:2,ratings:[6.8,7.1,6.5],motm:1},
  careerStats:{apps:3,goals:1,assists:2,cleanSheets:0,motm:1,ratings:[6.8,7.1,6.5],seasons:1},
  trophies:[],achievements:{},history:[],matchLog:[],offers:[],retired:false,contractYears:1,clubTier:1,clubIdx:2,month:1
};
const m3=migrateSave(JSON.parse(JSON.stringify(v3)));
ok(m3.trainDays===5&&Math.abs(m3.seasonMeanMul-0.93)<1e-9,'v3 字段保留');
ok(m3.form===0.8,'v3 状态保留');

/* ================= 8. 成就星级判定 ================= */
localStorage.clear();
const g8=newGame('成就','前锋',0);
G=g8; fixtures=genFixture(g8); viewRound=0;
g8.clubTier=1;
/* 拉到世界级 CA */
ATTRS_BY_POS['前锋'].forEach(k=>{ g8.attr[k]=18; });
const st8=caStars(calcCA(g8));
const unl=checkAchievements({});
ok(st8>=4.5,'18 全属性在顶级联赛 ≥4.5★');
ok(g8.achievements.ca18===true,'解锁 ca18（4.5★）');
ok(g8.achievements.ca16===true,'解锁 ca16（4★）');

/* ================= 8b. Request G：近期均评 / 学习倍率 / 指数成长 / 赛季命运 ================= */
/* --- 近期均评：开局 0 → 显示 —，首秀精确，EMA 递进 --- */
localStorage.clear();
const gG=newGame('均评','中场',0);
ok(gG.perfAvg===0,'新档 perfAvg=0（未首秀）');
ok(perfAvgOf(gG)===6.3,'perfAvgOf 对 0 回退 6.3 中性基准（预期上场计算不受影响）');
G=gG; fixtures=genFixture(gG); viewRound=0;
applyWeekResult({played:true,minutes:60,fitAfter:80,rating:7.2,goals:1,assists:0,motm:false},3);
ok(Math.abs(gG.perfAvg-7.2)<1e-9,`首秀均评 = 本场评分（${gG.perfAvg}）`);
applyWeekResult({played:true,minutes:90,fitAfter:70,rating:6.0,goals:0,assists:0,motm:false},0);
ok(Math.abs(gG.perfAvg-(7.2*0.55+6.0*0.45))<1e-9,'第二场 EMA 权重 0.55/0.45');
const perfBefore=gG.perfAvg;
applyWeekResult({played:false,minutes:0,fitAfter:70,rating:6.0,goals:0,assists:0,motm:false},0);
ok(gG.perfAvg>0&&gG.perfAvg<perfBefore,'未登场均评向 6.0 缓降');
const gN=newGame('未首秀','后卫',0);
G=gN; fixtures=genFixture(gN); viewRound=0;
applyWeekResult({played:false,minutes:0,fitAfter:100,rating:6.0,goals:0,assists:0,motm:false},0);
ok(gN.perfAvg===0,'未首秀不生成均评（界面显示 —）');

/* --- 学习倍率 learnMul：3★ 基准，低能力加速、高能力减速 --- */
localStorage.clear();
const gL=newGame('学习','中场',0);
G=gL; gL.clubTier=3; gL.seasonMeanMul=1;
const setAllM=v=>ATTRS_BY_POS['中场'].forEach(k=>{ gL.attr[k]=v; });
setAllM(9);
const lmMid=learnMul(gL);
ok(Math.abs(lmMid-1)<0.15,`乙级均值附近学习 ×≈1.0（${lmMid.toFixed(2)}）`);
setAllM(5);
const lmLow=learnMul(gL);
ok(lmLow>1.15,`低能力学习更快（${lmLow.toFixed(2)}）`);
setAllM(14);
const lmHigh=learnMul(gL);
ok(lmHigh<0.85,`高能力学习更慢（${lmHigh.toFixed(2)}）`);
ok(lmLow>lmMid&&lmMid>lmHigh,'学习倍率随能力单调递减');
ok(lmLow<=1.8&&lmHigh>=0.4,'学习倍率截断在 [0.4,1.8]');

/* --- 指数成长速度守卫：首周 0 级、4 周满额训练 ≤3 级、常量上限 --- */
localStorage.clear();
const gS=newGame('成长速度','前锋',0);
gS.potential=20;
G=gS; fixtures=genFixture(gS); viewRound=0;
const rW1=doTraining('general',6);
ok(rW1.ok,'守卫：首周 6 天训练成功');
ok(rW1.ups.length===0,`首周满额训练 0 级升级（实际 ${rW1.ups.length}）`);
let upsTotal=rW1.ups.length;
for(let w=1;w<4;w++){
  viewRound++; gS.roundTrained=-1;
  const r=doTraining('general',6);
  upsTotal+=r.ups.length;
}
ok(upsTotal<=3,`4 周满额训练累计升级 ≤3（实际 ${upsTotal}）`);
ok(XP_GROWTH>=1.40,`XP_GROWTH ≥1.40 指数成本（${XP_GROWTH}）`);
ok(TRAIN_DAY_XP<=2.5,`TRAIN_DAY_XP ≤2.5（${TRAIN_DAY_XP}）`);
ok(MATCH_GROWTH_BASE<=1.2,`MATCH_GROWTH_BASE ≤1.2（${MATCH_GROWTH_BASE}）`);

/* --- 赛季命运 seasonFate：四条规则 + 边界（stub rnd 定值） --- */
const origRnd=rnd;
const stubRnd=v=>{ rnd=()=>v; };
stubRnd(0.5);
let fA=seasonFate({standing:2,playerGood:true,playerBad:false,clubTier:2});
ok(fA.promoted&&!fA.event&&!fA.relegated,'前3+数据不差 → 大概率随队升级');
stubRnd(0.95);
let fB=seasonFate({standing:3,playerGood:true,playerBad:false,clubTier:2});
ok(!fB.promoted&&fB.event==='upgrade','前3+数据好+冲超失败 → 上级俱乐部求购');
stubRnd(0.1);
let fC=seasonFate({standing:1,playerGood:false,playerBad:true,clubTier:2});
ok(fC.event==='sell'&&!fC.promoted,'前3+数据差 → 出售/租借事件');
stubRnd(0.1);
let fD=seasonFate({standing:2,playerGood:true,playerBad:false,clubTier:1});
ok(!fD.promoted&&fD.event===null,'甲A前3 不可能升级、无事件');
let fE=seasonFate({standing:8,playerGood:true,playerBad:false,clubTier:2});
ok(fE.event==='upgrade','中游+数据好 → 高一级球队求购');
let fF=seasonFate({standing:8,playerGood:true,playerBad:false,clubTier:1});
ok(fF.event===null,'顶级联赛中游+数据好 → 无求购');
let fG=seasonFate({standing:8,playerGood:false,playerBad:true,clubTier:2});
ok(!fG.event&&!fG.promoted&&!fG.relegated,'中游+数据差 → 无事件');
stubRnd(0.5);
let fH=seasonFate({standing:17,playerGood:false,playerBad:true,clubTier:2});
ok(fH.relegated,'17名+数据差 → 一起降级');
let fI=seasonFate({standing:17,playerGood:false,playerBad:true,clubTier:3});
ok(!fI.relegated,'乙级垫底不降级');
stubRnd(0.9);
let fJ=seasonFate({standing:16,playerGood:true,playerBad:false,clubTier:2});
ok(!fJ.relegated,'16名+数据好 → 大概率保级');
stubRnd(0.1);
let fK=seasonFate({standing:16,playerGood:true,playerBad:false,clubTier:2});
ok(fK.relegated,'16名+数据好 → 小概率仍降级');
rnd=origRnd;

/* --- 租借：记录母队 → 赛季末归队 --- */
localStorage.clear();
const gLoan=newGame('租借','中场',0);
G=gLoan; fixtures=genFixture(gLoan); viewRound=0;
const pTier=gLoan.clubTier, pIdx=gLoan.clubIdx;
const lTier=pTier>1?pTier-1:2;
gLoan.offers=[{kind:'loan',club:clubName(lTier,0),tier:lTier,fee:0,salary:10,years:1}];
const contractB=gLoan.contractYears;
acceptOffer(0);
ok(gLoan.onLoan&&gLoan.onLoan.tier===pTier&&gLoan.onLoan.idx===pIdx,'租借记录母队');
ok(gLoan.clubTier===lTier,'租借到新俱乐部');
ok(gLoan.contractYears===contractB,'租借不改母队合同');
ok(gLoan.offers.length===0,'接受后报价清空');
const resLoan=advanceSeason();
ok(resLoan.summary.loanReturn===true,`赛季末归队标记（parent=${resLoan.summary.parentClub}）`);
ok(resLoan.summary.parentClub===clubName(pTier,pIdx),'归队文案指向母队');
ok(gLoan.clubTier===pTier&&gLoan.clubIdx===pIdx,'归队后俱乐部复位');
ok(!gLoan.onLoan,'onLoan 已清空');

/* --- 永久转会（求购/出售接受） --- */
const gT=newGame('转会','前锋',0);
G=gT;
const tTier=gT.clubTier===3?2:1;
gT.offers=[{kind:'upgrade',club:clubName(tTier,1),tier:tTier,fee:100,salary:20,years:3}];
acceptOffer(0);
ok(gT.clubTier===tTier&&gT.onLoan==null,'求购接受 → 永久转会且无租借残留');
ok(gT.salary===20&&gT.contractYears===3,'合同年限与薪资更新');
ok(gT.offers.length===0,'报价清空');

/* --- 源码接线检查 --- */
const uiSrcG=fs.readFileSync(path.join(ROOT,'js','ui.js'),'utf8');
ok(engSrc.indexOf('function learnMul')>=0,'learnMul 函数存在');
ok(engSrc.indexOf('*learnMul(G)')>=0,'训练/比赛成长接入 learnMul');
ok(engSrc.indexOf('function seasonFate')>=0&&engSrc.indexOf('genUpgradeOffer')>=0&&engSrc.indexOf('genSellOffers')>=0,
  'seasonFate / 求购 / 出售报价函数存在');
ok(engSrc.indexOf("kind==='loan'")>=0,'acceptOffer 含租借分支');
ok(uiSrcG.indexOf('pendingOffers')>=0,'endSeason 暂存报价（startSeason 清空修复）');
ok(uiSrcG.indexOf('OFFER_INFO')>=0&&uiSrcG.indexOf('offer-kicker')>=0,'报价卡按类型渲染（求购/出售/租借）');
ok(uiSrcG.indexOf('学习 ×')>=0,'训练预览显示学习倍率');
ok(uiSrcG.indexOf('G.perfAvg.toFixed(1)')>=0&&uiSrcG.indexOf("G.perfAvg>0")>=0,'近期均评未首秀显示 —');
ok(uiSrcG.indexOf('h.loanReturn')>=0,'生涯表租借赛季排名守卫');

/* ================= 9. 移除项全局扫描 ================= */
const src=['data.js','engine.js','ui.js'].map(f=>fs.readFileSync(path.join(ROOT,'js',f),'utf8')).join('\n');
['injuryWeeks','morale','INTENSITIES','TRAIN_READY','LEAGUE_AVG','FIRST_TOUCH_EVENTS','TRAIN_POS_WEIGHTS']
  .forEach(k=>{
    if(k==='injuryWeeks'||k==='morale'||k==='trainInt'){
      /* 允许 migrateSave 中的 delete 清理语句 */
      const lines=src.split('\n').filter(l=>l.includes(k)&&!/^\s*delete\s/.test(l)&&!/旧版字段/.test(l));
      ok(lines.length===0,`源码中不再出现 ${k}（除迁移清理）${lines.length?': '+lines[0].trim():''}`);
    }else{
      ok(src.indexOf(k)<0,`源码中不再出现 ${k}`);
    }
  });
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
ok(html.indexOf('injury-banner')<0,'HTML 无伤病横幅');
ok(html.indexOf('v-morale')<0,'HTML 无士气显示');
ok(html.indexOf('intensity-row')<0,'HTML 无强度行');
ok(/value="前锋">前锋<\/option>/.test(html)&&html.indexOf('进球机器')<0,'位置选项无提示文案');
ok(html.indexOf('id="day-row"')>=0,'天数选择行存在');
ok(html.indexOf('id="btn-menu"')>=0,'返回主菜单按钮存在');
ok(html.indexOf('id="slot-layer"')>=0,'存档槽面板存在');
ok(html.indexOf('btn-continue')<0,'旧继续按钮已替换');
const uiSrc=fs.readFileSync(path.join(ROOT,'js','ui.js'),'utf8');
ok(uiSrc.indexOf('attr-num ${attrClass(G.attr[k])}')>=0&&uiSrc.indexOf('${G.attr[k]}</b>')>=0,'属性行显示 FM 1~20 数值');
ok(uiSrc.indexOf('attr-star')<0&&uiSrc.indexOf('starClass')<0,'属性行无星级（不做双显示）');
ok(uiSrc.indexOf('function attrClass')>=0,'attrClass 色阶函数存在');
ok(html.indexOf('id="data-fit"')>=0&&html.indexOf('id="data-form"')>=0,'汇总含体能/状态百分比');
ok(html.indexOf('id="data-eff"')<0&&html.indexOf('比赛发挥')<0,'比赛发挥已移除');
ok(html.indexOf('数值 1–20')>=0,'属性面板数值说明存在');

/* ---- Request D：顶栏 / 方格结构 / emoji 清除 ---- */
ok(html.indexOf('id="v-eff"')<0,'顶栏已移除有效星级');
ok(!/>有效\s*</.test(html),'顶栏无“有效”表述');
ok(!/发挥\s*\d+%/.test(uiSrc),'顶栏体能无“发挥”表述');
ok(uiSrc.indexOf('rep.className=repClass')>=0,'声望按等级配色（repClass）');
ok(!/\(\d+\)/.test((uiSrc.match(/v-rep[^;]*/)||[''])[0]),'声望不显示具体数值');
ok(html.indexOf('id="tile-role"')>=0&&html.indexOf('id="tile-minutes"')>=0,'出场方格含预期定位与预期时间');
ok(html.indexOf('id="m-data"')>=0&&html.indexOf('id="m-career"')>=0,'数据/生涯方框 id 存在');
ok(html.indexOf('class="t-col"')>=0,'数据/生涯列容器（原生涯方格位置）存在');
ok((html.match(/class="tile t-half/g)||[]).length===2,'数据、生涯 = 两个半高长方框');
ok(html.indexOf('t-merged')<0&&html.indexOf('t-stack')<0,'旧合并方格结构已移除');
ok(html.indexOf('id="tile-apps"')<0&&html.indexOf('id="tile-season"')<0,'旧独立数据/生涯方格 id 已移除');
ok(uiSrc.indexOf('(avail-10)/2')>=0&&uiSrc.indexOf('/1.72')<0,'四宫格按两行等高收缩（半高框在格内二等分）');
ok(html.indexOf('id="btn-to-career"')>=0&&html.indexOf('id="btn-to-data"')>=0,'数据⇄生涯互跳按钮存在');
ok(html.indexOf('t-icon')<0,'方格无 emoji 图标位');
ok(uiSrc.indexOf('cat-ico')<0,'训练模块无 emoji 图标位');
/* 综合训练单行预览格式：（综合训练）全属性+ */
ok(uiSrc.indexOf('（${cat.name}）')>=0&&uiSrc.indexOf('focus.map(k=>ATTR_LABEL[k]+\'++\')')>=0,
  '训练预览为单行（把握机会）终结++ 格式');

/* 图形 emoji 全量扫描（★ → ⇄ 等排版符号白名单除外） */
const allow=new Set(['★','→','⇄','×','›','…','·','±','≤','≥','×']);
const emojiRe=/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2190}-\u{21FF}]/gu;
let emojiHits=[];
['index.html','js/data.js','js/engine.js','js/ui.js','assets/style.css'].forEach(f=>{
  const t=fs.readFileSync(path.join(ROOT,f),'utf8');
  let m;
  while((m=emojiRe.exec(t))){
    if(!allow.has(m[0])) emojiHits.push(f+':'+m[0]+'(U+'+m[0].codePointAt(0).toString(16).toUpperCase()+')');
  }
});
ok(emojiHits.length===0,`无图形 emoji${emojiHits.length?': '+emojiHits.slice(0,5).join(' '):''}`);

/* ================= 结果 ================= */
console.log(`\nPASS ${pass} / FAIL ${fail}`);
process.exit(fail?1:0);
