/* ============================================================
   足球人生 · UI 交互层
   ------------------------------------------------------------
   负责：DOM 绑定、面板开关、渲染、Toast、比赛/赛季流程展示。
   依赖：js/data.js 中的配置、js/engine.js 暴露的全局函数与 G。
   ============================================================ */
'use strict';

/* ================= 足球人生 · UI 交互层 ================= */
const $=s=>document.querySelector(s);
const $$=s=>document.querySelectorAll(s);

let seasonNatDone=false;
let toastTimer=null;
let trainCat='creativity';
let trainInt='normal';

/* 错误兜底：任何报错都弹 toast，避免"点了没反应" */
window.onerror=function(msg,src,line){
  try{ toast('脚本错误: '+msg+' @line '+line); }catch(e){}
};

/* ---------- 初始化 ---------- */
document.addEventListener('DOMContentLoaded',()=>{
  bindCreate();
  bindPanels();
  bindActions();
  $('#btn-match-close').onclick=()=>$('#match-layer').classList.remove('show');
  if(hasSave()){ $('#btn-continue').style.display='block'; }
});

/* ---------- 面板开关 ---------- */
function bindPanels(){
  $$('.tile').forEach(t=>{ t.onclick=()=>openPanel(t.dataset.panel); });
  $$('.panel-close').forEach(b=>{ b.onclick=()=>closePanel(b.dataset.close); });
  $('#btn-achv').onclick=()=>openPanel('ov-achv');
  $$('.overlay').forEach(ov=>{
    ov.addEventListener('click',e=>{ if(e.target===ov) ov.classList.remove('show'); });
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
      const nation=$('#sel-nation').value;
      const ft=parseInt($('#sel-firsttouch').value,10);
      newGame(name,pos,nation,ft);
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
  seasonNatDone=false;
  G.offers=[];
  G.roundTrained=-1;
  G.matchLog=[];
}
function syncSeason(){
  fixtures=genFixture(G);
  viewRound=0;
  seasonNatDone=false;
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
  $('#btn-nat').onclick=()=>{
    if(seasonNatDone){ toast('本赛季国家队任务已结算完毕。'); return; }
    seasonNatDone=true;
    const called=tryNationalCallup();
    if(!called){ toast('国家队教练组暂未征召你。'); renderTop(); return; }
    const res=simNationalSeason();
    G.caps+=res.caps; G.natGoals+=res.goals;
    G.seasonStats.caps=(G.seasonStats.caps||0)+res.caps;
    G.seasonStats.natGoals=(G.seasonStats.natGoals||0)+res.goals;
    G.rep=clamp(G.rep+res.caps*2+res.goals*3,0,100);
    const unl=checkAchievements({natCaps:res.caps,natGoals:res.goals});
    showMatchLayer([
      `你入选了 ${G.nation.n} 国家队！`,
      `国际比赛窗口期，你出战了 ${res.caps} 场比赛`,
      res.goals>0?`为国家队打入 ${res.goals} 球！`:'尚未取得国家队进球，继续努力',
      ...unl.map(u=>`成就解锁：${u.name}`)
    ],'国家队战役');
    saveGame(); renderAll();
  };
  $('#btn-endseason').onclick=()=>endSeason();
  $('#btn-simweek').onclick=()=>{
    if(!G||G.retired) return;
    if(viewRound>=fixtures.length){ endSeason(); return; }
    if(G.roundTrained!==viewRound && G.injuryWeeks<=0 && G.fitness<40){
      toast(doTraining('recovery','normal').msg);
    }
    playMatch(true);
  };
}

/* ---------- 比赛流程 ---------- */
function playMatch(auto){
  if(!G||G.retired) return;
  if(viewRound>=fixtures.length){ toast('本赛季联赛已全部结束，点击"结束赛季"。'); return; }
  if(G.injuryWeeks>0){
    G.injuryWeeks--;
    G.fitness=clamp(G.fitness+WEEKLY_RECOVERY,0,100);
    toast(`伤病恢复中…还需 ${G.injuryWeeks} 周。你缺席了本轮比赛，本周体能恢复 +${WEEKLY_RECOVERY}。`);
    viewRound++;
    G.roundTrained=-1;
    renderAll(); saveGame();
    return;
  }
  const fx=fixtures[viewRound];
  const roundNo=viewRound+1;
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
  G.fitness=clamp(m.fitAfter+WEEKLY_RECOVERY,0,100);
  if(m.injured>0){
    G.injuryWeeks=m.injured;
    G.morale=clamp(G.morale-12,0,100);
  }
  G.matchLog.push({
    round:roundNo, opp:fx.opp, home:fx.home,
    score:[m.score[0],m.score[1]], rating:m.rating,
    goals:m.goals, assists:m.assists, minutes:m.minutes,
    subbed:m.subbed, motm:m.motm
  });
  if(G.matchLog.length>12) G.matchLog.shift();
  G.roundTrained=-1;
  updateValue(G);
  const unl=checkAchievements({match:m});
  const lines=[
    `${fx.home?'主场':'客场'} · ${fx.home?clubName(G.clubTier,G.clubIdx)+' vs '+fx.opp:fx.opp+' vs '+clubName(G.clubTier,G.clubIdx)}`,
    `赛前体能 ${Math.round(m.fitBefore)} · 有效能力 ${fmt1(m.effCA)} / 综合 ${fmt1(m.rawCA)}`,
    ...m.events,
    `赛后体能 ${Math.round(m.fitAfter)} → 周恢复 +${WEEKLY_RECOVERY} → ${Math.round(G.fitness)}`,
    ...ups.map(u=>`赛中成长：${ATTR_LABEL[u.k]}升至 ${u.level} 级`),
    ...unl.map(u=>`成就解锁：${u.name}`)
  ].filter(Boolean);
  saveGame();
  if(auto){ renderAll(); }
  else showMatchLayer(lines,`第 ${roundNo} 轮`);
  renderAll();
}

/* ---------- 结束赛季 ---------- */
function endSeason(){
  if(!G||G.retired) return;
  if(viewRound<fixtures.length){
    while(viewRound<fixtures.length){
      const fx=fixtures[viewRound]; viewRound++;
      const m=simMatch(G,fx.opp,fx.home);
      if(m.played){
        G.seasonStats.apps++;
        G.seasonStats.goals+=m.goals;
        G.seasonStats.assists+=m.assists;
        G.seasonStats.ratings.push(m.rating);
        if(m.motm) G.seasonStats.motm=(G.seasonStats.motm||0)+1;
        if(m.injured>0) G.injuryWeeks=m.injured;
      }
    }
  }
  const res=advanceSeason();
  const unl=checkAchievements({season:true, trophy:res.summary.standing===1, promoted:res.summary.promoted});
  const s=res.summary;
  const lines=[
    `${s.club} · ${tierName(s.tier)} 赛季结算`,
    `出场 ${s.apps} · 进球 ${s.goals} · 助攻 ${s.assists} · 场均评分 ${s.avgRating}`,
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
    `国家队 ${G.caps} 场 ${G.natGoals} 球 · 冠军 ${G.trophies.length} 个`,
    `生涯场均评分 ${avg}`,
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
  $('#achv-badge').textContent=Object.keys(G.achievements||{}).length;
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
  let trainMain='可训练';
  if(G.retired) trainMain='已退役';
  else if(G.injuryWeeks>0) trainMain='养伤中';
  else if(done) trainMain='已训练';
  else if(over) trainMain='赛季结束';
  $('#tile-train-main').textContent=trainMain;
  const cat=TRAIN_CATS.find(c=>c.id===trainCat)||TRAIN_CATS[0];
  const it=INTENSITIES.find(i=>i.id===trainInt)||INTENSITIES[1];
  $('#tile-train-sub').textContent=`${cat.name} · ${it.name}`;
  $('#tile-train-foot').textContent=`体能 ${Math.round(G.fitness)}% · 赛后恢复 +${WEEKLY_RECOVERY}`;
  $('#tile-train-foot').className='t-foot'+(G.fitness<45?' warn':'');

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
    hint=`下一场：${fx.home?'主场迎战':'客场挑战'} <b>${fx.opp}</b> · 体能 ${Math.round(G.fitness)}%`;
    if(G.injuryWeeks>0) hint+=`<br><span class="warn">伤病中，还需恢复 ${G.injuryWeeks} 周，只能进行恢复训练。</span>`;
    else if(G.fitness<45) hint+=`<br><span class="warn">体能偏低，建议先恢复或选择轻度训练。</span>`;
    else if(done) hint+='<br>本周训练已完成，可以出战。';
    else hint+='<br>本周可安排一次训练。';
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
  $('#v-seasoncaps').textContent=s.caps||0;
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
    tr.innerHTML=`<td>${h.round}</td><td>${h.home?'主':'客'} ${h.opp}</td>
      <td>${h.score[0]}-${h.score[1]}</td><td>${h.minutes||0}</td>
      <td>${h.goals}/${h.assists}</td><td>${h.rating}</td>`;
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
    <button class="cat-btn${c.id===trainCat?' active':''}${c.id==='recovery'?' wide':''}" data-cat="${c.id}">
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
  if(cat.id==='recovery'){
    const cut=it.id==='light'?0:it.id==='normal'?1:2;
    const inj=G.injuryWeeks>0&&cut>0?` 伤情恢复加快 ${cut} 周。`:'';
    box.innerHTML=`<b>恢复训练</b>：体能 <b class="good">+${recRestore(it)}</b>（${Math.round(G.fitness)} → ${Math.min(100,Math.round(G.fitness+recRestore(it)))}），状态小幅回升。${inj}<br>
      不消耗体能，是低体能时的唯一选择。`;
  } else {
    const cost=Math.round(cat.cost*it.costMul);
    const stars=w=>w>=0.9?'★★★':w>=0.35?'★★':'★';
    const list=Object.keys(cat.effects).map(k=>`${ATTR_LABEL[k]} ${stars(cat.effects[k])}`).join(' · ');
    const after=clamp(G.fitness-cost,0,100);
    const gainWord=it.xpMul>=2?'大幅':it.xpMul>=1?'正常':'小幅';
    box.innerHTML=`<b>${cat.name}</b>：体能 <b>-${cost}</b>（${Math.round(G.fitness)} → ${Math.round(after)}）<br>
      属性经验：${list}<br>
      训练收益：<b>${gainWord}</b> · 训练后有效能力约 <b>${fitnessPct(after)}%</b>
      ${G.fitness<cost?'<br><span class="warn">体能不足，无法完成本次训练。</span>':''}`;
  }

  const done=G.roundTrained===viewRound;
  const over=viewRound>=fixtures.length;
  const btn=$('#btn-train');
  btn.disabled=done||over||G.retired;
  btn.textContent=G.retired?'已退役':done?'本周已训练':over?'本赛季已结束':'开始训练';
  $('#train-week').textContent=`第 ${Math.min(viewRound+1,fixtures.length||1)} 轮赛前 · ${done?'本周已安排':'本周可安排一次'}`;
  const rec=$('#train-rec'); if(rec) rec.textContent='+'+WEEKLY_RECOVERY;
}

/* ---------- 数据页（雷达图） ---------- */
function renderData(){
  const a=G.attr;
  drawRadar([a.pace,a.attack,a.technique,a.defense,a.physical,a.stamina],
            ['速度','把握机会','创造力','防守','身体','体能']);
  const ca=calcCA(G), eff=calcEffCA();
  $('#data-ca').textContent=fmt1(ca);
  $('#data-pot').textContent=G.potential?G.potential+' 级':'?';
  const pct=fitnessPct(G.fitness);
  $('#data-eff').innerHTML=`当前体能 ${Math.round(G.fitness)}% → 比赛有效能力 <b>${fmt1(eff)}</b>（发挥 ${pct}%）<br>
    体能越低，速度、创造力、把握机会等属性在比赛中能发挥出的水平越低，评分和进球都会受影响。`;

  const det=$('#attr-detail'); det.innerHTML='';
  ATTRS.forEach(k=>{
    const lv=a[k];
    const prog=lv>=20?1:clamp((G.xp[k]||0)/xpNeed(lv),0,1);
    const width=clamp((lv+prog)/20*100,0,100);
    const row=document.createElement('div');
    row.className='attr-row';
    row.innerHTML=`<span class="attr-name">${ATTR_LABEL[k]}</span>
      <div class="attr-bar"><div class="attr-fill" style="width:${width}%;background:${attrColor(lv)}"></div></div>
      <span class="attr-val">${lv}<small>/20</small></span>`;
    det.appendChild(row);
  });
}
function attrColor(v){ return v>=17?'#e63946':v>=14?'#f77f00':v>=10?'#2a9d8f':'#6c757d'; }

function drawRadar(vals,labels){
  const c=$('#radar'); if(!c) return;
  const dpr=window.devicePixelRatio||1;
  const ctx=c.getContext('2d');
  c.width=300*dpr; c.height=260*dpr;
  c.style.width='300px'; c.style.height='260px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const w=300,h=260,cx=w/2,cy=h/2+6,R=92;
  const n=vals.length;
  ctx.clearRect(0,0,w,h);
  ctx.strokeStyle='#ddd';
  for(let ring=1;ring<=4;ring++){
    ctx.beginPath();
    for(let i=0;i<=n;i++){
      const ang=Math.PI*2*i/n-Math.PI/2;
      const x=cx+Math.cos(ang)*R*ring/4, y=cy+Math.sin(ang)*R*ring/4;
      i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
    }
    ctx.stroke();
  }
  ctx.fillStyle='#888'; ctx.font='12px sans-serif'; ctx.textAlign='center';
  for(let i=0;i<n;i++){
    const ang=Math.PI*2*i/n-Math.PI/2;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+Math.cos(ang)*R,cy+Math.sin(ang)*R); ctx.stroke();
    ctx.fillText(labels[i],cx+Math.cos(ang)*(R+22),cy+Math.sin(ang)*(R+16)+4);
  }
  ctx.beginPath();
  for(let i=0;i<=n;i++){
    const ang=Math.PI*2*(i%n)/n-Math.PI/2;
    const r=R*clamp(vals[i%n],0,20)/20;
    const x=cx+Math.cos(ang)*r,y=cy+Math.sin(ang)*r;
    i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
  }
  ctx.closePath();
  ctx.fillStyle='rgba(42,157,143,.35)'; ctx.fill();
  ctx.strokeStyle='#2a9d8f'; ctx.lineWidth=2; ctx.stroke();
  ctx.fillStyle='#2a9d8f';
  for(let i=0;i<n;i++){
    const ang=Math.PI*2*i/n-Math.PI/2;
    const r=R*clamp(vals[i],0,20)/20;
    ctx.beginPath(); ctx.arc(cx+Math.cos(ang)*r,cy+Math.sin(ang)*r,3,0,7); ctx.fill();
  }
}

/* ---------- 生涯页 ---------- */
function renderCareer(){
  const c=$('#career-summary');
  c.innerHTML=`
    <div class="grid2">
      <div class="stat-card"><div class="num">${G.careerStats.apps}</div><div class="lab">出场</div></div>
      <div class="stat-card"><div class="num">${G.careerStats.goals}</div><div class="lab">进球</div></div>
      <div class="stat-card"><div class="num">${G.careerStats.assists}</div><div class="lab">助攻</div></div>
      <div class="stat-card"><div class="num">${G.trophies.length}</div><div class="lab">冠军</div></div>
      <div class="stat-card"><div class="num">${G.caps}</div><div class="lab">国家队出场</div></div>
      <div class="stat-card"><div class="num">${G.natGoals}</div><div class="lab">国家队进球</div></div>
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
      tr.innerHTML=`<td>${h.season}</td><td>${h.club}</td><td>${h.apps}</td><td>${h.goals}</td><td>${h.assists}</td><td>${h.avgRating}</td><td>${stand}</td>`;
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
  $('#achv-count').textContent=`${Object.keys(G.achievements).length} / ${ACHIEVEMENTS.length}`;
}

/* ---------- 比赛实况层 ---------- */
function showMatchLayer(lines,title){
  $('#match-title').textContent=title||'';
  $('#match-lines').innerHTML=lines.map((l,i)=>`<div class="mline" style="animation-delay:${i*0.12}s">${l}</div>`).join('');
  $('#match-layer').classList.add('show');
}

/* ---------- Toast ---------- */
function toast(msg){
  const t=$('#toast'); t.textContent=msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove('show'),3200);
}
