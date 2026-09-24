import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { defaultConfig } from '../src/science/defaults';
import { validate } from '../src/science/engine';
import type { Configuration } from '../src/science/types';
import {
  parseNumberList,
  parseNumeric,
  sameNumbers,
} from '../components/lab/numeric';
import {
  bandPath,
  fateCellColor,
  tracePath,
  xSpan,
  yExtent,
} from '../components/lab/plotting';
import { ConfigurationPanel } from '../components/lab/configuration';
import { ScientificPlot } from '../components/lab/chart';
test('parseNumeric accepts signs, exponents, U+2212 and a lone decimal comma', () => {
  const cases: [string, number][] = [
    ['-1.05', -1.05],
    ['+3', 3],
    [' 42 ', 42],
    ['.5', 0.5],
    ['5.', 5],
    ['1e-9', 1e-9],
    ['1E+5', 1e5],
    ['−1.1', -1.1],
    ['1e−5', 1e-5],
    ['0,69', 0.69],
    ['-0,315', -0.315],
  ];
  for (const [text, value] of cases) assert.equal(parseNumeric(text), value);
  for (const text of [
    '',
    '   ',
    '-',
    '1e',
    '1e-',
    '0x10',
    'Infinity',
    '-Infinity',
    'NaN',
    '1e400',
    '1,000.5',
    '1,2,3',
    '1 000',
    '95%',
    '1..2',
  ])
    assert.ok(Number.isNaN(parseNumeric(text)), JSON.stringify(text));
});
test('number lists ignore empty items and keep unreadable ones visible as NaN', () => {
  assert.deepEqual(parseNumberList('10, 1e5, 1e9'), [10, 1e5, 1e9]);
  assert.deepEqual(parseNumberList('10, 100,'), [10, 100]);
  assert.deepEqual(parseNumberList('10; −2'), [10, -2]);
  // With semicolons as separators a decimal comma is not split into two items.
  assert.deepEqual(parseNumberList('1,5; 10;'), [1.5, 10]);
  assert.ok(parseNumberList('10, 100; 5').some(Number.isNaN));
  assert.deepEqual(parseNumberList(''), []);
  const typo = parseNumberList('10, abc');
  assert.equal(typo[0], 10);
  assert.ok(Number.isNaN(typo[1]));
  assert.ok(sameNumbers([1, NaN], [1, NaN]));
  assert.ok(!sameNumbers([1, 2], [1, 2, 3]));
  // Passing through the default mass field leaves the configuration unchanged.
  const masses = defaultConfig().blackHoleMasses;
  assert.ok(sameNumbers(parseNumberList(masses.join(', ')), masses));
});
test('chart scaling survives short runs, gaps and non-finite bands', () => {
  assert.equal(xSpan(0), 1);
  assert.equal(xSpan(0.5), 0.5);
  assert.equal(xSpan(100), 100);
  assert.equal(xSpan(Number.NaN), 1);
  const series = [
    {
      values: [
        { x: 0, y: 1 },
        { x: 1, y: Number.NaN },
        { x: 2, y: 3 },
        { x: 3, y: null },
        { x: 4, y: 5 },
        { x: 5, y: 6 },
      ],
    },
  ];
  const nanBands = [
    { x: 0, low: Number.NaN, high: Number.NaN },
    { x: 1, low: 0, high: 10 },
  ];
  const [ymin, ymax] = yExtent(series, 5, nanBands);
  assert.ok(Number.isFinite(ymin) && Number.isFinite(ymax));
  assert.ok(ymin < 0 && ymax > 10);
  const sx = (x: number) => x * 10,
    sy = (y: number) => -y;
  const { d, dots } = tracePath(series[0].values, 5, sx, sy);
  assert.equal(d, 'M40.00,-5.00 L50.00,-6.00');
  // Isolated finite points (between gaps or alone) are drawn as dots.
  assert.deepEqual(dots, [
    { x: 0, y: -1 },
    { x: 20, y: -3 },
  ]);
  assert.deepEqual(tracePath([{ x: 0, y: 2 }], 0, sx, sy).dots, [
    { x: 0, y: -2 },
  ]);
  assert.equal(bandPath(nanBands, 5, sx, sy), null);
  assert.equal(bandPath(nanBands.slice(1), 5, sx, sy), null);
  assert.equal(
    bandPath(
      [
        { x: 0, low: 1, high: 2 },
        { x: 1, low: 3, high: 4 },
      ],
      5,
      sx,
      sy,
    ),
    'M0.00,-2.00 L10.00,-4.00 L10.00,-3.00 L0.00,-1.00 Z',
  );
});
test('invalid and unresolved fate-map cells are never colored as resolved', () => {
  const gray = '#475362';
  assert.equal(
    fateCellColor('invalid', 'Undetermined with current physics'),
    gray,
  );
  assert.equal(fateCellColor('limited', 'Big Rip'), gray);
  assert.equal(fateCellColor('complete', 'Big Rip'), '#c78277');
  assert.equal(
    fateCellColor('complete', 'Asymptotic de Sitter expansion'),
    '#83d5c2',
  );
  assert.notEqual(
    fateCellColor('complete', 'Long-lived decelerating expansion'),
    gray,
  );
});
test('the configuration panel renders a non-string preset instead of crashing', () => {
  const config = {
    ...defaultConfig(),
    preset: { a: 1 },
  } as unknown as Configuration;
  const html = renderToStaticMarkup(
    createElement(ConfigurationPanel, {
      config,
      issues: validate(config),
      setConfig: () => {},
      run: () => {},
      busy: false,
      onError: () => {},
      onNotice: () => {},
    }),
  );
  assert.match(html, /\[object Object\]/);
  // Events sharing an id (possible in imported files) render as two editors.
  const duplicate = { ...defaultConfig(), sandbox: true };
  duplicate.events = [
    { id: 'a', logTime: Number.NaN, action: 'halt', value: 0 },
    { id: 'a', logTime: 40, action: 'halt', value: 0 },
  ];
  const editors = renderToStaticMarkup(
    createElement(ConfigurationPanel, {
      config: duplicate,
      issues: validate(duplicate),
      setConfig: () => {},
      run: () => {},
      busy: false,
      onError: () => {},
      onNotice: () => {},
    }),
  );
  assert.equal(editors.match(/Remove custom event/g)?.length, 2);
});
test('an ensemble chart with non-finite bands keeps finite axes', () => {
  const html = renderToStaticMarkup(
    createElement(ScientificPlot, {
      title: 'Ensemble',
      xMax: 20,
      series: [
        {
          key: 'median',
          label: 'Median',
          color: '#fff',
          values: [
            { x: 0, y: 0 },
            { x: 20, y: 1 },
          ],
        },
      ],
      bands: [
        { x: 0, low: Number.NaN, high: Number.NaN },
        { x: 20, low: Number.NaN, high: Number.NaN },
      ],
    }),
  );
  assert.doesNotMatch(html, /NaN|Not available/);
});
