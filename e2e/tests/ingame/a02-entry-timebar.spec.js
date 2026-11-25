'use strict';

// 합치며 새로 들어온 PC 판 화면 브라우저 시험 — 역할 확인 동안 입장 준비 덮개, 시간 바·채팅 틀 위 명패+타이머 판(확대·접기 단추 없음)
// 목록 A02-판시작-역할.md 번호 A02-E-181~183 (frontend entryPreparing/InGameEntryPreparingOverlay.jsx, timebar/InGameTimebar.jsx·InGamePhaseTurnTimerPanel.jsx), 돌리지 않고 모임만: npx playwright test --list tests/ingame/a02-entry-timebar.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { sleep } = require('../../helpers/wait');
const night = require('./b-night/_night');
const day = require('./a-day/_lib');

// 입장 준비 덮개: 역할 확인(ROLE_REVEAL) 동안 판 전체를 어둡게 덮음, 역할 창은 그 위
const ENTRY_TEXT = '가면무도회에 입장하는 중입니다.';
const entryCover = (page) => page.locator('[data-ingame-entry-preparing]');
const revealDialog = (page) => page.getByRole('dialog', { name: '내 역할 보기' });

// 명패+타이머 판: 자리가 시간 바면 바 위(timebar-embedded), 채팅 틀이면 틀 위(chat-embedded) — 단계 글 "[낮-토론과 투표]"와 "00:00" 꼴 남은 시간
const DAY_LABEL = '[낮-토론과 투표]';
const plate = (page, where) => page.locator(`[data-ingame-phase-timer="${where}-embedded"]`);
const timebar = (page) => page.getByLabel(/^제 \d+일 시간 흐름$/);

// 타이머 자리 저장 값 (판에 들어가기 전, 로비에서) — 시험 빌드 기본값은 채팅 틀
async function placeTimer(page, where) {
    await page.evaluate((v) => {
        try { window.localStorage.setItem('joker.ingame.timerPlacement', v); } catch { /* 저장 막힘 */ }
    }, where);
}

// 사람 1(시민) + 봇 4 = 5명 판
function openTable(table, user) {
    return night.setup(table, { humans: [user], bots: 4, humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'CITIZEN', 'CITIZEN', 'CITIZEN'] });
}

// 첫 낮까지 손잡이로 (역할 창·낮 안내 닫음)
async function toFirstDay(t, page) {
    await day.closeReveal(page);
    await t.advanceUntil('DAY');
    await day.closeNotice(page, '낮이 되었습니다');
}

// 명패 판 남은 초 ("01:23" → 83)
async function plateSeconds(locator) {
    const m = /^(\d{2}):(\d{2})$/.exec((await locator.getByRole('timer').innerText()).trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

test('A02-E-181 5명 판 역할 확인 10초 동안 입장 준비 덮개 글이 읽히고, 10초 뒤 낮이 되면 덮개가 저절로 사라짐 (손잡이 안 씀) @game @realtime @smoke', async ({ user, table }) => {
    const page = user.page;
    const t = await openTable(table, user);
    await expect(revealDialog(page)).toBeVisible({ timeout: 20_000 });
    // 역할 창이 떠 있는 동안에도 덮개는 그 아래 깔림 → 창을 닫으면 덮개 글이 읽힘
    await expect(entryCover(page)).toHaveCount(1);
    await day.closeReveal(page);
    await expectReadable(entryCover(page).getByText(ENTRY_TEXT, { exact: true }));
    expect((await t.state()).phase, '아직 역할 확인 단계').toBe('ROLE_REVEAL');
    // 진짜 10초를 기다려 낮이 되면 덮개가 걷힘
    await expect.poll(async () => (await t.state()).phase, { timeout: 20_000, message: '10초 뒤 낮' }).toBe('DAY');
    await expect(entryCover(page)).toHaveCount(0, { timeout: 5_000 });
});

test('A02-E-182 5명 판 타이머 자리 시간 바 → 첫 낮 바 위 명패 "[낮-토론과 투표]"·남은 시간이 읽히고 줄어듦, 확대·접기 단추 없음 @game', async ({ user, table }) => {
    const page = user.page;
    await placeTimer(page, 'timebar');
    const t = await openTable(table, user);
    await toFirstDay(t, page);
    const board = timebar(page).locator('[data-ingame-phase-timer="timebar-embedded"]');
    await expectReadable(board.getByText(DAY_LABEL, { exact: true }), { uncovered: false });
    await expect(board.getByRole('timer')).toHaveText(/^\d{2}:\d{2}$/);
    // 바를 누를 단추가 없음 (합치기 전엔 "시간흐름바 확대"를 눌러야 남은 시간이 보였음)
    await expect(page.getByRole('button', { name: /^시간흐름바 (확대|접기)$/ })).toHaveCount(0);
    // 채팅 틀 쪽엔 판이 안 생김
    await expect(plate(page, 'chat')).toHaveCount(0);
    // 남은 시간이 실제로 줄어듦 (2초 남짓 뒤 다시 읽음)
    const first = await plateSeconds(board);
    await sleep(2_200);
    const later = await plateSeconds(board);
    expect(first, '처음 남은 초').not.toBeNull();
    expect(later, '2초 뒤 남은 초').toBeLessThan(first);
});

test('A02-E-183 5명 판 타이머 자리 채팅 틀 → 첫 낮 채팅 틀 위 명패 "[낮-토론과 투표]"·남은 시간이 읽힘, 시간 바엔 판 없음 @game', async ({ user, table }) => {
    const page = user.page;
    await placeTimer(page, 'chat');
    const t = await openTable(table, user);
    await toFirstDay(t, page);
    const board = plate(page, 'chat');
    await expectReadable(board.getByText(DAY_LABEL, { exact: true }), { uncovered: false });
    await expect(board.getByRole('timer')).toHaveText(/^\d{2}:\d{2}$/);
    await expect(timebar(page).locator('[data-ingame-phase-timer="timebar-embedded"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^시간흐름바 (확대|접기)$/ })).toHaveCount(0);
});
