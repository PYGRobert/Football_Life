/* ============================================================
   足球人生 · UI 交互层
   ------------------------------------------------------------
   负责：DOM 绑定、面板开关、渲染、Toast、比赛逐步播放。
   依赖：js/data.js 中的配置、js/engine.js 暴露的全局函数与 G。
   ============================================================ */
'use strict';

/* ================= 足球人生 · UI 交互层 ================= */
const $=s=>document.querySelector(s);
const $$=s=>document.querySelectorAll(s);

let toastTimer=null;
let trainCat='technique';
let trainInt='normal';

/* 比赛播放状态 */
let matchToken=0;
let matchState=null;

/* 错误兜底：任何报错都弹 toast，避免"点了没反应" */
window.onerror=function(msg,src,line){
  try{ toast('脚本错误: '+msg+' @line '+line); }catch(e){}
};

/* ---------- 初始化 ---------- */
document.addEventListener('DOMContentLoaded',()=>{
  bindCreate();
  bindPanels();
  bindActions();
  $('#btn-match-close').onclick=()=>{
    if(matchState && matchState.playing) skipMatchPlayback();
    else closeMatchLayer();
  };
  if(hasSave()){ $('#btn-continue').style.display='block'; }
});

/* ---------- 面板开关 ---------- */
function bindPanels(){
  $$('.tile').forEach(t=>{ t.onclick=()=>openPanel(t.dataset.panel); });
  $$('.panel-close').forEach(b=>{ b.onclick=()=>closePanel(b.dataset.close); });
  $('#btn-achv').onclick=()=>openPanel('ov-achv');
  $$('.overlay').forEach(ov=>{
    ov.addEventListener('click',e=>{
      if(e.target!==ov) return;
      if(ov.id==='match-layer'){ closeMatchLayer(); return; }
      ov.classList.remove('show');
    });
  });
}
function openPanel(id){
  const el=$('#'+id); if(!el||!G) return;
  el.classList.add('show');
  if(id==='ov-attr') renderData();
  else if(id==='ov-train') renderTrainUI();
  else if(id==='ov-data') renderDataPanel();
  else if(id==='ov-career') renderCareer();
  else if(id==='ov-achv') renderAchv();
}
function closePanel(id){ const el=$('#'+id); if(el) el.classList.remove('show'); }

function bindCreate(){
  $('#btn-start').onclick=()=>{
    try{
      const name=$('#inp-name').value.trim();
      const pos=$('#sel-pos').value;
      const ft=parseInt($('#sel-firsttouch').value,10);
      newGame(name,pos,ft);
      const ca=calcCA(G);
      G.potential=clamp(Math.round(ca)+ri(6,11)+(rnd()<0.12?3:0),10,20);
      startSeason();
      switchScreen('main');
      renderAll();
      toast(`欢迎来到职业足坛，${G.name}！16岁的你与 ${clubName(G.clubTier,G.clubIdx)} 签下了第一份合同。`);
      saveGame();
    }catch(e){ toast('创建失败: '+e.message); }
  };
  $('#btn-continue').onclick=()=>{
    if(loadGame()){ syncSeason(); switchScreen('main'); renderAll(); toast('欢迎回来，继续你的足球人生！'); }
  };
}

function startSeason(){
  fixtures=genFixture(G);
  viewRound=0;
  G.offers=[];
  G.roundTrained=-1;
  G.trainInt='normal';
  G.matchLog=[];
}
function syncSeason(){
  fixtures=genFixture(G);
  viewRound=0;
}

/* 真正切换整屏（不是向下滚动） */
function switchScreen(id){
  $$('.screen').forEach(el=>el.classList.remove('active'));
  const el=$('#'+id);
  if(el) el.classList.add('active');
  window.scrollTo(0,0);
}

/* ---------- 主操作 ---------- */
function bindActions(){
  $('#train-cats').addEventListener('click',e=>{
    const b=e.target.closest('.cat-btn'); if(!b) return;
    trainCat=b.dataset.cat; renderTrainUI();
  });
  $('#intensity-row').addEventListener('click',e=>{
    const b=e.target.closest('.int-btn'); if(!b) return;
    trainInt=b.dataset.int; renderTrainUI();
  });

  $('#btn-train').onclick=()=>{
    const res=doTraining(trainCat,trainInt);
    toast(res.msg);
    renderAll(); saveGame();
  };
  $('#btn-match').onclick=()=>playMatch(false);
  $('#btn-endseason').onclick=()=>endSeason();

  /* 模拟下一场：默认完成一次平均训练（普通强度） */
  $('#btn-simweek').onclick=()=>{
    if(!G||G.retired) return;
    if(viewRound>=fixtures.length){ endSeason(); return; }
    if(G.injuryWeeks>0){ playMatch(true); return; }
    let note='';
    if(G.roundTrained!==viewRound){
      const catId=autoTrainCategory();
      const cat=TRAIN_CATS.find(c=>c.id===catId);
      const r=doTraining(catId,'normal');
      if(r.ok && cat) note=`自动${cat.name}（普通强度）`;
    }
    playMatch(true,note);
  };
}

/* ---------- 比赛流程 ---------- */
function playMatch(auto,note){
  if(!G||G.retired) return;
  if(viewRound>=fixtures.length){ toast('本赛季联赛已全部结束，点击"赛季收官"。'); return; }
  if(G.injuryWeeks>0){
    G.injuryWeeks--;
    G.fitness=100;
    toast(`伤病恢复中…还需 ${G.injuryWeeks} 周。你缺席了本轮比赛，体能已恢复。`);
    viewRound++;
    G.roundTrained=-1;
    renderAll(); saveGame();
    return;
  }
  const fx=fixtures[viewRound];
  const roundNo=viewRound+1;

  prepareMatchFitness();
  const m=simMatch(G,fx.opp,fx.home);
  viewRound++;

  let ups=[];
  if(m.played){
    G.seasonStats.apps++;
    G.seasonStats.goals+=m.goals;
    G.seasonStats.assists+=m.assists;
    G.seasonStats.ratings.push(m.rating);
    if(m.motm) G.seasonStats.motm=(G.seasonStats.motm||0)+1;
    if(rnd()<0.4) G.form=clamp(G.form+0.01,0,1);
    ups=matchXP(m);
  }
  /* 未登场：评分 6.0 只记录在比赛日志，不进入场均评分 */
  G.fitness=m.fitAfter;
  if(m.injured>0){
    G.injuryWeeks=m.injured;
    G.morale=clamp(G.morale-12,0,100);
  }
  G.matchLog.push({
    round:roundNo, opp:fx.opp, home:fx.home,
    score:[m.score[0],m.score[1]], rating:m.rating,
    goals:m.goals, assists:m.assists, minutes:m.minutes,
    subbed:m.subbed, motm:m.motm, played:m.played
  });
  if(G.matchLog.length>12) G.matchLog.shift();
  G.roundTrained=-1;
  updateValue(G);
  const unl=checkAchievements({match:m});
  saveGame();

  if(auto){
    renderAll();
    const res=m.win?'胜':m.draw?'平':'负';
    toast(`模拟完成：${m.score[0]}-${m.score[1]} ${res} ${fx.opp} · ${m.played?`评分 ${m.rating.toFixed(1)}`:'未登场 评分 6.0'}${note?' · '+note:''}`);
    return;
  }

  startMatchPlayback(m,fx,roundNo,ups,unl);
  renderAll();
}

/* ---------- 结束赛季 ---------- */
function endSeason(){
  if(!G||G.retired) return;
  while(viewRound<fixtures.length){
    if(G.injuryWeeks>0){
      G.injuryWeeks--; G.fitness=100; viewRound++; G.roundTrained=-1; continue;
    }
    if(G.roundTrained!==viewRound) doTraining(autoTrainCategory(),'normal');
    if(G.injuryWeeks>0){
      G.injuryWeeks--; G.fitness=100; viewRound++; G.roundTrained=-1; continue;
    }
    prepareMatchFitness();
    const fx=fixtures[viewRound];
    const m=simMatch(G,fx.opp,fx.home);
    if(m.played){
      G.seasonStats.apps++;
      G.seasonStats.goals+=m.goals;
      G.seasonStats.assists+=m.assists;
      G.seasonStats.ratings.push(m.rating);
      if(m.motm) G.seasonStats.motm=(G.seasonStats.motm||0)+1;
      matchXP(m);
    }
    G.fitness=m.fitAfter;
    if(m.injured>0) G.injuryWeeks=m.injured;
    viewRound++;
    G.roundTrained=-1;
  }
  const res=advanceSeason();
  const unl=checkAchievements({season:true, trophy:res.summary.standing===1, promoted:res.summary.promoted});
  const s=res.summary;
  const lines=[
    `${s.club} · ${tierName(s.tier)} 赛季结算`,
    `出场 ${s.apps} · 进球 ${s.goals} · 助攻 ${s.assists} · 场均评分 ${s.avgRating||'—'}`,
    s.standing===1?`联赛冠军！`:s.standing<=3?`联赛第 ${s.standing} 名，获得奖牌`:s.relegated?`联赛第 ${s.standing} 名，不幸降级…`:`联赛第 ${s.standing} 名`,
    s.promoted?`球队升级成功！`:'',
    `新赛季你的年龄：${s.age} 岁`,
    ...unl.map(u=>`成就解锁：${u.name}`)
  ].filter(Boolean);
  if(res.retired){
    showRetire(lines);
  } else {
    startSeason();
    showMatchLayer(lines,'赛季结算');
    if(G.offers.length){ setTimeout(()=>showOffers(),600); }
  }
  saveGame(); renderAll();
}

function showRetire(baseLines){
  const avg=G.careerStats.ratings.length?
    (G.careerStats.ratings.reduce((a,b)=>a+b,0)/G.careerStats.ratings.length).toFixed(2):'—';
  const lines=[...baseLines,
    '',
    '═══════ 生涯总结 ═══════',
    `出场 ${G.careerStats.apps} · 进球 ${G.careerStats.goals} · 助攻 ${G.careerStats.assists}`,
    `冠军 ${G.trophies.length} 个 · 生涯场均评分 ${avg}`,
    `最终评价：${G.legacy.grade}（${G.legacy.score} 分）`,
    '',
    '你的球衣被挂在俱乐部荣誉墙上。'
  ];
  showMatchLayer(lines,'退役');
  $('#btn-again').style.display='block';
}

/* ---------- 转会 ---------- */
function showOffers(){
  const box=$('#offers-box'); box.innerHTML='';
  G.offers.forEach((o,i)=>{
    const d=document.createElement('div');
    d.className='offer-card';
    d.innerHTML=`<div class="offer-club">${o.club} <span class="tag t${o.tier}">${tierName(o.tier)}</span></div>
      <div class="offer-row">转会费 €${o.fee}万 · 周薪 €${o.salary}万 · ${o.years} 年合同</div>`;
    const b=document.createElement('button');
    b.className='btn small'; b.style.cssText='background:var(--green);color:#fff';
    b.textContent='接受报价';
    b.onclick=()=>{ acceptOffer(i); $('#offer-layer').classList.remove('show'); toast(`你转会至 ${o.club}！`); renderAll(); saveGame(); };
    const stay=document.createElement('button');
    stay.className='btn small'; stay.style.cssText='background:#e5e7eb;color:#333';
    stay.textContent='留队';
    stay.onclick=()=>{ G.offers=[]; G.contractYears=Math.max(G.contractYears,1); $('#offer-layer').classList.remove('show'); toast('你选择留守球队。'); };
    d.appendChild(b); d.appendChild(stay);
    box.appendChild(d);
  });
  $('#offer-layer').classList.add('show');
}

/* ---------- 渲染 ---------- */
function renderAll(){
  if(!G) return;
  renderTop();
  renderTiles();
  renderTrainUI();
  renderDataPanel();
  renderCareer();
  renderAchv();
  if($('#ov-attr') && $('#ov-attr').classList.contains('show')) renderData();
  fitTiles();
}

/* 主界面四宫格按可视高度收缩，保证整屏不出现纵向滚动 */
function fitTiles(){
  const tiles=$('.tiles'); if(!tiles) return;
  const top=tiles.getBoundingClientRect().top;
  if(top<=0) return;
  const reserve=88;                       // 底部操作条与留白
  const avail=window.innerHeight-top-reserve;
  const max=Math.max(72,Math.floor((avail-10)/2));
  tiles.style.setProperty('--tile-max',max+'px');
}
window.addEventListener('resize',()=>{ if(G) fitTiles(); });

function renderTop(){
  if(!G) return;
  $('#v-name').textContent=G.name;
  $('#v-pos').textContent=G.position;
  $('#v-age').textContent=G.age+' 岁';
  $('#v-club').textContent=`${clubName(G.clubTier,G.clubIdx)} · ${tierName(G.clubTier)}`;
  $('#v-ca').textContent=fmt1(calcCA(G));
  $('#v-eff').textContent=fmt1(calcEffCA());
  $('#v-value').textContent='€'+G.marketValue+'万';
  $('#v-rep').textContent=`${repLabel(G.rep)} (${Math.round(G.rep)})`;
  $('#v-morale').textContent=Math.round(G.morale);
  $('#v-season').textContent=`第 ${G.season} 赛季 · 第 ${Math.min(viewRound+1,fixtures.length||1)} / ${fixtures.length||34} 轮`;
  $('#v-fit').textContent=Math.round(G.fitness)+'% · 发挥'+fitnessPct(G.fitness)+'%';
  $('#v-form').textContent=Math.round(G.form*100)+'%';
  $('#bar-fitness>i').style.width=G.fitness+'%';
  $('#bar-form>i').style.width=(G.form*100)+'%';
  $('#achv-badge').textContent=ACHIEVEMENTS.filter(a=>G.achievements&&G.achievements[a.id]).length;
  const inj=$('#injury-banner');
  if(G.injuryWeeks>0){ inj.style.display='block'; inj.textContent=`伤病中，还需恢复 ${G.injuryWeeks} 周`; }
  else inj.style.display='none';
  $('#btn-match').disabled = G.retired || viewRound>=fixtures.length;
  $('#btn-match').textContent = G.retired?'已退役':viewRound>=fixtures.length?'联赛结束':`出战 · 第${viewRound+1}轮`;
}

/* 主界面四宫格 */
function renderTiles(){
  if(!G) return;
  const ca=calcCA(G), eff=calcEffCA();
  $('#tile-ca').textContent=fmt1(ca);
  $('#tile-attr-sub').textContent=`潜力 ${G.potential||'?'} · 有效 ${fmt1(eff)}`;

  const done=G.roundTrained===viewRound;
  const over=viewRound>=fixtures.length;
  const ready=done?(TRAIN_READY[G.trainInt||'normal']||95):100;
  let trainMain='可训练';
  if(G.retired) trainMain='已退役';
  else if(G.injuryWeeks>0) trainMain='养伤中';
  else if(done) trainMain='已训练';
  else if(over) trainMain='赛季结束';
  $('#tile-train-main').textContent=trainMain;
  const cat=TRAIN_CATS.find(c=>c.id===trainCat)||TRAIN_CATS[0];
  const it=INTENSITIES.find(i=>i.id===trainInt)||INTENSITIES[1];
  $('#tile-train-sub').textContent=`${cat.name} · ${it.name}`;
  $('#tile-train-foot').textContent=`赛后体能 ${Math.round(G.fitness)}% · 赛前恢复至 ${ready}%`;
  $('#tile-train-foot').className='t-foot';

  const s=G.seasonStats;
  $('#tile-apps').textContent=`${s.apps} 场`;
  $('#tile-data-sub').textContent=`${s.goals} 球 · ${s.assists} 助`;
  const avg=s.ratings.length?Math.round(s.ratings.reduce((a,b)=>a+b,0)/s.ratings.length*10)/10:0;
  $('#tile-data-foot').textContent=avg?`场均评分 ${avg.toFixed(1)}`:'等待首秀';

  $('#tile-season').textContent=`第 ${G.season} 赛季`;
  $('#tile-career-sub').textContent=`${G.age} 岁 · ${tierName(G.clubTier)}`;
  $('#tile-career-foot').textContent=`冠军 ${G.trophies.length} · 声望 ${repLabel(G.rep)}`;

  let hint='';
  if(G.retired){ hint='你的职业生涯已经结束，可以在生涯面板回顾荣誉。'; }
  else if(viewRound<fixtures.length){
    const fx=fixtures[viewRound];
    hint=`下一场：${fx.home?'主场迎战':'客场挑战'} <b>${fx.opp}</b> · 赛后体能 ${Math.round(G.fitness)}%（赛前恢复至 ${ready}%）`;
    if(G.injuryWeeks>0) hint+=`<br><span class="warn">伤病中，还需恢复 ${G.injuryWeeks} 周，暂时无法训练。</span>`;
    else if(done) hint+='<br>本周训练已完成，可以出战。';
    else hint+='<br>本周可安排一次训练，或直接模拟下一场。';
  }else{
    hint='本赛季联赛已结束，点击底部“赛季收官”进行结算。';
  }
  $('#home-hint').innerHTML=hint;
}

/* 数据面板 */
function renderDataPanel(){
  if(!G) return;
  const s=G.seasonStats;
  $('#v-seasonapps').textContent=s.apps;
  $('#v-seasongoals').textContent=s.goals;
  $('#v-seasonassists').textContent=s.assists;
  $('#v-seasonmotm').textContent=s.motm||0;
  const avg=s.ratings.length?Math.round(s.ratings.reduce((a,b)=>a+b,0)/s.ratings.length*10)/10:0;
  $('#v-seasonrating').textContent=avg?avg.toFixed(1):'—';

  const log=$('#season-log');
  if(!log) return;
  const arr=(G.matchLog||[]).slice().reverse();
  if(!arr.length){ log.innerHTML='<p class="muted">本赛季还没有比赛记录。</p>'; return; }
  const tbl=document.createElement('table');
  tbl.className='season-table';
  tbl.innerHTML='<tr><th>轮</th><th>对手</th><th>比分</th><th>分钟</th><th>球/助</th><th>评分</th></tr>';
  arr.forEach(h=>{
    const tr=document.createElement('tr');
    const rating=h.played===false?`${Number(h.rating).toFixed(1)}<small> 未登场</small>`:`${Number(h.rating).toFixed(1)}`;
    tr.innerHTML=`<td>${h.round}</td><td>${h.home?'主':'客'} ${h.opp}</td>
      <td>${h.score[0]}-${h.score[1]}</td><td>${h.minutes||0}</td>
      <td>${h.goals}/${h.assists}</td><td>${rating}</td>`;
    tbl.appendChild(tr);
  });
  log.innerHTML='';
  log.appendChild(tbl);
}

/* ---------- 训练面板 ---------- */
function renderTrainUI(){
  if(!G) return;
  const catsBox=$('#train-cats'); if(!catsBox) return;
  catsBox.innerHTML=TRAIN_CATS.map(c=>`
    <button class="cat-btn${c.id===trainCat?' active':''}" data-cat="${c.id}">
      <span class="cat-name"><span class="cat-ico">${c.icon}</span>${c.name}</span>
      <span class="cat-desc">${c.desc}</span>
    </button>`).join('');
  $('#intensity-row').innerHTML=INTENSITIES.map(i=>`
    <button class="int-btn${i.id===trainInt?' active':''}" data-int="${i.id}">
      ${i.name}<span class="im">${i.hint}</span>
    </button>`).join('');

  const cat=TRAIN_CATS.find(c=>c.id===trainCat)||TRAIN_CATS[0];
  const it=INTENSITIES.find(i=>i.id===trainInt)||INTENSITIES[1];
  const box=$('#train-preview');
  const cost=Math.round(cat.cost*it.costMul);
  const weights=TRAIN_POS_WEIGHTS[cat.id][G.position]||{};
  const stars=w=>w>=0.9?'★★★':w>=0.35?'★★':'★';
  const list=Object.keys(weights).sort((a,b)=>weights[b]-weights[a]).slice(0,4)
    .map(k=>`${ATTR_LABEL[k]} ${stars(weights[k])}`).join(' · ');
  const after=clamp(G.fitness-cost,0,100);
  const gainWord=it.xpMul>=2?'大幅':it.xpMul>=1?'正常':'小幅';
  const ready=TRAIN_READY[it.id]||95;
  box.innerHTML=`<b>${cat.name}</b>：体能 <b>-${cost}</b>（${Math.round(G.fitness)} → ${Math.round(after)}）<br>
    重点属性：${list}<br>
    训练收益：<b>${gainWord}</b> · 训练后下一场开场体能 <b>${ready}%</b>
    ${G.fitness<cost?'<br><span class="warn">体能不足，无法完成本次训练，可选择轻度训练。</span>':''}`;

  const done=G.roundTrained===viewRound;
  const over=viewRound>=fixtures.length;
  const btn=$('#btn-train');
  btn.disabled=done||over||G.retired||G.injuryWeeks>0;
  btn.textContent=G.retired?'已退役':G.injuryWeeks>0?'养伤中':done?'本周已训练':over?'本赛季已结束':'开始训练';
  $('#train-week').textContent=`第 ${Math.min(viewRound+1,fixtures.length||1)} 轮赛前 · ${done?'本周已安排':'本周可安排一次'}`;
}

/* ---------- 属性页（FM 风格数值） ---------- */
function renderData(){
  const ca=calcCA(G), eff=calcEffCA();
  $('#data-ca').textContent=fmt1(ca);
  $('#data-pot').textContent=G.potential||'?';
  $('#data-eff').textContent=`${fmt1(eff)}（${fitnessPct(G.fitness)}%）`;

  const box=$('#attr-groups'); if(!box) return;
  box.innerHTML=ATTR_GROUPS.map(g=>`
    <div class="attr-group">
      <h4>${g.name}</h4>
      <div class="attr-list">${g.keys.map(k=>`
        <div class="attr-line">
          <span class="attr-label">${ATTR_LABEL[k]}</span>
          <b class="attr-num ${attrClass(G.attr[k])}">${G.attr[k]}</b>
        </div>`).join('')}
      </div>
    </div>`).join('');
}
function attrClass(v){
  if(v<=5) return 'lv-poor';
  if(v<=10) return 'lv-normal';
  if(v<=15) return 'lv-good';
  return 'lv-elite';
}

/* ---------- 生涯页 ---------- */
function renderCareer(){
  const c=$('#career-summary');
  const avg=G.careerStats.ratings.length?
    (G.careerStats.ratings.reduce((a,b)=>a+b,0)/G.careerStats.ratings.length).toFixed(1):'—';
  c.innerHTML=`
    <div class="grid2">
      <div class="stat-card"><div class="num">${G.careerStats.apps}</div><div class="lab">出场</div></div>
      <div class="stat-card"><div class="num">${G.careerStats.goals}</div><div class="lab">进球</div></div>
      <div class="stat-card"><div class="num">${G.careerStats.assists}</div><div class="lab">助攻</div></div>
      <div class="stat-card"><div class="num">${G.trophies.length}</div><div class="lab">冠军</div></div>
      <div class="stat-card"><div class="num">${Math.round(G.rep)}</div><div class="lab">声望</div></div>
      <div class="stat-card"><div class="num">${avg}</div><div class="lab">生涯评分</div></div>
    </div>`;
  const hist=$('#career-history'); hist.innerHTML='';
  if(!G.history.length){ hist.innerHTML='<p class="muted">还没有完成任何赛季。</p>'; }
  else{
    const tbl=document.createElement('table');
    tbl.className='season-table';
    tbl.innerHTML='<tr><th>赛季</th><th>俱乐部</th><th>出场</th><th>球</th><th>助</th><th>评分</th><th>排名</th></tr>';
    G.history.forEach(h=>{
      const tr=document.createElement('tr');
      let stand=h.standing===1?'1（冠军）':h.standing;
      if(h.promoted) stand+=' 升'; if(h.relegated) stand+=' 降';
      tr.innerHTML=`<td>${h.season}</td><td>${h.club}</td><td>${h.apps}</td><td>${h.goals}</td><td>${h.assists}</td><td>${h.avgRating||'—'}</td><td>${stand}</td>`;
      tbl.appendChild(tr);
    });
    hist.appendChild(tbl);
  }
  const tp=$('#trophies-list');
  tp.innerHTML=G.trophies.length?
    G.trophies.map(t=>`<span class="trophy-chip">${t.year} ${t.name}</span>`).join(''):
    '<span class="muted">暂无冠军奖杯。</span>';
}

/* ---------- 成就页 ---------- */
function renderAchv(){
  const box=$('#achv-grid'); box.innerHTML='';
  ACHIEVEMENTS.forEach(a=>{
    const got=!!G.achievements[a.id];
    const d=document.createElement('div');
    d.className='achv-card'+(got?' got':'');
    d.innerHTML=`<div class="achv-name">${a.name}</div><div class="achv-desc">${a.desc}</div>`;
    box.appendChild(d);
  });
  $('#achv-count').textContent=`${ACHIEVEMENTS.filter(a=>G.achievements[a.id]).length} / ${ACHIEVEMENTS.length}`;
}

/* ============================================================
   比赛逐步播放
   ============================================================ */
function startMatchPlayback(m,fx,roundNo,ups,unl){
  matchToken++;
  const token=matchToken;
  matchState={m,fx,roundNo,ups,unl,playing:true};
  $('#match-title').textContent=`第 ${roundNo} 轮 · ${fx.home?'主场':'客场'} vs ${fx.opp}`;
  $('#match-hud').style.display='flex';
  $('#mh-teams').textContent=`${fx.home?clubName(G.clubTier,G.clubIdx):fx.opp} vs ${fx.home?fx.opp:clubName(G.clubTier,G.clubIdx)}`;
  setHud(0,[0,0],m.startRating||6.0);
  const body=$('#match-lines');
  body.scrollTop=0; body.innerHTML='';
  $('#match-layer').classList.add('show');
  $('#btn-match-close').textContent='跳过';
  $('#btn-again').style.display='none';
  runMatchBeats(token).catch(e=>toast('比赛播放出错: '+e.message));
}

function setHud(minute,score,rating){
  if(typeof minute==='number') $('#mh-minute').textContent=minute>=90?'FT':minute+"'";
  if(score) $('#mh-score').textContent=`${score[0]} : ${score[1]}`;
  if(typeof rating==='number') $('#mh-rating').textContent=rating.toFixed(1);
}

function wait(ms){ return new Promise(res=>setTimeout(res,ms)); }

function stage(html){
  const body=$('#match-lines');
  body.innerHTML=html;
  body.scrollTop=0;
}

async function runMatchBeats(token){
  const m=matchState.m;
  if(!m.played){
    stage(`<div class="stage center">
      <div class="loader-text">比赛模拟中<span class="waiting"><i></i><i></i><i></i></span></div>
      <p class="stage-sub">教练正在观察场上局势……</p>
    </div>`);
    await wait(1300);
    if(token!==matchToken) return;
    renderNotPlayed(m);
    finishPlayback();
    return;
  }

  for(const b of m.beats){
    if(token!==matchToken) return;
    if(b.type==='fulltime') continue;
    await renderBeat(b,token);
    if(token!==matchToken) return;
  }
  renderFinal(m);
  finishPlayback();
}

async function renderBeat(b,token){
  if(b.type==='kickoff'){
    stage(`<div class="stage center">
      <div class="scene-text">${b.text}</div>
      <div class="waiting"><i></i><i></i><i></i></div>
    </div>`);
    setHud(0,[0,0],matchState.m.startRating||6.0);
    await wait(750);
  } else if(b.type==='benchOn'){
    setHud(b.minute,[0,0],matchState.m.startRating||6.4);
    stage(`<div class="stage center">
      <div class="minute-tag">${b.minute}'</div>
      <div class="scene-text">${b.text}</div>
      <div class="waiting"><i></i><i></i><i></i></div>
    </div>`);
    await wait(1100);
  } else if(b.type==='scene'){
    setHud(b.minute,null,null);
    stage(`<div class="stage center">
      <div class="minute-tag">${b.minute}'</div>
      <div class="scene-text">${b.text}</div>
      <div class="waiting"><i></i><i></i><i></i></div>
    </div>`);
    await wait(1000);
  } else if(b.type==='halftime'){
    setHud(45,b.score,b.rating);
    stage(`<div class="stage center">
      <div class="half-badge">半场</div>
      <div class="scene-text">${b.text}</div>
      <div class="mini-stats">实时评分 <b>${b.rating.toFixed(1)}</b> · 体能 <b>${Math.round(b.fit)}%</b></div>
    </div>`);
    await wait(1200);
  } else if(b.type==='sub'){
    stage(`<div class="stage center">
      <div class="minute-tag">${b.minute}'</div>
      <div class="scene-text warn-text">${b.text}</div>
    </div>`);
    await wait(1500);
  } else if(b.type==='bg'){
    setHud(b.minute,b.score,matchState.m.rating);
    stage(`<div class="stage center">
      <div class="minute-tag">${b.minute}'</div>
      <div class="scene-text">${b.text}</div>
      <div class="score-chip">${b.score[0]} - ${b.score[1]}</div>
      <div class="waiting"><i></i><i></i><i></i></div>
    </div>`);
    await wait(1100);
  } else if(b.type==='key'){
    setHud(b.minute,null,null);
    stage(`<div class="stage key-stage">
      <div class="key-moment" id="km">
        <div class="km-minute">${b.minute}'</div>
        <div class="km-narr">${b.narrative}</div>
        <div class="km-waiting"><span class="waiting"><i></i><i></i><i></i></span><span>等待结果…</span></div>
        <div class="km-outcome-slot"></div>
      </div>
    </div>`);
    await wait(750);
    if(token!==matchToken) return;

    const km=$('#km');
    const waitRow=km && km.querySelector('.km-waiting');
    if(waitRow) waitRow.remove();
    const cls=b.highlight==='goal'?'goal':b.highlight==='assist'?'assist':b.highlight==='save'?'save':b.highlight==='block'?'block':b.highlight==='bad'?'bad':'good';
    const badge=b.highlight==='goal'?'⚽ 进球':b.highlight==='assist'?'🅰 助攻':b.highlight==='save'?'🧤 扑救':b.highlight==='block'?'🛡 关键防守':b.highlight==='bad'?'':'';
    const slot=km && km.querySelector('.km-outcome-slot');
    if(slot){
      slot.innerHTML=`<div class="km-outcome ${cls}">${badge?`<span class="event-badge">${badge}</span>`:''}<span>${b.outcome}</span></div>`;
    }
    if(km && (b.highlight==='goal'||b.highlight==='assist'||b.highlight==='save')){
      km.classList.add('flash-'+b.highlight);
    }
    setHud(b.minute,b.score,b.rating);
    await wait(b.highlight==='goal'||b.highlight==='assist'?1200:900);
  }
}

function renderNotPlayed(m){
  const fx=matchState.fx;
  const home=fx.home?clubName(G.clubTier,G.clubIdx):fx.opp;
  const away=fx.home?fx.opp:clubName(G.clubTier,G.clubIdx);
  setHud(90,m.score,6.0);
  stage(`<div class="stage center">
    <div class="result-kicker">本场比赛你并未上场</div>
    <div class="final-score">${m.score[0]} : ${m.score[1]}</div>
    <div class="final-teams">${home} <span>vs</span> ${away}</div>
    <div class="result-sub">${m.win?'球队取胜':m.draw?'双方战平':'球队失利'} · 你的评分 <b>6.0</b></div>
    <div class="final-note">未登场不计入场均评分</div>
  </div>`);
}

function renderFinal(m){
  const fx=matchState.fx;
  const home=fx.home?clubName(G.clubTier,G.clubIdx):fx.opp;
  const away=fx.home?fx.opp:clubName(G.clubTier,G.clubIdx);
  const res=m.win?'胜':m.draw?'平':'负';
  const defensive=G.position==='门将'?`<div class="fg-item"><b>${m.saves}</b><span>扑救</span></div>`
    :`<div class="fg-item"><b>${m.tackles}</b><span>关键防守</span></div>`;
  const extra=[
    ...(matchState.ups||[]).map(u=>`赛中成长：${ATTR_LABEL[u.k]}升至 ${u.level} 级`),
    ...(matchState.unl||[]).map(u=>`成就解锁：${u.name}`),
    m.injured>0?`赛后检查：肌肉不适，预计伤停 ${m.injured} 周。`:''
  ];
  setHud(90,m.score,m.rating);
  stage(`<div class="stage center">
    <div class="final-card ${m.win?'win':m.draw?'draw':'loss'}">
      <div class="result-kicker">全场结束 · ${res}${m.motm?' · 全场最佳':''}</div>
      <div class="final-score">${m.score[0]} : ${m.score[1]}</div>
      <div class="final-teams">${home} <span>vs</span> ${away}</div>
      <div class="final-grid">
        <div class="fg-item hot"><b>${m.rating.toFixed(1)}</b><span>评分</span></div>
        <div class="fg-item"><b>${m.minutes}</b><span>分钟</span></div>
        <div class="fg-item"><b>${m.goals}</b><span>进球</span></div>
        <div class="fg-item"><b>${m.assists}</b><span>助攻</span></div>
        <div class="fg-item"><b>${m.keyPasses}</b><span>关键传球</span></div>
        ${defensive}
      </div>
      <div class="final-note">${m.subbed?`第 ${m.subMinute} 分钟被换下`:(m.starter?'打满全场':`第 ${m.onMinute} 分钟替补登场`)} · 赛后体能 ${Math.round(m.fitAfter)}%</div>
      ${extra.length?`<div class="final-extra">${extra.join('<br>')}</div>`:''}
    </div>
  </div>`);
}

function finishPlayback(){
  if(matchState) matchState.playing=false;
  $('#btn-match-close').textContent='继续';
}

function skipMatchPlayback(){
  if(!matchState) return;
  matchToken++;
  const m=matchState.m;
  if(m.played) renderFinal(m); else renderNotPlayed(m);
  finishPlayback();
}

function closeMatchLayer(){
  matchToken++;
  matchState=null;
  $('#match-layer').classList.remove('show');
  $('#match-hud').style.display='none';
  $('#btn-match-close').textContent='继续';
}

/* 赛季结算 / 退役等普通文字层 */
function showMatchLayer(lines,title){
  matchToken++;
  matchState=null;
  $('#match-title').textContent=title||'';
  $('#match-hud').style.display='none';
  const body=$('#match-lines');
  body.innerHTML=lines.map((l,i)=>`<div class="mline" style="animation-delay:${i*0.08}s">${l}</div>`).join('');
  body.scrollTop=0;
  $('#match-layer').classList.add('show');
  $('#btn-match-close').textContent='继续';
}

/* ---------- Toast ---------- */
function toast(msg){
  const t=$('#toast'); t.textContent=msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove('show'),3200);
}
