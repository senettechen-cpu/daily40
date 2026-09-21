const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/data/unitVisuals.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const context = { exports: {} };
vm.runInNewContext(compiled, context);
const { UNIT_COSTS, UNIT_POWER, UNIT_VISUALS, getRecruitmentCost, getGarrisonPower } = context.exports;

test('recruitment preserves existing engine prices, including hive discount', () => {
    assert.equal(getRecruitmentCost('guardsmen', false), 300);
    assert.equal(getRecruitmentCost('guardsmen', true), 240);
    assert.equal(getRecruitmentCost('space_marine', true), 1500);
    assert.equal(getRecruitmentCost('custodes', false), 4500);
    assert.equal(getRecruitmentCost('dreadnought', false), 100);
    assert.equal(getRecruitmentCost('baneblade', false), 2000);
    Object.keys(UNIT_COSTS).filter(type => type !== 'guardsmen').forEach(type => assert.equal(getRecruitmentCost(type, true), UNIT_COSTS[type]));
});

test('defense preview counts elite units, absent fields and support exactly once', () => {
    assert.equal(getGarrisonPower({}), 0);
    assert.equal(getGarrisonPower({ guardsmen: 4, space_marine: 1 }), 500);
    assert.equal(getGarrisonPower({ dreadnought: 1, wolf_guard: 2, purifier: 1 }), 1700);
    assert.equal(getGarrisonPower({ redemptor_dreadnought: 1 }, ['librarian', 'barge']), 13000);
    assert.equal(getGarrisonPower({ guardsmen: 1 }, ['barge', 'barge']), 10050);
});

test('each deployable unit has a visual identity and all referenced raster assets exist', () => {
    for (const type of Object.keys(UNIT_POWER)) assert.ok(UNIT_VISUALS[type], type);
    for (const visual of Object.values(UNIT_VISUALS)) {
        assert.ok(visual.name && visual.color && visual.sigil);
        if (visual.image) assert.ok(fs.existsSync(path.join(root, 'public', visual.image)), visual.image);
    }
    assert.equal(UNIT_VISUALS.barge.image, undefined, 'barge uses its own vector illustration, never a tank photo');
    assert.ok(fs.existsSync(path.join(root, 'public/ascension/astartes-chamber.png')));
});
