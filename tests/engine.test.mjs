// 引擎回归对拍：直接从 mhxy-calculator.html 抽出三个「无 DOM 引擎块」跑真实数据。
// 页面与测试永远同源，改坏引擎立刻红。
// 运行： node tests/engine.test.mjs
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../mhxy-calculator.html', import.meta.url), 'utf8');
const block = id => {
  const m = html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`));
  if (!m) throw new Error(`未找到 <script id="${id}">`);
  return m[1];
};
const island = id => {
  const m = html.match(new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)</script>`));
  if (!m) throw new Error(`未找到数据岛 ${id}`);
  return JSON.parse(m[1]);
};

const { SkillEngine }  = new Function(`${block('engine-skill')}\nreturn { SkillEngine };`)();
const { XiulianEngine } = new Function(`${block('engine-xiulian')}\nreturn { XiulianEngine };`)();
const { QianyuanEngine } = new Function(`${block('engine-qianyuan')}\nreturn { QianyuanEngine };`)();
const { LifeEngine } = new Function(`${block('engine-lifeskill')}\nreturn { LifeEngine };`)();

const SK = SkillEngine(island('data-skill'));
const { expAt: EXP, expSum, TYPES, BASE_CAP, compute } = XiulianEngine;

let pass = 0, fail = 0;
const near = (a, b) => {
  if (typeof a === 'string' || typeof b === 'string') return String(a) === String(b);
  if (typeof a === 'boolean' || typeof b === 'boolean') return a === b;
  return Math.abs(a - b) < 0.005;
};
const t = (name, got, want) => {
  const ok = near(got, want);
  console.log(`${ok ? '✅' : '❌'}  ${name}  | 实际 ${got} | 期望 ${want}`);
  ok ? pass++ : fail++;
};

/* ============================================================
   师门技能引擎
   ============================================================ */
console.log('\n── 师门技能 ──');
t('costOf(0,1) 经验（1-30 级官方不收经验）', SK.costOf(0, 1).exp, 0);
t('1-30 级经验合计 = 0（官方口径）', SK.costOf(0, 30).exp, 0);
t('1-30 级金钱照旧照收', SK.costOf(0, 30).gold, 26287);
t('30→31 经验 = 10188（31 级起与官方逐级一致）', SK.costOf(30, 31).exp, 10188);
t('0→100 经验 = 官方工具箱接口值', SK.costOf(0, 100).exp, 15026094);
t('costOf(0,150) 经验（= 官方工具箱接口值）', SK.costOf(0, 150).exp, 102987846);
t('costOf(0,150) 金钱', SK.costOf(0, 150).gold, 38646689);
t('costOf(150,160) 经验', SK.costOf(150, 160).exp, 94383720);
t('costOf(150,160) 金钱', SK.costOf(150, 160).gold, 35393892);
t('costOf(0,180) 经验', SK.costOf(0, 180).exp, 660314326);
t('costOf(0,180) 金钱', SK.costOf(0, 180).gold, 212923391);
t('7 技能 0→150 经验', 7 * SK.costOf(0, 150).exp, 720914922);
t('7 技能 0→150 金钱', 7 * SK.costOf(0, 150).gold, 270526823);
t('costOf(174,180) 经验', SK.costOf(174, 180).exp, 200884590);
t('costOf(160,180) 经验', SK.costOf(160, 180).exp, 462942760);
t('costOf(70,70) 空区间为 0', SK.costOf(70, 70).exp, 0);

const bands = SK.bandsOf([[0, 180]]);
t('0→180 分 36 档', bands.length, 36);
t('首档 1–5 / 末档 176–180', `${bands[0].lo}-${bands[0].hi}/${bands[35].lo}-${bands[35].hi}`, '1-5/176-180');
t('各档之和 = 总经验', bands.reduce((s, x) => s + x.exp, 0), SK.costOf(0, 180).exp);
const partial = SK.bandsOf([[0, 7]]);
t('0→7 尾档 6–7', `${partial[1].lo}-${partial[1].hi}`, '6-7');
const two = SK.bandsOf([[150, 160]]);
t('150→160 恰两档（对上真实跳变）', `${two[0].lo}-${two[0].hi}/${two[1].lo}-${two[1].hi}`, '151-155/156-160');
t('多段区间并入同档', SK.bandsOf([[0, 5], [0, 5]])[0].exp, 2 * SK.costOf(0, 5).exp);

t('门派数 21', SK.SECTS.length, 21);
t('每门派 7 技能', SK.SECTS.every(s => s.skills.length === 7), true);
t('每门派恰一主技能且在首位', SK.SECTS.every(s => s.skills[0].main && s.skills.filter(k => k.main).length === 1), true);
t('法术总数（按门派去重）', SK.SECTS.reduce((n, s) => n + Object.keys(s.spells).length, 0), 288);
t('每个被引用的法术都有描述',
  SK.SECTS.every(s => s.skills.every(k => k.spells.every(n => s.spells[n] && s.spells[n].t))), true);

const lg = SK.SECTS.find(s => s.name === '龙宫');
const hfhy = lg.skills.find(k => k.name === '呼风唤雨');
const ljyj = SK.spellsOf(lg, hfhy)[0];
t('龙宫「呼风唤雨」→ 龙卷雨击', ljyj.name, '龙卷雨击');
t('龙卷雨击含功效', /功效：施展法术攻击对方/.test(ljyj.text), true);
t('龙卷雨击含使用条件', /使用条件：呼风唤雨技能达到15级/.test(ljyj.text), true);
t('龙卷雨击解析出解锁条件', `${ljyj.unlock[0]}@${ljyj.unlock[1]}`, '呼风唤雨@15');
t('龙卷雨击里程碑 6 档', ljyj.milestones.length, 6);
t('龙卷雨击 150 级 → 秒 7', `${ljyj.milestones[5][0]}${ljyj.milestones[5][1]}`, '150秒 7');

/* ============================================================
   人物修炼引擎
   ============================================================ */
console.log('\n── 人物修炼 ──');
const T = id => TYPES.find(x => x.id === id);
const atk = T('atk'), def = T('def'), hunt = T('hunt');
const wanAtk = e => e / 10 * 30000 / 10000;
const wanDef = e => e / 10 * 20000 / 10000;

t('E(1) = 150', EXP(1), 150);
t('E(2) = 210', EXP(2), 210);
t('E(10) = 1410', EXP(10), 1410);
t('E(25) = 7110', EXP(25), 7110);
t('0→25 经验 = 67750', expSum(0, 25), 67750);

t('锚点A 攻修 0→20 累计(万)',  wanAtk(expSum(0, 20)),  11160);
t('锚点B 攻修 20→25 纯点修(万)', wanAtk(expSum(20, 25)), 9165);
t('锚点C 防修 20→25 纯点修(万)', wanDef(expSum(20, 25)), 6110);
t('锚点D 攻修 15→25 纯点修(万)', wanAtk(expSum(15, 25)), 15030);
t('锚点E 防修 15→25 纯点修(万)', wanDef(expSum(15, 25)), 10020);
t('锚点G 攻修 0→25 累计(万)',  wanAtk(expSum(0, 25)),  20325);
t('锚点H 防修 0→25 累计(万)',  wanDef(expSum(0, 25)),  13550);

const F = compute(atk, 20, 20, 25);
t('锚点F 20级/上限20→25 沉没经验', F.sunkExp, 26270);
t('F2 降修次数', F.lowerCount, 5);
t('F3 终态上限', F.capFinal, 25);
t('F4 降修后等级', F.levelAfterLower, 22);
t('F5 终态等级', F.levelFinal, 25);
t('I 净花费(万)', F.newMoney / 10000, 17046);
t('I2 净经验', F.newExp, 56820);
t('K 15级/上限20→25 净花费(万)', compute(atk, 15, 20, 25).newMoney / 10000, 22785);

t('猎术上限 20', hunt.capMax, 20);
t('猎术不可降修', hunt.canLower, false);
t('猎术目标 25 判不可达', compute(hunt, 20, 20, 25).ok, false);
t('猎术 0→20 累计(万)', compute(hunt, 0, 20, 20).newMoney / 10000, 11160);
t('基础上限 20', BASE_CAP, 20);

t('目标 ≤ 当前等级 → 0 花费', compute(atk, 15, 20, 15).newMoney, 0);
t('上限已够(20/25→25) 无降修', compute(atk, 20, 25, 25).lowerCount, 0);
t('上限已够(20/25→25) 花费(万)', compute(atk, 20, 25, 25).newMoney / 10000, 9165);


/* ============================================================
   乾元丹引擎
   ============================================================ */
console.log('\n── 乾元丹 ──');
const QY = QianyuanEngine;
// 当前 9 个大丹的公开消耗表，用于对拍（防手滑改坏写死的数值）
const PUBLISHED = [
  [69,  1, 22341872,  4468371], [89,  2, 27846728,  5569343], [109, 3, 34534248,  6906847],
  [129, 4, 42519680,  8503933], [155, 5, 51918272, 10383652], [159, 6, 62845272, 12569051],
  [164, 7, 75415928, 15083183], [168, 8, 75977600, 15195518], [171, 9, 72201200, 14440238],
];
t('乾元丹共 9 个', QY.MAX, 9);
for (const [lv, n, e, m] of PUBLISHED){
  const d = QY.DAN[n - 1];
  t(`第 ${n} 个丹 等级/经验/金钱`, `${d.level}/${d.exp}/${d.money}`, `${lv}/${e}/${m}`);
}
t('等级门槛表', QY.DAN.map(d => d.level).join(), '69,89,109,129,155,159,164,168,171');

t('capForLevel(68) = 0',  QY.capForLevel(68), 0);
t('capForLevel(69) = 1',  QY.capForLevel(69), 1);
t('capForLevel(88) = 1',  QY.capForLevel(88), 1);
t('capForLevel(89) = 2',  QY.capForLevel(89), 2);
t('capForLevel(129) = 4', QY.capForLevel(129), 4);
t('capForLevel(154) = 4', QY.capForLevel(154), 4);
t('capForLevel(155) = 5', QY.capForLevel(155), 5);
t('capForLevel(170) = 8', QY.capForLevel(170), 8);
t('capForLevel(175) = 9', QY.capForLevel(175), 9);

const qyAll = QY.costBetween(0, 9);
t('0→9 累计经验', qyAll.exp, 465600800);
t('0→9 累计金钱', qyAll.money, 93120136);
t('0→9 步数', qyAll.count, 9);
const qy35 = QY.costBetween(3, 5);
t('第3→第5 经验', qy35.exp, QY.DAN[3].exp + QY.DAN[4].exp);
t('第3→第5 步数', qy35.count, 2);
t('第9→第9 为 0', QY.costBetween(9, 9).exp, 0);

const aff2 = QY.maxAffordable(0, 22341872 + 27846728);
t('经验反查：够开 2 个', aff2.got, 2);
t('经验反查：正好花完', aff2.leftExp, 0);
t('经验反查：到第 2 个', aff2.total, 2);
const aff1 = QY.maxAffordable(0, 22341872 - 1);
t('经验反查：差 1 点只能开 0 个', aff1.got, 0);
t('经验反查：距下一丹差 1', aff1.shortOf, 1);
t('经验反查：下一个是第 1 个', aff1.next.n, 1);
const affFull = QY.maxAffordable(0, 999999999);
t('经验反查：经验溢出也只到 9 个', affFull.got, 9);
t('经验反查：满了就没有下一个', affFull.next, null);
const affMid = QY.maxAffordable(5, 72201200);
t('经验反查：已有 5 个再开 1 个', affMid.got, 1);

/* ============================================================
   生活技能引擎
   ============================================================ */
console.log('\n── 生活技能 ──');
const LS = LifeEngine(island('data-skill').cost.exp);
const life = id => LS.SKILLS.find(s => s.id === id);

// 外部锚点：官方综合工具箱（xyq.163.com/tools）「帮派技能计算」后端接口
// /api/get_life_skill_upgrade_need 的逐级返回值加总。21 个技能全部逐级对拍过，
// 这里只固定「0→各技能上限」的总值，防手滑改坏上面写死的表。
const LIFE_TOTAL = [
  ['qiangshen',   140, 104406194,  13901235],
  ['mingxiang',   160, 197441706,  33480545],
  ['anqi',        160, 197441706,  33480545],
  ['dazao',       160, 161126102,  26315625],
  ['caifeng',     160, 161126102,  26315625],
  ['zhongyao',    160, 197441706,  33480545],
  ['lianjin',     160, 161126102,  26315625],
  ['pengren',     140,  74141717,  13901235],
  ['zhuibu',      160, 197441706,  33480545],
  ['taoli',       160, 197441706,  33480545],
  ['yangsheng',   160, 197441706,  33480545],
  ['jianshen',    160, 197441706,  33480545],
  ['qiaojiang',   160, 197441706,  33480545],
  ['ronglian',    160, 197441706,  33480545],
  ['lingshi',     120,  87583962,  13137285],
  ['qiangzhuang',  60, 3612200000, 903050000],
  ['cuiling',     160, 161126102,  26315625],
  ['shensu',       60, 3612200000, 903050000],
  ['feng',         20, 129400000,   32350000],
  ['yu',           20, 129400000,   32350000],
  ['xue',          20, 129400000,   32350000],
];
t('生活技能共 21 个', LS.SKILLS.length, 21);
for (const [id, cap, e, m] of LIFE_TOTAL){
  const sk = life(id), r = LS.costBetween(id, 0, cap);
  t(`${sk.name} 上限/0→上限 经验/金钱`, `${sk.cap}/${r.exp}/${r.money}`, `${cap}/${e}/${m}`);
}

// 分段倍率的三个起点：同一个技能在门槛两侧必须真的跳变
t('冥想 150 级经验 = 师门表', LS.stepOf(life('mingxiang'), 150).exp, 3242400);
t('冥想 151 级经验（进入分段）', LS.stepOf(life('mingxiang'), 151).exp, 6652022);
t('冥想 150→160 经验', LS.costBetween('mingxiang', 150, 160).exp, 94383720);
t('强身术 120 级经验 = 师门表', LS.stepOf(life('qiangshen'), 120).exp, 1384320);
t('强身术 121 级经验（×1.5）', LS.stepOf(life('qiangshen'), 121).exp, 2142949);
t('强身术 131 级经验（×2）', LS.stepOf(life('qiangshen'), 131).exp, 3864913);
t('打造 150 级经验 = 师门表', LS.stepOf(life('dazao'), 150).exp, 3242400);
t('打造 151 级经验（另一条曲线）', LS.stepOf(life('dazao'), 151).exp, 5022276);
t('打造 160 级经验', LS.stepOf(life('dazao'), 160).exp, 6645076);
t('灵石 80 级经验 = 师门 95 级', LS.stepOf(life('lingshi'), 80).exp, 573103);
t('灵石 81 级经验（×1.5）', LS.stepOf(life('lingshi'), 81).exp, 894117);

// 金钱：只跟等级走，不随经验放大
t('强身术与冥想 100 级金钱相同（经验被放大也一样）',
  `${LS.stepOf(life('qiangshen'), 100).money}/${LS.stepOf(life('mingxiang'), 100).money}`, '130295/130295');
t('强壮 1 级 经验/金钱', `${LS.stepOf(life('qiangzhuang'), 1).exp}/${LS.stepOf(life('qiangzhuang'), 1).money}`, '1720000/430000');
t('强壮 40 级经验', LS.stepOf(life('qiangzhuang'), 40).exp, 41500000);
t('强壮 41 级经验（41 起额外加 800 万×1）', LS.stepOf(life('qiangzhuang'), 41).exp, 51320000);
t('强壮 60 级经验', LS.stepOf(life('qiangzhuang'), 60).exp, 245500000);
t('强壮系金钱恒为经验 1/4',
  [...Array(60)].every((_, i) => { const s = LS.stepOf(life('qiangzhuang'), i + 1); return s.money * 4 === s.exp; }), true);
t('风之感应 1→20 经验与强壮逐级相同',
  [...Array(20)].every((_, i) => LS.stepOf(life('feng'), i + 1).exp === LS.stepOf(life('qiangzhuang'), i + 1).exp), true);

// 帮贡：消耗 = Σ(a+1..b)，需要持有 = 5 × 目标等级
const mx = LS.costBetween('mingxiang', 0, 160);
t('冥想 0→160 消耗帮贡', mx.bgUsed, 12880);
t('冥想 0→160 需要持有帮贡', mx.bgNeed, 800);
t('冥想 0→160 级数', mx.count, 160);
const mx2 = LS.costBetween('mingxiang', 110, 140);
t('冥想 110→140 消耗帮贡', mx2.bgUsed, 3765);
t('冥想 110→140 需要持有帮贡', mx2.bgNeed, 700);
t('打造 0→160 消耗/需要持有帮贡',
  `${LS.costBetween('dazao', 0, 160).bgUsed}/${LS.costBetween('dazao', 0, 160).bgNeed}`, '12880/800');
t('空区间为 0', `${LS.costBetween('mingxiang', 70, 70).exp}/${LS.costBetween('mingxiang', 70, 70).bgUsed}`, '0/0');
t('目标超过上限时按上限算（不报错）', LS.costBetween('lingshi', 0, 200).to, 120);

// 明细：每 5 级一档，与师门技能同一口径
const lb = LS.bandsOf('mingxiang', 150, 160);
t('150→160 恰两档', `${lb[0].lo}-${lb[0].hi}/${lb[1].lo}-${lb[1].hi}`, '151-155/156-160');
t('各档经验之和 = 总经验', lb.reduce((s, x) => s + x.exp, 0), LS.costBetween('mingxiang', 150, 160).exp);
t('各档帮贡之和 = 总帮贡', lb.reduce((s, x) => s + x.bgUsed, 0), LS.costBetween('mingxiang', 150, 160).bgUsed);
const lpart = LS.bandsOf('mingxiang', 0, 7);
t('0→7 尾档 6-7', `${lpart[1].lo}-${lpart[1].hi}`, '6-7');
t('0→20 共 4 档', LS.bandsOf('feng', 0, 20).length, 4);

/* ============================================================ */
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
