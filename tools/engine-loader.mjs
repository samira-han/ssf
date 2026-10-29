/**
 * 从网页计算器中加载“基础数据 + 纯计算函数”。
 *
 * 目的：网页版与命令行版共用同一份费率与算式，避免两处数据打架。
 * 约定：HTML 中 <script id="fee-engine"> 内必须有
 *   /* ===== 一、基础数据 ===== *\/
 *   /* ===== 二、纯计算函数 ===== *\/
 *   /* ===== 三、页面渲染 ===== *\/
 * 三段；只取第一段开头到第三段开头之间的内容。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const HTML_PATH = path.resolve(HERE, '..', '武汉诉讼费计算器.html');

const START_MARK = '/* ===== 一、基础数据 ===== */';
const END_MARK = '/* ===== 三、页面渲染 ===== */';

export function loadEngine() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const script = html.match(/<script id="fee-engine">([\s\S]*?)<\/script>/);
  if (!script) throw new Error('未在 HTML 中找到 <script id="fee-engine">');

  const js = script[1];
  const start = js.indexOf(START_MARK);
  const end = js.indexOf(END_MARK);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('HTML 中的“一、基础数据 / 三、页面渲染”标记缺失或顺序变化');
  }

  const source = js.slice(start, end);
  const api = new Function(
    source +
    '\nreturn { DATA, CATEGORIES, CATEGORY_ORDER, HALF_REASONS, calcScenario, propertyFee,' +
    ' executionFee, preservationFee, parseAmount, formatNum, money, signedMoney, formatPct, round2 };'
  )();

  if (!api.DATA || !api.CATEGORIES || typeof api.calcScenario !== 'function') {
    throw new Error('计算引擎导出失败');
  }
  return api;
}
