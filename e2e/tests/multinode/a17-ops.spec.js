'use strict';

// 서버 2대 운영 값 퍼짐 브라우저 시험 — 한 서버가 받은 판 골드 값·점검·금지어가 다른 서버의 판·방 만들기·채팅에도 그대로 듦
// 목록 A17-서버-여러대.md 번호 A17-E-013~015 (013 판 골드·014 점검은 서버 전체 값을 바꿔 @serial, E2E_NODES=2에서만 돎), 모임만: E2E_NODES=2 npx playwright test --list --no-deps tests/multinode/a17-ops.spec.js
const K = require('./_a17-kit');
const { ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const db = require('../../helpers/db');
const { FAST_ROOM_SETTINGS } = require('../../helpers/game');
const { clearMaintenance, noticeButton } = require('../maintenance/_maint');
const { openSetup } = require('../room/roomHelpers');
const N = require('../ingame/b-night/_night');
const C = require('../ingame/c-chat/_lib');
const K8 = require('../result/_a08-hard-kit');

const { test, expect, e2e, internal, mn, N1, N2, U, nick } = K;

const MAINTENANCE_MESSAGE = '시험 점검 중이에요 (서버 2대)';

// 점검 큰 안내 창이 떠 있으면 "확인했어요"로 닫고 "게임 만들기"가 눌릴 수 있을 때까지
async function readyToCreate(page) {
    const make = page.getByRole('button', { name: '게임 만들기' });
    await expect(async () => {
        const ok = noticeButton(page, '확인했어요');
        if (await ok.isVisible().catch(() => false)) await ok.click({ timeout: 1000 });
        await make.click({ trial: true, timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    return make;
}

test('A17-E-013 관리자 값 2 저장은 서버 ㄱ이 받음 → 서버 ㄴ 5명 판 결과판 내 자리 "+2골드" @game @serial @smoke', async ({ browser, crowd, bots }) => {
    test.setTimeout(300_000);
    const admin = await K.openAdmin(browser);
    try {
        const saved = await K.setGold(admin.page, 2, { node: N1 });
        expect(saved.settings?.goldReward, '저장된 값').toBe(2);

        // 판은 서버 ㄴ: 사람도 봇 4도 서버 ㄴ에 붙음
        const me = await crowd.on(N2);
        const [hostBot, ...otherBots] = await mn.botsOn(bots, 4, N2);
        const { t, joker } = await K.startGame({ hostBot, otherBots, people: [me] });
        expect(await mn.gameNodeOf(U(me)), '판이 도는 서버').toBe(N2);

        await K.endByJoker(t, joker);
        await K8.allAtResult([me]);
        await expect(K.goldChip(me.page, nick(me))).toHaveText('+2골드');
        await expectReadable(K.goldChip(me.page, nick(me)));
    } finally {
        await K.setGold(admin.page, 1);
        await admin.close();
    }
});

test('A17-E-014 점검 켜고 서버 ㄱ만 다시 읽음 → 서버 ㄴ 사람 "게임 만들기" → 점검 안내 글 @serial', async ({ crowd, bots }) => {
    const me = await crowd.on(N2);
    const [probe] = await mn.botsOn(bots, 1, N2);
    try {
        // 시작 시각 없이 켬 → 새 방·새 판만 막음 (결정 2026-11-16 아침 15번)
        await db.query(
            'UPDATE maintenance_state SET is_enabled = 1, message = ?, starts_at = NULL, ends_at = ?, updated_at = NOW() WHERE id = 1',
            [MAINTENANCE_MESSAGE, db.sqlTime(Date.now() + 3600e3)],
        );
        // 일부러 서버 ㄱ에만 → 서버끼리 알림으로 서버 ㄴ도 다시 읽어야 함
        const reloaded = await K.internalOn(N1, 'POST', '/internal/maintenance/reload');
        expect(reloaded.ok, `서버 ㄱ 점검 다시 읽기 (${reloaded.status})`).toBe(true);
        // 서버 ㄴ에 닿았는지: 서버 ㄴ 봇 방 만들기가 거절될 때까지 (그 전에 만들어진 방은 바로 지움)
        await expect.poll(async () => {
            const reply = await probe.request('create_room', { ...FAST_ROOM_SETTINGS });
            if (reply?.ok) await probe.request('delete_room', {});
            return reply?.code ?? null;
        }, { timeout: 15_000, message: '서버 ㄴ 방 만들기 거절 코드' }).toBe('MAINTENANCE');

        await openSetup(me.page);
        const make = await readyToCreate(me.page);
        const text = await ui.captureAlert(me.page, () => make.click());
        expect(text).toContain(MAINTENANCE_MESSAGE);
        await expectReadable(K.entryNotice(me.page).getByText(MAINTENANCE_MESSAGE));
        await expect(me.page).toHaveURL(/\/game-setup/);
        expect(await e2e.roomOf(U(me)), '방 안 생김').toBeNull();
    } finally {
        await clearMaintenance(internal);
    }
});

test('A17-E-015 새 금지어를 서버 ㄱ만 다시 읽음 → 서버 ㄴ 6명 판 채팅에 그 낱말 → 채팅 줄에 가려진 글 @game', async ({ crowd, bots }) => {
    test.setTimeout(180_000);
    const word = `금칙${Math.floor(Math.random() * 1e8)}`;
    await db.query('INSERT INTO banned_words (word, is_active, created_at, updated_at) VALUES (?, 1, NOW(), NOW())', [word]);
    try {
        const reloaded = await K.internalOn(N1, 'POST', '/internal/banned-words/reload');
        expect(reloaded.ok, `서버 ㄱ 금지어 다시 읽기 (${reloaded.status})`).toBe(true);

        const me = await crowd.on(N2);
        const [hostBot, ...otherBots] = await mn.botsOn(bots, 5, N2);
        const { t } = await K.startGame({ hostBot, otherBots, people: [me] });
        expect(await mn.gameNodeOf(U(me)), '판이 도는 서버').toBe(N2);
        await N.toDay(t, { dayIndex: 1 });

        const head = C.uniq('안녕');
        const masked = `${head} ${'*'.repeat(word.length)}`;
        await C.say(me.page, `${head} ${word}`);
        // 내 화면 채팅 줄도, 봇이 받은 글도 가려진 글
        await C.expectLine(me.page, nick(me), masked, { timeout: 15_000 });
        await expect(C.chatLog(me.page)).not.toContainText(word);
        await expect.poll(() => hostBot.events.some((r) => r.payload?.text === masked), { message: '봇이 받은 글' }).toBe(true);
    } finally {
        await db.query('DELETE FROM banned_words WHERE word = ?', [word]);
        await internal.reloadBannedWords();
    }
});
