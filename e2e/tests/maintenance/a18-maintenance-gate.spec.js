'use strict';

// 점검 중 새 방·새 입장 막힘 브라우저 시험 (PC) — 시작 시각 없이 켠 점검: 방 만들기·코드 입장이 관리자 점검 글로 거절, 대기방·방 인원은 그대로
// 목록 A18-설정-배포-광고.md 번호 A18-E-007·008 — 점검은 서버 전체에 걸려 @serial(serial 프로젝트, 하나씩), 돌리지 않고 모임만: npx playwright test --list --no-deps tests/maintenance/a18-maintenance-gate.spec.js
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const K = require('./_a18-kit');

const MESSAGE = '시험 점검이에요';

test.afterEach(async () => {
    // 실패해도 점검이 남지 않게 (다른 시험 방 만들기가 막힘)
    await K.clearMaint();
});

test('A18-E-007 점검 중(관리자 글 "시험 점검이에요") 방 만들기 → 그 글이 보이고 알림 글·화면 띠 글도 그 글, 대기방 안 감 @serial @smoke', async ({ user }) => {
    const page = user.page;
    // 시작 시각 없이 켬: 바로 점검 중 (결정 아침 15번 — 도는 판·대기방은 안 닫고 새 방만 막음)
    await K.setMaint({ enabled: true, startsInMs: null, message: MESSAGE });
    await page.goto('/game-setup');
    await expect(page.getByRole('button', { name: '게임 만들기' })).toBeVisible();

    // 들어오자마자 큰 안내에 관리자 글이 보임 (사람 눈에 읽힘)
    await expect(K.noticeTitle(page)).toHaveText(K.TEXT.ACTIVE_TITLE);
    await expectReadable(K.noticeLine(page, MESSAGE));
    await K.closeNotice(page);

    // "게임 만들기" → 알림 글 = 관리자 글, 알림 창을 닫은 뒤에도 까닭 글이 화면 띠에 남아 읽힘
    const text = await ui.captureAlert(page, () => page.getByRole('button', { name: '게임 만들기' }).click());
    expect(text).toBe(MESSAGE);
    await expectReadable(K.entryNotice(page).getByText(MESSAGE, { exact: true }));
    await expect(page).toHaveURL(/\/game-setup/);
    expect(await e2e.roomOf(K.U(user)), '방 안 생김').toBeNull();
});

test('A18-E-008 점검 켜기 전 만든 5명 정원 방 → 점검 켬 → 다른 사람이 코드 입장 → 거절 글, 방 인원 그대로 @serial', async ({ user, bots }) => {
    const page = user.page;
    const [host] = await bots.spawn(1);
    const room = await host.createRoom({ maxPlayers: 5 });
    expect((await e2e.roomOf(host.uuid))?.players, '점검 전 방 인원').toHaveLength(1);

    await K.setMaint({ enabled: true, startsInMs: null, message: MESSAGE });
    // 시작 시각 없는 점검은 대기방을 안 닫음
    expect((await e2e.roomOf(host.uuid))?.roomId, '점검 켠 뒤에도 방 그대로').toBe(room.roomId);

    await page.goto('/roomInvite');
    await K.dismissIfShown(page);
    await page.getByRole('textbox', { name: /방 코드/ }).first().click();
    await page.keyboard.type(room.roomCode);
    const text = await ui.captureAlert(page, () => page.getByRole('button', { name: '참여하기' }).click());
    expect(text).toBe(MESSAGE);
    // 알림 창을 닫은 뒤에도 까닭 글이 화면 띠에 남아 읽힘
    await expectReadable(K.entryNotice(page).getByText(MESSAGE, { exact: true }));
    await expect(page).not.toHaveURL(/\/game-matching/);
    expect(await e2e.roomOf(K.U(user)), '입장 안 됨').toBeNull();
    expect((await e2e.roomOf(host.uuid))?.players, '방 인원 그대로').toHaveLength(1);
});
