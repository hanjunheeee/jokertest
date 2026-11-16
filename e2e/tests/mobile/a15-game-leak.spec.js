'use strict';

// 판 안 정보가 모바일 화면 소켓 값에 안 새는지 브라우저 시험 (모바일) — 사람 자리마다 1일 처형·1일 밤 암살·2일 낮 시작까지 받은 글 전부를 봄
// 목록 A15-보안.md 번호 A15-E-011~014 (쓰는 동안 안 돌림: npx playwright test --list tests/mobile/a15-game-leak.spec.js)
const { test } = require('../../helpers/fixtures');
const k = require('../security/_a15-kit');

const C = (count) => Array(count).fill('CITIZEN');

test('A15-E-011 모바일 7명 판 산 시민 자리: 판 시작~2일 낮까지 받은 글에 남의 직업 없음 @game @smoke', async ({ user, table }) => {
    test.setTimeout(240_000);
    await k.seatCase(table, user, { counts: { JOKER: 1, DOCTOR: 1 }, me: 'CITIZEN', botRoles: ['JOKER', 'DOCTOR', ...C(4)], execute: 2, victim: 3 });
});

test('A15-E-012 모바일 8명 광대 2 판 산 광대 자리: 받은 글에 남의 직업 없음, 동료 목록엔 광대 봇만 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    await k.seatCase(table, user, {
        counts: { JOKER: 2, DOCTOR: 1, GUARD: 1 }, me: 'JOKER', botRoles: ['JOKER', 'DOCTOR', 'GUARD', ...C(4)], execute: 3, victim: 4,
    });
});

test('A15-E-013 모바일 5명 판 1일 처형된 사람 자리: 받은 글에 남의 직업 없음 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    await k.seatCase(table, user, { counts: { JOKER: 1 }, me: 'CITIZEN', botRoles: ['JOKER', ...C(3)], execute: 'me', victim: 1 });
});

test('A15-E-014 모바일 판 밖 사람(로비): 옆에서 6명 봇 판이 도는 동안 받은 판 글 0개 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    await k.outsiderCase(table, user, { counts: { JOKER: 1, DOCTOR: 1 }, botRoles: ['JOKER', 'DOCTOR', ...C(4)], execute: 2, victim: 3 });
});
