'use strict';

// 게임 초대 3분 브라우저 시험 (PC, 진짜 시간) — 봇 초대를 받고 손잡이 없이 3분을 진짜로 기다리면 친구 창을 다시 열 때 그 초대가 끝나 있음
// 목록 A13-친구-알림-초대.md 번호 A13-E-030 (결정「들어옴」 초대 3분, 시험_계획 3-5 "초대 3분 1개"), 쓰는 동안 안 돌림 — npx playwright test --list tests/social/a13-invite-realtime.spec.js
const { test, expect } = require('../../helpers/fixtures');
const K = require('./_a13-kit');

// 초대 유효 시간 3분 + 허용 폭 1.5초 + 요청 오가는 틈 0.5초
const INVITE_MS = 180_000;
const SLACK_MS = 2_000;

test('A13-E-030 봇 방장(정원 6) 초대 → 3분 진짜로 기다림 → 친구 창 다시 열면 그 초대 줄 없음, DB EXPIRED @realtime @smoke', async ({ user, bots }) => {
    // 시험 하나 제한(2분)보다 길어 이 시험 안에서만 늘림
    test.setTimeout(300_000);
    const page = user.page;
    const [bot] = await bots.spawn(1);
    await K.befriendBot(user, bot);
    const room = await K.botRoom(bot);

    // 초대 보내기 직전 시각 → 서버 만료 시각은 이보다 늦지 않음
    const sentAt = Date.now();
    const invite = await K.botInvite(bot, user, room);
    await K.openTab(page, '게임 초대');
    await expect(K.liveInviteRows(page, bot.nickname)).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(K.panel(page)).toHaveCount(0);

    // 3분이 지날 때까지 진짜로 기다림 (손잡이 없음)
    await K.sleepUntil(sentAt + INVITE_MS + SLACK_MS);

    await K.openTab(page, '게임 초대');
    await expect(K.liveInviteRows(page, bot.nickname)).toHaveCount(0);
    await K.waitInviteStatus(invite.inviteId, 'EXPIRED');
});
