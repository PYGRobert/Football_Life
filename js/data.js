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
  {name:'甲A联赛', tier:1, clubs:['沪上申城','广州塔城','京师御林','川蜀雄鹰','齐鲁泰山','江东风流','南粤虎门','渝州山城']},
  {name:'甲级联赛', tier:2, clubs:['滨海快艇','中原铁军','滇池雪豹','塞北狼群','湘江浪潮','陇右飞骑','闽海蛟龙','桂岭百色']},
  {name:'乙级联赛', tier:3, clubs:['漠河极光','琼崖椰风','河西走廊','天山雪莲','雁北飞燕','赣水红枫','黔中梯田','青海湖畔']}
];

const LEAGUE_QUALITY={
  1:{name:'甲A联赛', mean:13.4, sd:2.0},
  2:{name:'甲级联赛', mean:11.4, sd:2.0},
  3:{name:'乙级联赛', mean:9.4,  sd:2.0}
};

const ATTR_NORM={
  technique:1.0, finishing:0.95, composure:1.0, offball:0.98, passing:1.0,
  vision:0.98, heading:0.95, decisions:1.0, attack:0.95, defense:1.0,
  positioning:1.0, reflexes:1.0, handling:1.0, aerial:0.98,
  pace:1.05, stamina:1.05, physical:1.0
};

const FIRST_NAMES=['小','阿','李','王','张','刘','陈','杨','赵','黄','周','吴','徐','孙','马','朱','林','郭','何','高'];
const GIVEN_NAMES=['磊','强','军','伟','勇','杰','峰','涛','斌','超','辉','鹏','宇','晨','阳','风','龙','翔','轩','泽','俊','凯','浩','子墨','天翼','明轩','博文','思远','志豪','嘉禾'];

/* ---------- 足球起点：各位置对应的职责 ----------
   开始界面只显示职责名称（无提示性描述），加成由引擎静默应用。 */
const FIRST_TOUCH_BY_POS={
  前锋:[
    {t:'创造机会', stat:{passing:2,vision:1,technique:1},  rep:2},
    {t:'把握机会', stat:{finishing:2,composure:1,offball:1},rep:2},
    {t:'支点能力', stat:{heading:2,physical:1,technique:1}, rep:2}
  ],
  中场:[
    {t:'组织调度', stat:{passing:2,vision:1,decisions:1},  rep:2},
    {t:'攻坚插上', stat:{attack:2,composure:1,pace:1},    rep:2},
    {t:'防守拦截', stat:{defense:2,decisions:1,physical:1},rep:2}
  ],
  后卫:[
    {t:'出球组织', stat:{passing:2,technique:1,decisions:1},rep:2},
    {t:'防空拦截', stat:{heading:2,positioning:1,defense:1},rep:2},
    {t:'卡位对抗', stat:{defense:2,physical:1,pace:1},     rep:2}
  ],
  门将:[
    {t:'扑救反应', stat:{reflexes:2,handling:1,composure:1},rep:2},
    {t:'制空出击', stat:{aerial:2,positioning:1,physical:1},rep:2},
    {t:'发动进攻', stat:{passing:2,technique:1,decisions:1},rep:2}
  ]
};

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

/* ---------- 位置与综合能力权重（每行合计 1.0，键必须覆盖该位置全部属性） ---------- */
const ATTR_WEIGHTS={
  前锋:{finishing:.22,composure:.10,offball:.10,passing:.09,vision:.08,
        technique:.10,heading:.08,pace:.12,stamina:.05,physical:.06},
  中场:{passing:.17,vision:.12,technique:.12,decisions:.11,attack:.11,
        composure:.07,defense:.10,pace:.07,stamina:.08,physical:.05},
  后卫:{defense:.20,positioning:.13,heading:.11,decisions:.10,passing:.09,
        technique:.07,composure:.06,pace:.11,stamina:.06,physical:.07},
  门将:{reflexes:.22,handling:.15,aerial:.12,positioning:.13,decisions:.10,
        passing:.07,technique:.06,composure:.06,stamina:.04,physical:.05}
};

/* 每个位置的核心属性（高龄衰减时优先保护） */
const POS_CORE_ATTR={前锋:'finishing',中场:'passing',后卫:'defense',门将:'reflexes'};

/* ---------- 训练：按位置职能设计 ----------
   每个位置 3 个“角色职责方向”训练 + 1 个位置通用的“身体素质”训练。
   通用逻辑（FM 式）：所有属性等权重获得经验；
   当训练组合命中 TRAIN_FOCUS 中的重点属性时，这些属性权重上升 FOCUS_BOOST 倍。 */
const TRAIN_CATS={
  前锋:[
    {id:'create',  name:'创造机会', cost:12},
    {id:'finish',  name:'把握机会', cost:13},
    {id:'target',  name:'支点能力', cost:13},
    {id:'physical',name:'身体素质', cost:13},
    {id:'general', name:'综合训练', cost:12}
  ],
  中场:[
    {id:'build',   name:'组织调度', cost:12},
    {id:'arrive',  name:'攻坚插上', cost:13},
    {id:'screen',  name:'防守拦截', cost:13},
    {id:'physical',name:'身体素质', cost:13},
    {id:'general', name:'综合训练', cost:12}
  ],
  后卫:[
    {id:'buildout',name:'出球组织', cost:12},
    {id:'aerial',  name:'防空拦截', cost:13},
    {id:'duel',    name:'卡位对抗', cost:13},
    {id:'physical',name:'身体素质', cost:13},
    {id:'general', name:'综合训练', cost:12}
  ],
  门将:[
    {id:'reflex',    name:'扑救反应', cost:13},
    {id:'claim',     name:'制空出击', cost:12},
    {id:'distribute',name:'发动进攻', cost:12},
    {id:'physical',  name:'身体素质', cost:13},
    {id:'general',   name:'综合训练', cost:12}
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
   体能结算 = 上场剩余体能 + 休息恢复 − 训练消耗。
   成长不随天数线性放大：第 1 天为基准，之后按 DAY_XP_DECAY 边际递减。 */
const WEEK_DAYS=6;
const TRAIN_DAY_XP=2;                 /* 第 1 天的单属性基准成长（配合 learnMul 与指数曲线） */
const FOCUS_BOOST=1.8;                /* 重点属性权重倍率 */
const DAY_XP_DECAY=[1,0.85,0.75,0.7,0.65,0.6,0.55];  /* 第 n 天的边际收益（6 天合计 4.55×） */
const FIT_RECOVER_PER_DAY=9;          /* 每个休息日的体能恢复 */
const TRAIN_COST_PER_DAY_MUL=0.45;    /* 每训练 1 天的体能消耗 = cat.cost × 0.45 */

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
/* 不同位置的关键事件类型权重 */
const POS_EVENT_WEIGHTS={
  门将:{save:1},
  后卫:{attack:.15, pass:.10, defend:.75},
  中场:{pass:.40, attack:.30, defend:.30},
  前锋:{attack:.60, pass:.40}
};

/* 事件池按位置组织，need 只允许引用该位置属性表内的键 */
const MATCH_EVENTS={
  前锋:{
    attack:[
      {txt:'你反越位成功形成单刀', need:{finishing:.45,offball:.3,pace:.25}},
      {txt:'你接到队友的传球，稍作调整起脚远射', need:{finishing:.5,technique:.3,composure:.2}},
      {txt:'你在禁区内抢到落点，甩头攻门', need:{finishing:.35,heading:.4,physical:.25}},
      {txt:'你在禁区边缘连续变向后小角度抽射', need:{finishing:.4,technique:.35,offball:.25}},
      {txt:'队友倒三角回做，你迎球推射', need:{finishing:.55,composure:.25,offball:.2}},
      {txt:'你主罚点球，站在十二码前', need:{finishing:.5,composure:.5}}
    ],
    pass:[
      {txt:'你在禁区前沿拿球，观察队友跑位后送出直塞', need:{passing:.5,vision:.35,technique:.15}},
      {txt:'你在边路起脚传中', need:{passing:.45,technique:.25,vision:.2,pace:.1}},
      {txt:'你回撤接应，与队友打出二过一配合', need:{passing:.4,technique:.3,offball:.3}},
      {txt:'你背身拿球做墙，轻轻一蹭送到队友脚下', need:{passing:.45,physical:.3,technique:.25}},
      {txt:'你在肋部分球后迅速前插，队友心领神会', need:{passing:.4,vision:.3,offball:.3}},
      {txt:'你高高跃起头球摆渡，为队友创造机会', need:{heading:.45,passing:.3,offball:.25}}
    ]
  },
  中场:{
    attack:[
      {txt:'你后插上进入禁区，迎球推射', need:{attack:.45,pace:.3,composure:.25}},
      {txt:'你在禁区前沿突施冷箭', need:{attack:.5,technique:.3,composure:.2}},
      {txt:'你主罚点球，冷静推射死角', need:{attack:.5,composure:.4,decisions:.1}},
      {txt:'你和队友撞墙配合后杀入禁区完成射门', need:{attack:.4,passing:.3,technique:.3}},
      {txt:'你抢在后卫身前完成捅射', need:{attack:.45,decisions:.3,pace:.25}},
      {txt:'你主罚任意球，直接攻门', need:{attack:.45,technique:.35,composure:.2}}
    ],
    pass:[
      {txt:'你在中场拿球，观察队友跑位后送出直塞', need:{passing:.55,vision:.3,decisions:.15}},
      {txt:'你在中场转身摆脱后长传转移', need:{passing:.45,vision:.3,technique:.25}},
      {txt:'你主罚前场任意球，把球吊入禁区', need:{passing:.5,vision:.3,technique:.2}},
      {txt:'你和队友打出二过一配合', need:{passing:.4,technique:.3,decisions:.3}},
      {txt:'你在肋部倒三角回做，找到插上的队友', need:{passing:.45,vision:.35,composure:.2}},
      {txt:'你外脚背送出贴地斩，撕开防线', need:{passing:.5,technique:.35,vision:.15}}
    ],
    defend:[
      {txt:'对方中场直塞，你及时铲断拦截', need:{defense:.5,decisions:.3,physical:.2}},
      {txt:'你回追完成一次关键抢断', need:{defense:.4,pace:.35,decisions:.25}},
      {txt:'你贴身逼抢，破坏对方的组织节奏', need:{defense:.45,physical:.3,stamina:.25}},
      {txt:'你抢先一步截断对方的传球路线', need:{defense:.45,decisions:.35,pace:.2}},
      {txt:'对方禁区前沿起脚，你飞身封堵', need:{defense:.5,physical:.25,composure:.25}},
      {txt:'你争下第二落点，牢牢控制住中场', need:{physical:.4,defense:.35,stamina:.25}}
    ]
  },
  后卫:{
    defend:[
      {txt:'对方边锋加速突破，你卡住身位进行一对一防守', need:{defense:.45,pace:.3,positioning:.25}},
      {txt:'对手高球吊入禁区，你抢到第一点解围', need:{heading:.4,defense:.3,physical:.3}},
      {txt:'对方中场直塞，你及时铲断拦截', need:{defense:.45,positioning:.3,decisions:.25}},
      {txt:'对手快速反击，你回追破坏', need:{pace:.4,defense:.3,decisions:.3}},
      {txt:'对方在禁区前沿起脚，你飞身封堵', need:{defense:.5,physical:.25,positioning:.25}},
      {txt:'对方开出角球，你盯住后点的高中锋', need:{defense:.35,heading:.35,positioning:.3}}
    ],
    pass:[
      {txt:'你断球后冷静分边，发起反击', need:{passing:.45,decisions:.3,composure:.25}},
      {txt:'你从后场送出长传，直接找前场队友', need:{passing:.5,technique:.3,decisions:.2}},
      {txt:'你顶住压迫，短传交给回撤的中场', need:{passing:.45,composure:.3,technique:.25}},
      {txt:'你带球向前推进，撕开第一道防线', need:{technique:.4,pace:.3,decisions:.3}},
      {txt:'你斜传找到边路空当的队友', need:{passing:.5,decisions:.3,technique:.2}},
      {txt:'你头球摆渡给队友，化解压力并组织进攻', need:{heading:.45,passing:.3,decisions:.25}}
    ],
    attack:[
      {txt:'角球机会，你高高跃起头球攻门', need:{heading:.55,physical:.3,composure:.15}},
      {txt:'定位球机会，你冲入禁区抢点', need:{heading:.45,pace:.3,decisions:.25}},
      {txt:'你后插上尝试远射考验门将', need:{technique:.4,physical:.3,decisions:.3}}
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

/* ---------- 成就表 ---------- */
const ACHIEVEMENTS=[
  {id:'first_goal', name:'处子球', desc:'打进职业生涯第一球'},
  {id:'hat_trick', name:'帽子戏法', desc:'单场打进3球'},
  {id:'five_goal', name:'五子登科', desc:'单场打进5球'},
  {id:'first_trophy', name:'首个冠军', desc:'赢得第一个联赛冠军'},
  {id:'top_tier_champ', name:'顶级联赛冠军', desc:'赢得甲A联赛冠军'},
  {id:'promoted', name:'升级功臣', desc:'随队升级'},
  {id:'motm_10', name:'全场最佳', desc:'单场评分 8.5+'},
  {id:'rating_9', name:'满分表现', desc:'单场评分 9.0+'},
  {id:'season_20', name:'赛季20球', desc:'单赛季打进20球'},
  {id:'season_30', name:'金靴级', desc:'单赛季打进30球'},
  {id:'ca16', name:'顶级球员', desc:'综合评级达到 4★'},
  {id:'ca18', name:'世界级', desc:'综合评级达到 4.5★'},
  {id:'big_club', name:'豪门之路', desc:'效力甲A联赛球队'},
  {id:'career_100', name:'百场先生', desc:'职业生涯出场100场'},
  {id:'career_50', name:'生涯50球', desc:'职业生涯打进50球'},
  {id:'legend', name:'传奇退役', desc:'以 S 级评价退役'}
];
