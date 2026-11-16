'use strict';

// PC 점검 거절 브라우저 시험 — 점검 중 방 만들기 알림 글(기본 글·직접 쓴 글)·시작 막힘 글(대비 4.5)·방 안 행동은 됨, 예고만이거나 끈 뒤엔 방 만들어짐
// 목록 A01a-방만들기-설정-시작.md 번호 A01-E-092~097·139 — 점검은 서버 전체에 걸려 전부 @serial(serial 프로젝트, 하나씩), 돌리지 않고 모임만: npx playwright test --list tests/room/a01-maintenance.spec.js
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { e2e } = require('../../helpers/internal');
const { blockedDialog, botUpdateSettings } = require('./roomHelpers');
const K = require('./_a01a-kit');

const createButton = (page) => page.getByRole('button', { name: '게임 만들기' });

/** 점검 중 만들기 화면에서 "게임 만들기" → 알림 글 (큰 안내 창이 덮고 있으면 먼저 닫음) */
async function createAlertDuringMaint(page) {
    await K.openSetupPage(page);
    await K.dismissMaintNotice(page);
    return ui.captureAlert(page, () => createButton(page).click());
}

test.afterEach(async () => {
    // 실패해도 점검이 남지 않게 (다른 시험 방 만들기가 막힘)
    await K.clearMaint();
});

test('A01-E-092 점검 중 "게임 만들기" → 알림 글 = 서버 기본 점검 글, 방 없음 @serial @smoke', async ({ user }) => {
    // 시작 시각이 이미 지난 점검 (B-098 "켜짐·시작 시각 지남")
    await K.setMaint({ enabled: true, startsInMs: -1000 });
    const text = await createAlertDuringMaint(user.page);
    expect(text).toBe(K.MSG.MAINTENANCE_DEFAULT);
    await expect(user.page).toHaveURL(/\/game-setup/);
    expect(await e2e.roomOf(K.U(user))).toBeNull();
});

test('A01-E-093 5명 전원 준비 방 → 점검 켬 → "게임시작" → 막힘 창 점검 글 읽힘 @serial', async ({ user, bots }) => {
    const botList = await bots.spawn(4);
    await K.readyRoom(user, botList, { maxPlayers: 5, jokers: 1 });
    // 시작 시각 없이 켬: 바로 점검 중이지만 대기방은 안 닫힘 (시작 시각이 있으면 그 순간 대기방이 닫혀 시작을 못 눌러 봄)
    await K.setMaint({ enabled: true, startsInMs: null, message: '시험 점검 중이에요' });
    await K.dismissMaintNotice(user.page);
    await user.page.getByRole('button', { name: '게임시작' }).click();
    await K.expectStartRejected(user, '시험 점검 중이에요');
});

test('A01-E-094 점검 중 방 안 행동: 사람 손님 준비 됨, 봇 방장 설정 저장 됨 @serial', async ({ user, bots }) => {
    const [host] = await bots.spawn(1);
    const room = await host.createRoom({ accessType: 'open', maxPlayers: 10 });
    await ui.joinRoomByCodeUi(user.page, room.roomCode);
    await K.setMaint({ enabled: true, startsInMs: null });
    await K.dismissMaintNotice(user.page);
    await K.readyMe(user.page);
    await expect.poll(async () => (await e2e.roomOf(K.U(user)))?.players.find((p) => p.uuid === K.U(user))?.isReady).toBe(true);
    const r = await botUpdateSettings(host, { maxPlayers: 9 });
    expect(r?.ok, `설정 저장 답 ${JSON.stringify(r)}`).toBe(true);
    await expect.poll(async () => (await e2e.roomOf(K.U(user)))?.settings?.maxPlayers).toBe(9);
});

test('A01-E-095 점검 시작 1시간 뒤(예고만) → 방 만들어짐 @serial', async ({ user }) => {
    const page = user.page;
    await K.setMaint({ enabled: true, startsInMs: 3600e3 });
    await K.openSetupPage(page);
    await K.dismissMaintNotice(page);
    await createButton(page).click();
    await expect(page).toHaveURL(/\/game-matching/);
    await K.waitRoom(K.U(user));
});

test('A01-E-096 점검 켰다 끈 뒤 → 방 만들어짐 @serial', async ({ user }) => {
    await K.setMaint({ enabled: true, startsInMs: -1000 });
    await K.clearMaint();
    await K.createRoomOn(user);
});

test('A01-E-097 점검 글 "오전 점검입니다" → 방 만들기 알림 글이 그 글 @serial', async ({ user }) => {
    await K.setMaint({ enabled: true, startsInMs: -1000, message: '오전 점검입니다' });
    const text = await createAlertDuringMaint(user.page);
    expect(text).toBe('오전 점검입니다');
    expect(await e2e.roomOf(K.U(user))).toBeNull();
});

test('A01-E-139 점검 중 시작 막힘 창 글 대비 4.5 이상 @serial', async ({ user, bots }) => {
    const botList = await bots.spawn(4);
    await K.readyRoom(user, botList, { maxPlayers: 5, jokers: 1 });
    await K.setMaint({ enabled: true, startsInMs: null, message: '시험 점검 중이에요' });
    await K.dismissMaintNotice(user.page);
    await user.page.getByRole('button', { name: '게임시작' }).click();
    const alert = blockedDialog(user.page).getByRole('alert');
    await expect(alert).toHaveText('시험 점검 중이에요');
    await expectReadable(alert, { minRatio: 4.5 });
});
