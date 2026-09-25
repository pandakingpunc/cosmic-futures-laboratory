import { globSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
// Usage: node scripts/check-architecture.mjs [--root <repository>]
// Enforces the one-way dependency direction of src/science. A module may
// import from its own or a lower layer only, never interface code, so the
// numerical core stays usable from the worker, the HTTP API and the CLI:
//   0 core/, types.ts                  constants, hashing, random numbers, types
//   1 model/, expression.ts,           validation, segments, background equations,
//     astrophysics.ts, defaults.ts     tracers and observational presets
//   2 solver/, integrator.ts           integrators, sampling, tails, contraction
//   3 classify.ts, vacuum.ts,          outcome classification, branch continuations
//     continuation.ts, engine.ts       and the orchestrator
//   4 analysis.ts, report.ts,          ensembles, sweeps and serialization
//     compare.ts
//   5 dispatch.ts                      shared entry for the API and the worker
//   6 worker.ts, index.ts              browser worker and public library entry
// Components may import types, but no runtime code, from the worker module.
// Science modules may not use `**`, `**=` or Math.pow: V8 evaluates them with
// the C library's pow, which rounds differently on Linux and Windows, so they
// use pow10 and powPortable from core/pow.ts instead. The same holds in
// components/ and app/, which prepare engine input (the derived Ωr). Science
// modules may not use Math.tanh either, which newer V8 versions also take from
// the C library; they use tanhPortable from core/numeric.ts.
const LAYERS = [
  [0, /^core\//],
  [0, /^types\.ts$/],
  [1, /^model\//],
  [1, /^(expression|astrophysics|defaults)\.ts$/],
  [2, /^solver\//],
  [2, /^integrator\.ts$/],
  [3, /^(classify|vacuum|continuation|engine)\.ts$/],
  [4, /^(analysis|report|compare)\.ts$/],
  [5, /^dispatch\.ts$/],
  [6, /^(worker|index)\.ts$/],
];
const FORBIDDEN =
  /^(react|react-dom|next|lucide-react|@base-ui|@\/components|@\/app)(\/|$)/;
const MAX_LINES = 400;
const posix = (p) => p.split('\\').join('/');
/** Layer rank of a path relative to src/science, or null when unassigned. */
function layerOf(path) {
  const match = LAYERS.find(([, pattern]) => pattern.test(posix(path)));
  return match ? match[0] : null;
}
/** Import and re-export specifiers of a module, with type-only flags. */
function importsOf(path, source) {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest);
  const found = [];
  const add = (node, specifier, typeOnly) =>
    found.push({
      specifier,
      typeOnly,
      line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
    });
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      let typeOnly;
      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause,
          bindings = clause?.namedBindings;
        typeOnly =
          !!clause &&
          (clause.phaseModifier === ts.SyntaxKind.TypeKeyword ||
            (!clause.name &&
              !!bindings &&
              ts.isNamedImports(bindings) &&
              bindings.elements.length > 0 &&
              bindings.elements.every((e) => e.isTypeOnly)));
      } else
        typeOnly =
          node.isTypeOnly ||
          (!!node.exportClause &&
            ts.isNamedExports(node.exportClause) &&
            node.exportClause.elements.length > 0 &&
            node.exportClause.elements.every((e) => e.isTypeOnly));
      add(node, node.moduleSpecifier.text, typeOnly);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    )
      add(node, node.arguments[0].text, false);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}
/**
 * Uses of `**`, `**=` and of the named Math functions (also as Math['name']
 * or destructured from Math in a declaration).
 */
function platformDependentOf(path, source, functions) {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest);
  const found = [];
  const add = (node, what) =>
    found.push({
      what,
      line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
    });
  const isMath = (node) => ts.isIdentifier(node) && node.text === 'Math';
  const visit = (node) => {
    if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskToken ||
        node.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskEqualsToken)
    )
      add(node.operatorToken, `'${node.operatorToken.getText(file)}'`);
    else if (
      ts.isPropertyAccessExpression(node) &&
      isMath(node.expression) &&
      functions.includes(node.name.text)
    )
      add(node, `Math.${node.name.text}`);
    else if (
      ts.isElementAccessExpression(node) &&
      isMath(node.expression) &&
      ts.isStringLiteralLike(node.argumentExpression) &&
      functions.includes(node.argumentExpression.text)
    )
      add(node, `Math.${node.argumentExpression.text}`);
    else if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      isMath(node.initializer) &&
      ts.isObjectBindingPattern(node.name)
    )
      for (const e of node.name.elements) {
        const name = (e.propertyName ?? e.name).getText(file);
        if (functions.includes(name)) add(node, `Math.${name}`);
      }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}
/** Why a platform-dependent operation is rejected, and what to use instead. */
const REMEDY = {
  'Math.tanh':
    "which newer V8 versions take from the operating system's C library; use tanhPortable from src/science/core/numeric.",
};
const POWER_REMEDY =
  'which rounds differently on Linux and Windows; use pow10 or powPortable from src/science/core/pow.';
/**
 * Violations for files given as { path, source } with paths relative to the
 * repository root. Science modules are those under src/science/.
 */
function checkArchitecture(files) {
  const problems = [];
  for (const { path, source } of files) {
    const file = posix(path);
    const at = (line) => `${file}:${line}`;
    const science = file.startsWith('src/science/');
    for (const p of platformDependentOf(
      file,
      source,
      science ? ['pow', 'tanh'] : ['pow'],
    ))
      problems.push(
        `${at(p.line)} uses ${p.what}, ${REMEDY[p.what] ?? POWER_REMEDY}`,
      );
    if (!science) {
      for (const i of importsOf(file, source))
        if (
          !i.typeOnly &&
          /(^|\/)src\/science\/worker(\.ts)?$/.test(i.specifier)
        )
          problems.push(
            `${at(i.line)} imports runtime code from the worker module; import its message types with 'import type' from dispatch.`,
          );
      continue;
    }
    const own = file.slice('src/science/'.length),
      rank = layerOf(own);
    if (rank === null) {
      problems.push(
        `${file} has no layer; assign it in scripts/check-architecture.mjs.`,
      );
      continue;
    }
    const lines = source.split('\n').length - (source.endsWith('\n') ? 1 : 0);
    if (lines > MAX_LINES)
      problems.push(
        `${file} has ${lines} lines; split modules above ${MAX_LINES}.`,
      );
    for (const i of importsOf(file, source)) {
      const spec = i.specifier;
      if (FORBIDDEN.test(spec)) {
        problems.push(`${at(i.line)} imports interface code '${spec}'.`);
        continue;
      }
      let target;
      if (spec.startsWith('.')) target = posix(join(dirname(file), spec));
      else if (spec.startsWith('@/')) target = spec.slice(2);
      else continue;
      if (target.startsWith('data/')) continue;
      if (!target.startsWith('src/science/')) {
        problems.push(
          `${at(i.line)} imports '${spec}' from outside src/science and data/.`,
        );
        continue;
      }
      const inner = target.slice('src/science/'.length);
      const targetRank = layerOf(/\.\w+$/.test(inner) ? inner : `${inner}.ts`);
      if (targetRank === null)
        problems.push(`${at(i.line)} imports unassigned module '${spec}'.`);
      else if (targetRank > rank)
        problems.push(
          `${at(i.line)} (layer ${rank}) imports '${spec}' from higher layer ${targetRank}.`,
        );
    }
  }
  return problems;
}
const option = process.argv.indexOf('--root');
const root =
  option > 0
    ? resolve(process.argv[option + 1])
    : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = '*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}';
const paths = [
  ...globSync(`src/science/**/${SOURCES}`, { cwd: root }),
  ...globSync(`{components,app}/**/${SOURCES}`, { cwd: root }),
].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const problems = checkArchitecture(
  paths.map((p) => ({
    path: p,
    source: readFileSync(join(root, p), 'utf8'),
  })),
);
for (const p of problems) console.error(`FAIL ${p}`);
if (problems.length) process.exitCode = 1;
else
  console.log(
    `Architecture check passed: ${paths.length} modules respect the src/science layers.`,
  );
