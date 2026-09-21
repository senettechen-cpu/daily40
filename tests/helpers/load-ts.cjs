// Loads a TypeScript module (and its relative imports) for node:test without a build step.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const cache = new Map();
function loadTs(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file);
    const box = { exports: {}, require(id) {
        if (!id.startsWith('.')) return require(id);
        const base = path.resolve(path.dirname(file), id);
        const target = [base + '.ts', base + '.tsx', path.join(base, 'index.ts')].find(p => fs.existsSync(p));
        return loadTs(target);
    } };
    box.module = { exports: box.exports };
    cache.set(file, box.exports);
    const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(output, box);
    return box.exports;
}
module.exports = { loadTs };
