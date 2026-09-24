const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');

const gate = loadTs('shared/battle/gate.ts');


test('G1: a finished core opens the gate; nothing else does', () => {
    assert.equal(gate.operationGate({ completedCores: 1, restDay: false, exempt: false }).allowed, true);
    const blocked = gate.operationGate({ completedCores: 0, restDay: false, exempt: false });
    assert.equal(blocked.allowed, false);
    assert.match(blocked.reason, /還沒完成任何今日核心/);
});

test('G1: a rest day or exemption lets the operation run but pays nothing', () => {
    for (const input of [{ restDay: true, exempt: false }, { restDay: false, exempt: true }]) {
        const result = gate.operationGate({ completedCores: 0, ...input });
        assert.equal(result.allowed, true);
        assert.equal(result.paysRequisition, false);
    }
    assert.equal(gate.operationGate({ completedCores: 2, restDay: false, exempt: false }).paysRequisition, true);
});
