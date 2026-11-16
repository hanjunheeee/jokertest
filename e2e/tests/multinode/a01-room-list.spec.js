'use strict';

// 서버 2대 방 목록·방 코드 브라우저 시험 — 한 서버에서 만든 공개 방이 다른 서버 사람 목록에 뜨고 설정 바꾸면 줄 요약도, 두 서버에서 번갈아 만든 코드 20개가 안 겹침
// 목록 A01a-방만들기-설정-시작.md 번호 A01-H-008·009 (@hard, E2E_NODES=2에서만 돎), 돌리지 않고 모임만: E2E_NODES=2 npx playwright test --list tests/multinode/a01-room-list.spec.js
const mn = require('./_mn');
const { openRoomList, findRoomRow } = require('../room/roomHelpers');
const K = require('../room/_a01a-kit');

const { test, expect, NODE_IDS } = mn;
const [NODE_A, NODE_B] = NODE_IDS;

test('A01-H-008 서버 A 사람 X 공개 방 → 서버 B 사람 Y 목록에 줄, X가 광대 2→1로 바꾸면 Y 줄 요약도 "광대 1" @hard @smoke', async ({ onNode }) => {
    const X = await onNode.person(NODE_A);
    const Y = await onNode.person(NODE_B);
    await K.createRoomOn(X, { code: false, jokers: 2 });
    await openRoomList(Y.page);
    const row = await findRoomRow(Y.page, K.titleOf(X), { timeoutMs: 20_000 });
    expect(row, `서버 B 목록에 "${K.titleOf(X)}" 줄`).not.toBeNull();
    await expect(row).toContainText('광대 2');

    await K.openEditor(X.page);
    await K.fill(X.page, { jokers: 1 });
    await K.saveEditor(X.page);
    await expect(row).toContainText('광대 1', { timeout: 20_000 });
    await expect(row).not.toContainText('광대 2');
});

test('A01-H-009 두 사람이 서버 A·B에서 같은 때 방 10번씩 만들고 나가기 → 코드 20개 다 다름 @hard', async ({ onNode }) => {
    test.setTimeout(480_000);
    const X = await onNode.person(NODE_A);
    const Y = await onNode.person(NODE_B);
    const loop = async (who) => {
        const codes = [];
        for (let i = 0; i < 10; i += 1) codes.push(await K.createAndDelete(who));
        return codes;
    };
    const [a, b] = await Promise.all([loop(X), loop(Y)]);
    const all = [...a, ...b];
    expect(all).toHaveLength(20);
    for (const code of all) expect(code).toMatch(/^[A-Z0-9]{6}$/);
    expect(new Set(all).size, `겹친 코드: ${all.filter((c, i) => all.indexOf(c) !== i).join(',')}`).toBe(20);
});
