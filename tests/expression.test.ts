import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileExpression } from '../src/science/expression';
import { near } from './helpers';
test('safe expressions support precedence and reject code', () => {
  near(compileExpression('-2^2 + a/2')(2), -3);
  near(compileExpression('-1 + 0.1*sin(log(a))')(1), -1);
  assert.throws(() => compileExpression('globalThis.process.exit()'));
  assert.throws(() => compileExpression('a; alert(1)'));
  assert.throws(() => compileExpression('sqrt(-1)')(1));
});
