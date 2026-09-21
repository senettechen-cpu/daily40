const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadTs } = require('./helpers/load-ts.cjs');
const { LedgerQuickMenu } = loadTs('src/components/ledger/LedgerQuickMenu.tsx');

const noop = () => {};
const render = props => renderToStaticMarkup(React.createElement(LedgerQuickMenu, { busy: false, onUse: noop, onPin: noop, onUnpin: noop, onHide: noop, ...props }));

test('renders nothing when there are no presets or suggestions', () => {
    assert.equal(render({ pinned: [], suggestions: [] }), '');
});

test('pinned presets come first and show a remembered amount; suggestions offer pin and hide', () => {
    const html = render({
        pinned: [{ id: 'p1', category: '飲食', itemName: '早餐', paymentMethod: 'Cash', amount: 60, pinned: true, hidden: false },
            { id: 'p2', category: '交通', itemName: '加油', paymentMethod: 'CreditCard', amount: null, pinned: true, hidden: false }],
        suggestions: [{ category: '飲食', itemName: '咖啡', paymentMethod: 'Cash', count: 4 }],
    });
    assert.ok(html.indexOf('早餐') < html.indexOf('咖啡'));
    assert.ok(html.includes('一鍵記錄 ₮60'));
    assert.ok(html.includes('帶入欄位，再輸入金額'));
    assert.ok(html.includes('aria-label="取消釘選 早餐"'));
    assert.ok(html.includes('aria-label="釘選 咖啡"'));
    assert.ok(html.includes('aria-label="不再建議 咖啡"'));
    assert.ok(html.includes('×4'));
});

test('all buttons are disabled while a quick action is in flight', () => {
    const html = render({ busy: true, pinned: [], suggestions: [{ category: '飲食', itemName: '咖啡', paymentMethod: 'Cash', count: 1 }] });
    assert.equal((html.match(/<button/g) || []).length, (html.match(/disabled=""/g) || []).length);
});
