/* ============================================================
   足球人生 · 静态配置
   ------------------------------------------------------------
   这里只放“可调数值 / 名称 / 文案 / 概率表 / 成就表”。
   修改平衡性时优先改这个文件，不要动引擎逻辑。
   ============================================================ */
'use strict';

/* ---------- 基础位置与属性 ----------
   每个位置拥有独立属性表（参考 FM27 的属性与职责体系，做合理简化）。
   其中 身体素质（速度/耐力/力量）为位置通用，其余属性按该位置的
   角色职责方向设计。 */
const POSITIONS=['门将','后卫','中场','前锋'];

const ATTRS_BY_POS={
  前锋:['technique','finishing','composure','offball','passing','vision','heading','pace','stamina','physical'],
  中场:['technique','passing','vision','decisions','attack','composure','defense','pace','stamina','physical'],
  后卫:['technique','passing','decisions','defense','positioning','heading','composure','pace','stamina','physical'],
  门将:['reflexes','handling','aerial','positioning','decisions','passing','technique','composure','stamina','physical']
};
/* 全属性并集（仅作兜底遍历用，具体逻辑一律以 ATTRS_BY_POS 为准） */
const ATTRS=Array.from(new Set([].concat.apply([],Object.values(ATTRS_BY_POS))));

const ATTR_LABEL={
  technique:'技术', finishing:'终结', composure:'冷静', offball:'跑位',
  passing:'传球', vision:'视野', heading:'头球', decisions:'决断',
  attack:'射门', defense:'防守', positioning:'位置感', reflexes:'反应',
  handling:'手型', aerial:'制空', pace:'速度', stamina:'耐力', physical:'力量'
};

/* 属性面板分组：技术 / 精神 / 身体（FM 风格，按位置分列） */
const ATTR_GROUPS_BY_POS={
  前锋:[
    {name:'技术', keys:['technique','passing','finishing','heading']},
    {name:'精神', keys:['vision','composure','offball']},
    {name:'身体', keys:['pace','stamina','physical']}
  ],
  中场:[
    {name:'技术', keys:['technique','passing','attack','defense']},
    {name:'精神', keys:['vision','decisions','composure']},
    {name:'身体', keys:['pace','stamina','physical']}
  ],
  后卫:[
    {name:'技术', keys:['technique','passing','defense','heading']},
    {name:'精神', keys:['positioning','decisions','composure']},
    {name:'身体', keys:['pace','stamina','physical']}
  ],
  门将:[
    {name:'技术', keys:['reflexes','handling','aerial','passing','technique']},
    {name:'精神', keys:['positioning','decisions','composure']},
    {name:'身体', keys:['stamina','physical']}
  ]
};

/* 1-20 等级的起始区间，按位置区分（每个位置的属性表不同） */
const ATTR_START={
  前锋:{technique:[6,9],finishing:[7,10],composure:[6,8],offball:[6,9],passing:[5,7],
        vision:[5,7],heading:[5,8],pace:[6,9],stamina:[5,7],physical:[5,7]},
  中场:{technique:[7,10],passing:[8,10],vision:[7,9],decisions:[7,9],attack:[5,8],
        composure:[6,8],defense:[5,7],pace:[5,7],stamina:[7,9],physical:[5,6]},
  后卫:{technique:[5,7],passing:[6,8],decisions:[7,9],defense:[7,10],positioning:[7,9],
        heading:[7,9],composure:[6,8],pace:[5,7],stamina:[6,8],physical:[7,9]},
  门将:{reflexes:[7,10],handling:[6,9],aerial:[6,9],positioning:[7,9],decisions:[7,9],
        passing:[5,7],technique:[5,7],composure:[7,9],stamina:[6,8],physical:[6,8]}
};

/* ---------- 联赛（3 级） ----------
   球员能力在联赛中服从正态分布：mean 为平均水平，sd 为标准差。
   每个赛季联赛平均水平在 ±20% 内随机波动（引擎写入 seasonMeanMul）。
   ATTR_NORM 为各属性相对联赛均值的画像系数（速度略高、终结略低等）。 */
const CLUB_TIERS=[
  {name:'中超', tier:1, clubs:['沪上申城','广州塔城','京师御林','川蜀雄鹰','齐鲁泰山','江东风流','南粤虎门','渝州山城']},
  {name:'中甲', tier:2, clubs:['滨海快艇','中原铁军','滇池雪豹','塞北狼群','湘江浪潮','陇右飞骑','闽海蛟龙','桂岭百色']},
  {name:'中乙', tier:3, clubs:['漠河极光','琼崖椰风','河西走廊','天山雪莲','雁北飞燕','赣水红枫','黔中梯田','青海湖畔']}
];

const LEAGUE_QUALITY={
  1:{name:'中超', mean:150, sd:25},
  2:{name:'中甲', mean:130, sd:25},
  3:{name:'中乙', mean:100, sd:25}
};

const ATTR_NORM={
  technique:1.0, finishing:0.95, composure:1.0, offball:0.98, passing:1.0,
  vision:0.98, heading:0.95, decisions:1.0, attack:0.95, defense:1.0,
  positioning:1.0, reflexes:1.0, handling:1.0, aerial:0.98,
  pace:1.05, stamina:1.05, physical:1.0
};

const FIRST_NAMES=['小','阿','李','王','张','刘','陈','杨','赵','黄','周','吴','徐','孙','马','朱','林','郭','何','高'];
const GIVEN_NAMES=['磊','强','军','伟','勇','杰','峰','涛','斌','超','辉','鹏','宇','晨','阳','风','龙','翔','轩','泽','俊','凯','浩','子墨','天翼','明轩','博文','思远','志豪','嘉禾'];

/* ---------- 位置选择（中轴线英文缩写） ---------- */
const POS_SHORT={前锋:'FW',中场:'MF',后卫:'DF',门将:'GK'};

/* ---------- 角色创建：出身背景 ----------
   avg=属性整体偏移；spread=离散度（大=不均）；tier=起始联赛；star=相对联赛星级描述。 */
const ORIGIN_OPTIONS=[
  {id:'youth', name:'青训球员', tier:2,
   desc:'俱乐部青训出品，属性分配平均，当前处于中甲（约 1.5★）。<br>训练体系完整、成长稳健，但队内竞争激烈，<b>上场次数较少</b>，需要耐心争取机会。'},
  {id:'genius', name:'天才球员', tier:2,
   desc:'天赋异禀但偏科严重，有明显的长板、属性分配不均，处于中甲（约 1★）。<br>你可以依赖长板<b>走捷径</b>快速立足，但短板将成为长期隐患；<b>也可以选择阵痛期补齐短板</b>，厚积薄发。'},
  {id:'hometown', name:'家乡球员', tier:3,
   desc:'从业余联赛一步一个脚印踢上来的本地人，属性随机，当前处于中乙（约 2.5★）。<br>能力偏低但<b>定位首发</b>，初始赛季比赛机会更多，游戏初期体验更好。'}
];

/* ---------- 角色创建：个人特点（对应领域初始数值更高） ----------
   tech=技术类  body=身体类  mind=精神类（按位置属性表分组） */
const TRAIT_OPTIONS=[
  {id:'tech', name:'技术优秀', groups:['technique','passing','finishing','heading','reflexes','handling','attack'],
   desc:'脚下功夫细腻，技术类属性（传控/射门/扑救手型等）初始数值更高。'},
  {id:'body', name:'身体天赋高', groups:['pace','stamina','physical','aerial','jumping'],
   desc:'天生运动能力出众，身体类属性（速度/耐力/力量/弹跳等）初始数值更高。'},
  {id:'mind', name:'精神属性强', groups:['composure','vision','decisions','offball','positioning'],
   desc:'头脑冷静、阅读比赛能力强，精神类属性（视野/决断/冷静/跑位等）初始数值更高。'}
];

/* ---------- 经验曲线（界面不显示经验数字） ----------
   FM 式指数级成长难度：每升 1 级所需经验 = base × XP_GROWTH^(等级-1)，
   等级越高成本增长越快，配合基础收入调低，避免“几个回合就满星”。 */
const XP_GROWTH=1.45;
/* 不同属性升级所需经验不同：身体类便宜，精神类昂贵 */
const ATTR_XP_BASE={
  technique:16, finishing:20, composure:24, offball:20, passing:14, vision:20,
  heading:22, decisions:20, attack:20, defense:18, positioning:18,
  reflexes:18, handling:16, aerial:18, pace:20, physical:16, stamina:14
};

/* ---------- 位置与综合能力权重 ----------
   不同于 FM（3D 引擎使身体权重过高），本作三方向属性各有分工：
   · 身体（速度/耐力/力量）：决定关键节点数量（机会频率）与耐力表现系数，
     且是把握机会/防守成功的协同属性 —— 权重中等偏高
   · 技术（传控射/扑救手型）：所有关键动作（进攻/组织/防守/扑救）的核心判定属性
     —— 权重最高
   · 精神（视野/决断/冷静/跑位/站位）：决定抽到关键事件的概率，
     是重大事件（进球/助攻/关键防守）成败的关键属性 —— 权重中等
   每行合计 1.0，键必须覆盖该位置全部属性。 */
const ATTR_WEIGHTS={
  前锋:{finishing:.20,technique:.15,offball:.12,composure:.10,pace:.12,physical:.08,stamina:.06,passing:.07,vision:.06,heading:.04},
  中场:{passing:.18,technique:.14,vision:.12,decisions:.11,stamina:.10,defense:.09,attack:.09,composure:.08,pace:.05,physical:.04},
  后卫:{defense:.20,positioning:.14,decisions:.10,technique:.12,heading:.10,physical:.11,pace:.09,passing:.07,stamina:.05,composure:.02},
  门将:{reflexes:.22,handling:.16,positioning:.12,aerial:.10,decisions:.10,composure:.08,stamina:.06,physical:.06,passing:.06,technique:.04}
};

/* 每个位置的核心属性（高龄衰减时优先保护） */
const POS_CORE_ATTR={前锋:'finishing',中场:'passing',后卫:'defense',门将:'reflexes'};

/* ---------- 训练：按位置职能设计 ----------
   每个位置 3 个“角色职责方向”训练 + 1 个位置通用的“身体素质”训练。
   通用逻辑（FM 式）：所有属性等权重获得经验；
   当训练组合命中 TRAIN_FOCUS 中的重点属性时，这些属性权重上升 FOCUS_BOOST 倍。 */
const TRAIN_CATS={
  前锋:[
    {id:'create',  name:'创造机会'},
    {id:'finish',  name:'把握机会'},
    {id:'target',  name:'支点能力'},
    {id:'physical',name:'身体素质'},
    {id:'general', name:'综合训练'}
  ],
  中场:[
    {id:'build',   name:'组织调度'},
    {id:'arrive',  name:'攻坚插上'},
    {id:'screen',  name:'防守拦截'},
    {id:'physical',name:'身体素质'},
    {id:'general', name:'综合训练'}
  ],
  后卫:[
    {id:'buildout',name:'出球组织'},
    {id:'aerial',  name:'防空拦截'},
    {id:'duel',    name:'卡位对抗'},
    {id:'physical',name:'身体素质'},
    {id:'general', name:'综合训练'}
  ],
  门将:[
    {id:'reflex',    name:'扑救反应'},
    {id:'claim',     name:'制空出击'},
    {id:'distribute',name:'发动进攻'},
    {id:'physical',  name:'身体素质'},
    {id:'general',   name:'综合训练'}
  ]
};

/* 训练组合的重点属性（命中即权重上升；不在该位置属性表中的键会被忽略）。
   综合训练无重点：全部属性纯等权（FM 通用逻辑）。 */
const TRAIN_FOCUS={
  create:['passing','vision','technique'],
  finish:['finishing','composure','offball'],
  target:['heading','physical','technique'],
  build:['passing','vision','technique'],
  arrive:['attack','composure','pace'],
  screen:['defense','decisions','physical'],
  buildout:['passing','technique','decisions'],
  aerial:['heading','positioning','defense'],
  duel:['defense','physical','pace'],
  reflex:['reflexes','handling','positioning'],
  claim:['aerial','physical','decisions'],
  distribute:['passing','technique','decisions'],
  physical:['pace','stamina','physical'],
  general:[]
};

/* ---------- 周期训练（天数制 0~6） ----------
   一周 = 6 天（一周一赛）：训练 d 天 + 休息 (6-d) 天。
   体能结算 = 上场剩余体能 + 训练日恢复 × d + 休息日恢复 × (6-d)。
   无论训练还是休息每天都在恢复体能，训练日恢复系数较低。
   平衡基准：40% 体能 → 练 3 休 3 → 比赛日恢复满
   （40 + 3×8 + 3×12 = 100）。
   成长不随天数线性放大：第 1 天为基准，之后按 DAY_XP_DECAY 边际递减。 */
const WEEK_DAYS=6;
const TRAIN_DAY_XP=2;                 /* 第 1 天的单属性基准成长（配合 learnMul 与指数曲线） */
const FOCUS_BOOST=1.8;                /* 重点属性权重倍率 */
const DAY_XP_DECAY=[1,0.85,0.75,0.7,0.65,0.6,0.55];  /* 第 n 天的边际收益（6 天合计 4.55×） */
/* 平衡设计：休息日高恢复、训练日低恢复，训练越多比赛体能越低，
   玩家需在成长与状态间权衡。
   典型场景（赛后 ~60%）：全休 → 96；3练3休 → 87；6练 → 75。
   低体能开局（40%）：3练3休 → 67，6练 → 55 —— 盲目全练会带低体能出战。
   连续几周高强度后体能滚落，必须主动安排全休周回血。 */
const FIT_RECOVER_REST_DAY=9;         /* 每个休息日的体能恢复 */
const FIT_RECOVER_TRAIN_DAY=3;        /* 每个训练日的体能恢复（较低系数） */

/* ---------- 状态（form） ----------
   与训练天数、上场时间直接挂钩，并决定比赛发挥水平。 */
const FORM_TRAIN_DAY=0.055;   /* 每训练 1 天 */
const FORM_PLAY_PER_90=0.07;  /* 每 90 分钟出场 */
const FORM_NO_TRAIN=-0.09;    /* 一周 0 天训练 */
const FORM_NO_PLAY=-0.08;     /* 整场坐在替补席 */

/* ---------- 比赛通用成长 ----------
   参赛即获得全属性等权成长：6.0 评分 / 90 分钟 = MATCH_GROWTH_BASE × 1 天训练基准
   （与训练一样乘 learnMul、ageFactor、状态系数）。 */
const MATCH_GROWTH_BASE=1.0;
const MATCH_RATING_BASE=6.0;

/* ---------- 比赛关键事件：位置权重 / 事件池 / 非关键点文案 ---------- */
/* 不同位置的关键事件类型权重。
   setpiece=定位球专项（点球/任意球/角球头球），独立随机：
   后卫的进攻机会只能从这里出现（没有运动战 attack）。 */
const POS_EVENT_WEIGHTS={
  门将:{save:1},
  后卫:{defend:.45, pass:.18, dribble:.10, keypass:.10, offball:.10, setpiece:.07},
  中场:{keypass:.22, pass:.18, defend:.22, dribble:.15, attack:.10, offball:.10, setpiece:.03},
  前锋:{attack:.32, offball:.18, keypass:.12, dribble:.16, pass:.18, setpiece:.04}
};

/* ---------- 评分系统：按位置差异化的加减分（FM/真实足球逻辑） ----------
   设计原则：
   · 前锋：跑出机会（attack 成功）无论是否进球都涨分；错失队友创造的良机重罚；
     普通射门未进轻罚；无射门/跑位隐身缓降；过人被断惩罚。
   · 中场：关键传球成功大奖、失败不罚；简单传球失误才罚；防守失位惩罚。
   · 后卫/门将：防守事件失败（含失球）惩罚重；关键防守/扑救奖励高。 */
const RATING_RULES={
  前锋:{
    start:6.4, min:4.5,
    attack:{goal:.50, created:.10, missBig:-.24, bad:-.08},
    offball:{good:.07, bad:-.06},               /* 跑出空当 + / 隐身 − */
    keypass:{assist:.36, created:.12, bad:0},   /* 关键传球失败不罚 */
    dribble:{good:.10, bad:-.12},               /* 被断惩罚 */
    pass:  {assist:.32, good:.08, bad:-.10},    /* 简单传球失误才罚 */
    missBigChance:.20
  },
  中场:{
    start:6.5, min:4.5,
    attack:{goal:.50, created:.10, missBig:-.22, bad:-.10},
    offball:{good:.06, bad:-.05},
    keypass:{assist:.35, created:.12, bad:0},
    dribble:{good:.09, bad:-.10},
    pass:  {assist:.30, good:.06, bad:-.09},
    defend:{block:.25, good:.08, bad:-.12, concede:-.25},
    missBigChance:.20
  },
  后卫:{
    start:6.5, min:4.5,
    attack:{goal:.55, created:.10, missBig:-.15, bad:-.08},
    offball:{good:.06, bad:-.06},
    keypass:{assist:.35, created:.10, bad:-.06},  /* 后卫出球要求更高 */
    dribble:{good:.09, bad:-.14},                 /* 后卫被断更危险 */
    pass:  {assist:.30, good:.06, bad:-.12},
    defend:{block:.26, good:.08, bad:-.18, concede:-.34},
    missBigChance:.15
  },
  门将:{
    start:6.7, min:4.5,
    save:{save:.24, good:.08, bad:-.15, concede:-.32}   /* 失球惩罚最重 */
  }
};

/* 赛果一次性修正（按净胜球）：小胜 +0.2 / 大胜(≥3) +0.5 / 同理负向 */
function resultRatingAdj(my,opp){
  const d=my-opp;
  if(d===0) return 0;
  const mag=Math.abs(d)>=3?0.5:0.2;
  return d>0?mag:-mag;
}

/* 事件池按位置组织，need 只允许引用该位置属性表内的键。
   offball=跑位/反越位  dribble=盘带过人  keypass=威胁球/最后一传
   pass=普通串联传球    attack=射门      defend=防守动作  save=扑救 */
const MATCH_EVENTS={
  前锋:{
    attack:[
      {kind:'open', txt:'你反越位成功形成单刀', need:{finishing:.45,offball:.3,pace:.25}},
      {kind:'open', txt:'你接到队友的传球，稍作调整起脚远射', need:{finishing:.5,technique:.3,composure:.2}},
      {kind:'open', txt:'你在禁区边缘连续变向后小角度抽射', need:{finishing:.4,technique:.35,offball:.25}},
      {kind:'open', txt:'队友倒三角回做，你迎球推射', need:{finishing:.55,composure:.25,offball:.2}}
    ],
    setpiece:[
      {kind:'penalty', txt:'球队获得点球，你站在十二码前', need:{finishing:.5,composure:.5}},
      {kind:'header', txt:'角球机会，你抢到前点甩头攻门', need:{heading:.4,offball:.35,physical:.25}}
    ],
    offball:[
      {txt:'你灵动的前插撕开了对方防线的空当', need:{offball:.55,pace:.3,composure:.15}},
      {txt:'你连续两次变向摆脱了盯防后卫', need:{offball:.4,pace:.35,technique:.25}},
      {txt:'你在越位线边缘游走，后卫进退两难', need:{offball:.6,decisions:.2,composure:.2}},
      {txt:'你回撤拿球又迅速前插，带动了进攻节奏', need:{offball:.35,vision:.3,stamina:.35}},
      {txt:'你在禁区内不断游弋，吸引了对方两名防守球员', need:{offball:.5,physical:.3,composure:.2}},
      {txt:'你迟迟没有摆脱盯防，在前场近乎隐身', need:{offball:.6,pace:.2,composure:.2}, hidden:true}
    ],
    keypass:[
      {txt:'你在禁区前沿送出一脚穿透防线的直塞', need:{passing:.5,vision:.35,technique:.15}},
      {txt:'你在边路送出精准传中，找到包抄队友', need:{passing:.45,technique:.25,vision:.2,pace:.1}},
      {txt:'你背身拿球做墙，轻轻一蹭送到队友脚下', need:{passing:.45,physical:.3,technique:.25}},
      {txt:'你在肋部分球后迅速前插，队友心领神会', need:{passing:.4,vision:.3,offball:.3}},
      {txt:'你高高跃起头球摆渡，为队友创造绝佳机会', need:{heading:.45,passing:.3,offball:.25}}
    ],
    dribble:[
      {txt:'你在边路持球推进，正面过掉防守球员', need:{technique:.45,pace:.35,composure:.2}},
      {txt:'你禁区前沿连续盘带，晃开射门角度', need:{technique:.5,offball:.25,composure:.25}},
      {txt:'你尝试强行突破，被防守球员干净断下', need:{technique:.5,pace:.3,decisions:.2}, fail:true}
    ],
    pass:[
      {txt:'你回撤接应，与队友打出二过一配合', need:{passing:.4,technique:.3,offball:.3}},
      {txt:'你简单转移球权，保持进攻流畅', need:{passing:.6,composure:.4}}
    ]
  },
  中场:{
    attack:[
      {kind:'open', txt:'你后插上进入禁区，迎球推射', need:{attack:.45,pace:.3,composure:.25}},
      {kind:'open', txt:'你在禁区前沿突施冷箭', need:{attack:.5,technique:.3,composure:.2}},
      {kind:'open', txt:'你和队友撞墙配合后杀入禁区完成射门', need:{attack:.4,passing:.3,technique:.3}},
      {kind:'open', txt:'你抢在后卫身前完成捅射', need:{attack:.45,decisions:.3,pace:.25}}
    ],
    setpiece:[
      {kind:'penalty', txt:'球队获得点球，你主动走上十二码', need:{attack:.5,composure:.4,decisions:.1}},
      {kind:'fk', txt:'你主罚禁区前沿的任意球，直接攻门', need:{attack:.45,technique:.35,composure:.2}}
    ],
    offball:[
      {txt:'你敏锐地插上到禁区前沿的空当，接应传球', need:{offball:.5,decisions:.3,stamina:.2}},
      {txt:'你横向移动接应，为持球队友拉开出球线路', need:{offball:.45,vision:.3,stamina:.25}},
      {txt:'你在攻防转换中第一时间落到正确位置', need:{decisions:.45,offball:.35,positioning:.2}},
      {txt:'你在对方逼抢下没有找到接应空间，推进受阻', need:{offball:.5,decisions:.3,composure:.2}, hidden:true}
    ],
    keypass:[
      {txt:'你在中场拿球，观察队友跑位后送出直塞', need:{passing:.55,vision:.3,decisions:.15}},
      {txt:'你在中场转身摆脱后长传转移，直接找到前插队友', need:{passing:.45,vision:.3,technique:.25}},
      {txt:'你主罚前场任意球，把球精准吊入禁区', need:{passing:.5,vision:.3,technique:.2}},
      {txt:'你在肋部倒三角回做，找到插上的队友', need:{passing:.45,vision:.35,composure:.2}},
      {txt:'你外脚背送出贴地斩，撕开防线', need:{passing:.5,technique:.35,vision:.15}}
    ],
    dribble:[
      {txt:'你中场持球推进，连续摆脱两名防守球员', need:{technique:.45,pace:.3,composure:.25}},
      {txt:'你带球突入肋部，迫使对方防线收缩', need:{technique:.4,offball:.3,decisions:.3}},
      {txt:'你试图带球推进，被对手抢先捅走球权', need:{technique:.45,decisions:.3,pace:.25}, fail:true}
    ],
    pass:[
      {txt:'你在中后场简单串联，转移进攻方向', need:{passing:.6,decisions:.4}},
      {txt:'你护球转身，把球交给位置更好的队友', need:{passing:.5,physical:.3,composure:.2}}
    ],
    defend:[
      {txt:'对方中场直塞，你及时铲断拦截', need:{defense:.5,decisions:.3,physical:.2}},
      {txt:'你回追完成一次关键抢断', need:{defense:.4,pace:.35,decisions:.25}},
      {txt:'你贴身逼抢，破坏对方的组织节奏', need:{defense:.45,physical:.3,stamina:.25}},
      {txt:'对方禁区前沿起脚，你飞身封堵', need:{defense:.5,physical:.25,composure:.25}},
      {txt:'对方反击时你防守失位，进攻方获得良机', need:{defense:.5,positioning:.3,decisions:.2}, fail:true}
    ]
  },
  后卫:{
    defend:[
      {txt:'对方边锋加速突破，你卡住身位进行一对一防守', need:{defense:.45,pace:.3,positioning:.25}},
      {txt:'对手高球吊入禁区，你抢到第一点解围', need:{heading:.4,defense:.3,physical:.3}},
      {txt:'对方中场直塞，你及时铲断拦截', need:{defense:.45,positioning:.3,decisions:.25}},
      {txt:'对手快速反击，你回追破坏', need:{pace:.4,defense:.3,decisions:.3}},
      {txt:'对方开出角球，你盯住后点的高中锋', need:{defense:.35,heading:.35,positioning:.3}},
      {txt:'你防守失位，对方边锋轻松内切制造险情', need:{defense:.5,positioning:.3,decisions:.2}, fail:true}
    ],
    offball:[
      {txt:'你在定位球进攻中前插到后点空当', need:{offball:.4,heading:.3,pace:.3}},
      {txt:'你压上参与进攻，在边路提供了接应点', need:{offball:.4,stamina:.35,decisions:.25}},
      {txt:'你造越位时机精准，让对手前锋无功而返', need:{decisions:.5,positioning:.4,composure:.1}},
      {txt:'你站位过于靠前，身后留下了大片空当', need:{positioning:.5,decisions:.3,composure:.2}, hidden:true}
    ],
    keypass:[
      {txt:'你从后场送出长传，直接找到前场队友', need:{passing:.5,technique:.3,decisions:.2}},
      {txt:'你断球后一脚出球，直接发起快速反击', need:{passing:.45,vision:.3,decisions:.25}},
      {txt:'你斜传找到边路空当的队友，进攻豁然开朗', need:{passing:.5,decisions:.3,technique:.2}}
    ],
    dribble:[
      {txt:'你带球向前推进，撕开第一道防线', need:{technique:.4,pace:.3,decisions:.3}},
      {txt:'你后场盘带被对手逼抢断球，险些酿成大祸', need:{technique:.45,decisions:.3,composure:.25}, fail:true}
    ],
    pass:[
      {txt:'你顶住压迫，短传交给回撤的中场', need:{passing:.45,composure:.3,technique:.25}},
      {txt:'你简单横传控制节奏，稳住球权', need:{passing:.6,composure:.4}}
    ],
    /* 后卫没有运动战 attack：进攻机会全部来自定位球专项池 */
    setpiece:[
      {kind:'penalty', txt:'球队获得点球，你作为第一点球手站上十二码', need:{finishing:.4,composure:.4,heading:.2}},
      {kind:'header', txt:'角球机会，你高高跃起头球攻门', need:{heading:.55,physical:.3,composure:.15}},
      {kind:'header', txt:'前场任意球吊入禁区，你抢到落点甩头攻门', need:{heading:.45,physical:.3,decisions:.25}}
    ]
  },
  门将:{
    save:[
      {txt:'对手禁区外突施冷箭，你飞身扑救', need:{reflexes:.45,positioning:.3,handling:.25}},
      {txt:'对方前锋单刀杀入禁区，你出击封堵', need:{aerial:.4,decisions:.3,positioning:.3}},
      {txt:'对方近距离头球攻门，你反应极快', need:{reflexes:.5,handling:.3,composure:.2}},
      {txt:'对手主罚点球，你判断方向飞身扑出', need:{reflexes:.4,positioning:.3,composure:.3}},
      {txt:'对方禁区内的补射直奔死角，你侧身扑出', need:{reflexes:.5,handling:.3,decisions:.2}},
      {txt:'对方传中，你在人群中稳稳将球摘下', need:{aerial:.45,physical:.3,handling:.25}}
    ]
  }
};

/* 防守综合能力（用于计算对手期望进球），按位置取可用属性 */
const POS_DEF_NEED={
  前锋:{physical:.4,pace:.35,offball:.25},
  中场:{defense:.55,decisions:.25,physical:.2},
  后卫:{defense:.5,positioning:.3,physical:.2},
  门将:{reflexes:.4,positioning:.35,decisions:.25}
};

const FILLER_TEXTS=[
  '双方在中场反复拉锯，球权不断易手。',
  '你不断跑动寻找空间，队友在后场组织。',
  '比赛节奏很快，攻防转换一波接一波。',
  '教练在场边大声提醒你注意站位。',
  '球迷的助威声一浪高过一浪。',
  '对手收缩防线，你在前场耐心倒脚。',
  '你回撤到中场接应，帮助球队把球控住。',
  '场上的对抗越来越激烈，每一次拼抢都不留余地。'
];

/* ---------- 训练过场动画文案 ----------
   训练日文案按训练类别区分；休息日通用。 */
const TRAIN_CINE_TEXTS={
  create:['传接球与视野训练','直塞球线路打磨','组织调度专项演练'],
  finish:['射门脚法打磨','门前抢点练习','终结冷静度训练'],
  target:['背身拿球对抗训练','头球争顶专项','支点做墙配合演练'],
  build:['中场调度演练','长短传精度训练','攻防转换决策训练'],
  arrive:['后插上时机演练','远射与冲击训练','禁区攻坚专项'],
  screen:['拦截站位训练','贴身逼抢演练','防守选位专项'],
  buildout:['后场出球演练','由守转攻传球训练','控球推进专项'],
  aerial:['高空球防守演练','头球解围专项','盯人争顶训练'],
  duel:['一对一卡位对抗','身体对抗训练','贴身防守演练'],
  reflex:['反应扑救训练','快速射门扑救演练','神经反应专项'],
  claim:['高空球摘取训练','出击时机演练','制空对抗专项'],
  distribute:['手抛球与开球训练','发动进攻传球演练','长传精度专项'],
  physical:['力量房体能训练','折返跑与冲刺练习','耐力储备训练'],
  general:['全项目综合训练','技术体能交替课','多项综合演练']
};
const REST_CINE_TEXTS=['恢复性休息','按摩放松与理疗','自由活动调整','充分睡眠恢复'];

/* ---------- 成就表 ---------- */
const ACHIEVEMENTS=[
  {id:'first_goal', name:'处子球', desc:'打进职业生涯第一球'},
  {id:'hat_trick', name:'帽子戏法', desc:'单场打进3球'},
  {id:'five_goal', name:'五子登科', desc:'单场打进5球'},
  {id:'first_trophy', name:'首个冠军', desc:'赢得第一个联赛冠军'},
  {id:'top_tier_champ', name:'顶级联赛冠军', desc:'赢得中超冠军'},
  {id:'promoted', name:'升级功臣', desc:'随队升级'},
  {id:'motm_10', name:'全场最佳', desc:'单场评分 8.5+'},
  {id:'rating_9', name:'满分表现', desc:'单场评分 9.0+'},
  {id:'season_20', name:'赛季20球', desc:'单赛季打进20球'},
  {id:'season_30', name:'金靴级', desc:'单赛季打进30球'},
  {id:'ca16', name:'顶级球员', desc:'综合评级达到 4★'},
  {id:'ca18', name:'世界级', desc:'综合评级达到 4.5★'},
  {id:'big_club', name:'豪门之路', desc:'效力中超球队'},
  {id:'career_100', name:'百场先生', desc:'职业生涯出场100场'},
  {id:'career_50', name:'生涯50球', desc:'职业生涯打进50球'},
  {id:'legend', name:'传奇退役', desc:'以 S 级评价退役'}
];
