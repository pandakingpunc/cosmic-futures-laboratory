/** A bounded recursive-descent arithmetic interpreter; no eval or generated code. */
type Node = { op: string; value?: number; name?: string; args?: Node[] };
export function compileExpression(source: string): (a: number) => number {
  if (source.length > 240)
    throw new Error('The equation must contain at most 240 characters.');
  const tokens =
    source.match(
      /(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[a-zA-Z_]+|[+\-*/^(),]/gi,
    ) ?? [];
  if (tokens.join('').toLowerCase() !== source.replace(/\s/g, '').toLowerCase())
    throw new Error('Equation contains unsupported characters.');
  let i = 0;
  const peek = () => tokens[i];
  function atom(): Node {
    const t = tokens[i++];
    if (t === '(') {
      const n = sum();
      if (tokens[i++] !== ')') throw new Error('Missing closing parenthesis.');
      return n;
    }
    if (/^(?:\d|\.)/.test(t ?? '')) return { op: 'number', value: Number(t) };
    if (['a', 'z', 'pi', 'e'].includes(t)) return { op: 'variable', name: t };
    if (['sin', 'cos', 'exp', 'log', 'sqrt', 'abs', 'tanh'].includes(t)) {
      if (tokens[i++] !== '(')
        throw new Error('Functions require parentheses.');
      const n = sum();
      if (tokens[i++] !== ')') throw new Error('Missing function parenthesis.');
      return { op: 'function', name: t, args: [n] };
    }
    throw new Error(
      `Unknown token: ${t ?? 'end of expression'}. Use a, z, arithmetic, sin, cos, exp, log, sqrt, abs or tanh.`,
    );
  }
  function power(): Node {
    let n = atom();
    if (peek() === '^') {
      i++;
      n = { op: '^', args: [n, unary()] };
    }
    return n;
  }
  function unary(): Node {
    if (peek() === '+' || peek() === '-') {
      const op = tokens[i++];
      return { op: 'unary' + op, args: [unary()] };
    }
    return power();
  }
  function product(): Node {
    let n = unary();
    while (peek() === '*' || peek() === '/') {
      const op = tokens[i++];
      n = { op, args: [n, unary()] };
    }
    return n;
  }
  function sum(): Node {
    let n = product();
    while (peek() === '+' || peek() === '-') {
      const op = tokens[i++];
      n = { op, args: [n, product()] };
    }
    return n;
  }
  const root = sum();
  if (i !== tokens.length)
    throw new Error('Unexpected trailing equation text.');
  const funcs: Record<string, (v: number) => number> = {
    sin: Math.sin,
    cos: Math.cos,
    exp: Math.exp,
    log: Math.log,
    sqrt: Math.sqrt,
    abs: Math.abs,
    tanh: Math.tanh,
  };
  function calc(n: Node, a: number): number {
    if (n.op === 'number') return n.value!;
    if (n.op === 'variable')
      return { a, z: 1 / a - 1, pi: Math.PI, e: Math.E }[n.name as 'a']!;
    const left = calc(n.args![0], a);
    if (n.op === 'function') return funcs[n.name!](left);
    if (n.op === 'unary-') return -left;
    if (n.op === 'unary+') return left;
    const right = calc(n.args![1], a);
    return n.op === '+'
      ? left + right
      : n.op === '-'
        ? left - right
        : n.op === '*'
          ? left * right
          : n.op === '/'
            ? left / right
            : left ** right;
  }
  return (a) => {
    const w = calc(root, a);
    if (!Number.isFinite(w) || Math.abs(w) > 1e5)
      throw new Error(
        `Equation undefined or |w| > 100000 at a=${a.toPrecision(5)}.`,
      );
    return w;
  };
}
