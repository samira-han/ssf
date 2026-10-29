#!/usr/bin/env node
/**
 * 送检包一键自检
 *
 * 不依赖浏览器或第三方库；检查：
 * 1. HTML 结构与离线依赖
 * 2. 湖北固定标准、数据版本、类型数量
 * 3. 14 类费用的关键计算向量
 * 4. 同一份受理费只减一次、反诉独立计费、封顶、无效输入等边界
 * 5. 送检包关键文件是否齐全
 *
 * 用法：
 *   node tools/package-check.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEngine } from './engine-loader.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const HTML = path.join(ROOT, '武汉诉讼费计算器.html');
const E = loadEngine();

const checks = [];
function check(name, fn) {
  try {
    const detail = fn();
    checks.push({ ok: true, name, detail: detail || '' });
  } catch (err) {
    checks.push({ ok: false, name, detail: err.message });
  }
}
function assert(cond, message) {
  if (!cond) throw new Error(message);
}
function eq(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}：期望 ${expected}，实际 ${actual}`);
  return `${label}=${expected}`;
}
function calc(input) {
  const r = E.calcScenario(input);
  assert(r.ok, r.error || '计算失败');
  return r;
}

/* ---------- 1. 文件与 HTML 结构 ---------- */
const requiredFiles = [
  '武汉诉讼费计算器.html',
  'README.md',
  '武汉诉讼费收费标准与依据.md',
  '外检说明.md',
  'tools/wuhan-litigation-fee.mjs',
  'tools/engine-loader.mjs',
  'tests/wuhan-litigation-fee.test.mjs',
  '原始快照/README.md',
  '原始快照/国务院令第481号_诉讼费用交纳办法.html',
  '原始快照/湖北政务服务_全省法院收费清单.html',
  '原始快照/鄂价费2008-5号_湖北省部分诉讼费标准.pdf',
  '原始快照/民诉法解释2022修正_最高人民法院.html',
  '原始快照/民诉法解释2022修正_官方全文.html'
];
check('送检包关键文件齐全', () => {
  const missing = requiredFiles.filter((f) => !fs.existsSync(path.join(ROOT, f)));
  assert(missing.length === 0, '缺少文件：' + missing.join('、'));
  return `${requiredFiles.length} 个文件`;
});

check('HTML 可读取且含独立计算引擎', () => {
  const html = fs.readFileSync(HTML, 'utf8');
  assert(html.includes('<title>武汉诉讼费计算器'), '标题缺失');
  assert(html.includes('<script id="fee-engine">'), 'fee-engine 缺失');
  assert(html.includes('/* ===== 一、基础数据 ===== */'), '基础数据标记缺失');
  assert(html.includes('/* ===== 三、页面渲染 ===== */'), '页面渲染标记缺失');
  assert(!/<script[^>]+src=/.test(html), '存在外部 script 依赖');
  assert(!/<link[^>]+stylesheet/.test(html), '存在外部样式依赖');
  assert(!/127\.0\.0\.1|localhost/.test(html), 'HTML 含本地服务地址');
  return `${Math.round(html.length / 1024)} KB，无外部依赖`;
});

/* ---------- 2. 数据口径 ---------- */
check('数据版本与湖北固定标准', () => {
  eq(E.DATA.version, '2026-10-28', 'version');
  eq(E.DATA.hubei.divorce, 200, '离婚');
  eq(E.DATA.hubei.personality, 300, '人格权');
  eq(E.DATA.hubei.otherNonProperty, 80, '其他非财产');
  eq(E.DATA.hubei.ipNoAmount, 1000, '知识产权无金额');
  eq(E.DATA.hubei.jurisdiction, 80, '管辖权异议');
  eq(E.DATA.administrative.general, 50, '行政其他');
  eq(E.DATA.administrative.special, 100, '行政商标专利海事');
  eq(E.DATA.labor.fee, 10, '劳动争议');
  return '全部匹配';
});

check('14 类费用齐全且顺序正确', () => {
  eq(Object.keys(E.CATEGORIES).length, 14, '类型数量');
  eq(E.CATEGORY_ORDER.case.length, 8, '案件受理费类型');
  eq(E.CATEGORY_ORDER.application.length, 6, '申请费类型');
  return '8 类受理费 + 6 类申请费';
});

/* ---------- 3. 关键计算向量 ---------- */
const vectors = [
  ['财产案件 10 万元', { category: 'property', amount: 100000 }, 2300],
  ['财产案件 100 万元 + 反诉 50 万元', { category: 'property', amount: 1000000, counterclaimAmount: 500000 }, 18200],
  ['财产案件 100 万元', { category: 'property', amount: 1000000 }, 13800],
  ['财产案件 500 万元', { category: 'property', amount: 5000000 }, 46800],
  ['财产案件 2000 万元', { category: 'property', amount: 20000000 }, 141800],
  ['离婚不涉及财产', { category: 'divorce', propertyIncluded: false }, 200],
  ['离婚财产 50 万元', { category: 'divorce', propertyIncluded: true, propertyAmount: 500000 }, 1700],
  ['人格权索赔 10 万元', { category: 'personality', damages: 100000 }, 800],
  ['人格权索赔 100 万元', { category: 'personality', damages: 1000000 }, 5300],
  ['劳动争议', { category: 'labor' }, 10],
  ['知识产权无金额', { category: 'ip', hasAmount: false }, 1000],
  ['知识产权金额 100 万元', { category: 'ip', hasAmount: true, amount: 1000000 }, 13800],
  ['行政其他', { category: 'administrative', special: false }, 50],
  ['行政商标专利海事', { category: 'administrative', special: true }, 100],
  ['其他非财产', { category: 'nonProperty' }, 80],
  ['管辖权异议不成立', { category: 'jurisdiction' }, 80],
  ['执行 50 万元', { category: 'execution', hasAmount: true, amount: 500000 }, 7400],
  ['执行 500 万元', { category: 'execution', hasAmount: true, amount: 5000000 }, 52400],
  ['保全 10 万元', { category: 'preservation', amount: 100000 }, 1020],
  ['保全 100 万元封顶', { category: 'preservation', amount: 1000000 }, 5000],
  ['支付令 10 万元', { category: 'paymentOrder', amount: 100000 }, 766.67],
  ['公示催告', { category: 'publicNotice' }, 100],
  ['撤销仲裁', { category: 'arbitration' }, 400],
  ['破产 2 亿元封顶', { category: 'bankruptcy', amount: 200000000 }, 300000]
];
for (const [name, input, expected] of vectors) {
  check(name, () => eq(calc(input).fee, expected, 'fee'));
}

/* ---------- 4. 边界与减半 ---------- */
check('执行无金额显示 50–500 元区间', () => {
  const r = calc({ category: 'execution', hasAmount: false });
  eq(r.fee, null, 'fee');
  eq(r.range.min, 50, 'min');
  eq(r.range.max, 500, 'max');
  return '50–500 元';
});

check('财产案件 100 万元减半后为 6,900 元', () => {
  const r = calc({ category: 'property', amount: 1000000, half: 'simple' });
  eq(r.baseFee, 13800, '原额');
  eq(r.fee, 6900, '减半后');
  eq(r.discount.amount, 6900, '少交');
  eq(r.lines.filter((x) => x.adjustment).length, 1, '减半明细条数');
  return '只减一次';
});

check('反诉/第三人独立计费后减半', () => {
  const r = calc({ category: 'property', amount: 1000000, counterclaimAmount: 500000 });
  eq(r.baseFee, 22600, '原额合计');
  eq(r.fee, 18200, '本诉+反诉');
  eq(r.discounts.length, 1, '减半份数');
  eq(r.discounts[0].scope, 'counterclaim', '减半对象');
  return '本诉 13,800 + 反诉 4,400 = 18,200 元';
});

check('本诉减半与反诉减半各自独立', () => {
  const r = calc({ category: 'property', amount: 1000000, half: 'simple', counterclaimAmount: 500000 });
  eq(r.fee, 11300, '本诉 6,900 + 反诉 4,400');
  eq(r.discounts.length, 2, '两份减半');
  eq(r.discounts.reduce((s, d) => s + d.amount, 0), 11300, '减半总额');
  return '6,900 + 4,400';
});

check('管辖权异议不适用减半', () => {
  const r = calc({ category: 'jurisdiction', half: 'simple' });
  eq(r.fee, 80, 'fee');
  eq(r.discount, null, 'discount');
  return '80 元';
});

check('申请费不适用减半', () => {
  const r = calc({ category: 'execution', hasAmount: true, amount: 500000, half: 'simple' });
  eq(r.fee, 7400, 'fee');
  eq(r.discount, null, 'discount');
  return '7,400 元';
});

check('无效金额会返回错误', () => {
  const r = E.calcScenario({ category: 'property', amount: 0 });
  eq(r.ok, false, 'ok');
  assert(typeof r.error === 'string' && r.error.length > 0, '错误信息缺失');
  return r.error;
});

check('金额解析支持“万”和千分位', () => {
  eq(E.parseAmount('10万'), 100000, '10万');
  eq(E.parseAmount('1,000,000元'), 1000000, '千分位');
  assert(Number.isNaN(E.parseAmount('abc')), '非法文本应返回 NaN');
  return '10万 / 1,000,000元';
});

check('金额格式化保留到分', () => {
  eq(E.money(766.67), '¥766.67', 'money');
  eq(E.money(2300), '¥2,300', 'money');
  return '¥766.67 / ¥2,300';
});

/* ---------- 5. 文档与来源 ---------- */
check('依据文档包含关键来源与口径', () => {
  const doc = fs.readFileSync(path.join(ROOT, '武汉诉讼费收费标准与依据.md'), 'utf8');
  assert(doc.includes('国务院令第481号'), '缺少国务院令');
  assert(doc.includes('鄂价费〔2008〕5号'), '缺少鄂价费');
  assert(doc.includes('第206条'), '缺少减半一次依据');
  assert(doc.includes('武汉市中级人民法院'), '缺少武汉适用说明');
  return '来源与口径齐全';
});

check('README 包含网页与命令行入口', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  assert(readme.includes('武汉诉讼费计算器.html'), '缺少网页入口');
  assert(readme.includes('wuhan-litigation-fee.mjs'), '缺少命令行入口');
  return '入口齐全';
});

/* ---------- 输出 ---------- */
const pass = checks.filter((c) => c.ok).length;
console.log('\n武汉诉讼费计算器 · 送检包自检\n');
for (const c of checks) {
  console.log(`${c.ok ? '[PASS]' : '[FAIL]'} ${c.name}${c.detail ? '：' + c.detail : ''}`);
}
console.log(`\n结果：${pass}/${checks.length} 通过\n`);

if (pass !== checks.length) process.exitCode = 1;
