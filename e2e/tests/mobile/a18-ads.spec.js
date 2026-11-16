'use strict';

// 모바일 광고 브라우저 시험 — 한 판 끝 광고 창(결과 화면 뒤 1.5초·5초 전엔 못 닫음·뒤로 가기는 광고만 다룸·판 끝 흐름 안 막음), 판 화면엔 광고 없음, 로비 광고 줄이 바닥 단추를 안 가림
// 목록 A18-설정-배포-광고.md 번호 A18-E-016~020 — 광고 꾸러미 요청은 가짜로 바꾸고 다른 광고 주소는 막음(진짜 광고 계정으로 안 나감), E-016은 가짜 광고 값으로 빌드한 모바일 화면이 있어야 통과
// 돌리지 않고 모임만: npx playwright test --list --no-deps tests/mobile/a18-ads.spec.js
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { customRoleSettings } = require('../../helpers/game');
const { playToResult } = require('../room/roomHelpers');
const A9 = require('../ingame/_a09-simple-kit');
const K = require('../maintenance/_a18-kit');

// 결과 화면 버튼 (모바일 그림 버튼은 aria-label)
const toRoomButton = (page) => page.getByRole('button', { name: '대기방으로', exact: true });
const closeTimer = (page) => page.getByTestId('result-close-timer');
const timerSeconds = async (page) => Number(await closeTimer(page).getAttribute('data-seconds-left'));

/**
 * 광고 가로챈 휴대폰 사람으로 5명 판(사람 1 + 봇 4, 봇 광대 처형 → 시민 승) → 결과판이 보이고 광고 창이 열린 때까지
 * @returns {Promise<{ phone, t, adAt:number }>} adAt = 광고 창이 보인 때
 */
async function resultWithAd(players, table) {
    const phone = await K.openPhone(players);
    const page = phone.page;
    const { t } = await playToResult({ user: phone, table, kind: 'citizenWin' });
    await expect(toRoomButton(page)).toBeVisible();
    // 결과판·버튼이 먼저, 광고 창은 그 뒤 (1.5초 늦춤)
    expect(await K.adDialog(page).count(), '결과판이 보인 순간엔 광고 창 없음').toBe(0);
    await expect(K.adDialog(page)).toBeVisible({ timeout: 10_000 });
    return { phone, t, adAt: Date.now() };
}

/** 그 page에 뜬 브라우저 확인 창 글 모으기 (확인 창이 뜨면 안 되는 시험용, 뜨면 취소) */
function watchConfirms(page) {
    const got = [];
    page.on('dialog', (dialog) => { got.push(dialog.message()); dialog.dismiss().catch(() => {}); });
    return got;
}

test('A18-E-016 모바일 5명 판 끝 → 결과판·단추 뒤 광고 창(가짜 광고 채워짐), 4초엔 "닫기" 없음, 5초 뒤 "닫기" 읽힘 → 누르면 결과판 그대로 @game @smoke', async ({ players, table }) => {
    test.setTimeout(180_000);
    const { phone, adAt } = await resultWithAd(players, table);
    const page = phone.page;
    await K.expectFakeFilled(K.adDialog(page), phone.ads);

    // 4초: 아직 닫기 없음 (남은 초 글만)
    await K.sleepUntil(adAt + 4000);
    await expect(K.adClose(page)).toHaveCount(0);
    await expect(K.adDialog(page).getByText(/^\d초 뒤 닫기$/)).toBeVisible();

    // 5초 뒤: 닫기 단추가 사람 눈에 읽힘
    await expect(K.adClose(page)).toBeVisible({ timeout: Math.max(0, adAt + 5000 + K.SLACK_MS - Date.now()) });
    await expectReadable(K.adClose(page));
    await K.adClose(page).click();
    await expect(K.adDialog(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/gameresult/);
    await expect(page.getByRole('region', { name: '가면무도회 참가자 정체' })).toBeVisible();
});

test('A18-E-017 모바일 6명 판(사람 1 + 봇 5) 역할 확인·낮·밤 → 광고 줄·광고 창 없음, 로비로 나가면 광고 줄 있음 @game', async ({ players, table }) => {
    test.setTimeout(180_000);
    const phone = await K.openPhone(players);
    const page = phone.page;
    // 로비엔 광고 줄 있음 (비교 기준)
    await expect(K.adBanner(page)).toBeVisible();

    const t = await table.setup({
        humans: [phone],
        bots: 5,
        settings: { ...K.LONG_TIMES, ...customRoleSettings({ JOKER: 1 }) },
        roles: ({ humans, bots }) => Object.fromEntries([[K.U(humans[0]), 'CITIZEN'], ...bots.map((b, i) => [K.U(b), i === 0 ? 'JOKER' : 'CITIZEN'])]),
    });
    const noAds = async (stage) => {
        await expect(page, stage).toHaveURL(/\/ingame/);
        await expect(K.adBanner(page), `${stage}: 광고 줄 없음`).toHaveCount(0);
        await expect(K.adDialog(page), `${stage}: 광고 창 없음`).toHaveCount(0);
    };

    // 역할 확인
    await expect(page.getByRole('dialog', { name: '내 역할 보기' })).toBeVisible({ timeout: 20_000 });
    await noAds('역할 확인');
    await ui.readRoleReveal(page);
    // 낮
    await A9.toDay(t);
    await A9.clear(page);
    await noAds('낮');
    // 밤
    await A9.toNight(t);
    await A9.clear(page);
    await noAds('밤');

    // 판에서 나가 로비로 → 광고 줄 다시 있음
    await A9.leaveAlive(page);
    await ui.gotoLobby(page);
    await expect(K.adBanner(page)).toBeVisible();
    await expect(K.adSlot(K.adBanner(page))).toHaveCount(1);
});

test('A18-E-018 모바일 광고 창 열림 → 2초에 뒤로 가기 → 창·결과 화면 그대로, 6초에 뒤로 가기 → 창만 닫힘, "로비로 나가시겠습니까?" 안 뜸, 새로고침 안 됨 @game', async ({ players, table }) => {
    test.setTimeout(180_000);
    const { phone, adAt } = await resultWithAd(players, table);
    const page = phone.page;
    const confirms = watchConfirms(page);
    // 새로고침되면 사라지는 표시
    await page.evaluate(() => { window.__a18NoReload = true; });

    await K.sleepUntil(adAt + 2000);
    await page.evaluate(() => window.history.back());
    // 뒤로 가기를 받을 틈을 준 뒤 (진짜 시간 규칙 확인이라 고정 기다림)
    await page.waitForTimeout(500);
    await expect(K.adDialog(page)).toBeVisible();
    await expect(page).toHaveURL(/\/gameresult/);

    await K.sleepUntil(adAt + 6000);
    await expect(K.adClose(page)).toBeVisible();
    await page.evaluate(() => window.history.back());
    await expect(K.adDialog(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/gameresult/);
    await expect(page.getByRole('region', { name: '가면무도회 참가자 정체' })).toBeVisible();
    await expect(toRoomButton(page)).toBeVisible();
    expect(confirms.filter((m) => m.includes(K.TEXT.EXIT_RESULT)), '"로비로 나가시겠습니까?" 확인 창').toEqual([]);
    await expect(page.getByText(K.TEXT.EXIT_RESULT)).toHaveCount(0);
    expect(await page.evaluate(() => window.__a18NoReload === true), '새로고침 안 됨').toBe(true);
});

test('A18-E-019 모바일 광고 창이 열린 동안 결과 화면 남은 시간이 계속 줄어듦, 닫은 뒤 "대기방으로" → 같은 방 대기방 @game', async ({ players, table }) => {
    test.setTimeout(180_000);
    const { phone, t } = await resultWithAd(players, table);
    const page = phone.page;
    const first = await timerSeconds(page);
    expect(first, '남은 시간 칸').toBeGreaterThan(0);
    await expect.poll(() => timerSeconds(page), { timeout: 5_000, message: '광고 창 뒤 남은 시간이 줄어듦' }).toBeLessThan(first);
    await expect(K.adDialog(page)).toBeVisible();

    await expect(K.adClose(page)).toBeVisible({ timeout: 10_000 });
    await K.adClose(page).click();
    await expect(K.adDialog(page)).toHaveCount(0);
    await toRoomButton(page).click();
    await expect(page).toHaveURL(/\/game-matching/, { timeout: 20_000 });
    await expect.poll(async () => (await e2e.roomOf(K.U(phone)))?.roomId, { message: '들어간 방' }).toBe(t.room.roomId);
});

test('A18-E-020 모바일 로비 광고 줄이 바닥 단추 줄 아래, 바닥 단추 가운데가 안 가려짐, 사이 8px 이상', async ({ players }) => {
    const phone = await K.openPhone(players);
    const page = phone.page;
    const banner = K.adBanner(page);
    await expect(banner).toBeVisible();
    const slot = K.adSlot(banner).first();
    await expect(slot).toBeVisible();
    const slotBox = await slot.boundingBox();

    const bottomButtons = page.locator('#mobile-shell-bottom').getByRole('button');
    const count = await bottomButtons.count();
    expect(count, '로비 바닥 단추').toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
        const button = bottomButtons.nth(i);
        const box = await button.boundingBox();
        expect(box.y + box.height, `바닥 단추 ${i}가 광고 줄 위`).toBeLessThanOrEqual((await banner.boundingBox()).y + 0.5);
        expect(slotBox.y - (box.y + box.height), `바닥 단추 ${i}와 광고 칸 사이`).toBeGreaterThanOrEqual(8);
        expect(await K.centerIsOwn(button), `바닥 단추 ${i} 가운데가 가려짐`).toBe(true);
    }
});
