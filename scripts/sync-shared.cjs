// Copies shared/ (rules used by both the web app and the server) into
// server/src/shared/. The server may be built from its own folder, so it
// cannot import ../shared directly. tests/shared-sync.test.cjs fails when
// the copy drifts; run `npm run sync:shared` after editing shared/.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'shared');
const target = path.join(root, 'server', 'src', 'shared');

function listFiles(dir, base = dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? listFiles(full, base) : [path.relative(base, full)];
    });
}

function sync() {
    fs.rmSync(target, { recursive: true, force: true });
    for (const file of listFiles(source)) {
        fs.mkdirSync(path.dirname(path.join(target, file)), { recursive: true });
        fs.copyFileSync(path.join(source, file), path.join(target, file));
    }
    fs.writeFileSync(path.join(target, 'GENERATED.md'), '由 `npm run sync:shared` 從根目錄 `shared/` 複製產生，請勿直接修改。\n');
}

module.exports = { listFiles, source, target };
if (require.main === module) { sync(); console.log(`Synced ${listFiles(source).length} files to ${path.relative(root, target)}`); }
