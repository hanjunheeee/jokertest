// 모바일 인게임 시트: 위 줄 "인게임 설정"(채팅·사운드 탭·방 코드 보기), "플레이어별 전적목록"(전적·신고) — 아래에서 올라오는 시트
const { test, expect } = require('../../helpers/fixtures');
const { startTalkGame } = require('./_talk');

const settingsSheet = (page) => page.getByRole('dialog', { name: '인게임 설정' });
const recordSheet = (page) => page.getByRole('dialog', { name: '플레이어별 전적목록' });

async function openSettings(page) {
    await page.getByRole('button', { name: '인게임 설정' }).click();
    await expect(settingsSheet(page)).toBeVisible();
    return settingsSheet(page);
}

async function openRecords(page) {
    await page.getByRole('button', { name: '플레이어별 전적목록' }).click();
    await expect(recordSheet(page)).toBeVisible();
    return recordSheet(page);
}

test.describe('인게임 설정 시트', () => {
    test('"인게임 설정"을 누르면 → 설정 시트가 올라오고 채팅 탭이 눌린 채 채팅 항목 셋이 보임 @game', async ({ user, table }) => {
        await startTalkGame(table, user, { bots: 2 });
        const sheet = await openSettings(user.page);
        await expect(sheet.getByRole('heading', { name: '설정' })).toBeVisible();
        await expect(sheet.getByRole('button', { name: '채팅' })).toHaveAttribute('aria-pressed', 'true');
        await expect(sheet.getByRole('slider', { name: '채팅 글자 크기' })).toBeVisible();
        await expect(sheet.getByRole('checkbox', { name: '채팅 시간 표시' })).not.toBeChecked();
        await expect(sheet.getByRole('checkbox', { name: '닉네임 색상 표시' })).toBeChecked();
    });

    test('설정 시트에서 사운드 탭을 누르면 → 음량 밀대와 효과음 음소거가 보임 @game', async ({ user, table }) => {
        await startTalkGame(table, user, { bots: 2 });
        const sheet = await openSettings(user.page);
        await sheet.getByRole('button', { name: '사운드' }).click();
        await expect(sheet.getByRole('button', { name: '사운드' })).toHaveAttribute('aria-pressed', 'true');
        await expect(sheet.getByRole('slider').first()).toBeVisible();
        await expect(sheet.getByRole('checkbox', { name: '효과음 음소거' })).toBeVisible();
    });

    test('설정 시트가 떠 있을 때 Esc를 누르면 → 시트가 내려감 @game', async ({ user, table }) => {
        await startTalkGame(table, user, { bots: 2 });
        await openSettings(user.page);
        await user.page.keyboard.press('Escape');
        await expect(settingsSheet(user.page)).toHaveCount(0);
    });

    test('설정 시트는 → 375 폭 안에 들어오고 화면 아래쪽에 붙어 올라옴 @game', async ({ user, table }) => {
        await startTalkGame(table, user, { bots: 2 });
        const box = await (await openSettings(user.page)).boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(375);
        expect(box.y + box.height).toBeGreaterThan(812 - 30);
    });

    test('채팅 시간 표시를 켜고 시트를 닫았다 다시 열면 → 켜진 그대로 @game', async ({ user, table }) => {
        await startTalkGame(table, user, { bots: 2 });
        let sheet = await openSettings(user.page);
        await sheet.getByRole('checkbox', { name: '채팅 시간 표시' }).click();
        await user.page.keyboard.press('Escape');
        await expect(settingsSheet(user.page)).toHaveCount(0);
        sheet = await openSettings(user.page);
        await expect(sheet.getByRole('checkbox', { name: '채팅 시간 표시' })).toBeChecked();
    });

    test('"방 코드 보기"를 누르면 → 방코드 창에 이 판 방 코드가 보임 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        const sheet = await openSettings(user.page);
        await sheet.getByRole('button', { name: '방 코드 보기' }).click();
        const code = user.page.getByRole('dialog', { name: '방코드' });
        await expect(code).toBeVisible();
        await expect(code.getByLabel(`방코드 ${t.roomCode}`)).toBeVisible();
    });

    test('방코드 창에서 "방코드 복사"를 누르면 → 클립보드에 방 코드가 들어가고 "복사됨"으로 바뀜 @game', async ({ user, table }) => {
        await user.context.grantPermissions(['clipboard-read', 'clipboard-write']);
        const t = await startTalkGame(table, user, { bots: 2 });
        const sheet = await openSettings(user.page);
        await sheet.getByRole('button', { name: '방 코드 보기' }).click();
        const code = user.page.getByRole('dialog', { name: '방코드' });
        await code.getByRole('button', { name: '방코드 복사' }).click();
        await expect(code.getByRole('button', { name: '방코드 복사됨' })).toBeVisible();
        expect(await user.page.evaluate(() => navigator.clipboard.readText())).toBe(t.roomCode);
    });
});

test.describe('플레이어별 전적목록 시트', () => {
    test('"플레이어별 전적목록"을 누르면 → "플레이어 리스트" 시트에 판 참가자가 전부 줄로 보임 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 4 });
        const sheet = await openRecords(user.page);
        await expect(sheet.getByRole('heading', { name: '플레이어 리스트' })).toBeVisible();
        const list = sheet.getByRole('list', { name: '플레이어 전적 목록' });
        await expect(list.getByRole('listitem')).toHaveCount(5);
        for (const bot of t.bots) await expect(list.getByText(bot.nickname, { exact: true })).toBeVisible();
    });

    test('새 계정끼리의 판이면 → 전적목록 줄마다 "0판 | 0%"가 보임 @game', async ({ user, table }) => {
        await startTalkGame(table, user, { bots: 2 });
        const sheet = await openRecords(user.page);
        await expect(sheet.getByText('0판 | 0%')).toHaveCount(3);
    });

    test('전적목록에서 → 남의 줄엔 신고 버튼이 있고 내 줄엔 없음 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        const sheet = await openRecords(user.page);
        await expect(sheet.getByRole('button', { name: `${t.bots[0].nickname} 신고` })).toBeVisible();
        await expect(sheet.getByRole('button', { name: `${user.account.nickname} 신고` })).toHaveCount(0);
    });

    test('전적목록에서 봇 "신고"를 누르면 → 플레이어 신고 창이 사유 넷(욕설·비매너·부정행위·기타)과 뜸 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        const sheet = await openRecords(user.page);
        await sheet.getByRole('button', { name: `${t.bots[0].nickname} 신고` }).click();
        const report = user.page.getByTestId('report-sheet');
        await expect(report).toBeVisible();
        const reasons = report.getByRole('radiogroup', { name: '신고 사유' });
        for (const r of ['욕설', '비매너', '부정행위', '기타']) await expect(reasons.getByRole('radio', { name: r })).toBeVisible();
    });

    test('신고 창에서 사유 "욕설"을 고르고 신고하면 → 접수 안내가 뜨고 그 줄이 "신고됨"이 됨 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        const sheet = await openRecords(user.page);
        await sheet.getByRole('button', { name: `${t.bots[0].nickname} 신고` }).click();
        const report = user.page.getByTestId('report-sheet');
        await report.getByRole('radio', { name: '욕설' }).click();
        await report.getByRole('button', { name: '신고하기' }).click();
        await expect(report.getByText('신고가 접수되었습니다. 운영자가 확인합니다.')).toBeVisible();
        await report.getByRole('button', { name: '닫기' }).last().click();
        await expect(recordSheet(user.page).getByText('신고됨')).toBeVisible();
    });

    test('전적목록 시트 닫기 버튼을 누르면 → 시트가 내려감 @game', async ({ user, table }) => {
        await startTalkGame(table, user, { bots: 2 });
        const sheet = await openRecords(user.page);
        await sheet.getByRole('button', { name: '플레이어별 전적목록 닫기' }).click();
        await expect(recordSheet(user.page)).toHaveCount(0);
    });

});
