/* ============================================================
   足球人生 · UI 交互层
   ------------------------------------------------------------
   负责：DOM 绑定、面板开关、渲染、Toast、比赛逐步播放、存档槽。
   依赖：js/data.js 中的配置、js/engine.js 暴露的全局函数与 G。
   ============================================================ */
'use strict';

const $=s=>document.querySelector(s);
const $$=s=>document.querySelectorAll(s);

let toastTimer=null;
let trainCat='finish';
let trainDays=3;          /* 本周训练天数选择 0~6 */
let slotMode='load';      /* 存档槽面板模式：load=读取 / replace=替换或放弃 */

/* 当前位置的训练模块列表；并确保选中的模块对该位置有效 */
function posTrainCats(){
  const list=(G&&TRAIN_CATS[G.position])||TRAIN_CATS['中场'];
  if(!list.some(c=>c.id===trainCat)) trainCat=list[0].id;
  return list;
}

/* 比赛播放状态 */
let matchToken=0;
let matchState=null;

/* 错误兜底：任何报错都弹 toast，避免"点了没反应" */
window.onerror=function(msg,src,line){
  try{ toast('脚本错误: '+msg+' @line '+line); }catch(e){}
};

/* ---------- 初始化 ---------- */
document.addEventListener('DOMContentLoaded',()=>{
  importLegacySave();
  bindCreate();
  bindPanels();
  bindActions();
  bindSlots();
  $('#btn-match-close').onclick=()=>{
    if(matchState && matchState.playing) skipMatchPlayback();
    else closeMatchLayer();
  };
  rebuildDutyOptions();
  refreshMenuButtons();
  /* 退出（关闭/刷新）时自动保存当前存档槽 */
  window.addEventListener('beforeunload',()=>{
    if(G && G.saveSlot!=null) saveGame(G.saveSlot);
  });
});

/* ---------- 面板开关 ---------- */
function bindPanels(){
  $$('.tile[data-panel]').forEach(t=>{ t.onclick=()=>openPanel(t.dataset.panel); });
  $$('.panel-close').forEach(b=>{ b.onclick=()=>closePanel(b.dataset.close); });
  $('#btn-achv').onclick=()=>openPanel('ov-achv');
  /* 数据 ⇄ 生涯 面板互跳 */
  const toCareer=$('#btn-to-career');
  if(toCareer) toCareer.onclick=()=>{ closePanel('ov-data'); openPanel('ov-career'); };
  const toData=$('#btn-to-data');
  if(toData) toData.onclick=()=>{ closePanel('ov-career'); openPanel('ov-data'); };
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
  $('#sel-pos').onchange=()=>rebuildDutyOptions();
  $('#btn-start').onclick=()=>{
    try{
      const name=$('#inp-name').value.trim();
      const pos=$('#sel-pos').value;
      const ft=parseInt($('#sel-firsttouch').value,10)||0;
      newGame(name,pos,ft);
      const ca=calcCA(G);
      G.potential=clamp(Math.round(ca)+ri(6,11)+(rnd()<0.12?3:0),10,20);
      trainDays=G.trainDays||3;
      startSeason();
      switchScreen('main');
      renderAll();
      /* 存档：优先空栏位；已满则提示替换或放弃 */
      const slot=emptySlot();
      if(slot!=null){
        G.saveSlot=slot; saveGame(slot);
        toast(`欢迎来到职业足坛，${G.name}！已存入栏位 ${slot}。`);
      }else{
        toast('存档栏位已满，请选择一个栏位替换，或放弃本次存档。');
        openSlotLayer('replace');
      }
      refreshMenuButtons();
    }catch(e){ toast('创建失败: '+e.message); }
  };
  $('#btn-load').onclick=()=>openSlotLayer('load');
  $('#btn-menu').onclick=returnToMenu;
}

/* 足球起点：随位置切换为对应职责（只显示职责名称） */
function rebuildDutyOptions(){
  const sel=$('#sel-firsttouch'); if(!sel) return;
  const pos=($('#sel-pos')&&$('#sel-pos').value)||'前锋';
  const list=FIRST_TOUCH_BY_POS[pos]||FIRST_TOUCH_BY_POS['前锋'];
  const prev=parseInt(sel.value,10);
  sel.innerHTML=list.map((d,i)=>`<option value="${i}">${d.t}</option>`).join('');
  sel.value=(isNaN(prev)||prev>=list.length)?0:prev;
}

/* ---------- 存档槽 ---------- */
function bindSlots(){
  $('#slot-discard').onclick=()=>{
    if(G) G.saveSlot=null;
    $('#slot-layer').classList.remove('show');
    toast('已放弃本次存档，本局进度不会被保存。');
  };
}
function refreshMenuButtons(){
  const b=$('#btn-load'); if(b) b.style.display=hasSave()?'block':'none';
}
function openSlotLayer(mode){
  slotMode=mode||'load';
  $('#slot-title').textContent=slotMode==='replace'?'存档已满 · 选择栏位':'读取存档';
  $('#slot-discard').style.display=slotMode==='replace'?'block':'none';
  renderSlotList();
  $('#slot-layer').classList.add('show');
}
function renderSlotList(){
  const box=$('#slot-list'); if(!box) return;
  const slots=listSlots();
  box.innerHTML=slots.map(s=>{
    if(s.empty){
      return `<div class="slot-card empty" data-idx="${s.idx}">
        <span class="slot-no">栏位 ${s.idx}</span>
        <div class="slot-info"><div class="slot-name">空</div></div>
        <span class="slot-act">${slotMode==='replace'?'存入':'—'}</span>
      </div>`;
    }
    const act=slotMode==='replace'?'替换':'读取';
    const when=s.savedAt?new Date(s.savedAt).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
    return `<div class="slot-card" data-idx="${s.idx}">
      <span class="slot-no">栏位 ${s.idx}</span>
      <div class="slot-info">
        <div class="slot-name">${s.name} <span class="tag t${s.tier||3}">${s.position}</span></div>
        <div class="slot-sub">第 ${s.season} 赛季 · ${s.age} 岁 · ${s.club}${s.retired?' · 已退役':''}${when?' · '+when:''}</div>
      </div>
      <span class="slot-act">${act}</span>
    </div>`;
  }).join('');
  box.querySelectorAll('.slot-card').forEach(el=>{
    el.onclick=()=>onSlotPick(parseInt(el.dataset.idx,10));
  });
}
function onSlotPick(idx){
  if(slotMode==='load'){
    if(!loadGame(idx)){ toast('该栏位没有存档。'); return; }
    trainDays=G.trainDays||3;
    syncSeason();
    switchScreen('main');
    renderAll();
    /* 存档里若留有未处理的赛季命运/合同报价，读档后补显 */
    if(Array.isArray(G.offers)&&G.offers.length) setTimeout(()=>showOffers(),300);
    toast(`已读取栏位 ${idx}：${G.name}，第 ${G.season} 赛季。`);
  }else{
    /* 替换：把当前进度写入该栏位 */
    if(!G){ toast('当前没有进行中的存档。'); return; }
    saveGame(idx);
    $('#slot-layer').classList.remove('show');
    toast(`已保存到栏位 ${idx}。`);
  }
  refreshMenuButtons();
}

/* 退回开始菜单（自动保存） */
function returnToMenu(){
  if(G && G.saveSlot!=null){
    saveGame(G.saveSlot);
    toast('已保存并返回主菜单。');
  }else{
    toast('已返回主菜单（当前进度未保存）。');
  }
  $$('.overlay').forEach(o=>o.classList.remove('show'));
  refreshMenuButtons();
  switchScreen('create');
}

function startSeason(){
  fixtures=genFixture(G);
  viewRound=0;
  G.offers=[];
  G.roundTrained=-1;
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
  $('#day-row').addEventListener('click',e=>{
    const b=e.target.closest('.int-btn'); if(!b) return;
    trainDays=parseInt(b.dataset.days,10)||0;
    renderTrainUI();
  });

  $('#btn-train').onclick=()=>{
    const res=doTraining(trainCat,trainDays);
    toast(res.msg);
    if(res.ok) trainDays=G.trainDays;
    renderAll(); saveGame();
  };
  $('#btn-match').onclick=()=>playMatch(false);
  $('#btn-endseason').onclick=()=>endSeason();

  /* 模拟下一场：未训练则按当前天数选择自动训练 */
  $('#btn-simweek').onclick=()=>{
    if(!G||G.retired) return;
    if(viewRound>=fixtures.length){ endSeason(); return; }
    let note='';
    if(G.roundTrained!==viewRound){
      const catId=autoTrainCategory();
      const cat=posTrainCats().find(c=>c.id===catId);
      const r=doTraining(catId,trainDays);
      if(r.ok && cat) note=`自动${cat.name} · ${trainDays}天`;
    }
    playMatch(true,note);
  };
}

/* ---------- 比赛流程 ---------- */
function playMatch(auto,note){
  if(!G||G.retired) return;
  if(viewRound>=fixtures.length){ toast('本赛季联赛已全部结束，点击"赛季收官"。'); return; }
  const fx=fixtures[viewRound];
  const roundNo=viewRound+1;
  const daysTrained=(G.roundTrained===viewRound)?(G.trainDays||0):0;

  prepareMatchFitness();
  const m=simMatch(G,fx.opp,fx.home);
  viewRound++;

  const ups=applyWeekResult(m,daysTrained);
  G.matchLog.push({
    round:roundNo, opp:fx.opp, home:fx.home,
    score:[m.score[0],m.score[1]], rating:m.rating,
    goals:m.goals, assists:m.assists, minutes:m.minutes,
    subbed:m.subbed, motm:m.motm, played:m.played
  });
  if(G.matchLog.length>12) G.matchLog.shift();
  updateValue(G);
  const unl=checkAchievements({match:m});
  saveGame();

  if(auto){
    renderAll();
    const res=m.win?'胜':m.draw?'平':'负';
    toast(`模拟完成：${m.score[0]}-${m.score[1]} ${res} ${fx.opp} · ${m.played?`评分 ${m.rating.toFixed(1)}`:'未登场'}${note?' · '+note:''}`);
    return;
  }

  startMatchPlayback(m,fx,roundNo,ups,unl);
  renderAll();
}

/* ---------- 结束赛季 ---------- */
function endSeason(){
  if(!G||G.retired) return;
  while(viewRound<fixtures.length){
    const daysTrained=(G.roundTrained===viewRound)?(G.trainDays||0):0;
    if(daysTrained<=0) doTraining(autoTrainCategory(),trainDays);
    prepareMatchFitness();
    const fx=fixtures[viewRound];
    const m=simMatch(G,fx.opp,fx.home);
    const days=(G.roundTrained===viewRound)?(G.trainDays||0):0;
    applyWeekResult(m,days);
    viewRound++;
  }
  const res=advanceSeason();
  const unl=checkAchievements({season:true, trophy:res.summary.standing===1, promoted:res.summary.promoted});
  const s=res.summary;
  const lines=[
    `${s.club} · ${tierName(s.tier)} 赛季结算`,
    `出场 ${s.apps} · 进球 ${s.goals} · 助攻 ${s.assists} · 场均评分 ${s.avgRating||'—'}`,
    s.loanReturn?`租借期满，回归 ${s.parentClub}`:
      s.standing===1?`联赛冠军！`:
      s.standing<=3?`联赛第 ${s.standing} 名，获得奖牌`:
      s.relegated?`联赛第 ${s.standing} 名，不幸降级…`:
      `联赛第 ${s.standing} 名`,
    s.promoted?`球队升级成功！`:'',
    s.fateEvent==='upgrade'?`你的表现打动了高一级俱乐部，收到了求购报价！`:'',
    s.fateEvent==='sell'?`球队决定出售 / 租借你，收到了报价！`:'',
    `新赛季你的年龄：${s.age} 岁`,
    ...unl.map(u=>`成就解锁：${u.name}`)
  ].filter(Boolean);
  if(res.retired){
    showRetire(lines);
  } else {
    /* startSeason 会清空 offers —— 先暂存命运/合同报价，开局后再放回 */
    const pendingOffers=G.offers||[];
    startSeason();
    G.offers=pendingOffers;
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

/* ---------- 转会 / 求购 / 出售·租借 报价 ---------- */
const OFFER_INFO={
  contract:{kicker:'合同到期 · 转会邀请', accept:'接受报价', stay:'留队'},
  upgrade :{kicker:'高一级俱乐部求购',     accept:'转会加盟', stay:'拒绝 · 留队'},
  sell    :{kicker:'球队挂牌出售',         accept:'同意转会', stay:'拒绝 · 留队'},
  loan    :{kicker:'球队安排租借',         accept:'同意租借', stay:'拒绝 · 留队'}
};
function showOffers(){
  const box=$('#offers-box'); box.innerHTML='';
  G.offers.forEach((o,i)=>{
    const info=OFFER_INFO[o.kind||'contract']||OFFER_INFO.contract;
    const d=document.createElement('div');
    d.className='offer-card';
    const row=o.kind==='loan'
      ? `<div class="offer-row">租借 ${o.years} 年 · 周薪 €${o.salary}万</div>`
      : `<div class="offer-row">${o.fee>0?`转会费 €${o.fee}万 · `:''}周薪 €${o.salary}万 · ${o.years} 年合同</div>`;
    d.innerHTML=`<div class="offer-kicker">${info.kicker}</div>
      <div class="offer-club">${o.club} <span class="tag t${o.tier}">${tierName(o.tier)}</span></div>
      ${row}`;
    const b=document.createElement('button');
    b.className='btn small'; b.style.cssText='background:var(--green);color:#fff';
    b.textContent=info.accept;
    b.onclick=()=>{
      acceptOffer(i);
      $('#offer-layer').classList.remove('show');
      toast(o.kind==='loan'?`你租借加盟 ${o.club}！`:`你转会至 ${o.club}！`);
      syncSeason();               /* 更换俱乐部 → 按新联赛重排赛程 */
      renderAll(); saveGame();
    };
    const stay=document.createElement('button');
    stay.className='btn small'; stay.style.cssText='background:#e5e7eb;color:#333';
    stay.textContent=info.stay;
    stay.onclick=()=>{
      G.offers=[]; G.contractYears=Math.max(G.contractYears,1);
      $('#offer-layer').classList.remove('show');
      toast('你选择留守球队。');
      renderAll(); saveGame();
    };
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
  const reserve=88;
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
  $('#v-ca').textContent=starsText(caStars(calcCA(G)));
  $('#v-value').textContent='€'+G.marketValue+'万';
  const rep=$('#v-rep');
  rep.textContent=repLabel(G.rep);
  rep.className=repClass(G.rep);
  $('#v-season').textContent=`第 ${G.season} 赛季 · 第 ${Math.min(viewRound+1,fixtures.length||1)} / ${fixtures.length||34} 轮`;
  $('#v-fit').textContent=Math.round(G.fitness)+'%';
  $('#v-form').textContent=Math.round(G.form*100)+'%';
  $('#bar-fitness>i').style.width=G.fitness+'%';
  $('#bar-form>i').style.width=(G.form*100)+'%';
  $('#achv-badge').textContent=ACHIEVEMENTS.filter(a=>G.achievements&&G.achievements[a.id]).length;
  $('#btn-match').disabled = G.retired || viewRound>=fixtures.length;
  $('#btn-match').textContent = G.retired?'已退役':viewRound>=fixtures.length?'联赛结束':`出战 · 第${viewRound+1}轮`;
}

/* 主界面四宫格 */
function renderTiles(){
  if(!G) return;
  const ca=calcCA(G);
  $('#tile-ca').textContent=starsText(caStars(ca));
  $('#tile-attr-sub').textContent=`潜力 ${starsText(caStars(G.potential))} · 体能 ${Math.round(G.fitness)}%`;

  const done=G.roundTrained===viewRound;
  const over=viewRound>=fixtures.length;
  let trainMain='可训练';
  if(G.retired) trainMain='已退役';
  else if(done) trainMain='已训练';
  else if(over) trainMain='赛季结束';
  $('#tile-train-main').textContent=trainMain;
  const cat=posTrainCats().find(c=>c.id===trainCat)||posTrainCats()[0];
  $('#tile-train-sub').textContent=`${cat.name} · ${done?(G.trainDays||0):trainDays} 天`;
  $('#tile-train-foot').textContent=`体能 ${Math.round(G.fitness)}% · 状态 ${Math.round(G.form*100)}%`;
  $('#tile-train-foot').className='t-foot';

  /* 出场提示：下一场预期定位 + 预期上场时间 */
  const plan=appearancePlan(G);
  if(G.retired || over){
    $('#tile-role').textContent='赛季结束';
    $('#tile-minutes').textContent='等待赛季结算';
    $('#tile-play-foot').textContent='—';
  }else{
    $('#tile-role').textContent=plan.role;
    $('#tile-minutes').textContent=`预期上场 ${plan.expectMinutes} 分钟`;
    $('#tile-play-foot').textContent=`综合 ${starsText(plan.st)} · 近期均评 ${(G.perfAvg>0)?G.perfAvg.toFixed(1):'—'}`;
  }

  /* 数据 · 生涯合并方格（上下两段） */
  const s=G.seasonStats;
  const avg=s.ratings.length?Math.round(s.ratings.reduce((a,b)=>a+b,0)/s.ratings.length*10)/10:0;
  $('#m-data').textContent=`${s.apps}场 · ${s.goals}球 · ${s.assists}助 · 均评 ${avg?avg.toFixed(1):'—'}`;
  $('#m-career').innerHTML=`第 ${G.season} 赛季 · ${G.age} 岁 · 冠军 ${G.trophies.length} · 声望 <b class="${repClass(G.rep)}">${repLabel(G.rep)}</b>`;

  let hint='';
  if(G.retired){ hint='生涯已结束，可在生涯面板回顾荣誉。'; }
  else if(viewRound<fixtures.length){
    const fx=fixtures[viewRound];
    hint=`下一场：${fx.home?'主场迎战':'客场挑战'} <b>${fx.opp}</b>`;
  }else{
    hint='本赛季联赛已结束，点击“赛季收官”进行结算。';
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

/* ---------- 训练面板（天数制 0~6） ---------- */
function renderTrainUI(){
  if(!G) return;
  const catsBox=$('#train-cats'); if(!catsBox) return;
  const cats=posTrainCats();
  catsBox.innerHTML=cats.map(c=>`
    <button class="cat-btn${c.id===trainCat?' active':''}" data-cat="${c.id}">
      <span class="cat-name">${c.name}</span>
    </button>`).join('');

  const dayRow=$('#day-row');
  dayRow.innerHTML=Array.from({length:WEEK_DAYS+1},(_,d)=>`
    <button class="int-btn${d===trainDays?' active':''}" data-days="${d}">
      ${d}<span class="im">${d===0?'全休':'练'+d+'休'+(WEEK_DAYS-d)}</span>
    </button>`).join('');

  const cat=cats.find(c=>c.id===trainCat)||cats[0];
  const days=trainDays;
  const restDays=WEEK_DAYS-days;
  const cost=Math.round(cat.cost*TRAIN_COST_PER_DAY_MUL*days);
  const recover=FIT_RECOVER_PER_DAY*restDays;
  const after=clamp(G.fitness+recover-cost,0,100);
  const mul=dayXpMul(days);
  const keys=ATTRS_BY_POS[G.position]||[];
  const focus=(TRAIN_FOCUS[cat.id]||[]).filter(k=>keys.indexOf(k)>=0);
  const focusTxt=focus.length?focus.map(k=>ATTR_LABEL[k]+'++').join('  '):'全属性+';
  const box=$('#train-preview');
  box.innerHTML=`<b>（${cat.name}）</b>${focusTxt}<br>
    训练 ${days} 天 / 休息 ${restDays} 天 · 体能 ${Math.round(G.fitness)} → <b>${Math.round(after)}</b> · 成长 ×${days>0?`<b>${fmt1(mul)}</b>`:'0'} · 学习 ×<b>${fmt1(learnMul(G))}</b> · 状态 +${Math.round(FORM_TRAIN_DAY*days*100)}%
    ${after<30?'<br><span class="warn">赛后体能偏低，比赛发挥会受影响。</span>':''}`;

  const done=G.roundTrained===viewRound;
  const over=viewRound>=fixtures.length;
  const btn=$('#btn-train');
  btn.disabled=done||over||G.retired;
  btn.textContent=G.retired?'已退役':done?'本周已安排':over?'本赛季已结束':'开始训练';
  $('#train-week').textContent=`第 ${Math.min(viewRound+1,fixtures.length||1)} 轮赛前 · ${done?'本周已安排':'本周可安排一次'}`;
}

/* ---------- 属性页：综合评价用星级，具体属性用 FM 的 1~20 ---------- */
function renderData(){
  const ca=calcCA(G);
  $('#data-ca').textContent=starsText(caStars(ca));
  $('#data-pot').textContent=starsText(caStars(G.potential));
  $('#data-fit').textContent=Math.round(G.fitness)+'%';
  $('#data-form').textContent=Math.round(G.form*100)+'%';

  const box=$('#attr-groups'); if(!box) return;
  const groups=ATTR_GROUPS_BY_POS[G.position]||ATTR_GROUPS_BY_POS['中场'];
  box.innerHTML=groups.map(g=>`
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
/* 1~20 数值的 FM 色阶 */
function attrClass(v){
  if(v<=5) return 'lv-poor';
  if(v<=10) return 'lv-normal';
  if(v<=15) return 'lv-good';
  return 'lv-elite';
}

/* ---------- 生涯页（每场同步更新） ---------- */
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
      let stand=h.loanReturn?'租借':
        h.standing===1?'1（冠军）':
        (typeof h.standing==='number'?h.standing:'—');
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
    const badge=b.highlight==='goal'?'进球':b.highlight==='assist'?'助攻':b.highlight==='save'?'扑救':b.highlight==='block'?'关键防守':b.highlight==='bad'?'':'';
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
    ...(matchState.ups||[]).map(u=>`通用成长：${ATTR_LABEL[u.k]}升至 ${u.level} 级`),
    ...(matchState.unl||[]).map(u=>`成就解锁：${u.name}`)
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
      <div class="final-note">${m.subbed?`第 ${m.subMinute} 分钟被换下`:(m.starter?'打满全场':`第 ${m.onMinute} 分钟替补登场`)} · 赛后体能 ${Math.round(m.fitAfter)}% · 状态 ${Math.round(G.form*100)}%</div>
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
