'use strict';

// PC·모바일이 섞인 판에서 끊김을 보는 어려운 브라우저 시험 (PC 2 + 모바일 2) — 모바일 사람이 끊기면 PC 카드엔 "연결 끊김" 배지, 모바일 채팅엔 끊김 알림 줄
// 목록 A09-끊김-나가기-탈주.md A09-H-031 — 모이는지만: npx playwright test --list tests/ingame/a09-mixed-devices.spec.js
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { talk } = require('../mobile/_talk');
const L = require('./a-day/_lib');
const A = require('./_a04-multi');
const K = require('./_a09-simple-kit');
const H = require('./_a09-hard-kit');

const { U, nick } = H;

test('A09-H-031 6명 판(PC 2 + 모바일 2 + 봇 2) 모바일 ㄷ이 끊김 → PC ㄱ 카드 "연결 끊김" 배지, 모바일 ㄹ 채팅 "ㄷ님의 연결이 끊겼습니다" @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    // ㄱ·ㄴ PC, ㄷ·ㄹ 모바일
    const [a, b, c, d] = await H.openPeople(user, players, 4, { mobile: [2, 3] });
    expect(A.isMobile(c.page) && A.isMobile(d.page) && !A.isMobile(a.page) && !A.isMobile(b.page), '화면 종류 섞임').toBe(true);
    const t = await H.seat(table, [a, b, c, d], { n: 6 });
    await K.toDay(t);
    await A.calm(a.page);
    await ui.closeOverlays(d.page);
    await expect(talk.phaseLine(d.page)).toContainText('낮 토론', { timeout: 15_000 });

    const since = Date.now();
    await c.page.close();
    await K.droppedAt(t, U(c), since);
    // PC: 카드 상태·이름·배지 그림 (배지는 글 없는 그림이라 대비는 안 봄)
    await H.expectStatus(a.page, nick(c), 'disconnected');
    await expect(L.card(a.page, nick(c))).toHaveAccessibleName(`연결 끊김 ${nick(c)}`);
    await expectReadable(K.badgeOf(a.page, nick(c)), { contrast: false, uncovered: false });
    // 모바일: 채팅 칸 알림 줄
    const line = talk.system(d.page).filter({ hasText: H.TEXT.disconnectedNotice(nick(c)) });
    await expect(line).toHaveCount(1, { timeout: 15_000 });
    await expectReadable(line.getByText(H.TEXT.disconnectedNotice(nick(c))), { uncovered: false });
    // 끊겼을 뿐 죽은 건 아님
    expect((await t.player(U(c))).alive).toBe(true);
});
