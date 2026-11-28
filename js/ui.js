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
  else if(id==='ov-status') renderStatusPanel();
}
function closePanel(id){ const el=$('#'+id); if(el) el.classList.remove('show'); }

/* ============================================================
   角色创建向导：封面（姓名）→ 位置 → 出身 → 特点 → 确认生成
   ============================================================ */
const wiz={step:0,pos:null,origin:null,trait:null};
const WIZ_PAGES=['wp-pos','wp-origin','wp-trait','wp-confirm'];
const STEP_LABELS=['选择位置','选择出身','选择特点','确认生成'];

function bindCreate(){
  $('#btn-randname').onclick=()=>{
    $('#inp-name').value=pick(FIRST_NAMES)+pick(GIVEN_NAMES);
  };
  $('#btn-start').onclick=()=>{
    $('#inp-name').value='';
    wiz.step=0; wiz.pos=null; wiz.origin=null; wiz.trait=null;
    switchScreen('create-wizard');
    renderWizard();
  };
  $('#btn-load').onclick=()=>openSlotLayer('load');
  $('#btn-menu').onclick=returnToMenu;

  /* 位置节点 */
  $$('.pos-node').forEach(b=>{
    b.onclick=()=>{
      wiz.pos=b.dataset.pos;
      $$('.pos-node').forEach(x=>x.classList.toggle('active',x===b));
      renderWizard();
    };
  });
  /* 出身 / 特点列表 */
  $('#origin-list').addEventListener('click',e=>{
    const b=e.target.closest('.opt-box'); if(!b) return;
    wiz.origin=b.dataset.id;
    renderWizard();
  });
  $('#trait-list').addEventListener('click',e=>{
    const b=e.target.closest('.opt-box'); if(!b) return;
    wiz.trait=b.dataset.id;
    renderWizard();
  });
  /* 导航 */
  $('#wiz-back').onclick=()=>{
    if(wiz.step===0){ switchScreen('create'); return; }
    wiz.step--; renderWizard();
  };
  $('#wiz-next').onclick=()=>{
    if(!wizNextEnabled()) return;
    if(wiz.step<WIZ_PAGES.length-1){ wiz.step++; renderWizard(); return; }
    /* 确认页点"进入游戏" → 真正开档 */
    try{
      const name=$('#inp-name').value.trim();
      newGame(name,wiz.pos,wiz.origin,wiz.trait);
      trainDays=G.trainDays||3;
      startSeason();
      switchScreen('main');
      renderAll();
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
}

function wizNextEnabled(){
  if(wiz.step===0) return !!wiz.pos;
  if(wiz.step===1) return !!wiz.origin;
  if(wiz.step===2) return !!wiz.trait;
  return true;   /* 确认页 */
}

function renderWizard(){
  $('#wiz-step').textContent=`第 ${wiz.step+1} 步 / 共 ${WIZ_PAGES.length} 步 · ${STEP_LABELS[wiz.step]}`;
  WIZ_PAGES.forEach((id,i)=>{ $('#'+id).classList.toggle('active',i===wiz.step); });
  $('#wiz-next').disabled=!wizNextEnabled();
  $('#wiz-next').textContent=wiz.step===WIZ_PAGES.length-1?'进入游戏':'下一步';
  $('#wiz-back').textContent=wiz.step===0?'返回封面':'上一步';

  if(wiz.step===1) renderOriginList();
  if(wiz.step===2) renderTraitList();
  if(wiz.step===3) renderConfirm();
}

function renderOriginList(){
  const list=$('#origin-list');
  list.innerHTML=ORIGIN_OPTIONS.map(o=>
    `<button class="opt-box${o.id===wiz.origin?' active':''}" data-id="${o.id}">${o.name}</button>`).join('');
  const sel=ORIGIN_OPTIONS.find(o=>o.id===wiz.origin);
  $('#origin-desc').innerHTML=sel
    ?`<b class="od-name">${sel.name}</b><p>${sel.desc}</p>`
    :'<p class="muted-light">在左侧选择一个出身，这里会显示详细说明。</p>';
}

function renderTraitList(){
  const list=$('#trait-list');
  list.innerHTML=TRAIT_OPTIONS.map(t=>
    `<button class="opt-box${t.id===wiz.trait?' active':''}" data-id="${t.id}">${t.name}</button>`).join('');
  const sel=TRAIT_OPTIONS.find(t=>t.id===wiz.trait);
  $('#trait-desc').innerHTML=sel
    ?`<b class="od-name">${sel.name}</b><p>${sel.desc}</p>`
    :'<p class="muted-light">在左侧选择一个特点，这里会显示详细说明。</p>';
}

function renderConfirm(){
  /* 确认页先据当前选择预生成一次属性（每次进入重新随机，最终开档再生成一次） */
  const name=$('#inp-name').value.trim();
  const preview=newGame(name,wiz.pos,wiz.origin,wiz.trait);
  const groups=ATTR_GROUPS_BY_POS[preview.position]||ATTR_GROUPS_BY_POS['中场'];
  $('#confirm-card').innerHTML=`
    <div class="cf-head">
      <b>${preview.name}</b>
      <span class="tag t2">${preview.position}</span>
      <span class="cf-sub">${ORIGIN_OPTIONS.find(o=>o.id===preview.origin).name} · ${TRAIT_OPTIONS.find(t=>t.id===preview.trait).name}</span>
    </div>
    <div class="cf-club">${clubName(preview.clubTier,preview.clubIdx)} · ${tierName(preview.clubTier)}</div>
    ${groups.map(g=>`
      <div class="cf-group"><h4>${g.name}</h4>
        <div class="cf-attrs">${g.keys.map(k=>`
          <span class="cf-attr">${ATTR_LABEL[k]} <b>${preview.attr[k]}</b></span>`).join('')}
        </div>
      </div>`).join('')}
    <p class="cf-note">属性已随机生成 · 点击「进入游戏」正式开始（将以本次属性为准）</p>`;
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
      <button class="slot-del" data-del="${s.idx}" title="删除存档">删除</button>
    </div>`;
  }).join('');
  box.querySelectorAll('.slot-card').forEach(el=>{
    el.onclick=(e)=>{
      if(e.target.closest('.slot-del')) return;   /* 删除按钮单独处理 */
      onSlotPick(parseInt(el.dataset.idx,10));
    };
  });
  box.querySelectorAll('.slot-del').forEach(btn=>{
    btn.onclick=(e)=>{
      e.stopPropagation();
      const idx=parseInt(btn.dataset.del,10);
      openConfirm(`确定删除栏位 ${idx} 的存档？`,()=>{
        localStorage.removeItem(slotKey(idx));
        renderSlotList();
        refreshMenuButtons();
        toast(`栏位 ${idx} 存档已删除。`);
      },{yes:'删除',no:'取消'});
    };
  });
}
function onSlotPick(idx){
  if(slotMode==='load'){
    if(!loadGame(idx)){ toast('该栏位没有存档。'); return; }
    trainDays=G.trainDays||3;
    $('#slot-layer').classList.remove('show');   /* 读取成功 → 关闭存档窗口 */
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
  refreshRole(G);   /* 赛季开始按当前能力/球队档位刷新角色 */
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
    if(res.ok){
      trainDays=G.trainDays;
      renderAll(); saveGame();
      playTrainingCinematic(res.days,res.ups);
    }else{
      toast(res.msg);
    }
  };
  $('#btn-match').onclick=()=>{
    /* 未训练 → 先弹确认框，避免手滑带低状态出战 */
    if(G && !G.retired && G.roundTrained!==viewRound && viewRound<fixtures.length){
      openConfirm('还未进行训练，是否进入比赛？',()=>playMatch(false),{
        sub:`第 ${viewRound+1} 轮 · ${fixtures[viewRound].home?'主场迎战':'客场挑战'} ${fixtures[viewRound].opp}`,
        warn:`本周未安排训练 · 当前体能 ${Math.round(G.fitness)}% · 状态 ${Math.round(G.form*100)}%，
未经训练直接出战，体能与状态都会拖累表现。`,
        onNo:()=>openPanel('ov-train')
      });
      return;
    }
    playMatch(false);
  };
  $('#btn-endseason').onclick=()=>endSeason();

  /* 模拟下一场：未训练则默认按 3 天综合训练自动安排 */
  $('#btn-simweek').onclick=()=>{
    if(!G||G.retired) return;
    if(viewRound>=fixtures.length){ endSeason(); return; }
    let note='';
    if(G.roundTrained!==viewRound){
      const catId='general';
      const cat=posTrainCats().find(c=>c.id===catId);
      const r=doTraining(catId,3);
      if(r.ok) note=`自动综合训练 · 3天`;
    }
    playMatch(true,note);
  };
}

/* ---------- 通用确认弹层 ---------- */
function openConfirm(text,onYes,opts){
  opts=opts||{};
  $('#confirm-text').textContent=text;
  $('#confirm-sub').textContent=opts.sub||'';
  const yes=$('#confirm-yes'), no=$('#confirm-no');
  if(opts.yes!=null) yes.textContent=opts.yes;
  if(opts.no!=null) no.textContent=opts.no;
  const warn=$('#confirm-warn');
  if(opts.warn){
    warn.style.display='flex';
    $('#confirm-warn-text').textContent=opts.warn;
  }else{
    warn.style.display='none';
  }
  /* 确认框叠在存档层上方：z-index 抬高避免被遮挡 */
  $('#confirm-layer').classList.add('show');
  yes.onclick=()=>{
    $('#confirm-layer').classList.remove('show');
    onYes();
  };
  no.onclick=()=>{
    $('#confirm-layer').classList.remove('show');
    if(opts.onNo) opts.onNo();
  };
}

/* ---------- 通用确认弹层结束 ---------- */

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
  /* 每场比赛后检查：比赛成就 + 赛季进球成就（赛季中即时解锁） */
  const unl=checkAchievements({match:m, season:true});
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
    if(daysTrained<=0) doTraining('general',3);
    prepareMatchFitness();
    const fx=fixtures[viewRound];
    const m=simMatch(G,fx.opp,fx.home);
    const days=(G.roundTrained===viewRound)?(G.trainDays||0):0;
    applyWeekResult(m,days);
    viewRound++;
  }
  /* 快照赛季进球后再推进赛季（advanceSeason 会清空 seasonStats） */
  const seasonGoalsSnapshot=G.seasonStats?G.seasonStats.goals:0;
  const res=advanceSeason();
  const unl=checkAchievements({season:true, seasonGoals:seasonGoalsSnapshot,
    trophy:res.summary.standing===1, promoted:res.summary.promoted});
  const s=res.summary;
  if(res.retired){
    const lines=[
      `${s.club} · ${tierName(s.tier)} 赛季结算`,
      `出场 ${s.apps} · 进球 ${s.goals} · 助攻 ${s.assists} · 场均评分 ${s.avgRating||'—'}`,
      `新赛季你的年龄：${s.age} 岁`,
      ...unl.map(u=>`成就解锁：${u.name}`)
    ];
    showRetire(lines);
    saveGame(); renderAll();
    return;
  }
  /* startSeason 会清空 offers —— 先暂存，成绩单确认后再放回展示转会 */
  const pendingOffers=G.offers||[];
  startSeason();
  G.offers=pendingOffers;
  saveGame();
  showSeasonReport(s,unl,pendingOffers);
  renderAll();
}

/* ---------- 赛季成绩单（逐项落下 + D~S 分级，确认后再看转会） ---------- */
const REPORT_ROWS=[
  s=>({k:'出场次数', v:s.apps>0?s.apps+' 场':'0 场（枯坐板凳的一季）'}),
  s=>({k:'进球',     v:s.goals+' 球'}),
  s=>({k:'助攻',     v:s.assists+' 次'}),
  s=>({k:'场均评分', v:s.avgRating?s.avgRating.toFixed(1):'—'}),
  s=>({k:'联赛排名', v:s.standing===1?'冠军！':(s.standing+' 名')}),
  s=>({k:'球队动向', v:s.loanReturn?'租借期满，回归 '+s.parentClub:
        s.promoted?'升级成功！':s.relegated?'不幸降级…':'原地踏步'})
];
function seasonGrade(s){
  /* 加权：场均评分 50% + 出场 30% + 荣誉 20% */
  const apps=Math.min(s.apps/20,1);            /* 20 场 = 满额 */
  const rating=clamp(((s.avgRating||5.5)-5.2)/2.2,0,1);  /* 5.2→0, 7.4→1 */
  const honor=s.standing===1?1:s.standing<=3?0.7:s.promoted?0.6:s.relegated?0:0.2;
  const score=rating*0.5+apps*0.3+honor*0.2;
  if(score>=0.85) return {g:'S',note:'传奇一季！你就是这支球队的心脏。',cls:'gr-s'};
  if(score>=0.68) return {g:'A',note:'出色的表现，球迷为你起立鼓掌。',cls:'gr-a'};
  if(score>=0.5)  return {g:'B',note:'稳健的赛季，教练组对你表示认可。',cls:'gr-b'};
  if(score>=0.32) return {g:'C',note:'表现平平，下赛季需要拿出更多东西。',cls:'gr-c'};
  return {g:'D',note:'艰难的一季……外界开始质疑你的能力。',cls:'gr-d'};
}
function showSeasonReport(s,unl,pendingOffers){
  const token=trainCineToken();   /* 复用动画令牌防重入 */
  $('#rp-title').textContent=s.season+' 赛季 · '+s.club;
  $('#rp-sub').textContent=tierName(s.tier)+' · '+s.age+' 岁 · 第 '+G.season+' 赛季生涯';
  const rows=$('#rp-rows'); rows.innerHTML='';
  REPORT_ROWS.forEach(f=>{
    const d=f(s);
    const row=document.createElement('div');
    row.className='rp-row';
    row.innerHTML=`<span class="rp-k">${d.k}</span><b class="rp-v">${d.v}</b>`;
    rows.appendChild(row);
  });
  const unlRow=unl.length?unl.map(u=>u.name).join(' · '):'';
  if(unlRow){
    const row=document.createElement('div');
    row.className='rp-row rp-achv';
    row.innerHTML=`<span class="rp-k">成就解锁</span><b class="rp-v">${unlRow}</b>`;
    rows.appendChild(row);
  }
  const grade=seasonGrade(s);
  const gEl=$('#rp-grade');
  gEl.textContent='—';
  gEl.className='rp-grade '+grade.cls;
  $('#rp-grade-note').textContent='';
  $('#rp-confirm').style.visibility='hidden';
  $('#report-layer').classList.add('show');

  /* 逐项落下 → 最后砸出评级 */
  (async()=>{
    const items=rows.querySelectorAll('.rp-row');
    for(const it of items){
      if(token!==trainCineToken.n) return;
      await wait(240);
      it.classList.add('dropped');
    }
    await wait(350);
    if(token!==trainCineToken.n) return;
    gEl.classList.add('slammed');
    gEl.textContent=grade.g;
    $('#rp-grade-note').textContent=grade.note;
    await wait(500);
    if(token!==trainCineToken.n) return;
    $('#rp-confirm').style.visibility='visible';
  })();

  $('#rp-confirm').onclick=()=>{
    if(token!==trainCineToken.n) return;
    $('#report-layer').classList.remove('show');
    const lines=[
      G.offers.length?`你收到了 ${G.offers.length} 份新报价，点击下方查看。`:'暂无转会动向，专注新赛季吧。'
    ];
    if(G.offers.length){ showOffers(); }
    else{ toast('开启 '+G.season+' 赛季！'); }
    renderAll(); saveGame();
  };
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
      ? `<div class="offer-row">租借 ${o.years} 年 · 周薪 ￥${o.salary}万</div>`
      : `<div class="offer-row">${o.fee>0?`转会费 ￥${o.fee}万 · `:''}周薪 ￥${o.salary}万 · ${o.years} 年合同</div>`;
    d.innerHTML=`<div class="offer-kicker">${info.kicker}</div>
      <div class="offer-club">${o.club} <span class="tag t${o.tier}">${tierName(o.tier)}</span></div>
      ${row}`;
    const b=document.createElement('button');
    b.className='btn small'; b.style.cssText='background:var(--grass);color:#fff';
    b.textContent=info.accept;
    b.onclick=()=>{
      acceptOffer(i);
      $('#offer-layer').classList.remove('show');
      toast(o.kind==='loan'?`你租借加盟 ${o.club}！`:`你转会至 ${o.club}！`);
      syncSeason();               /* 更换俱乐部 → 按新联赛重排赛程 */
      renderAll(); saveGame();
    };
    const stay=document.createElement('button');
    stay.className='btn small'; stay.style.cssText='background:var(--bg);color:var(--ink)';
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
  $('#v-value').textContent='￥'+(G.marketValue>=10000?(G.marketValue/10000).toFixed(1)+'亿':G.marketValue+'万');
  $('#v-season').textContent=`第 ${G.season} 赛季 · 第 ${Math.min(viewRound+1,fixtures.length||1)} / ${fixtures.length||34} 轮`;
  $('#v-fit').textContent=Math.round(G.fitness)+'%';
  $('#v-form').textContent=Math.round(G.form*100)+'%';
  $('#bar-fitness>i').style.width=G.fitness+'%';
  $('#bar-form>i').style.width=(G.form*100)+'%';
  /* 伤病风险条（0~200%，显示为百分比；色阶随风险升高） */
  const risk=Math.round(G.injuryRisk||0);
  $('#v-risk').textContent=risk+'%';
  $('#v-risk').style.color=risk>=160?'var(--comic-red)':risk>=130?'var(--pop-d)':'#9fb2c0';
  $('#bar-risk>i').style.width=clamp(risk/2,0,100)+'%';
  $('#bar-risk>i').style.background=risk>=160?'var(--comic-red)':risk>=130?'var(--pop)':'var(--grass)';
  /* 伤病状态显示 */
  const injEl=$('#v-injury');
  if(injEl){
    if(G.injuredWeeks>0){
      injEl.textContent=`伤病 ${G.injuredWeeks}周`;
      injEl.style.color='var(--comic-red)';
      injEl.style.display='inline';
    }else{
      injEl.style.display='none';
    }
  }
  $('#achv-badge').textContent=ACHIEVEMENTS.filter(a=>G.achievements&&G.achievements[a.id]).length;
  $('#btn-match').disabled = G.retired || viewRound>=fixtures.length || G.injuredWeeks>0;
  $('#btn-match').textContent = G.retired?'已退役':G.injuredWeeks>0?'伤病休战':viewRound>=fixtures.length?'联赛结束':`出战 · 第${viewRound+1}轮`;
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
  /* 伤病风险可视化：色阶随风险升高（绿→橙→红） */
  const risk=Math.round(G.injuryRisk||0);
  const riskColor=risk>=160?'var(--comic-red)':risk>=130?'var(--pop-d)':'var(--grass-d)';
  $('#tile-train-foot').innerHTML=`体能 ${Math.round(G.fitness)}% · 状态 ${Math.round(G.form*100)}% · <span style="color:${riskColor}">伤病风险 ${risk}%</span>`;
  $('#tile-train-foot').className='t-foot';

  /* 出场提示：下一场预期定位 + 预期上场时间 + 球队档位/排名 */
  const plan=appearancePlan(G);
  if(G.retired || over){
    $('#tile-role').textContent='赛季结束';
    $('#tile-minutes').textContent='等待赛季结算';
    $('#tile-play-foot').textContent='—';
  }else{
    $('#tile-role').textContent=plan.role;
    $('#tile-minutes').textContent=`预期上场 ${plan.expectMinutes} 分钟`;
    $('#tile-play-foot').textContent=`球队排名：第 ${currentStanding(G)} 名`;
  }

  /* 数据 · 生涯合并方格（上下两段） */
  const s=G.seasonStats;
  const avg=s.ratings.length?Math.round(s.ratings.reduce((a,b)=>a+b,0)/s.ratings.length*10)/10:0;
  $('#m-data').textContent=`${s.apps}场 · ${s.goals}球 · ${s.assists}助 · 均评 ${avg?avg.toFixed(1):'—'}`;
  $('#m-career').innerHTML=`第 ${G.season} 赛季 · ${G.age} 岁 · 冠军 ${G.trophies.length} · 出场 ${G.careerStats.apps}`;

  let hint='';
  if(G.retired){ hint='生涯已结束，可在生涯面板回顾荣誉。'; }
  else if(G.injuredWeeks>0){
    hint=`<b style="color:var(--comic-red)">伤病恢复中：${G.injuryName||'伤病'}（还剩 ${G.injuredWeeks} 周）</b> · 状态正在流失，休息可加速恢复`;
  }
  else if(viewRound<fixtures.length){
    const fx=fixtures[viewRound];
    hint=`下一场：${fx.home?'主场迎战':'客场挑战'} <b>${fx.opp}</b> · 伤病风险 ${Math.round(G.injuryRisk||0)}%`;
  }
  else{
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
  const after=clamp(G.fitness+FIT_RECOVER_TRAIN_DAY*days+FIT_RECOVER_REST_DAY*restDays,0,100);
  /* 预期伤病风险：训练日 +8 / 休息日 −12（当前风险 0~200 基础上计算） */
  const riskBefore=Math.round(G.injuryRisk||0);
  const riskAfter=clamp(Math.round((G.injuryRisk||0)+days*8-restDays*12),0,200);
  const riskColor=riskAfter>=160?'var(--comic-red)':riskAfter>=130?'var(--pop-d)':'var(--grass-d)';
  const riskDelta=riskAfter-riskBefore;
  const riskDeltaTxt=(riskDelta>=0?'+':'')+riskDelta+'%';
  const keys=ATTRS_BY_POS[G.position]||[];
  const focus=(TRAIN_FOCUS[cat.id]||[]).filter(k=>keys.indexOf(k)>=0);
  const focusTxt=focus.length?focus.map(k=>ATTR_LABEL[k]+'++').join('  '):'全属性+';
  const box=$('#train-preview');
  box.innerHTML=`<div class="tp-focus">${focusTxt}</div>
    <div class="tp-fit"><span class="tp-label">预期体能</span><b>${Math.round(G.fitness)}% → ${Math.round(after)}%</b>${after<30?'<span class="warn"> · 赛后体能偏低</span>':''}</div>
    <div class="tp-fit"><span class="tp-label">预期伤病风险</span><b style="color:${riskColor}">${riskBefore}% → ${riskAfter}%</b><span style="font-size:11px;color:${riskDelta>0?'var(--comic-red-d)':'var(--grass-d)'}">（${riskDeltaTxt}）${riskAfter>=160?' · 极高，强烈建议全休':riskAfter>=130?' · 偏高':''}</span></div>`;

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
  /* 伤病风险（色阶）与伤病状态 */
  const risk=Math.round(G.injuryRisk||0);
  const riskEl=$('#data-risk');
  riskEl.textContent=risk+'%';
  riskEl.style.color=risk>=160?'#ff4757':risk>=130?'#f07300':'#4ade80';
  const injEl=$('#data-inj');
  if(G.injuredWeeks>0){
    injEl.textContent=G.injuryName||'伤病中';
    injEl.style.color='#ff4757';
  }else{
    injEl.textContent='健康';
    injEl.style.color='';
  }
  renderStatusPanel();

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

/* ---------- 现状面板：定位/预期时间/教练态度/球队定位/球迷态度 ---------- */
function renderStatusPanel(){
  if(!G) return;
  const plan=appearancePlan(G);
  $('#st-role').textContent=plan.role;
  $('#st-expect').textContent=plan.expectMinutes+' 分钟';
  /* 近5场评分 */
  const recent=G.seasonStats.ratings.slice(-5);
  const recentAvg=recent.length?(recent.reduce((a,b)=>a+b,0)/recent.length):null;
  const rEl=$('#st-recent');
  rEl.textContent=recentAvg==null?'—':recentAvg.toFixed(1);
  rEl.style.color=recentAvg==null?'':recentAvg>=7?'var(--grass-d)':recentAvg<5.9?'var(--comic-red-d)':'var(--pop-d)';
  /* 教练态度：一句话精简版 */
  const baseCoach={key:'战术核心',starter:'稳定首发',rotate:'重要轮换',squad:'考察对象'}[G.roleId]||'';
  let coach;
  if(recentAvg==null){
    coach={key:'全队围绕你展开',starter:'教练信任你',rotate:'会给你机会',squad:'证明自己'}[G.roleId]||'—';
  }else{
    let mood;
    if(recentAvg>=7.5) mood='状态火热，位置稳固';
    else if(recentAvg>=6.8) mood='表现满意，信任持续';
    else if(recentAvg>=6.2) mood='表现合格，需更稳定';
    else if(recentAvg>=5.6) mood='状态下滑，竞争加剧';
    else mood='表现低迷，可能失去位置';
    coach=`作为${baseCoach}：${mood}`;
  }
  $('#st-coach').innerHTML=coach;
  /* 球迷态度：一句话精简版 */
  const bandDef=TEAM_BANDS.find(b=>b.id===TIER_BAND_MAP[G.clubTier][G.clubIdx]);
  const perf=bandDef.basePos-currentStanding(G);   /* 正 = 比预期好 */
  let fans;
  if(perf>=2) fans='远超预期，气氛火热';
  else if(perf>=0.5) fans='成绩令人满意';
  else if(perf>-0.5) fans='成绩符合预期';
  else if(perf>-2) fans='低于预期，出现嘘声';
  else fans='深陷泥潭，球迷不满';
  $('#st-fans').innerHTML=fans;
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
  $('#match-hud').classList.remove('hud-hidden');
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
      ${b.injury?`<div class="scene-text warn-text">伤病！${b.injury.name}（预计缺阵 ${b.injury.weeks} 周）</div>`:''}
      <div class="mini-stats">实时评分 <b>${b.rating.toFixed(1)}</b> · 体能 <b>${Math.round(b.fit)}%</b></div>
    </div>`);
    await wait(b.injury?1800:1200);
  } else if(b.type==='sub'){
    stage(`<div class="stage center">
      <div class="minute-tag">${b.minute}'</div>
      <div class="scene-text warn-text">${b.text}</div>
    </div>`);
    await wait(1500);
  } else if(b.type==='bg'){
    /* 用实时评分（b.rating），不能取 m.rating（全场最终值含赛果加成，会先显示终点分） */
    setHud(b.minute,b.score,(typeof b.rating==='number')?b.rating:null);
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
  $('#match-hud').classList.add('hud-hidden');
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
  /* 全场结束：顶部 HUD（时间/比分/评分）向上收起，只展示下方数据汇总 */
  $('#match-hud').classList.add('hud-hidden');
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
      ${m.beats&&m.beats.length&&m.beats[m.beats.length-1].injury?`<div class="final-extra" style="border-color:var(--comic-red-d);color:var(--comic-red-d)">伤病：${m.beats[m.beats.length-1].injury.name}（缺阵 ${m.beats[m.beats.length-1].injury.weeks} 周）${m.beats[m.beats.length-1].injury.dropped?'<br>属性受损：'+m.beats[m.beats.length-1].injury.dropped.join('/'):''}</div>`:''}
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

/* ============================================================
   训练过场动画
   点击"开始训练"后播放：训练 + 休息逐日推进，日期后移，
   训练日白字 / 休息日蓝字 / 比赛日红字，动态省略号，播放完自动关闭。
   文案与训练类别对应（data.js TRAIN_CINE_TEXTS）。
   ============================================================ */
/* 训练/休息穿插排布：全练或全休只有一种；其余交替穿插 */
function buildWeekSchedule(days){
  const arr=[];
  for(let t=days,r=WEEK_DAYS-days;t>0||r>0;){
    if(t>0){ arr.push('train'); t--; }
    if(r>0){ arr.push('rest'); r--; }
  }
  return arr;
}

function trainCineToken(){ return trainCineToken.n=(trainCineToken.n||0)+1; }

async function playTrainingCinematic(days,ups){
  const token=trainCineToken();
  const layer=$('#train-cine');
  const list=$('#tc-lines');
  layer.classList.add('show');
  $('#ov-train').classList.remove('show');   /* 关闭训练面板，突出过场 */
  list.innerHTML='';

  const sched=buildWeekSchedule(days);
  const dayNames=['周一','周二','周三','周四','周五','周六'];
  const cat=(posTrainCats().find(c=>c.id===trainCat)||posTrainCats()[0]);
  const trainTexts=TRAIN_CINE_TEXTS[cat.id]||TRAIN_CINE_TEXTS.general;
  const items=[];
  let ti=0;
  sched.forEach((kind,i)=>{
    items.push({
      kind, day:dayNames[i],
      text:kind==='train'?trainTexts[ti++%trainTexts.length]:pick(REST_CINE_TEXTS)
    });
  });
  items.push({kind:'match',day:'比赛日',text:'比赛日即将到来'});

  const fit0=Math.round(G.fitness);
  const fitAfter=fit0+Math.round(FIT_RECOVER_TRAIN_DAY*days)+FIT_RECOVER_REST_DAY*(WEEK_DAYS-days);
  $('#tc-title').textContent=`第 ${viewRound+1} 轮 · ${days>0?cat.name:'全周休整'}`;
  $('#tc-fit').innerHTML=`体能 <b>${fit0}%</b> → <b>${clamp(fitAfter,0,100)}%</b>`;

  for(let i=0;i<items.length;i++){
    if(token!==trainCineToken.n) return;
    const it=items[i];
    const row=document.createElement('div');
    row.className=`tc-line tc-${it.kind}`;
    const dot=it.kind==='match'
      ?`<span class="tc-dot"></span>`
      :`<span class="tc-ellipsis"><i></i><i></i><i></i></span>`;
    row.innerHTML=`<span class="tc-day">${it.day}</span>
      <span class="tc-text">${it.text}</span>${dot}`;
    list.appendChild(row);
    /* 保持滚动到底部，营造逐日后移感 */
    const body=$('#tc-body'); body.scrollTop=body.scrollHeight;
    await wait(it.kind==='match'?900:620);
    if(token!==trainCineToken.n) return;
    row.classList.add('done');
    const dotEl=row.querySelector('.tc-ellipsis'); if(dotEl) dotEl.remove();
  }

  /* 成长提示 */
  if(ups&&ups.length){
    const row=document.createElement('div');
    row.className='tc-line tc-up';
    row.innerHTML=`<span class="tc-day">成长</span>
      <span class="tc-text">${ups.map(u=>`${ATTR_LABEL[u.k]} → ${u.level}`).join(' · ')}</span>`;
    list.appendChild(row);
    const body=$('#tc-body'); body.scrollTop=body.scrollHeight;
    await wait(1100);
    if(token!==trainCineToken.n) return;
  }

  await wait(400);
  if(token!==trainCineToken.n) return;
  layer.classList.remove('show');
  renderAll();
  /* 训练结束后直接出战（本周未比赛时） */
  if(viewRound<fixtures.length && G && !G.retired && G.roundTrained===viewRound){
    playMatch(false);
  }
}
