'use strict';

// 서버 다시 켜기 브라우저 시험 — 판·대기방은 기록 없이 사라지고 탈주 아님, 켤 때 다시 읽는 값(탈주 막힘·금지어·판 골드·점검)은 다시 켠 뒤에도 그대로
// 목록 A18-설정-배포-광고.md 번호 A18-H-004~009 — 시험 서버를 끄고 다시 켜서 @shutdown(serial 프로젝트, 하나씩), 점검까지 걸린 H-009는 @serial도, 돌리지 않고 모임만: npx playwright test --list --no-deps tests/maintenance/a18-restart.spec.js
const crypto = require('node:crypto');
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const db = require('../../helpers/db');
const { internal } = require('../../helpers/internal');
const { createRoomUi, playToResult, resultRow } = require('../room/roomHelpers');
const { wallet } = require('../store/store-tools');
const { gotoAccount } = require('../mypage/account-tools');
const { changeNicknameUi, nicknameSection } = require('../auth/_a11b-kit');
const A7 = require('../ingame/_a07-simple-kit');
const A9 = require('../ingame/_a09-simple-kit');
const L = require('../ingame/a-day/_lib');
const K = require('./_a18-kit');

// 낱말은 시험마다 무작위 소문자 (다른 시험 글에 안 걸리게, 닉네임 규칙 = 한글·영문·숫자 2~8자)
const randomWord = (n = 5) => Array.from(crypto.randomBytes(n), (b) => 'qwxzjvk'[b % 7]).join('');
// 첫 탈주 막힘(5분) 안 어느 때든 — 다시 켜는 데 몇십 초 걸려도 맞게
const COOLDOWN_LEFT = /^탈주로 [0-4]분 \d{1,2}초 뒤에 참여할 수 있습니다\.$/;

/** 판 골드 값을 1로 되돌림 (관리자 API = DB + 서버 메모리, 안 되면 DB만 고치고 서버를 한 번 더 다시 켬) */
async function restoreGold(browser) {
    let admin = null;
    try {
        admin = await A7.openAdmin(browser);
        await admin.setGold(1);
    } catch (error) {
        console.warn(`[a18] 관리자 API로 판 골드 못 되돌림 → DB + 다시 켜기 (${error.message})`);
        await db.query("UPDATE game_settings SET value_int = 1 WHERE `key` = 'GAME_GOLD_REWARD'");
        await K.restartBackend();
    } finally {
        await admin?.close().catch(() => {});
    }
}

test('A18-H-004 5명 판(사람 2 + 봇 3) 낮 토론 중 서버 끄고 다시 켬 → 두 화면 서버 끄기 안내, 판 없음·판 화면에 안 남음, 둘 다 방 만들기 됨(탈주 글 없음), 그 판 전적 줄 없음 @game @hard @shutdown @smoke', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const other = await players.add();
    const people = [user, other];
    const dialogs = people.map((p) => K.collectDialogs(p.page));
    const t = await table.setup({
        humans: people,
        bots: 3,
        settings: K.LONG_TIMES,
        roles: ({ humans, bots }) => Object.fromEntries([
            ...humans.map((h) => [K.U(h), 'CITIZEN']),
            ...bots.map((b, i) => [K.U(b), i === 0 ? 'JOKER' : 'CITIZEN']),
        ]),
    });
    await L.toDay(t);
    expect((await t.state())?.dayPhase, '낮 토론 중').toBe('DAY_DISCUSSION');
    const gameId = t.gameId;

    await K.restartBackend();
    for (const [i, got] of dialogs.entries()) {
        await expect.poll(() => got.includes(K.TEXT.SHUTDOWN), { timeout: 10_000, message: `사람 ${i + 1} 서버 끄기 안내` }).toBe(true);
    }

    // 판은 메모리에서 사라짐 → 판 화면에 안 남음
    for (const p of people) await expect(p.page).not.toHaveURL(/\/ingame/, { timeout: 60_000 });
    for (const p of people) expect(await e2e.gameOf(K.U(p)), '판 없음').toBeNull();
    for (const p of people) {
        const room = await K.createRoomOk(p);
        expect(room.hostUuid).toBe(K.U(p));
    }
    dialogs.forEach((got, i) => expect(got.filter((m) => m.includes('탈주로')), `사람 ${i + 1} 탈주 글`).toEqual([]));
    expect(await db.query('SELECT id FROM game_results WHERE id = ?', [gameId]), '그 판 전적 줄').toEqual([]);
    for (const p of people) expect(await db.query('SELECT id FROM game_desertions WHERE user_id = ?', [K.U(p)]), '탈주 줄').toEqual([]);
});

test('A18-H-005 6명 정원 대기방(사람 2)에서 서버 끄고 다시 켬 → 두 사람 로비로 가고 각자 새 방 만들기 됨 @hard @shutdown', async ({ user, players }) => {
    test.setTimeout(240_000);
    const other = await players.add();
    const room = await createRoomUi(user, { maxPlayers: 6 });
    await ui.joinRoomByCodeUi(other.page, room.roomCode);
    await expect.poll(async () => (await e2e.roomOf(K.U(user)))?.players?.length, { message: '방 인원' }).toBe(2);

    await K.restartBackend();

    for (const p of [user, other]) {
        await ui.gotoLobby(p.page);
        await expect(p.page).not.toHaveURL(/\/login/);
    }
    for (const p of [user, other]) {
        const fresh = await K.createRoomOk(p);
        expect(fresh.hostUuid, '각자 새 방의 방장').toBe(K.U(p));
        expect(fresh.roomId, '옛 방이 아님').not.toBe(room.roomId);
    }
});

test('A18-H-006 탈주 대기는 서버를 다시 켜도 남음: 5명 판(사람 1 + 봇 4)에서 산 채로 나감 → 막힘 글 → 다시 켬 → 여전히 "탈주로 …" 읽힘 @game @hard @shutdown', async ({ players, table }) => {
    test.setTimeout(240_000);
    // 막힘 글을 화면 글로 읽어 보려고 휴대폰 사람 (PC는 브라우저 알림 창이라 읽힘을 못 봄)
    const phone = await K.openPhone(players);
    const page = phone.page;
    const t = await A9.seat(table, phone, { n: 5 });
    await A9.toDay(t);
    await A9.leaveAlive(page);
    const first = await K.createRoomAlert(page);
    expect(first).toMatch(A9.COOLDOWN_FIRST);

    await K.restartBackend();

    const after = await K.createRoomAlert(page, { close: false });
    expect(after).toMatch(COOLDOWN_LEFT);
    await expectReadable(K.parchmentText(page));
    await K.parchment(page).getByRole('button', { name: '확인' }).click();
    expect(await e2e.roomOf(K.U(phone)), '방 안 생김').toBeNull();
});

test('A18-H-007 [지금 동작] 금지어를 DB에만 넣고(다시 읽기 없이) 서버 다시 켬 → 그 낱말 든 닉네임으로 바꾸기 → 거절 글 @hard @shutdown', async ({ user }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const word = randomWord();
    await db.query('INSERT INTO banned_words (word, is_active, created_at, updated_at) VALUES (?, 1, NOW(), NOW())', [word]);
    try {
        await K.restartBackend();
        await gotoAccount(page);
        expect(await changeNicknameUi(page, `${word}a1`)).toBe(400);
        await expect(nicknameSection(page).getByText(K.TEXT.BANNED_NICKNAME, { exact: true })).toBeVisible();
        await expectReadable(nicknameSection(page).getByText(K.TEXT.BANNED_NICKNAME, { exact: true }));
    } finally {
        await db.query('DELETE FROM banned_words WHERE word = ?', [word]);
        await internal.reloadBannedWords();
    }
});

test('A18-H-008 판 골드 값 2를 DB에만 넣고 서버 다시 켬 → 5명 판(사람 1 + 봇 4) 끝 결과판 내 자리 "+2골드", 잔액 +2 @game @hard @shutdown', async ({ browser, user, table }) => {
    test.setTimeout(300_000);
    const before = Number((await wallet(K.U(user))).gold);
    await db.query("UPDATE game_settings SET value_int = 2 WHERE `key` = 'GAME_GOLD_REWARD'");
    try {
        await K.restartBackend();
        await playToResult({ user, table, kind: 'citizenWin' });
        await expect(resultRow(user.page, K.nick(user)).getByTestId('game-result-gold-reward')).toHaveText('+2골드');
        await expect.poll(async () => Number((await wallet(K.U(user))).gold), { timeout: 30_000, message: '잔액' }).toBe(before + 2);
    } finally {
        // 서버 전체 값이라 꼭 1로 (안 그러면 뒤 시험 판 골드가 2)
        await restoreGold(browser);
    }
});

test('A18-H-009 점검 켜짐(시작 시각 지남)을 DB에만 넣고 서버 다시 켬 → 켜진 직후 큰 안내 "지금 점검 중이에요", 방 만들기 → 점검 거절 글 @hard @shutdown @serial', async ({ user }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const message = `시험 점검 ${randomWord(4)}`;
    try {
        await K.writeMaint({ enabled: true, startsInMs: -1000, message });
        await K.restartBackend();

        await page.goto('/game-setup');
        await expect(page.getByRole('button', { name: '게임 만들기' })).toBeVisible();
        await expect(K.noticeTitle(page)).toHaveText(K.TEXT.ACTIVE_TITLE, { timeout: 15_000 });
        await expectReadable(K.noticeTitle(page), { large: true });
        await K.closeNotice(page);
        const text = await ui.captureAlert(page, () => page.getByRole('button', { name: '게임 만들기' }).click());
        expect(text).toBe(message);
        // 알림 창을 닫은 뒤에도 까닭 글이 화면 띠에 남아 읽힘
        await expectReadable(K.entryNotice(page).getByText(message, { exact: true }));
        expect(await e2e.roomOf(K.U(user)), '방 안 생김').toBeNull();
    } finally {
        await K.clearMaint();
    }
});
