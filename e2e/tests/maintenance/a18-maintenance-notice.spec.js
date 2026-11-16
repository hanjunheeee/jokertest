'use strict';

// 점검 예약 큰 안내·띠 브라우저 시험 (PC) — 예약 큰 안내 → 닫으면 위쪽 띠(남은 시간 줄어듦) → 띠 누르면 다시, 끄면 띠 사라짐, 판 중에도 안내만 뜨고 판은 계속, 1분 선에서 다시 크게
// 목록 A18-설정-배포-광고.md 번호 A18-E-009·010·011·013, A18-H-003 — 점검은 서버 전체에 걸려 @serial, 돌리지 않고 모임만: npx playwright test --list --no-deps tests/maintenance/a18-maintenance-notice.spec.js
const { test, expect, e2e } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const L = require('../ingame/a-day/_lib');
const K = require('./_a18-kit');

const HALF_HOUR = 30 * 60 * 1000;

test.afterEach(async () => {
    // 실패해도 예약이 남지 않게 (남으면 30분 뒤 다른 시험 판이 끝남)
    await K.clearMaint();
});

/** 예약 큰 안내가 뜰 때까지: 제목·남은 시간·강제 종료 줄이 읽힘 */
async function expectScheduledNotice(page) {
    await expect(K.noticeTitle(page)).toHaveText(K.TEXT.SCHEDULED_TITLE, { timeout: 15_000 });
    await expectReadable(K.noticeTitle(page), { large: true });
    await expectReadable(K.noticeRemaining(page), { large: true });
    await expectReadable(K.noticeLine(page, K.TEXT.FORCE_END_LINE));
}

/** 띠 남은 초 (못 읽으면 던짐) */
async function bandSeconds(page) {
    const text = await K.bandText(page).innerText();
    const s = K.bandSecondsOf(text);
    if (s === null) throw new Error(`띠 글을 못 읽음: ${text}`);
    return s;
}

test('A18-E-009 로비, 30분 뒤 점검 예약 → 큰 안내 "점검 예정이에요"·남은 시간 → "확인했어요" → 위쪽 띠 "점검까지 29분 …", 남은 시간이 줄어듦 @serial @smoke', async ({ user }) => {
    const page = user.page;
    await K.setMaint({ enabled: true, startsInMs: HALF_HOUR });
    await expectScheduledNotice(page);
    await expect(K.noticeRemaining(page)).toHaveText(/^(29분 \d{2}|30분 0[01])초$/);

    await K.closeNotice(page);
    await expect(K.bandText(page)).toHaveText(/^점검까지 29분 \d{2}초$/);
    await expectReadable(K.bandText(page));
    const first = await bandSeconds(page);
    await expect.poll(() => bandSeconds(page), { timeout: 5_000, message: '띠 남은 시간이 줄어듦' }).toBeLessThan(first);
});

test('A18-E-010 예약 안내를 닫아 띠가 된 뒤 띠를 누름 → 큰 안내 다시 @serial', async ({ user }) => {
    const page = user.page;
    await K.setMaint({ enabled: true, startsInMs: HALF_HOUR });
    await expectScheduledNotice(page);
    await K.closeNotice(page);
    await expect(K.band(page)).toBeVisible();

    await K.openBand(page);
    await expect(K.noticeTitle(page)).toHaveText(K.TEXT.SCHEDULED_TITLE);
    await expectReadable(K.noticeButton(page, '확인했어요'));
    await expect(K.band(page)).toHaveCount(0);
});

test('A18-E-011 예약 → 띠 → 점검 끄기 → 띠 사라짐 → 방 만들기 됨 @serial', async ({ user }) => {
    const page = user.page;
    await K.setMaint({ enabled: true, startsInMs: HALF_HOUR });
    await expectScheduledNotice(page);
    await K.closeNotice(page);
    await expect(K.band(page)).toBeVisible();

    await K.clearMaint();
    await expect(K.band(page)).toHaveCount(0);
    await expect(K.noticeDialog(page)).toHaveCount(0);
    const room = await K.createRoomOk(user);
    expect(room.hostUuid).toBe(K.U(user));
});

test('A18-E-013 5명 판 낮(사람 1 + 봇 4) 30분 뒤 예약 → 판 화면 가운데 큰 안내 → 닫음 → 띠, 낮 투표 누름 → 서버가 표 받음 @game @serial', async ({ user, table }) => {
    const page = user.page;
    const t = await table.setup({
        humans: [user],
        bots: 4,
        settings: K.LONG_TIMES,
        roles: ({ humans, bots }) => ({
            [K.U(humans[0])]: 'CITIZEN', [K.U(bots[0])]: 'JOKER', [K.U(bots[1])]: 'CITIZEN', [K.U(bots[2])]: 'CITIZEN', [K.U(bots[3])]: 'CITIZEN',
        }),
    });
    const start = await t.state();
    expect(L.playerOf(start, K.U(user))?.role, '미리 정한 내 직업').toBe('CITIZEN');
    await L.toDay(t);

    await K.setMaint({ enabled: true, startsInMs: HALF_HOUR });
    await expectScheduledNotice(page);
    await expect(page).toHaveURL(/\/ingame/);
    // 판 화면 가운데 (가로 가운데 ±40px)
    const box = await K.noticeDialog(page).boundingBox();
    const view = page.viewportSize();
    expect(Math.abs(box.x + box.width / 2 - view.width / 2), '큰 안내가 가로 가운데').toBeLessThanOrEqual(40);

    await K.closeNotice(page);
    await expect(K.band(page)).toBeVisible();
    await expectReadable(K.bandText(page));

    // 판은 그대로: 투표 단계로 넘겨 내가 봇 하나를 찍음 → 봇 4는 기권 → 다 냈으니 마감 전에 서버가 판정 (내 표를 받았다는 뜻)
    await L.toVote(t);
    const target = t.bots[1];
    await L.voteUi(page, L.nickOf(t, target));
    await L.botsVote(t, null);
    const after = await L.waitState(t, (g) => g.phase !== 'DAY', { timeout: 20_000, message: '다 낸 뒤 판정 (투표 마감 90초 전)' });
    expect(after.phase, '판 계속 (끝나지 않음)').not.toBe('ENDED');
    expect(await e2e.gameOf(K.U(user)), '판 그대로').not.toBeNull();
});

test('A18-H-003 70초 뒤 예약 → 큰 안내 닫음 → 진짜로 약 10초 → 1분 선에서 큰 안내 다시(±1.5초) @hard @serial @realtime', async ({ user }) => {
    const page = user.page;
    const { startsAtMs } = await K.setMaint({ enabled: true, startsInMs: 70_000 });
    await expectScheduledNotice(page);
    await K.closeNotice(page);
    await expect(K.band(page)).toBeVisible();

    // 1분 선 = 시작 60초 전, 그 1.5초 전까진 띠 그대로
    const lineAt = startsAtMs - 60_000;
    await K.sleepUntil(lineAt - K.SLACK_MS);
    await expect(K.noticeDialog(page)).toHaveCount(0);
    await expect(K.band(page)).toBeVisible();

    await expect(K.noticeTitle(page)).toHaveText(K.TEXT.SCHEDULED_TITLE, { timeout: 2 * K.SLACK_MS + 1000 });
    const reopenedAt = Date.now();
    expect(Math.abs(reopenedAt - lineAt), `1분 선에서 다시 열림 (차이 ${reopenedAt - lineAt}ms)`).toBeLessThanOrEqual(K.SLACK_MS);
    await expectReadable(K.noticeRemaining(page), { large: true });
});
