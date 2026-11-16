'use strict';

// 결과 화면 브라우저 시험 (PC) — 승리·패배 영상 뒤 결과판, 영상이 막히면 건너뛰기(20초 포함), 처형 영상 뒤 결과 화면, 새로고침하면 결과 못 봄(골드는 받음), 신고 단추는 남의 줄만
// 목록 시험목록/A07-승패-결과-골드.md A07-E-046~050·118·133·134, 모이는지만 봄: npx playwright test --list tests/ingame/a07-result-screen.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const k = require('./_a07-simple-kit');

const { C, uid, nick } = k;

// 결과 영상 칸 (승리 = win, 패배 = lose)와 그 안 건너뛰기 단추
const intro = (page, outcome) => page.locator(`[data-game-result-intro="${outcome}"]`);
const skipOf = (page, outcome) => intro(page, outcome).getByRole('button', { name: '건너뛰기' });
// 결과를 못 볼 때 안내 글
const unavailable = (page) => page.getByRole('alert').filter({ hasText: '게임 결과를 확인할 수 없습니다' });

// 시민 승으로 끝냄: 봇 표로 광대(t.bots[0]) 처형 (결과판까지는 안 감)
async function executeJoker(t) {
    const end = await k.execute(t, uid(t.bots[0]));
    expect(end.winResult?.winner).toBe('CITIZEN');
}

// 결과 영상 칸이 먼저 뜨고(그 영상 파일로, 그동안 결과판 없음) 그 뒤 결과판이 보임
async function expectIntroThenBoard(page, outcome, fileWord) {
    const video = intro(page, outcome).locator('video');
    await expect(video).toBeAttached({ timeout: 40_000 });
    // 영상 주소 → 예: "/bg/게임 승리 연출.mp4" (주소는 풀어 쓴 한글이라 합쳐서 봄)
    const src = decodeURIComponent(await video.getAttribute('src')).normalize('NFC');
    expect(src).toContain(fileWord);
    expect(await k.board(page).count(), '영상 칸이 떠 있는 동안 결과판 없음').toBe(0);
    await k.reachBoard(page);
    await expect(intro(page, outcome)).toHaveCount(0);
}

test('A07-E-046 5명 판 이긴 편: 승리 영상 뒤 결과판 @game @smoke', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(3)]);
    // 광대 봇이 나가 시민 승 → 바로 결과 화면 (추방 영상을 안 거치게)
    await k.leave(t, t.bots[0]);
    await expectIntroThenBoard(page, 'win', '게임 승리 연출');
    await expect(k.banner(page)).toHaveText('승리');
});

test('A07-E-047 6명 판 진 편: 패배 영상 뒤 결과판 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', 'JOKER', ...C(3)]);
    // 시민 봇 둘이 나가 2:2 → 광대 승 (나는 진 편)
    await k.leave(t, t.bots[2]);
    await k.leave(t, t.bots[3]);
    await expectIntroThenBoard(page, 'lose', '게임 패배 연출');
    await expect(k.banner(page)).toHaveText('패배');
});

test('A07-E-048 7명 판 결과 영상 재생이 막히면 "건너뛰기"가 보이고 누르면 결과판 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(5)]);
    // 자동 재생이 막힌 창 흉내: 재생 요청은 거절, 속성으로 저절로 시작된 재생도 바로 멈춤
    await page.evaluate(() => {
        HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('시험: 자동 재생 막힘', 'NotAllowedError'));
        document.addEventListener('play', (event) => { event.target.pause(); }, true);
    });
    // 광대 봇이 나가 바로 결과 화면 (추방 영상을 안 거치게)
    await k.leave(t, t.bots[0]);
    await expectReadable(skipOf(page, 'win'), { timeout: 40_000 });
    expect(await k.board(page).count(), '건너뛰기 전엔 결과판 없음').toBe(0);
    await skipOf(page, 'win').click();
    await expect(k.board(page)).toBeVisible();
    await expect(k.rows(page)).toHaveCount(7);
});

test('A07-E-049 8명 판 결과판에서 새로고침 → "게임 결과를 확인할 수 없습니다" + "로비로 돌아가기" @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(6)]);
    await executeJoker(t);
    await k.reachBoard(page);
    await page.reload();
    await expectReadable(unavailable(page), { timeout: 20_000 });
    await expectReadable(page.getByRole('button', { name: '로비로 돌아가기' }));
    await expect(k.board(page)).toHaveCount(0);
});

test('A07-E-050 5명 판 결과판에서 새로고침해도 지갑 +1 그대로 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(3)]);
    const before = await k.gold(uid(user));
    await executeJoker(t);
    await k.reachBoard(page);
    await page.reload();
    await expect(unavailable(page)).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => k.gold(uid(user)), { timeout: 30_000, message: '지갑 골드' }).toBe(before + 1);
    // 판 끝 처리가 다 끝난 뒤에도 한 줄 그대로 (새로고침으로 빠졌다고 빼거나 두 번 주지 않음)
    await k.settled(t, t.bots[1]);
    expect((await k.rewardRows(t.gameId)).filter((r) => r.user_id === uid(user))).toHaveLength(1);
});

test('A07-E-118 8명 판 마지막 광대 처형 → 처형 영상이 끝난 뒤에 결과 화면 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(6)]);
    // 추방 연출이 떠 있는 동안 어느 화면이었는지 적어 둠 (화면이 바뀔 때마다 봄)
    await page.evaluate(() => {
        const seen = { overlay: false, video: false, onResult: false };
        window.__a07Expulsion = seen;
        new MutationObserver(() => {
            const overlay = document.querySelector('[data-ingame-tribunal-expulsion]');
            if (!overlay) return;
            seen.overlay = true;
            if (overlay.querySelector('video')) seen.video = true;
            if (window.location.pathname.includes('gameresult')) seen.onResult = true;
        }).observe(document.body, { childList: true, subtree: true, attributes: true });
    });
    await executeJoker(t);
    // 판은 이미 끝났지만 연출이 도는 동안엔 판 화면 그대로
    await expect(page.locator('[data-ingame-tribunal-expulsion]')).toBeVisible({ timeout: 20_000 });
    expect(page.url()).toMatch(/\/ingame/);
    // 영상이 끝나면 저절로 결과 화면 (영상이 멈춰 건너뛰기가 뜨면 눌러 줌 — 그래도 연출 뒤에 넘어감)
    await expect(async () => {
        await k.passCovers(page);
        await expect(page).toHaveURL(/\/gameresult/, { timeout: 1000 });
    }).toPass({ timeout: 45_000 });
    await expect(page.locator('[data-ingame-tribunal-expulsion]')).toHaveCount(0);
    expect(await page.evaluate(() => window.__a07Expulsion)).toEqual({ overlay: true, video: true, onResult: false });
    await k.reachBoard(page);
});

test('A07-E-133 8명 판 결과판 신고 단추는 남의 줄 7개, 내 줄엔 없음 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(6)]);
    await executeJoker(t);
    await k.reachBoard(page);
    await expect(k.rows(page)).toHaveCount(8);
    await expect(k.board(page).getByTestId('report-row-button')).toHaveCount(7);
    await expect(k.rowOf(page, nick(user)).getByTestId('report-row-button')).toHaveCount(0);
    for (const bot of t.bots) await expect(k.rowOf(page, nick(bot)).getByTestId('report-row-button')).toHaveCount(1);
    await expectReadable(k.rowOf(page, nick(t.bots[1])).getByTestId('report-row-button'));
});

test('A07-E-134 5명 판 결과 영상이 멈춰 있으면 20초(±1.5초)에 "건너뛰기"가 뜸 @game @realtime', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(3)]);
    // 영상을 멈춰 둠: 결과 영상 파일 요청에 답을 안 줌 → 끝남·오류·재생 거절 어느 것도 안 와서 20초 시계만 남음
    await page.route(
        (url) => /게임 (승리|패배) 연출\.mp4$/.test(decodeURIComponent(url.pathname).normalize('NFC')),
        () => {},
    );
    // 광대 봇이 나가 바로 결과 화면 (추방 영상을 안 거치게)
    await k.leave(t, t.bots[0]);
    await expect(intro(page, 'win')).toBeVisible({ timeout: 40_000 });
    const shownAt = Date.now();
    // 20초 규칙을 보는 시험이라 진짜로 기다림: 18.5초까진 건너뛰기 없음
    await page.waitForTimeout(18_500 - (Date.now() - shownAt));
    expect(await skipOf(page, 'win').count(), '18.5초엔 아직 건너뛰기 없음').toBe(0);
    await expect(skipOf(page, 'win')).toBeVisible({ timeout: 4000 });
    expect(Date.now() - shownAt).toBeLessThanOrEqual(21_500);
    await expectReadable(skipOf(page, 'win'));
    await skipOf(page, 'win').click();
    await expect(k.board(page)).toBeVisible();
});
