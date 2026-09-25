// UI 冒烟：用自带迷你 DOM 把 mhxy-calculator.html 的全部代码真实执行一遍，
// 验证外壳启动、三个工具的初始化、交互与结果渲染。
// 运行： node tests/ui.test.mjs
import { readFileSync } from 'node:fs';
import { installDOM } from './dom.mjs';

const html = readFileSync(new URL('../mhxy-calculator.html', import.meta.url), 'utf8');
const blocks = [...html.matchAll(/<script(?: id="[^"]+")?>([\s\S]*?)<\/script>/g)].map(m => m[1]);

let errors = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? '✅' : '❌'}  ${name}${extra ? '  → ' + extra : ''}`);
  if (!cond) errors++;
};

const { document, body } = installDOM(html);
const QianyuanEngineRef = () => new Function(`${(html.match(/<script id="engine-qianyuan">([\s\S]*?)<\/script>/) || [])[1]}\nreturn QianyuanEngine;`)();
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

try {
  new Function(blocks.join('\n'))();
  check('全部代码执行无异常', true);
} catch (e) {
  check('全部代码执行无异常（抛出：' + e.message + '）', false);
  process.exit(1);
}

/* ============================================================
   外壳
   ============================================================ */
console.log('\n── 外壳 ──');
const tabs = $$('#tabs button');
check('渲染出 3 个工具页签', tabs.length === 3, tabs.map(b => b.textContent).join(' / '));
check('页签名称正确', tabs.map(b => b.textContent).join('/') === '人物修炼/师门技能/乾元丹');
check('默认激活第一个工具（人物修炼）', tabs[0].classList.contains('active'));
check('默认加载人物修炼', !!$('.tool-xiulian') && !$('.tool-xiulian').hidden);
check('未激活的工具尚未创建（懒加载）', $('.tool-skill') === null);
check('hash 同步为工具 id', globalThis.location.hash === 'xiulian', globalThis.location.hash);

/* ============================================================
   师门技能工具
   ============================================================ */
console.log('\n── 师门技能 ──');
$$('#tabs button')[1].fire('click');
check('切到师门技能工具', !!$('.tool-skill') && !$('.tool-skill').hidden && $('.tool-xiulian').hidden);
const skill = $('.tool-skill');
const num = sel => $(sel).textContent.replace(/,/g, '');
const stats = () => $$('.tool-skill .stat .sub').map(e => e.textContent.replace(/,/g, ''));

check('默认单个技能模式', $('#sk-panel-single').hidden === false && $('#sk-panel-batch').hidden === true);
check('单技能模式下技能/法术栏隐藏', $('#sk-card-skills').hidden && $('#sk-card-spells').hidden);
check('结果卡横跨整行', $('#sk-grid').classList.contains('two'));

// 初始不预填、不计算（与人物修炼同一口径）
const idle = sel => $(sel).innerHTML.includes('自动计算');
check('初始不预填等级', $('#sk-from').value === '' && $('#sk-to').value === '');
check('初始滑条停在最左（未设置）', $('#sk-from-r').value === '0' && $('#sk-to-r').value === '1');
check('初始不算结果，显示待填写', idle('#sk-stats') && !/<div class="stat/.test($('#sk-stats').innerHTML));
check('初始隐藏消耗明细与摘要框', $('#sk-detail').hidden === true && $('#sk-summary').hidden === true);
const setSk = (id, v) => { const n = $('#' + id); n.value = String(v); n.fire('input'); };

setSk('sk-from', 0);
check('只填当前等级仍不算', idle('#sk-stats'));
setSk('sk-to', 150);
check('填完两项后 0→150 经验', stats()[0] === '103057986', stats().join(' / '));
check('填完两项后 0→150 金钱', stats()[1] === '38646689');
check('算完后显示消耗明细与摘要框', $('#sk-detail').hidden === false && $('#sk-summary').hidden === false);

// 预设与滑条
$('.tool-skill .chip[data-to="180"]').fire('click');
check('点目标预设 180 生效', $('#sk-to').value === '180' && $('#sk-from').value === '0', $('#sk-from').value + '→' + $('#sk-to').value);
check('0→180 经验', stats()[0] === '660384466', stats().join(' / '));

$('#sk-from-r').value = '170';
$('#sk-from-r').fire('input');
check('拖当前滑条生效', $('#sk-from').value === '170', $('#sk-from').value + '→' + $('#sk-to').value);
$('#sk-from-r').value = '179';
$('#sk-from-r').fire('input');
check('当前拉满 179 → 推目标到 180', $('#sk-from').value === '179' && $('#sk-to').value === '180');

// 滑条悬停：不点击就预览「这个位置会选到几级」，且不改动实际值
const fromR = $('#sk-from-r');
fromR._rect = { left: 0, width: 180 };              // 迷你 DOM 无布局，给个假的轨道几何
check('预览前实际值停在 179', $('#sk-from').value === '179' && fromR.value === '179',
  $('#sk-from').value + ' / ' + fromR.value);
fromR.fire('mouseenter', { clientX: 90 });          // 轨道正中
check('悬停预览该位置会选到的等级', $('#sk-from-v').hidden === false && $('#sk-from-v').textContent === '90',
  $('#sk-from-v').textContent);
check('预览气泡落在 50% 附近', /^calc\(50\.\d+% - 0\.\d+px\)$/.test($('#sk-from-v').style.left || ''),
  $('#sk-from-v').style.left);
check('预览不改动实际值', fromR.value === '179' && $('#sk-from').value === '179',
  fromR.value + ' / ' + $('#sk-from').value);
fromR.fire('mousemove', { clientX: 171 });          // 拖到最右
check('鼠标移动预览跟着变', $('#sk-from-v').textContent === '179', $('#sk-from-v').textContent);
fromR.fire('mousemove', { clientX: 9 });            // 最左
check('最左预览为 0', $('#sk-from-v').textContent === '0', $('#sk-from-v').textContent);
fromR.fire('mouseleave');
check('鼠标移开后气泡收起', $('#sk-from-v').hidden === true);

// 每 5 级档
$('#sk-detail').open = true;
$('#sk-detail').fire('toggle');
$('#sk-from').value = '0'; $('#sk-from').fire('input');
check('0→180 明细 36 档 + 表头', ($('#sk-band-box').innerHTML.match(/<tr[ >]/g) || []).length === 37,
  String(($('#sk-band-box').innerHTML.match(/<tr[ >]/g) || []).length));
check('明细标题标注档数', /共 36 档/.test($('#sk-detail-sum').textContent), $('#sk-detail-sum').textContent);

// 切组合计算
check('模式改名为「组合计算」',
  $('.tool-skill [data-seg="batch"]').textContent === '组合计算（整个门派）',
  $('.tool-skill [data-seg="batch"]').textContent);
$('.tool-skill [data-seg="batch"]').fire('click');
check('切到组合三栏', $('#sk-grid').classList.contains('batch'));
check('技能栏与法术栏显示', !$('#sk-card-skills').hidden && !$('#sk-card-spells').hidden);
check('左侧标题变为门派与统一设置', $('#sk-panel-title').textContent === '门派与统一设置');
check('技能列表 7 行', $$('.tool-skill .skrow').length === 7);
check('技能行不含折叠块', !/<details/.test($('#sk-list').innerHTML));
check('技能行不再显示法术数量', !/个法术/.test($('#sk-list').innerHTML));
check('技能行不再出现「按技能等级提高…」长句', !/按技能等级提|提高角色的/.test($('#sk-list').innerHTML));
check('技能行用标签显示属性（如躲避）', /class="tag attr">躲避</.test($('#sk-list').innerHTML),
  ($('#sk-list').innerHTML.match(/class="tag attr">[^<]*/g) || []).slice(0, 4).join(' | '));
check('属性标签与主技能标签同款不同色', /class="tag">主技能</.test($('#sk-list').innerHTML)
  && /class="tag attr">/.test($('#sk-list').innerHTML));
check('没有属性的主技能不硬凑标签', (($('#sk-list').innerHTML.match(/class="tag attr">/g) || []).length) === 5,
  String(($('#sk-list').innerHTML.match(/class="tag attr">/g) || []).length) + ' 个');
check('首行默认命中主技能高亮', $$('.tool-skill .skrow')[0].classList.contains('active'));
check('法术面板默认显示主技能', /为官之道/.test($('#sk-spells').innerHTML));
check('法术全部展开无折叠', !/<details/.test($('#sk-spells').innerHTML));
check('法术含功效/条件/消耗', /功效：/.test($('#sk-spells').innerHTML) && /使用条件：/.test($('#sk-spells').innerHTML) && /消耗：/.test($('#sk-spells').innerHTML));
check('批量初始不算结果（等级未填）', idle('#sk-stats'));
check('批量初始无合计表', $('#sk-batch-box').hidden === true);
check('批量初始无明细', $('#sk-detail').hidden === true);
$('#sk-def-from').value = '0'; $('#sk-def-to').value = '150';
$('#sk-apply').fire('click');
check('应用统一设置后 7 技能合计经验', stats()[0] === '721405902', stats().join(' / '));

// 点技能切换
$$('.tool-skill .skrow')[1].querySelector('.sk-name').fire('click');
check('点第 2 个技能 → 右栏切换', /无双一击/.test($('#sk-spells').innerHTML),
  ($('#sk-spells').innerHTML.match(/sp-hd-name">([^<]*)/) || [])[1]);
check('第 2 行高亮 / 第 1 行取消', $$('.tool-skill .skrow')[1].classList.contains('active') && !$$('.tool-skill .skrow')[0].classList.contains('active'));

// 勾选与统一设置
const cb0 = $$('.tool-skill .skrow')[0].querySelector('input[type=checkbox]');
cb0.checked = false; cb0.fire('input');
check('取消勾选后合计变为 6 技能', stats()[0] === '618347916', stats().join(' / '));

$('#sk-def-from').value = '100'; $('#sk-def-to').value = '160';
$('#sk-apply').fire('click');
check('应用到全部', $$('.tool-skill .skrow').every(r => r.querySelector('.lv-from').value === '100' && r.querySelector('.lv-to').value === '160'));
check('6 技能 100→160 合计', stats()[0] === '1094072832', stats().join(' / '));
$('#sk-all').fire('click');
check('全选后 7 技能 100→160 合计', stats()[0] === '1276418304', stats().join(' / '));

// 换门派
$('#sk-sect').value = '5'; $('#sk-sect').fire('change');
check('切到龙宫', $('#sk-spells').innerHTML.includes('九龙诀'));
$$('.tool-skill .skrow')[2].querySelector('.sk-name').fire('click');
check('龙宫「呼风唤雨」→ 龙卷雨击', /龙卷雨击/.test($('#sk-spells').innerHTML));
check('龙卷雨击含等级里程碑', /等级里程碑/.test($('#sk-spells').innerHTML) && /秒 7/.test($('#sk-spells').innerHTML));
check('含解锁等级徽标', /呼风唤雨 达 15 级可学/.test($('#sk-spells').innerHTML));

/* ============================================================
   人物修炼工具
   ============================================================ */
console.log('\n── 人物修炼 ──');
$$('#tabs button')[0].fire('click');
check('切到修炼工具', !$('.tool-xiulian').hidden && $('.tool-skill').hidden);
check('页签高亮跟随', $$('#tabs button')[0].classList.contains('active'));
check('hash 同步', globalThis.location.hash === 'xiulian', globalThis.location.hash);

const xl = $('.tool-xiulian');
const xlOut = () => $('#xl-result').innerHTML;
const setXl = (id, v) => { const n = $('#xl-' + id); n.value = String(v); n.fire('input'); n.fire('change'); };

check('修炼类型 3 个', $$('.tool-xiulian .opt').length === 3);
check('类型名正确', $$('.tool-xiulian .opt').map(o => o.querySelector('.n').textContent).join('/') === '攻修 / 法修/防御 / 抗法/猎术修炼');
check('初始为待填写状态', xlOut().includes('填写左侧三项数据后自动计算'));
check('初始不展示花费', !xlOut().includes('需要花费'));
check('初始输入框为空', $('#xl-lv').value === '' && $('#xl-target').value === '');
check('攻/法 上限范围 20~25', $('#xl-cap').min === '20' && $('#xl-cap').max === '25');

setXl('cap', 20); setXl('lv', 30);
check('等级 30 夹紧到上限 20', $('#xl-lv').value === '20', $('#xl-lv').value);
setXl('cap', 21); setXl('lv', 30);
check('上限改 21 后等级夹紧到 21', $('#xl-lv').value === '21');
setXl('lv', -5);
check('等级 -5 夹紧到 0', $('#xl-lv').value === '0');
setXl('target', 99);
check('目标 99 夹紧到 25', $('#xl-target').value === '25');

// 当前修炼等级不能超过当前上限：超了就就地夹到上限 + 结果区明确说明（不能默默按别的数字算）
setXl('cap', 20); setXl('lv', 25); setXl('target', 25);
check('当前等级 25 就地夹到上限 20', $('#xl-lv').value === '20', $('#xl-lv').value);
check('并说明「已按 20 级计算」',
  /不能超过当前修炼上限/.test(xlOut()) && /已按 20 级计算/.test(xlOut()),
  (xlOut().match(/⚠️[^<]*/) || [])[0]);
check('说明之下仍照常给出花费', xlOut().includes('1.7046 亿'));

// 上限调大后不再夹，说明同步消失
setXl('cap', 25); setXl('lv', 25);
check('上限调大后可以填 25', $('#xl-lv').value === '25', $('#xl-lv').value);
check('不再显示夹紧说明', !xlOut().includes('不能超过当前修炼上限'));

// 上限调小到低于当前等级：失焦时把当前等级一并夹下来 + 说明
setXl('cap', 25); setXl('lv', 25); setXl('target', 25);
check('上限 25 / 当前 25 正常且无说明', $('#xl-lv').value === '25' && !xlOut().includes('不能超过当前修炼上限'));
setXl('cap', 20);
check('上限调小后当前等级被夹到 20', $('#xl-lv').value === '20', $('#xl-lv').value);
check('并给出夹紧说明', xlOut().includes('不能超过当前修炼上限'));

// 回归：逐字输入不能被中途夹紧写回（曾经填「20」被改成「25」）
// 关键是要按「浏览器把按键追加到当前 DOM 值后面」的方式模拟，而不是直接赋最终值
function typeInto(node, text){
  node.value = '';
  node.fire('input');
  for (const ch of text){
    node.value = node.value + ch;      // 追加到当前 DOM 值（若被写回过，这里就会叠加到脏值上）
    node.fire('input');
  }
  return node.value;
}
setXl('lv', 0); setXl('cap', 20); setXl('target', 25);   // 先回到合法状态
check('逐字输入上限 20 不被改写', typeInto($('#xl-cap'), '20') === '20', $('#xl-cap').value);
check('逐字输入上限 25 不被改写', typeInto($('#xl-cap'), '25') === '25', $('#xl-cap').value);
check('输入过程中即使越界也不写回', typeInto($('#xl-cap'), '99') === '99', $('#xl-cap').value);
$('#xl-cap').fire('change');                              // 失焦才夹紧
check('失焦后 99 才被夹到 25', $('#xl-cap').value === '25', $('#xl-cap').value);
$('#xl-cap').fire('blur');
check('blur 后保持 25', $('#xl-cap').value === '25', $('#xl-cap').value);

setXl('lv', 20); setXl('cap', 20); setXl('target', 25);
check('攻修 20/20→25 花费 = 1.7046 亿', xlOut().includes('1.7046 亿'));
check('攻修 20/20→25 沉没损失 = 7,881 万', xlOut().includes('7,881 万'));
check('渲染 5 行降修', (xlOut().match(/class="lower"/g) || []).length === 5);
check('含降修明细表', xlOut().includes('降修'));
check('含上限走势 pill', xlOut().includes('上限 <b>20 → 25</b>'));
check('降修明细用 flow 布局（# 与操作紧邻）', /table-wrap tall flow/.test(xlOut()),
  (xlOut().match(/table-wrap [^"]*/) || [])[0]);
check('含降修后 22 级 pill', xlOut().includes('降修后 <b>22 级</b>'));
check('无「详情见下表」结论句', !xlOut().includes('详情见下表'));
check('操作列只有 点修 / 降修 共 10 行',
  (xlOut().match(/<td class="op">(点修|降修)<\/td>/g) || []).length === 10);
check('降修场景不出现「经验」', !xlOut().includes('经验'));

setXl('lv', 20); setXl('cap', 25); setXl('target', 25);
check('无降修 20/25→25 花费 = 9,165 万', xlOut().includes('9,165 万'));
check('无降修时不出现沉没', !xlOut().includes('沉没'));

// 防御/抗法：切类型**保留**已输入的修炼值，并立即按新单价重算
$$('.tool-xiulian .opt')[1].fire('click');
check('切类型后保留等级/上限/目标',
  $('#xl-lv').value === '20' && $('#xl-cap').value === '25' && $('#xl-target').value === '25',
  [$('#xl-lv').value, $('#xl-cap').value, $('#xl-target').value].join(' / '));
check('切类型后立即按防御单价重算', xlOut().includes('6,110 万'), (xlOut().match(/[\d,]+ 万/) || [])[0]);
setXl('lv', 20); setXl('cap', 20); setXl('target', 25);
check('防修 20/20→25 花费 = 1.1364 亿', xlOut().includes('1.1364 亿'));
check('防修沉没 = 5,254 万', xlOut().includes('5,254 万'));

// 猎术
$$('.tool-xiulian .opt')[2].fire('click');
check('猎术上限框被禁用', $('#xl-cap').disabled === true);
check('猎术上限值为 20', $('#xl-cap').value === '20');
check('猎术目标范围 0~20', $('#xl-target').min === '0' && $('#xl-target').max === '20');
check('猎术提示不适用降修', $('#xl-cap-hint').textContent.includes('不适用降修'));
setXl('lv', 0); setXl('target', 25);
check('猎术目标 25 夹紧到 20', $('#xl-target').value === '20');
check('猎术 0→20 花费 = 1.116 亿', xlOut().includes('1.116 亿'));
check('猎术不展示降修明细', !xlOut().includes('降修'));

// 只填两项不计算（切回攻修后先清空，验证「三项没填完一律不算」仍在）
$$('.tool-xiulian .opt')[0].fire('click');
check('切回攻修仍保留输入', $('#xl-lv').value === '0' && $('#xl-target').value === '20',
  [$('#xl-lv').value, $('#xl-target').value].join(' / '));
const clearXl = id => { const n = $('#xl-' + id); n.value = ''; n.fire('input'); n.fire('change'); };
['lv', 'cap', 'target'].forEach(clearXl);
check('清空后回到待填写', xlOut().includes('填写左侧三项数据后自动计算'));
setXl('lv', 20); setXl('cap', 20);
check('只填两项仍是待填写', xlOut().includes('填写左侧三项数据后自动计算'));
setXl('target', 10);
check('目标 ≤ 当前等级 → 提示无需提升', xlOut().includes('无需提升'));

/* ============================================================
   乾元丹工具
   ============================================================ */
console.log('\n── 乾元丹 ──');
$$('#tabs button')[2].fire('click');
check('页签共 3 个', $$('#tabs button').length === 3, $$('#tabs button').map(b => b.textContent).join(' / '));
check('切到乾元丹工具', !$('.tool-qianyuan').hidden && $('.tool-xiulian').hidden);
check('hash 同步', globalThis.location.hash === 'qianyuan', globalThis.location.hash);

const qy = $('.tool-qianyuan');
const qyOut = () => $('#qy-result').innerHTML;
const qyStats = () => $$('.tool-qianyuan .stat .sub').map(e => e.textContent.replace(/,/g, ''));
const setQy = (id, v) => { const n = $('#' + id); n.value = String(v); n.fire('change'); };

// 初始不预选、不计算（与人物修炼同一口径）
check('初始不预选丹数', $('#qy-cur').value === '' && $('#qy-target').value === '');
const optInfo = sel => $$(sel + ' option').map(o => ({ v:o.value, t:o.textContent, hidden:o.hidden, disabled:o.disabled }));
const curOpts = optInfo('#qy-cur'), tgtOpts = optInfo('#qy-target');
check('占位项选中态可见、候选列表里隐藏',
  curOpts[0].v === '' && curOpts[0].t === '请选择' && curOpts[0].hidden === true && curOpts[0].disabled === true);
check('当前已有乾元丹候选 = 0~8', curOpts.slice(1).map(o => o.t).join() === '0,1,2,3,4,5,6,7,8',
  curOpts.slice(1).map(o => o.t).join(' / '));
check('目标乾元丹候选 = 1~9（不含 0）', tgtOpts.slice(1).map(o => o.t).join() === '1,2,3,4,5,6,7,8,9',
  tgtOpts.slice(1).map(o => o.t).join(' / '));
check('展开的候选列表里没有「请选择」',
  curOpts.slice(1).concat(tgtOpts.slice(1)).every(o => o.t !== '请选择' && o.hidden !== true));
check('目标候选里没有 0', !tgtOpts.slice(1).some(o => o.t === '0'), tgtOpts.slice(1).map(o => o.t).join(' / '));
check('初始不算结果，显示待选择', qyOut().includes('选择当前与目标丹数后自动计算') && !/<div class="stat/.test(qyOut()));
setQy('qy-target', 9);
check('只选目标仍不算', qyOut().includes('选择当前与目标丹数后自动计算'));

setQy('qy-cur', 0);
check('选完两项后 0→9 经验', qyStats()[0] === '465600800', qyStats().join(' / '));
check('选完两项后 0→9 金钱', qyStats()[1] === '93120136');
check('明细 表头+9 行+合计', (qyOut().match(/<tr[ >]/g) || []).length === 11,
  String((qyOut().match(/<tr[ >]/g) || []).length));
check('明细含第 1 个丹 69 级', qyOut().includes('第 1 个') && qyOut().includes('69 级'));
check('已移除「等价旧丹」列', !qyOut().includes('等价旧丹') && !qyOut().includes('小丹'));
check('明细只有 4 列', (qyOut().match(/<th>/g) || []).length === 4,
  String((qyOut().match(/<th>/g) || []).length));
check('已移除人物等级输入', $('#qy-level') === null && !qyOut().includes('人物等级'));

// 区间
$('#qy-cur').value = '4'; $('#qy-cur').fire('change');
$('#qy-target').value = '6'; $('#qy-target').fire('change');
const seg = QianyuanEngineRef().DAN;
check('第4→第6 经验', qyStats()[0] === String(seg[4].exp + seg[5].exp), qyStats().join(' / '));
check('第4→第6 共 2 个', qyOut().includes('共 <b>2</b> 个乾元丹'));
$('#qy-cur').value = '6'; $('#qy-cur').fire('change');
check('当前 = 目标 时提示无需提升', qyOut().includes('无需提升'));

// 「按经验算能开几丹」已移除：乾元丹只剩「按丹数算花费」一种模式
check('已移除模式切换', $$('.tool-qianyuan [data-seg]').length === 0);
check('已移除经验输入与面板', $('#qy-exp') === null && $('#qy-cur2') === null && $('#qy-panel-exp') === null);
setQy('qy-cur', 0); setQy('qy-target', 9);
check('仍保留按丹数计算的明细表', qyOut().includes('乾元丹') && qyOut().includes('需等级'));

/* ============================================================
   切回师门技能，状态应保留
   ============================================================ */
console.log('\n── 工具切换状态保持 ──');
$$('#tabs button')[1].fire('click');
check('切回师门技能仍是批量模式', $('#sk-grid').classList.contains('batch'));
check('勾选与等级设置保留', $('#sk-list').innerHTML.includes('value="100"'));

console.log(errors ? `\n${errors} 项失败` : '\n全部通过');
process.exit(errors ? 1 : 0);
