/* ============================================================
   足球人生 · 静态配置
   ------------------------------------------------------------
   这里只放“可调数值 / 名称 / 文案 / 概率表 / 成就表”。
   修改平衡性时优先改这个文件，不要动引擎逻辑。
   ============================================================ */
'use strict';

/* ---------- 基础位置与属性 ---------- */
const POSITIONS=['门将','后卫','中场','前锋'];

const ATTRS=['pace','technique','attack','defense','physical','stamina'];
const ATTR_LABEL={pace:'速度',technique:'创造力',attack:'把握机会',defense:'防守',physical:'身体',stamina:'体能'};

/* 1-20 等级的起始区间，按位置区分 */
const ATTR_START={
  门将:{pace:[3,6],technique:[5,8],attack:[2,4],defense:[8,11],physical:[6,8],stamina:[6,8]},
  后卫:{pace:[5,7],technique:[5,7],attack:[3,5],defense:[8,10],physical:[7,9],stamina:[6,8]},
  中场:{pace:[5,7],technique:[8,10],attack:[6,8],defense:[5,7],physical:[5,6],stamina:[7,9]},
  前锋:{pace:[7,9],technique:[7,9],attack:[8,10],defense:[3,4],physical:[5,7],stamina:[5,7]}
};

const NATION_TIER=[
  {n:'巴西',t:1},{n:'法国',t:1},{n:'阿根廷',t:1},{n:'德国',t:1},{n:'西班牙',t:1},
  {n:'英格兰',t:1},{n:'葡萄牙',t:1},{n:'意大利',t:1},{n:'荷兰',t:1},
  {n:'比利时',t:2},{n:'克罗地亚',t:2},{n:'乌拉圭',t:2},{n:'哥伦比亚',t:2},{n:'墨西哥',t:2},
  {n:'日本',t:2},{n:'韩国',t:2},{n:'塞内加尔',t:2},{n:'瑞士',t:2},{n:'丹麦',t:2},
  {n:'中国',t:3},{n:'澳大利亚',t:3},{n:'尼日利亚',t:3},{n:'加纳',t:3},{n:'埃及',t:3},
  {n:'波兰',t:3},{n:'瑞典',t:3},{n:'捷克',t:3},{n:'美国',t:3}
];

const CLUB_TIERS=[
  {name:'甲A联赛', tier:1, clubs:['沪上申城','广州塔城','京师御林','川蜀雄鹰','齐鲁泰山','江东风流','南粤虎门','渝州山城']},
  {name:'甲级联赛', tier:2, clubs:['滨海快艇','中原铁军','滇池雪豹','塞北狼群','湘江浪潮','陇右飞骑','闽海蛟龙','桂岭百色']},
  {name:'乙级联赛', tier:3, clubs:['漠河极光','琼崖椰风','河西走廊','天山雪莲','雁北飞燕','赣水红枫','黔中梯田','青海湖畔']},
  {name:'地区联赛', tier:4, clubs:['渔村联','矿工队','小镇FC','码头工人','山民联','校园联','农场联','島民FC']}
];

const FIRST_NAMES=['小','阿','李','王','张','刘','陈','杨','赵','黄','周','吴','徐','孙','马','朱','林','郭','何','高'];
const GIVEN_NAMES=['磊','强','军','伟','勇','杰','峰','涛','斌','超','辉','鹏','宇','晨','阳','风','龙','翔','轩','泽','俊','凯','浩','子墨','天翼','明轩','博文','思远','志豪','嘉禾'];

const FIRST_TOUCH_EVENTS=[
  {t:'街边野球场', d:'一场野球比赛被球探注意到，个子虽小但球感出众', stat:{technique:2,attack:1}, rep:2},
  {t:'校园足球队', d:'校队教练认为你纪律性出色，基本功扎实', stat:{technique:1,defense:1,stamina:1}, rep:1},
  {t:'青训营选拔', d:'通过正规青训营选拔，接受系统训练', stat:{pace:1,technique:1,physical:2}, rep:3},
  {t:'家乡小球场', d:'每天放学后对着墙练球两小时，练出了金左脚', stat:{technique:2,attack:2}, rep:1}
];


/* ---------- 经验曲线（界面不显示经验数字） ---------- */
const XP_BASE=16, XP_GROWTH=1.28;

/* ---------- 位置与综合能力权重 ---------- */
const ATTR_WEIGHTS={
  门将:{defense:.35,technique:.2,physical:.15,pace:.1,stamina:.15,attack:.05},
  后卫:{defense:.32,physical:.2,pace:.16,technique:.14,stamina:.13,attack:.05},
  中场:{technique:.3,stamina:.18,defense:.15,attack:.15,pace:.12,physical:.1},
  前锋:{attack:.34,technique:.24,pace:.2,physical:.1,stamina:.08,defense:.04}
};

/* ---------- 训练：五大类别 + 三档强度 ---------- */
const TRAIN_CATS=[
  {id:'creativity', name:'创造力训练', icon:'🎨', desc:'技术、视野与想象力', effects:{technique:1, attack:.4, defense:.15}, cost:12},
  {id:'finishing',  name:'把握机会',   icon:'🎯', desc:'射门、抢点与终结',   effects:{attack:1, technique:.4, physical:.1}, cost:13},
  {id:'speed',      name:'速度训练',   icon:'⚡', desc:'加速、爆发与步频',   effects:{pace:1, physical:.3, stamina:.1}, cost:14},
  {id:'fitness',    name:'体能训练',   icon:'💪', desc:'耐力、对抗与恢复储备', effects:{stamina:1, physical:.4, pace:.1}, cost:13},
  {id:'recovery',   name:'恢复训练',   icon:'🛌', desc:'放松、理疗与状态调整', effects:null, cost:0}
];

const INTENSITIES=[
  {id:'light', name:'轻度训练', hint:'消耗 ×0.55', costMul:0.55, xpMul:0.5, rest:24},
  {id:'normal',name:'普通训练', hint:'均衡',        costMul:1.0,  xpMul:1.0, rest:45},
  {id:'hard',  name:'强化特训', hint:'消耗 ×2.3',  costMul:2.3,  xpMul:2.2, rest:65}
];

function recRestore(it){ return it.rest; }

/* ---------- 体能恢复与联赛平均能力 ---------- */
const WEEKLY_RECOVERY=56;
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
    {txt:'你接到队友的传球，稍作调整起脚远射', need:{attack:.55,technique:.45}},
    {txt:'你在禁区内抢到落点，甩头攻门', need:{attack:.5,physical:.5}},
    {txt:'你反越位成功形成单刀', need:{attack:.55,pace:.45}},
    {txt:'你在禁区边缘连续变向后小角度抽射', need:{attack:.5,technique:.5}},
    {txt:'队友倒三角回做，你迎球推射', need:{attack:.7,technique:.3}},
    {txt:'你主罚点球，站在十二码前', need:{attack:.8,technique:.2}}
  ],
  pass:[
    {txt:'你在中场拿球，观察队友跑位后送出直塞', need:{technique:.65,attack:.35}},
    {txt:'你在边路起脚传中', need:{technique:.55,pace:.45}},
    {txt:'你和队友打出二过一配合', need:{technique:.5,pace:.5}},
    {txt:'你主罚前场任意球，把球吊入禁区', need:{technique:.75,physical:.25}},
    {txt:'你在中场转身摆脱后长传转移', need:{technique:.7,physical:.3}},
    {txt:'你在肋部与队友做撞墙配合后回做', need:{technique:.6,attack:.4}}
  ],
  defend:[
    {txt:'对方边锋加速突破，你卡住身位进行一对一防守', need:{defense:.6,pace:.4}},
    {txt:'对手高球吊入禁区，你抢到第一点解围', need:{defense:.5,physical:.5}},
    {txt:'对方中场直塞，你及时铲断拦截', need:{defense:.6,physical:.4}},
    {txt:'对手快速反击，你回追破坏', need:{defense:.5,pace:.5}},
    {txt:'对方在禁区前沿起脚，你飞身封堵', need:{defense:.7,physical:.3}},
    {txt:'对方开出角球，你盯住后点的高中锋', need:{defense:.55,physical:.45}}
  ],
  save:[
    {txt:'对手禁区外突施冷箭，你飞身扑救', need:{defense:.55,technique:.45}},
    {txt:'对方前锋单刀杀入禁区，你出击封堵', need:{defense:.6,physical:.4}},
    {txt:'对手角球开出，你在人群中高高跃起摘球', need:{defense:.5,physical:.5}},
    {txt:'对方近距离头球攻门，你反应极快', need:{defense:.7,technique:.3}},
    {txt:'对手主罚点球，你判断方向', need:{defense:.75,technique:.25}},
    {txt:'对方禁区内的补射直奔死角，你侧身扑出', need:{defense:.7,technique:.3}}
  ]
};

const POS_SPECIAL_EVENTS={
  门将:{
    pass:[
      {txt:'你稳稳接住对方传中，随后手抛球发动快攻', need:{technique:.6,attack:.4}},
      {txt:'你大脚开球越过半场，直接寻找前场队友', need:{technique:.55,physical:.45}},
      {txt:'你短传给回撤的中卫，帮助球队从后场组织', need:{technique:.7,defense:.3}},
      {txt:'你出击到禁区外将球解围后，迅速分给边路', need:{defense:.5,technique:.5}},
      {txt:'你扑住远射后快速起身，把球抛给边锋', need:{technique:.6,defense:.4}}
    ],
    defend:[
      {txt:'对方直塞打身后，你果断出击把球没收', need:{defense:.65,pace:.35}},
      {txt:'对手开出角球，你冲出击球区将球击出', need:{defense:.55,physical:.45}},
      {txt:'对方快速反击形成单刀，你出击封堵角度', need:{defense:.7,physical:.3}}
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
  {id:'national_debut', name:'国脚生涯', desc:'完成国家队首秀'},
  {id:'nat_goal', name:'为国争光', desc:'国家队进球'},
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
