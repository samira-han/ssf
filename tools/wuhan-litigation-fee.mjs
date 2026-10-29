#!/usr/bin/env node
/**
 * 武汉诉讼费命令行计算器
 *
 * 与网页版共用同一份费率与纯计算函数：运行时从 ../武汉诉讼费计算器.html
 * 的 <script id="fee-engine"> 中读取，改了网页里的费率，这里自动跟着变。
 *
 * 用法：
 *   node wuhan-litigation-fee.mjs property 1000000
 *   node wuhan-litigation-fee.mjs property 50万 --half simple
 *   node wuhan-litigation-fee.mjs property 100万 --counterclaim 50万
 *   node wuhan-litigation-fee.mjs divorce 500000
 *   node wuhan-litigation-fee.mjs divorce --no-property
 *   node wuhan-litigation-fee.mjs personality 100000
 *   node wuhan-litigation-fee.mjs labor
 *   node wuhan-litigation-fee.mjs ip 1000000
 *   node wuhan-litigation-fee.mjs ip --no-amount
 *   node wuhan-litigation-fee.mjs administrative --special
 *   node wuhan-litigation-fee.mjs execution 500000
 *   node wuhan-litigation-fee.mjs execution --no-amount
 *   node wuhan-litigation-fee.mjs preservation 100000
 *   node wuhan-litigation-fee.mjs payment-order 100000
 *   node wuhan-litigation-fee.mjs public-notice
 *   node wuhan-litigation-fee.mjs arbitration
 *   node wuhan-litigation-fee.mjs bankruptcy 10000000
 *   node wuhan-litigation-fee.mjs list
 *
 * 通用参数：
 *   --half simple|mediation|withdrawal   本诉减半情形（同一份费用只减一次）
 *   --counterclaim 金额                  反诉/第三人独立请求额（另按第18条减半）
 *   --no-amount        ip / execution 表示没有争议金额 / 执行金额
 *   --special          行政案件中的商标、专利、海事行政案件
 *   --no-property      离婚案件不涉及财产分割
 *   --json             输出机器可读 JSON
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadEngine, HTML_PATH } from './engine-loader.mjs';

const E = loadEngine();

const COMMANDS = {
  property: 'property',
  '财产': 'property',
  '财产案件': 'property',
  divorce: 'divorce',
  '离婚': 'divorce',
  '离婚案件': 'divorce',
  personality: 'personality',
  '人格权': 'personality',
  '人格权案件': 'personality',
  labor: 'labor',
  '劳动': 'labor',
  '劳动争议': 'labor',
  ip: 'ip',
  '知识产权': 'ip',
  '知识产权案件': 'ip',
  administrative: 'administrative',
  admin: 'administrative',
  '行政': 'administrative',
  '行政案件': 'administrative',
  'non-property': 'nonProperty',
  nonProperty: 'nonProperty',
  nonproperty: 'nonProperty',
  '其他非财产': 'nonProperty',
  jurisdiction: 'jurisdiction',
  '管辖异议': 'jurisdiction',
  '管辖权异议': 'jurisdiction',
  execution: 'execution',
  '执行': 'execution',
  '申请执行': 'execution',
  preservation: 'preservation',
  '保全': 'preservation',
  '财产保全': 'preservation',
  'payment-order': 'paymentOrder',
  paymentOrder: 'paymentOrder',
  paymentorder: 'paymentOrder',
  '支付令': 'paymentOrder',
  'public-notice': 'publicNotice',
  publicNotice: 'publicNotice',
  publicnotice: 'publicNotice',
  '公示催告': 'publicNotice',
  arbitration: 'arbitration',
  '撤销仲裁': 'arbitration',
  '撤销仲裁裁决': 'arbitration',
  bankruptcy: 'bankruptcy',
  '破产': 'bankruptcy',
  '破产申请': 'bankruptcy'
};

const HALF_ALIASES = {
  simple: 'simple',
  '简易': 'simple',
  '简易程序': 'simple',
  mediation: 'mediation',
  '调解': 'mediation',
  withdrawal: 'withdrawal',
  '撤诉': 'withdrawal'
};

function parseArgs(argv) {
  const opt = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opt.json = true;
    else if (a === '--no-amount') opt.noAmount = true;
    else if (a === '--special') opt.special = true;
    else if (a === '--no-property') opt.noProperty = true;
    else if (a === '--half') opt.half = argv[++i];
    else if (a === '--amount') opt.amount = argv[++i];
    else if (a === '--counterclaim' || a === '--third-party') opt.counterclaim = argv[++i];
    else if (a === '-h' || a === '--help') opt.help = true;
    else opt._.push(a);
  }
  return opt;
}

function requireAmount(raw, label) {
  const n = E.parseAmount(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`请填写大于0的${label}，例如：${label === '诉讼请求金额' ? '100000 或 10万' : '500000'}`);
  }
  return n;
}

function optionalNonNegative(raw, label) {
  if (raw == null || raw === '') return 0;
  const n = E.parseAmount(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${label}格式不正确，请填写不小于0的金额`);
  }
  return n;
}

function halfValue(raw) {
  if (!raw) return '';
  const value = HALF_ALIASES[raw];
  if (!value) {
    throw new Error('--half 只支持 simple、mediation、withdrawal（或 简易、调解、撤诉）；反诉/第三人请用 --counterclaim');
  }
  return value;
}

function scenarioFromArgs(cmd, opt) {
  const pos = opt.amount != null ? opt.amount : opt._[1];
  const half = halfValue(opt.half);
  const base = { category: cmd, half };

  if (opt.counterclaim != null && cmd !== 'property' && cmd !== 'ip') {
    throw new Error('--counterclaim 仅适用于 property，或有争议金额的 ip；其他类型暂不支持反诉独立计费');
  }

  switch (cmd) {
    case 'property': {
      const s = { ...base, amount: requireAmount(pos, '诉讼请求金额') };
      if (opt.counterclaim != null) s.counterclaimAmount = requireAmount(opt.counterclaim, '反诉 / 第三人请求金额');
      return s;
    }
    case 'divorce':
      return {
        ...base,
        propertyIncluded: !opt.noProperty && pos != null,
        propertyAmount: opt.noProperty || pos == null ? 0 : optionalNonNegative(pos, '财产总额')
      };
    case 'personality':
      return { ...base, damages: optionalNonNegative(pos, '损害赔偿金额') };
    case 'labor':
      return base;
    case 'ip': {
      if (opt.noAmount) {
        if (opt.counterclaim != null) throw new Error('无争议金额的知识产权案件不支持反诉独立计费；请先给出争议金额');
        return { ...base, hasAmount: false };
      }
      const s = { ...base, hasAmount: true, amount: requireAmount(pos, '争议金额') };
      if (opt.counterclaim != null) s.counterclaimAmount = requireAmount(opt.counterclaim, '反诉 / 第三人请求金额');
      return s;
    }
    case 'administrative':
      return { ...base, special: !!opt.special };
    case 'nonProperty':
    case 'jurisdiction':
      return base;
    case 'execution':
      if (opt.noAmount) return { ...base, hasAmount: false };
      return { ...base, hasAmount: true, amount: requireAmount(pos, '执行金额') };
    case 'preservation':
      return { ...base, amount: optionalNonNegative(pos, '保全金额') };
    case 'paymentOrder':
      return { ...base, amount: requireAmount(pos, '债权金额') };
    case 'publicNotice':
    case 'arbitration':
      return base;
    case 'bankruptcy':
      return { ...base, amount: requireAmount(pos, '破产财产总额') };
    default:
      throw new Error(`未知命令：${cmd}`);
  }
}

function amountText(result) {
  if (result.range) return `¥${E.formatNum(result.range.min)}–${E.formatNum(result.range.max)}`;
  return E.money(result.fee);
}

function lineText(line) {
  const amount = line.amountText || (line.amount < 0 ? E.signedMoney(line.amount) : E.money(line.amount));
  return `  ${line.label}${line.detail ? '（' + line.detail + '）' : ''}：${amount}`;
}

function printHelp() {
  console.log(`
武汉诉讼费命令行计算器

用法：
  node wuhan-litigation-fee.mjs <类型> [金额] [参数]

常用：
  property 1000000                 财产案件 100 万元
  property 50万 --half simple      本诉简易程序减半
  property 100万 --counterclaim 50万  本诉 100 万 + 反诉 50 万，分别计算
  divorce 500000                   离婚，财产总额 50 万元
  divorce --no-property            离婚，不涉及财产
  personality 100000               人格权，索赔 10 万元
  labor                            劳动争议（10 元）
  ip 1000000                       知识产权，有争议金额
  ip --no-amount                   知识产权，无争议金额
  administrative --special         商标/专利/海事行政
  execution 500000                 申请执行 50 万元
  execution --no-amount            没有执行金额
  preservation 100000              保全 10 万元
  payment-order 100000             支付令，债权 10 万元
  public-notice                    公示催告（100 元）
  arbitration                      撤销仲裁裁决（400 元）
  bankruptcy 10000000              破产申请，财产总额 1000 万元
  list                             列出全部类型

通用参数：
  --half simple|mediation|withdrawal   本诉的减半情形（同一份受理费只减一次）
  --counterclaim <金额>                反诉/有独立请求权第三人的独立请求额（另按第18条减半）
  --no-amount / --special / --no-property / --json

金额支持 100000、100,000、10万、10万元。
`);
}

function printResult(result, json) {
  if (json) {
    console.log(JSON.stringify({
      ...result,
      source: {
        version: E.DATA.version,
        law: E.DATA.law,
        local: E.DATA.localStandard,
        html: HTML_PATH
      }
    }, null, 2));
    return;
  }
  console.log('\n武汉诉讼费估算');
  console.log('类型：' + result.categoryName + '（' + result.feeKind + '）');
  console.log('情形：' + result.sub);
  console.log('结果：' + amountText(result) + (result.timing ? '（' + result.timing + '）' : ''));
  const discounts = result.discounts || (result.discount ? [result.discount] : []);
  if (discounts.length) {
    const saved = discounts.reduce((sum, d) => sum + d.amount, 0);
    const desc = discounts.map((d) => (d.scope === 'counterclaim' ? '反诉/第三人：' : '') + d.label).join('；');
    console.log('减半：' + desc + '；原额 ' + E.money(result.baseFee) + '，少交 ' + E.money(saved));
  }
  if (result.category === 'paymentOrder') {
    console.log('基数：财产案件受理费 ' + E.money(result.baseFee));
  }
  console.log('明细：');
  for (const line of result.lines) console.log(lineText(line));
  console.log('提示：' + result.note);
  console.log('依据：国务院令第481号；鄂价费〔2008〕5号；数据基准 ' + E.DATA.version);
  console.log('说明：仅供参考，以法院缴费通知书为准。\n');
}

function list() {
  console.log('\n武汉诉讼费计算器 · 类型代码\n');
  for (const mode of ['case', 'application']) {
    console.log(mode === 'case' ? '一、起诉 / 上诉（案件受理费）' : '二、申请事项（申请费）');
    for (const key of E.CATEGORY_ORDER[mode]) {
      const c = E.CATEGORIES[key];
      console.log(`  ${key.padEnd(14)} ${c.name}  —— ${c.hint}`);
    }
    console.log('');
  }
  console.log('湖北固定标准：离婚 200 元；人格权 300 元；其他非财产 80 元；无争议金额知识产权 1,000 元；管辖权异议 80 元。');
  console.log('财产案件、执行、保全等按金额分段累计。同一份案件受理费减半只能减一次；反诉/第三人另按第18条单独计费后减半。\n');
}

function main() {
  const opt = parseArgs(process.argv.slice(2));
  if (opt.help || !opt._.length) return printHelp();
  const rawCmd = opt._[0];
  if (rawCmd === 'list' || rawCmd === '列表') return list();

  const cmd = COMMANDS[rawCmd] || COMMANDS[rawCmd.toLowerCase()];
  if (!cmd) {
    throw new Error(`未知类型：${rawCmd}。可用 list 查看全部类型。`);
  }

  const scenario = scenarioFromArgs(cmd, opt);
  const result = E.calcScenario(scenario);
  if (!result.ok) throw new Error(result.error);
  printResult(result, opt.json);
}

try {
  main();
} catch (err) {
  console.error('错误：' + err.message);
  process.exitCode = 1;
}
