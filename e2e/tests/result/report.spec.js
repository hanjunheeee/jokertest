// 결과 화면 신고: 내 줄엔 버튼 없음·사유 4개·기타 메모 필수·500자·접수·"신고됨"·중복·1분 5번 제한·같이 안 한 판·자기 신고
const { test, expect } = require('../../helpers/fixtures');
const { E2E } = require('../../helpers/env');
const db = require('../../helpers/db');
const h = require('../room/roomHelpers');

const dialog = (page) => page.getByRole('dialog', { name: '플레이어 신고' });
const reportBtn = (page, name) => page.getByRole('button', { name: `${name} 신고`, exact: true });
const submit = (page) => page.getByTestId('report-submit');
const message = (page) => page.getByTestId('report-message');

// 내가 광대로 이긴 2인 판 → 결과 화면, 신고 대상 봇
async function resultWithBot(user, table) {
    const r = await h.playToResult({ user, table, kind: 'jokerWin' });
    const bot = r.t.bots[0];
    return { ...r, bot, gameId: r.t.gameId };
}

async function openReport(page, name) {
    await reportBtn(page, name).click();
    await expect(dialog(page)).toBeVisible();
}

// API로 신고 보내기 (화면과 같은 쿠키) → { status, body }
async function postReport(user, body) {
    const res = await user.context.request.post(`${E2E.apiUrl}/reports`, { data: body, headers: { origin: E2E.desktopUrl } });
    let json = null;
    try { json = await res.json(); } catch { /* 글자 */ }
    return { status: res.status(), body: json };
}

const reportRows = (reporter, target) => db.query(
    'SELECT reason_code, memo, game_id, status FROM reports WHERE reporter_id = ? AND target_id = ?', [reporter, target],
);

test.describe('결과 화면 신고 @game', () => {
    test('결과 목록에서 → 내 줄엔 신고 버튼이 없고 상대 줄에만 "신고" 버튼이 있음', async ({ user, table }) => {
        const { bot } = await resultWithBot(user, table);
        await expect(h.resultRow(user.page, user.account.nickname).getByTestId('report-row-button')).toHaveCount(0);
        await expect(reportBtn(user.page, bot.nickname)).toBeVisible();
        await expect(reportBtn(user.page, bot.nickname)).toHaveText('신고');
    });

    test('신고 버튼을 누르면 → 신고 창에 대상 이름과 사유 네 개(욕설·비매너·부정행위·기타)가 보임', async ({ user, table }) => {
        const { bot } = await resultWithBot(user, table);
        await openReport(user.page, bot.nickname);
        await expect(user.page.getByTestId('report-target')).toHaveText(bot.nickname);
        const radios = dialog(user.page).getByRole('radiogroup', { name: '신고 사유' }).getByRole('radio');
        await expect(radios).toHaveText(['욕설', '비매너', '부정행위', '기타']);
        await expect(radios.filter({ has: user.page.locator('[aria-checked="true"]') })).toHaveCount(0);
    });

    test('사유를 누르면 → 그 사유만 골라짐(다른 걸 누르면 바뀜)', async ({ user, table }) => {
        const { bot } = await resultWithBot(user, table);
        await openReport(user.page, bot.nickname);
        const d = dialog(user.page);
        await d.getByRole('radio', { name: '욕설' }).click();
        await expect(d.getByRole('radio', { name: '욕설' })).toHaveAttribute('aria-checked', 'true');
        await d.getByRole('radio', { name: '비매너' }).click();
        await expect(d.getByRole('radio', { name: '비매너' })).toHaveAttribute('aria-checked', 'true');
        await expect(d.getByRole('radio', { name: '욕설' })).toHaveAttribute('aria-checked', 'false');
    });

    test('사유를 안 고르고 신고하기를 누르면 → "신고 사유를 골라 주세요." 안내, 서버에 안 감', async ({ user, table }) => {
        const { bot } = await resultWithBot(user, table);
        await openReport(user.page, bot.nickname);
        await submit(user.page).click();
        await expect(message(user.page)).toHaveText('신고 사유를 골라 주세요.');
        expect(await reportRows(user.account.uuid, bot.uuid)).toHaveLength(0);
    });

    test('기타를 고르고 메모 없이 신고하면 → "기타 사유는 메모를 적어 주세요." 안내', async ({ user, table }) => {
        const { bot } = await resultWithBot(user, table);
        await openReport(user.page, bot.nickname);
        await dialog(user.page).getByRole('radio', { name: '기타' }).click();
        await submit(user.page).click();
        await expect(message(user.page)).toHaveText('기타 사유는 메모를 적어 주세요.');
    });

    test('기타에 빈칸만 적고 신고하면 → 메모 없음으로 보고 안내가 뜸', async ({ user, table }) => {
        const { bot } = await resultWithBot(user, table);
        await openReport(user.page, bot.nickname);
        await dialog(user.page).getByRole('radio', { name: '기타' }).click();
        await dialog(user.page).getByRole('textbox', { name: '메모' }).fill('   ');
        await submit(user.page).click();
        await expect(message(user.page)).toHaveText('기타 사유는 메모를 적어 주세요.');
    });

    test('기타에 메모를 적고 신고하면 → 접수되고 DB에 ETC·메모가 남음', async ({ user, table }) => {
        const { bot, gameId } = await resultWithBot(user, table);
        await openReport(user.page, bot.nickname);
        await dialog(user.page).getByRole('radio', { name: '기타' }).click();
        await dialog(user.page).getByRole('textbox', { name: '메모' }).fill('밤마다 같은 말 반복');
        await submit(user.page).click();
        await expect(message(user.page)).toHaveText('신고가 접수되었습니다. 운영자가 확인합니다.');
        const rows = await reportRows(user.account.uuid, bot.uuid);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ reason_code: 'ETC', memo: '밤마다 같은 말 반복', game_id: gameId, status: 'OPEN' });
    });

    test('욕설로 메모 없이 신고하면 → 접수되고 DB 메모는 비어 있음', async ({ user, table }) => {
        const { bot } = await resultWithBot(user, table);
        await openReport(user.page, bot.nickname);
        await dialog(user.page).getByRole('radio', { name: '욕설' }).click();
        await submit(user.page).click();
        await expect(message(user.page)).toHaveText('신고가 접수되었습니다. 운영자가 확인합니다.');
        const rows = await reportRows(user.account.uuid, bot.uuid);
        expect(rows[0]).toMatchObject({ reason_code: 'ABUSE', memo: null });
    });

    test('부정행위로 신고하면 → DB 사유가 CHEATING', async ({ user, table }) => {
        const { bot } = await resultWithBot(user, table);
        await openReport(user.page, bot.nickname);
        await dialog(user.page).getByRole('radio', { name: '부정행위' }).click();
        await submit(user.page).click();
        await expect(message(user.page)).toHaveText('신고가 접수되었습니다. 운영자가 확인합니다.');
        expect((await reportRows(user.account.uuid, bot.uuid))[0].reason_code).toBe('CHEATING');
    });

    test('메모 앞뒤에 빈칸을 넣어 신고하면 → DB엔 다듬은 메모가 남음', async ({ user, table }) => {
        const { bot } = await resultWithBot(user, table);
        await openReport(user.page, bot.nickname);
        await dialog(user.page).getByRole('radio', { name: '비매너' }).click();
        await dialog(user.page).getByRole('textbox', { name: '메모' }).fill('   잠수함   ');
        await submit(user.page).click();
        await expect(message(user.page)).toHaveText('신고가 접수되었습니다. 운영자가 확인합니다.');
        expect((await reportRows(user.account.uuid, bot.uuid))[0]).toMatchObject({ reason_code: 'GRIEFING', memo: '잠수함' });
    });

    test('메모를 적으면 → 글자 수 표시가 "N/500"으로 바뀜', async ({ user, table }) => {
        const { bot } = await resultWithBot(user, table);
        await openReport(user.page, bot.nickname);
        await expect(dialog(user.page).getByText('0/500')).toBeVisible();
        await dialog(user.page).getByRole('textbox', { name: '메모' }).fill('가나다라마');
        await expect(dialog(user.page).getByText('5/500')).toBeVisible();
    });

    test('메모를 501자 넣으면 → 500자에서 잘리고 "500/500"', async ({ user, table }) => {
        const { bot } = await resultWithBot(user, table);
        await openReport(user.page, bot.nickname);
        const memo = dialog(user.page).getByRole('textbox', { name: '메모' });
        await expect(memo).toHaveAttribute('maxlength', '500');
        await memo.click();
        await user.page.keyboard.insertText('가'.repeat(501));
        await expect(dialog(user.page).getByText('500/500')).toBeVisible();
        expect((await memo.inputValue()).length).toBe(500);
    });

    test('메모 500자로 신고하면 → 접수되고 DB에 500자가 다 남음', async ({ user, table }) => {
        const { bot } = await resultWithBot(user, table);
        await openReport(user.page, bot.nickname);
        await dialog(user.page).getByRole('radio', { name: '기타' }).click();
        await dialog(user.page).getByRole('textbox', { name: '메모' }).fill('나'.repeat(500));
        await submit(user.page).click();
        await expect(message(user.page)).toHaveText('신고가 접수되었습니다. 운영자가 확인합니다.');
        expect((await reportRows(user.account.uuid, bot.uuid))[0].memo).toHaveLength(500);
    });

    test('신고가 접수되면 → 신고하기 버튼이 사라지고 아래 버튼이 "닫기"가 됨', async ({ user, table }) => {
        const { bot } = await resultWithBot(user, table);
        await openReport(user.page, bot.nickname);
        await dialog(user.page).getByRole('radio', { name: '욕설' }).click();
        await submit(user.page).click();
        await expect(message(user.page)).toBeVisible();
        await expect(submit(user.page)).toHaveCount(0);
        await expect(user.page.getByTestId('report-cancel')).toHaveText('닫기');
        await expect(dialog(user.page).getByRole('radio', { name: '비매너' })).toBeDisabled();
    });

    test('신고한 뒤 창을 닫으면 → 그 줄 버튼이 "신고됨"으로 잠김', async ({ user, table }) => {
        const { bot } = await resultWithBot(user, table);
        await openReport(user.page, bot.nickname);
        await dialog(user.page).getByRole('radio', { name: '욕설' }).click();
        await submit(user.page).click();
        await expect(message(user.page)).toBeVisible();
        await user.page.getByTestId('report-cancel').click();
        const done = user.page.getByRole('button', { name: `${bot.nickname} 신고됨` });
        await expect(done).toHaveText('신고됨');
        await expect(done).toBeDisabled();
    });

    test('같은 판 같은 사람을 다시 신고하면(API) → 409 DUPLICATE_REPORT', async ({ user, table }) => {
        const { bot, gameId } = await resultWithBot(user, table);
        const first = await postReport(user, { targetUuid: bot.uuid, gameId, reasonCode: 'ABUSE' });
        expect(first.status).toBeLessThan(300);
        const again = await postReport(user, { targetUuid: bot.uuid, gameId, reasonCode: 'GRIEFING' });
        expect(again.status).toBe(409);
        expect(JSON.stringify(again.body)).toContain('DUPLICATE_REPORT');
        expect(await reportRows(user.account.uuid, bot.uuid)).toHaveLength(1);
    });

    test('이미 신고한 사람을 화면에서 또 신고하면 → "이미 이 판에서 신고한 플레이어입니다." 안내와 신고됨', async ({ user, table }) => {
        const { bot, gameId } = await resultWithBot(user, table);
        await postReport(user, { targetUuid: bot.uuid, gameId, reasonCode: 'ABUSE' });
        await openReport(user.page, bot.nickname);
        await dialog(user.page).getByRole('radio', { name: '비매너' }).click();
        await submit(user.page).click();
        await expect(message(user.page)).toHaveText('이미 이 판에서 신고한 플레이어입니다.');
        await user.page.getByTestId('report-cancel').click();
        await expect(user.page.getByRole('button', { name: `${bot.nickname} 신고됨` })).toBeDisabled();
    });

    test('1분 안에 신고를 5번 넘게 보내면 → 6번째는 "신고가 너무 많습니다" 안내', async ({ user, table }) => {
        const { bot, gameId } = await resultWithBot(user, table);
        // 5번은 API로 (중복 거절도 횟수로 셈)
        for (let i = 0; i < 5; i += 1) await postReport(user, { targetUuid: bot.uuid, gameId, reasonCode: 'ABUSE' });
        await openReport(user.page, bot.nickname);
        await dialog(user.page).getByRole('radio', { name: '욕설' }).click();
        await submit(user.page).click();
        await expect(message(user.page)).toHaveText('신고가 너무 많습니다. 잠시 후 다시 시도해주세요.');
    });

    test('같이 안 한 판으로 신고하면(API) → 404 GAME_NOT_FOUND', async ({ user, table, accounts }) => {
        const { gameId } = await resultWithBot(user, table);
        const stranger = await accounts.create();
        const res = await postReport(user, { targetUuid: stranger.uuid, gameId, reasonCode: 'ABUSE' });
        expect(res.status).toBe(404);
        expect(JSON.stringify(res.body)).toContain('GAME_NOT_FOUND');
    });

    test('나 자신을 신고하면(API) → 400 SELF_REPORT', async ({ user, table }) => {
        const { gameId } = await resultWithBot(user, table);
        const res = await postReport(user, { targetUuid: user.account.uuid, gameId, reasonCode: 'ABUSE' });
        expect(res.status).toBe(400);
        expect(JSON.stringify(res.body)).toContain('SELF_REPORT');
    });

    test('신고 창에서 취소를 누르면 → 창이 닫히고 신고는 안 남음', async ({ user, table }) => {
        const { bot } = await resultWithBot(user, table);
        await openReport(user.page, bot.nickname);
        await dialog(user.page).getByRole('radio', { name: '욕설' }).click();
        await user.page.getByTestId('report-cancel').click();
        await expect(dialog(user.page)).toHaveCount(0);
        await expect(reportBtn(user.page, bot.nickname)).toBeEnabled();
        expect(await reportRows(user.account.uuid, bot.uuid)).toHaveLength(0);
    });

    test('신고 창에서 Esc를 누르면 → 창이 닫힘', async ({ user, table }) => {
        const { bot } = await resultWithBot(user, table);
        await openReport(user.page, bot.nickname);
        await user.page.keyboard.press('Escape');
        await expect(dialog(user.page)).toHaveCount(0);
    });

    test('신고 창을 닫았다 다시 열면 → 고른 사유·메모가 비워져 있음', async ({ user, table }) => {
        const { bot } = await resultWithBot(user, table);
        await openReport(user.page, bot.nickname);
        await dialog(user.page).getByRole('radio', { name: '기타' }).click();
        await dialog(user.page).getByRole('textbox', { name: '메모' }).fill('적다 맒');
        await dialog(user.page).getByRole('button', { name: '신고 창 닫기' }).click();
        await openReport(user.page, bot.nickname);
        await expect(dialog(user.page).getByRole('radio', { name: '기타' })).toHaveAttribute('aria-checked', 'false');
        await expect(dialog(user.page).getByRole('textbox', { name: '메모' })).toHaveValue('');
    });

    test('판 중에 채팅이 있었으면 → 신고에 그 판 채팅 증거가 같이 저장됨', async ({ user, table }) => {
        const me = user.account.uuid;
        const t = await table.setup({ humans: [user], bots: 2, roles: ({ bots }) => ({ [me]: 'CITIZEN', [bots[0].account.uuid]: 'JOKER', [bots[1].account.uuid]: 'CITIZEN' }) });
        const joker = t.bots[0];
        t.playBots((bot) => (bot === joker
            ? { dayChat: '증거로 남을 말', dayVote: 'abstain', tribunal: 'skip', night: 'skip' }
            : { dayVote: joker.uuid, tribunal: 'GUILTY', night: 'skip' }));
        await h.closeReveals([user.page]);
        await h.finishGame(t, { stepDelayMs: 1200 });
        await h.waitResult(user.page);
        await openReport(user.page, joker.nickname);
        await dialog(user.page).getByRole('radio', { name: '욕설' }).click();
        await submit(user.page).click();
        await expect(message(user.page)).toHaveText('신고가 접수되었습니다. 운영자가 확인합니다.');
        const rows = await db.query(
            'SELECT e.messages FROM report_chat_evidence e JOIN reports r ON r.id = e.report_id WHERE r.reporter_id = ? AND r.target_id = ?',
            [me, joker.uuid],
        );
        expect(rows).toHaveLength(1);
        expect(JSON.stringify(rows[0].messages)).toContain('증거로 남을 말');
    });

    test('처형돼 죽은 사람 줄에도 → 신고 버튼이 있음', async ({ user, table }) => {
        const { t, joker } = await h.playToResult({ user, table, kind: 'citizenWin' });
        const dead = t.bots.find((b) => b.account.uuid === joker);
        await expect(reportBtn(user.page, dead.nickname)).toBeEnabled();
    });

    test('다른 사람이 같은 판 같은 대상을 신고하면 → 중복이 아니라 따로 접수됨', async ({ user, table, players }) => {
        const other = await players.add();
        const r = await h.playToResult({ user, table, kind: 'jokerWin', extraHumans: [other] });
        await h.waitResult(other.page);
        const target = r.t.bots[0];
        for (const p of [user, other]) {
            await openReport(p.page, target.nickname);
            await dialog(p.page).getByRole('radio', { name: '욕설' }).click();
            await submit(p.page).click();
            await expect(message(p.page)).toHaveText('신고가 접수되었습니다. 운영자가 확인합니다.');
        }
        const rows = await db.query('SELECT reporter_id FROM reports WHERE target_id = ? AND game_id = ?', [target.uuid, r.t.gameId]);
        expect(rows).toHaveLength(2);
    });

    test('신고 창 바깥 어두운 곳을 누르면 → 창이 닫힘', async ({ user, table }) => {
        const { bot } = await resultWithBot(user, table);
        await openReport(user.page, bot.nickname);
        await user.page.mouse.click(10, 10);
        await expect(dialog(user.page)).toHaveCount(0);
    });
});
