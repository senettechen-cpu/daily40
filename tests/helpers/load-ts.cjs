// Loads a TypeScript/TSX module (and its relative imports) for node:test without a build step.
// `mocks` replaces modules by import specifier (e.g. 'express', '../db') and gets its own module cache.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const sharedCache = new Map();
const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX };
function loadTs(file, { mocks, cache = mocks ? new Map() : sharedCache } = {}) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file);
    const box = { exports: {}, performance, console, process, require(id) {
        if (mocks && Object.hasOwn(mocks, id)) return mocks[id];
        if (id.endsWith('.css')) return {};
        if (!id.startsWith('.')) return require(id);
        const base = path.resolve(path.dirname(file), id);
        const target = [base + '.ts', base + '.tsx', path.join(base, 'index.ts')].find(p => fs.existsSync(p));
        return loadTs(target, { mocks, cache });
    } };
    box.module = { exports: box.exports };
    cache.set(file, box.exports);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions }).outputText, box);
    return box.exports;
}
module.exports = { loadTs };
