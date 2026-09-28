const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');

// The table tag and both radars read one table, so a domain added to
// shared/ascension without a colour here would show up as "unset" everywhere.
const look = loadTs('src/data/domainLook.ts');
const { DOMAINS } = loadTs('shared/ascension/rules.ts');

test('every growth domain has its own colour and its own sector', () => {
    const missing = DOMAINS.filter(d => !look.DOMAIN_LOOK[d.id]).map(d => d.id);
    assert.equal(missing.join(', '), '', `domains with no look: ${missing.join(', ')}`);

    const entries = DOMAINS.map(d => look.DOMAIN_LOOK[d.id]);
    const hexes = entries.map(e => e.hex);
    assert.equal(new Set(hexes).size, hexes.length, `two domains share a colour: ${hexes.join(', ')}`);

    const angles = entries.map(e => e.angle);
    assert.equal(new Set(angles).size, angles.length, 'two domains share a radar sector');
});

test('a task with no domain reads as unset, not as one of the domains', () => {
    const taken = DOMAINS.map(d => look.DOMAIN_LOOK[d.id]);
    assert.ok(!taken.some(e => e.hex === look.UNSET_LOOK.hex), 'the unset colour collides with a domain');
    assert.ok(!taken.some(e => e.angle === look.UNSET_LOOK.angle), 'the unset sector collides with a domain');
    assert.equal(look.lookOf(undefined).hex, look.UNSET_LOOK.hex);
    assert.equal(look.lookOf(null).hex, look.UNSET_LOOK.hex);
    assert.equal(look.lookOf('not-a-domain').hex, look.UNSET_LOOK.hex);
});

test('a blip stays in its domain sector and does not move between repaints', () => {
    for (const { id } of DOMAINS) {
        const centre = look.DOMAIN_LOOK[id].angle;
        for (const taskId of ['a', 'task-1', 'ffffffff-1111-2222-3333-444444444444', '喝水']) {
            const angle = look.blipAngle(id, taskId);
            assert.ok(Math.abs(angle - centre) <= 25, `${id}/${taskId} landed ${angle}, outside its sector`);
            assert.equal(angle, look.blipAngle(id, taskId), 'the same task moved between calls');
        }
    }
});

test('tasks of one domain spread out rather than stacking on one angle', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `task-${i}`);
    const angles = new Set(ids.map(id => look.blipAngle('health', id)));
    assert.ok(angles.size >= 6, `twelve health tasks landed on only ${angles.size} angles`);
});
