// Loads a TypeScript/TSX module (and its relative imports) for node:test without a build step.
// `mocks` replaces modules by import specifier (e.g. 'express', '../db') and gets its own module cache.
// `defines` substitutes source text before compiling (e.g. Vite's import.meta.env.BASE_URL).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const sharedCache = new Map();
const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX };
function loadTs(file, { mocks, defines, cache = mocks || defines ? new Map() : sharedCache } = {}) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file);
    const box = { exports: {}, performance, console, process, require(id) {
        if (mocks && Object.hasOwn(mocks, id)) return mocks[id];
        if (id.endsWith('.css')) return {};
        if (!id.startsWith('.')) return require(id);
        const base = path.resolve(path.dirname(file), id);
        if (id.endsWith('.json')) { const data = JSON.parse(fs.readFileSync(base, 'utf8')); return { __esModule: true, default: data, ...data }; }
        const target = [base + '.ts', base + '.tsx', path.join(base, 'index.ts')].find(p => fs.existsSync(p));
        return loadTs(target, { mocks, defines, cache });
    } };
    box.module = { exports: box.exports };
    cache.set(file, box.exports);
    let source = fs.readFileSync(file, 'utf8');
    for (const [from, to] of Object.entries(defines || {})) source = source.split(from).join(to);
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions }).outputText, box);
    return box.exports;
}
module.exports = { loadTs };
