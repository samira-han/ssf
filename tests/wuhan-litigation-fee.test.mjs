import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from '../tools/engine-loader.mjs';

const E = loadEngine();

function calc(input) {
  const r = E.calcScenario(input);
  assert.equal(r.ok, true, r.error);
  return r;
}

test('基础数据：湖北固定标准与类型数量', () => {
  assert.equal(E.DATA.version, '2026-10-28');
  assert.equal(E.DATA.hubei.divorce, 200);
  assert.equal(E.DATA.hubei.personality, 300);
  assert.equal(E.DATA.hubei.otherNonProperty, 80);
  assert.equal(E.DATA.hubei.ipNoAmount, 1000);
  assert.equal(E.DATA.hubei.jurisdiction, 80);
  assert.equal(Object.keys(E.CATEGORIES).length, 14);
});

test('金额解析：数字、千分位、万、元', () => {
  assert.equal(E.parseAmount('100000'), 100000);
  assert.equal(E.parseAmount('100,000'), 100000);
  assert.equal(E.parseAmount('10万'), 100000);
  assert.equal(E.parseAmount('10万元'), 100000);
  assert.equal(E.parseAmount('1.5万'), 15000);
  assert.equal(E.parseAmount('  ¥ 500000 元 '), 500000);
  assert.ok(Number.isNaN(E.parseAmount('')));
  assert.ok(Number.isNaN(E.parseAmount('abc')));
  assert.equal(E.parseAmount('-1'), -1);
});

test('财产案件：所有档位边界', () => {
  const cases = [
    [1, 50],
    [10000, 50],
    [100000, 2300],
    [200000, 4300],
    [500000, 8800],
    [1000000, 13800],
    [2000000, 22800],
    [5000000, 46800],
    [10000000, 81800],
    [20000000, 141800],
    [30000000, 191800],
    [100000000, 541800]
  ];
  for (const [amount, fee] of cases) {
    assert.equal(calc({ category: 'property', amount }).fee, fee, `amount=${amount}`);
  }
});

test('离婚：基础 200 元，超过 20 万元部分按 0.5%', () => {
  assert.equal(calc({ category: 'divorce', propertyIncluded: false }).fee, 200);
  assert.equal(calc({ category: 'divorce', propertyIncluded: true, propertyAmount: 0 }).fee, 200);
  assert.equal(calc({ category: 'divorce', propertyIncluded: true, propertyAmount: 200000 }).fee, 200);
  assert.equal(calc({ category: 'divorce', propertyIncluded: true, propertyAmount: 500000 }).fee, 1700);
  assert.equal(E.calcScenario({ category: 'divorce', propertyIncluded: true, propertyAmount: '' }).ok, false);
  assert.equal(E.calcScenario({ category: 'divorce', propertyIncluded: true, propertyAmount: NaN }).ok, false);
  assert.equal(calc({ category: 'divorce', propertyIncluded: true, propertyAmount: 1000000 }).fee, 4200);
});

test('人格权：基础 300 元，赔偿分段加收', () => {
  assert.equal(calc({ category: 'personality', damages: 0 }).fee, 300);
  assert.equal(calc({ category: 'personality', damages: 50000 }).fee, 300);
  assert.equal(calc({ category: 'personality', damages: 100000 }).fee, 800);
  assert.equal(calc({ category: 'personality', damages: 500000 }).fee, 2800);
  assert.equal(calc({ category: 'personality', damages: 1000000 }).fee, 5300);
});

test('劳动争议、知识产权、行政、其他非财产、管辖权异议', () => {
  assert.equal(calc({ category: 'labor' }).fee, 10);
  assert.equal(calc({ category: 'ip', hasAmount: false }).fee, 1000);
  assert.equal(calc({ category: 'ip', hasAmount: true, amount: 100000 }).fee, 2300);
  assert.equal(calc({ category: 'administrative', special: false }).fee, 50);
  assert.equal(calc({ category: 'administrative', special: true }).fee, 100);
  assert.equal(calc({ category: 'nonProperty' }).fee, 80);
  assert.equal(calc({ category: 'jurisdiction' }).fee, 80);
});

test('执行费：分段累计与无金额区间', () => {
  assert.equal(calc({ category: 'execution', hasAmount: true, amount: 10000 }).fee, 50);
  assert.equal(calc({ category: 'execution', hasAmount: true, amount: 500000 }).fee, 7400);
  assert.equal(calc({ category: 'execution', hasAmount: true, amount: 5000000 }).fee, 52400);
  assert.equal(calc({ category: 'execution', hasAmount: true, amount: 10000000 }).fee, 77400);
  assert.equal(calc({ category: 'execution', hasAmount: true, amount: 20000000 }).fee, 87400);

  const r = calc({ category: 'execution', hasAmount: false });
  assert.equal(r.fee, null);
  assert.deepEqual(r.range, { min: 50, max: 500 });
  assert.equal(r.timing, '执行后交纳');
});

test('保全费：30 元起、5000 元封顶', () => {
  assert.equal(calc({ category: 'preservation', amount: 0 }).fee, 30);
  assert.equal(calc({ category: 'preservation', amount: 1000 }).fee, 30);
  assert.equal(calc({ category: 'preservation', amount: 100000 }).fee, 1020);
  assert.equal(calc({ category: 'preservation', amount: 500000 }).fee, 3020);
  assert.equal(calc({ category: 'preservation', amount: 896000 }).fee, 5000);
  assert.equal(calc({ category: 'preservation', amount: 1000000 }).fee, 5000);
});

test('支付令：财产案件受理费的 1/3', () => {
  assert.equal(calc({ category: 'paymentOrder', amount: 10000 }).fee, 16.67);
  assert.equal(calc({ category: 'paymentOrder', amount: 100000 }).fee, 766.67);
  assert.equal(calc({ category: 'paymentOrder', amount: 1000000 }).fee, 4600);
});

test('公示催告、撤销仲裁裁决', () => {
  assert.equal(calc({ category: 'publicNotice' }).fee, 100);
  assert.equal(calc({ category: 'arbitration' }).fee, 400);
});

test('破产：财产案件标准减半，最高 30 万元', () => {
  assert.equal(calc({ category: 'bankruptcy', amount: 100000 }).fee, 1150);
  assert.equal(calc({ category: 'bankruptcy', amount: 1000000 }).fee, 6900);
  assert.equal(calc({ category: 'bankruptcy', amount: 5000000 }).fee, 23400);
  assert.equal(calc({ category: 'bankruptcy', amount: 20000000 }).fee, 70900);
  assert.equal(calc({ category: 'bankruptcy', amount: 111640000 }).fee, 300000);
  assert.equal(calc({ category: 'bankruptcy', amount: 200000000 }).fee, 300000);
});

test('反诉/第三人：独立计费后减半，与本诉分别计算', () => {
  const r = calc({ category: 'property', amount: 1000000, counterclaimAmount: 500000 });
  assert.equal(r.baseFee, 22600);
  assert.equal(r.fee, 18200);
  assert.equal(r.counterclaim.base, 8800);
  assert.equal(r.counterclaim.discountAmount, 4400);
  assert.equal(r.discounts.length, 1);
  assert.equal(r.discounts[0].scope, 'counterclaim');
  assert.match(r.sub, /本诉 1,000,000 元/);
  assert.match(r.sub, /反诉\/第三人 500,000 元/);

  const both = calc({ category: 'property', amount: 1000000, half: 'simple', counterclaimAmount: 500000 });
  assert.equal(both.baseFee, 22600);
  assert.equal(both.fee, 11300);
  assert.equal(both.discounts.length, 2);
  assert.equal(both.discounts.reduce((s, d) => s + d.amount, 0), 11300);
  assert.equal(both.discount, null);

  const ip = calc({ category: 'ip', hasAmount: true, amount: 1000000, counterclaimAmount: 500000 });
  assert.equal(ip.fee, 18200);

  assert.equal(E.calcScenario({ category: 'property', amount: 1000000, counterclaimAmount: 0 }).ok, false);
  assert.equal(E.calcScenario({ category: 'divorce', propertyIncluded: false, counterclaimAmount: 500000 }).ok, false);
  assert.equal(E.calcScenario({ category: 'property', amount: 1000000, half: 'counterclaim' }).ok, false);
});

test('减半：只减一次，且只作用于案件受理费', () => {
  const plain = calc({ category: 'property', amount: 1000000 });
  assert.equal(plain.fee, 13800);
  assert.equal(plain.discount, null);

  const simple = calc({ category: 'property', amount: 1000000, half: 'simple' });
  assert.equal(simple.fee, 6900);
  assert.equal(simple.discount.amount, 6900);
  assert.equal(simple.lines.filter((l) => l.adjustment).length, 1);
  assert.equal(simple.lines.reduce((s, l) => s + l.amount, 0), simple.fee);

  const mediation = calc({ category: 'property', amount: 1000000, half: 'mediation' });
  assert.equal(mediation.fee, simple.fee);

  const laborHalf = calc({ category: 'labor', half: 'simple' });
  assert.equal(laborHalf.fee, 5);

  const jurisdictionHalf = calc({ category: 'jurisdiction', half: 'simple' });
  assert.equal(jurisdictionHalf.fee, 80);
  assert.equal(jurisdictionHalf.discount, null);

  const executionHalf = calc({ category: 'execution', hasAmount: true, amount: 500000, half: 'simple' });
  assert.equal(executionHalf.fee, 7400);
  assert.equal(executionHalf.discount, null);
});

test('输入校验：非正数、非法文本、未知类型', () => {
  assert.equal(E.calcScenario({ category: 'property', amount: 0 }).ok, false);
  assert.equal(E.calcScenario({ category: 'property', amount: -1 }).ok, false);
  assert.equal(E.calcScenario({ category: 'property', amount: 'abc' }).ok, false);
  assert.equal(E.calcScenario({ category: 'ip', hasAmount: true, amount: 0 }).ok, false);
  assert.equal(E.calcScenario({ category: 'paymentOrder', amount: 0 }).ok, false);
  assert.equal(E.calcScenario({ category: 'bankruptcy', amount: 0 }).ok, false);
  assert.equal(E.calcScenario({ category: 'nope' }).ok, false);
});

test('结果结构：金额展示与口径', () => {
  const r = calc({ category: 'property', amount: 123456 });
  assert.equal(r.categoryName, '财产案件');
  assert.equal(r.feeKind, '案件受理费');
  assert.equal(r.timing, '立案时预交');
  assert.equal(E.money(r.fee), '¥2,769.12');
  assert.match(r.note, /减半/);
  assert.match(r.formula, /分段累计/);

  const pay = calc({ category: 'paymentOrder', amount: 100000 });
  assert.equal(pay.mode, 'application');
  assert.equal(pay.feeKind, '申请费');
  assert.equal(pay.timing, '申请时预交');
});
