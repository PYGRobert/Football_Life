/* ============================================================
   足球人生 · 静态配置
   ------------------------------------------------------------
   这里只放“可调数值 / 名称 / 文案 / 概率表 / 成就表”。
   修改平衡性时优先改这个文件，不要动引擎逻辑。
   ============================================================ */
'use strict';

/* ---------- 基础位置与属性 ---------- */
const POSITIONS=['门将','后卫','中场','前锋'];

/* 12 项属性，分为技术 / 精神 / 身体三组，参考 FM 的球员档案 */
const ATTRS=[
  'pace','technique','passing','dribbling','attack','defense',
  'heading','vision','decisions','composure','physical','stamina'
];
const ATTR_LABEL={
  pace:'速度', technique:'技术', passing:'传球', dribbling:'盘带',
  attack:'射门', defense:'防守', heading:'头球', vision:'视野',
  decisions:'决断', composure:'冷静', physical:'力量', stamina:'耐力'
};
const ATTR_GROUPS=[
  {name:'技术', keys:['technique','passing','dribbling','attack','heading','defense']},
  {name:'精神', keys:['vision','decisions','composure']},
  {name:'身体', keys:['pace','physical','stamina']}
];

/* 1-20 等级的起始区间，按位置区分 */
const ATTR_START={
  门将:{pace:[3,6],technique:[5,8],passing:[6,8],dribbling:[3,5],attack:[2,4],defense:[8,11],
        heading:[5,7],vision:[6,8],decisions:[7,9],composure:[8,10],physical:[6,8],stamina:[6,8]},
  后卫:{pace:[5,7],technique:[5,7],passing:[6,8],dribbling:[4,6],attack:[3,5],defense:[8,10],
        heading:[7,9],vision:[5,7],decisions:[7,9],composure:[7,9],physical:[7,9],stamina:[6,8]},
  中场:{pace:[5,7],technique:[8,10],passing:[8,10],dribbling:[7,9],attack:[6,8],defense:[5,7],
        heading:[5,6],vision:[8,10],decisions:[7,9],composure:[7,9],physical:[5,6],stamina:[7,9]},
  前锋:{pace:[7,9],technique:[7,9],passing:[5,7],dribbling:[7,9],attack:[8,10],defense:[3,4],
        heading:[6,8],vision:[6,8],decisions:[5,7],composure:[6,8],physical:[5,7],stamina:[5,7]}
};

const CLUB_TIERS=[
  {name:'甲A联赛', tier:1, clubs:['沪上申城','广州塔城','京师御林','川蜀雄鹰','齐鲁泰山','江东风流','南粤虎门','渝州山城']},
  {name:'甲级联赛', tier:2, clubs:['滨海快艇','中原铁军','滇池雪豹','塞北狼群','湘江浪潮','陇右飞骑','闽海蛟龙','桂岭百色']},
  {name:'乙级联赛', tier:3, clubs:['漠河极光','琼崖椰风','河西走廊','天山雪莲','雁北飞燕','赣水红枫','黔中梯田','青海湖畔']},
  {name:'地区联赛', tier:4, clubs:['渔村联','矿工队','小镇FC','码头工人','山民联','校园联','农场联','島民FC']}
];

const FIRST_NAMES=['小','阿','李','王','张','刘','陈','杨','赵','黄','周','吴','徐','孙','马','朱','林','郭','何','高'];
const GIVEN_NAMES=['磊','强','军','伟','勇','杰','峰','涛','斌','超','辉','鹏','宇','晨','阳','风','龙','翔','轩','泽','俊','凯','浩','子墨','天翼','明轩','博文','思远','志豪','嘉禾'];

const FIRST_TOUCH_EVENTS=[
  {t:'街边野球场', d:'一场野球比赛被球探注意到，个子虽小但球感出众', stat:{technique:2,dribbling:1,attack:1}, rep:2},
  {t:'校园足球队', d:'校队教练认为你纪律性出色，基本功扎实', stat:{technique:1,defense:1,stamina:1,decisions:1}, rep:1},
  {t:'青训营选拔', d:'通过正规青训营选拔，接受系统训练', stat:{pace:1,technique:1,physical:2,passing:1}, rep:3},
  {t:'家乡小球场', d:'每天放学后对着墙练球两小时，练出了金左脚', stat:{technique:2,attack:2,composure:1}, rep:1}
];


/* ---------- 经验曲线（界面不显示经验数字） ---------- */
const XP_GROWTH=1.28;
/* 不同属性升级所需经验不同：身体类便宜，精神类昂贵 */
const ATTR_XP_BASE={
  pace:20, technique:16, passing:14, dribbling:18, attack:20, defense:18,
  heading:22, vision:20, decisions:20, composure:24, physical:16, stamina:14
};

/* ---------- 位置与综合能力权重（每行合计 1.0） ---------- */
const ATTR_WEIGHTS={
  门将:{defense:.30,decisions:.13,composure:.12,technique:.10,passing:.08,physical:.08,stamina:.07,pace:.04,heading:.04,vision:.04},
  后卫:{defense:.24,heading:.11,physical:.13,pace:.12,decisions:.08,passing:.07,technique:.06,stamina:.08,composure:.05,vision:.04,dribbling:.02},
  中场:{passing:.17,technique:.16,vision:.13,decisions:.10,dribbling:.09,stamina:.09,defense:.07,attack:.07,pace:.06,composure:.04,physical:.02},
  前锋:{attack:.24,technique:.13,pace:.15,dribbling:.11,heading:.09,passing:.07,composure:.06,decisions:.05,vision:.04,physical:.03,stamina:.03}
};

/* ---------- 训练：五个模块 + 三档强度 ---------- */
const TRAIN_CATS=[
  {id:'technique', name:'技术训练', icon:'🎨', desc:'技术、传球、盘带与视野', cost:12},
  {id:'attacking', name:'射门训练', icon:'🎯', desc:'射门、头球与终结',     cost:13},
  {id:'defending', name:'防守训练', icon:'🛡️', desc:'防守、对抗与位置感',   cost:13},
  {id:'speed',     name:'速度训练', icon:'⚡', desc:'速度、爆发与盘带',     cost:14},
  {id:'fitness',   name:'体能训练', icon:'💪', desc:'耐力、力量与对抗',     cost:13}
];

/* 同一训练模块对不同位置加成不同：权重越高，获得的属性经验越多 */
const TRAIN_POS_WEIGHTS={
  technique:{
    前锋:{technique:1,dribbling:.8,passing:.55,vision:.5,composure:.35,decisions:.3},
    中场:{technique:.9,passing:1,dribbling:.7,vision:.8,decisions:.55,composure:.35},
    后卫:{technique:.6,passing:.8,heading:.45,decisions:.5,vision:.4},
    门将:{technique:.8,passing:.75,decisions:.5,composure:.45,vision:.4}
  },
  attacking:{
    前锋:{attack:1,composure:.7,heading:.75,technique:.5,decisions:.45,pace:.35},
    中场:{attack:.7,technique:.55,vision:.5,composure:.55,decisions:.5,passing:.4},
    后卫:{heading:.8,attack:.45,physical:.5,decisions:.4,composure:.45},
    门将:{passing:.5,decisions:.55,composure:.5,technique:.4}
  },
  defending:{
    前锋:{defense:.5,decisions:.4,physical:.4,heading:.45,composure:.3},
    中场:{defense:.8,decisions:.55,physical:.5,stamina:.45,heading:.4},
    后卫:{defense:1,heading:.8,physical:.7,decisions:.55,pace:.45,stamina:.45},
    门将:{defense:1,decisions:.7,composure:.6,heading:.45,physical:.5}
  },
  speed:{
    前锋:{pace:1,dribbling:.7,physical:.45,stamina:.35},
    中场:{pace:.8,dribbling:.7,stamina:.55,physical:.35},
    后卫:{pace:.9,physical:.5,stamina:.45,defense:.4},
    门将:{pace:.7,physical:.5,decisions:.35,stamina:.35}
  },
  fitness:{
    前锋:{stamina:.8,physical:.7,pace:.45},
    中场:{stamina:1,physical:.6,pace:.4},
    后卫:{physical:.9,stamina:.8,heading:.4},
    门将:{physical:.8,stamina:.7,decisions:.4}
  }
};

const INTENSITIES=[
  {id:'light', name:'轻度训练', hint:'消耗 ×0.55', costMul:0.55, xpMul:0.5},
  {id:'normal',name:'普通训练', hint:'均衡',        costMul:1.0,  xpMul:1.0},
  {id:'hard',  name:'强化特训', hint:'消耗 ×2.3',  costMul:2.3,  xpMul:2.2}
];

/* 训练后体能恢复到下一场开场目标（只在体能低于目标时恢复） */
const TRAIN_READY={light:100,normal:95,hard:82};

/* ---------- 联赛平均能力 ---------- */
const LEAGUE_AVG=[0,14.2,12.2,10.2,8.2];

/* ---------- 比赛关键事件：位置权重 / 事件池 / 非关键点文案 ---------- */
/* 不同位置的关键事件类型权重 */
const POS_EVENT_WEIGHTS={
  门将:{save:.75, pass:.20, defend:.05},
  后卫:{defend:.58, pass:.22, attack:.20},
  中场:{pass:.40, attack:.30, defend:.30},
  前锋:{attack:.55, pass:.30, defend:.15}
};

const MATCH_EVENTS={
  attack:[
    {txt:'你接到队友的传球，稍作调整起脚远射', need:{attack:.5,technique:.3,composure:.2}},
    {txt:'你在禁区内抢到落点，甩头攻门', need:{attack:.45,heading:.35,physical:.2}},
    {txt:'你反越位成功形成单刀', need:{attack:.45,pace:.3,composure:.25}},
    {txt:'你在禁区边缘连续变向后小角度抽射', need:{attack:.4,dribbling:.35,technique:.25}},
    {txt:'队友倒三角回做，你迎球推射', need:{attack:.55,composure:.25,technique:.2}},
    {txt:'你主罚点球，站在十二码前', need:{attack:.55,composure:.35,decisions:.1}}
  ],
  pass:[
    {txt:'你在中场拿球，观察队友跑位后送出直塞', need:{passing:.55,vision:.3,technique:.15}},
    {txt:'你在边路起脚传中', need:{passing:.45,technique:.25,pace:.2,vision:.1}},
    {txt:'你和队友打出二过一配合', need:{passing:.4,dribbling:.3,decisions:.3}},
    {txt:'你主罚前场任意球，把球吊入禁区', need:{passing:.55,vision:.25,technique:.2}},
    {txt:'你在中场转身摆脱后长传转移', need:{passing:.45,vision:.3,dribbling:.25}},
    {txt:'你在肋部与队友做撞墙配合后回做', need:{passing:.45,technique:.3,decisions:.25}}
  ],
  defend:[
    {txt:'对方边锋加速突破，你卡住身位进行一对一防守', need:{defense:.5,pace:.25,decisions:.25}},
    {txt:'对手高球吊入禁区，你抢到第一点解围', need:{defense:.4,heading:.35,physical:.25}},
    {txt:'对方中场直塞，你及时铲断拦截', need:{defense:.45,decisions:.3,physical:.25}},
    {txt:'对手快速反击，你回追破坏', need:{defense:.4,pace:.35,decisions:.25}},
    {txt:'对方在禁区前沿起脚，你飞身封堵', need:{defense:.55,physical:.25,composure:.2}},
    {txt:'对方开出角球，你盯住后点的高中锋', need:{defense:.4,heading:.35,physical:.25}}
  ],
  save:[
    {txt:'对手禁区外突施冷箭，你飞身扑救', need:{defense:.45,decisions:.3,composure:.25}},
    {txt:'对方前锋单刀杀入禁区，你出击封堵', need:{defense:.45,decisions:.3,physical:.25}},
    {txt:'对手角球开出，你在人群中高高跃起摘球', need:{defense:.4,heading:.3,physical:.3}},
    {txt:'对方近距离头球攻门，你反应极快', need:{defense:.55,composure:.25,decisions:.2}},
    {txt:'对手主罚点球，你判断方向', need:{defense:.5,composure:.3,decisions:.2}},
    {txt:'对方禁区内的补射直奔死角，你侧身扑出', need:{defense:.55,composure:.25,decisions:.2}}
  ]
};

const POS_SPECIAL_EVENTS={
  门将:{
    pass:[
      {txt:'你稳稳接住对方传中，随后手抛球发动快攻', need:{passing:.45,vision:.3,decisions:.25}},
      {txt:'你大脚开球越过半场，直接寻找前场队友', need:{passing:.4,physical:.35,vision:.25}},
      {txt:'你短传给回撤的中卫，帮助球队从后场组织', need:{passing:.55,decisions:.3,composure:.15}},
      {txt:'你出击到禁区外将球解围后，迅速分给边路', need:{defense:.4,passing:.35,decisions:.25}},
      {txt:'你扑住远射后快速起身，把球抛给边锋', need:{passing:.45,defense:.3,vision:.25}}
    ],
    defend:[
      {txt:'对方直塞打身后，你果断出击把球没收', need:{defense:.5,decisions:.3,pace:.2}},
      {txt:'对手开出角球，你冲出击球区将球击出', need:{defense:.45,heading:.3,physical:.25}},
      {txt:'对方快速反击形成单刀，你出击封堵角度', need:{defense:.5,decisions:.3,physical:.2}}
    ]
  }
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
  {id:'ca16', name:'顶级球员', desc:'综合评分达到 16'},
  {id:'ca18', name:'世界级', desc:'综合评分达到 18'},
  {id:'big_club', name:'豪门之路', desc:'效力甲A联赛球队'},
  {id:'career_100', name:'百场先生', desc:'职业生涯出场100场'},
  {id:'career_50', name:'生涯50球', desc:'职业生涯打进50球'},
  {id:'legend', name:'传奇退役', desc:'以 S 级评价退役'}
];
