// 모바일 빈칸 채우기 시험: 전적 시트 신고가 DB에 줄로 남는지, 이모티콘 팔레트 슬롯을 바꿔 저장하면 새로 열어도 남는지 (375×812)
// 빈칸찾기 중 9·하 16
const { test, expect, ui } = require('../../helpers/fixtures');
const { query } = require('../../helpers/db');
const { startTalkGame } = require('./_talk');

const recordSheet = (page) => page.getByRole('dialog', { name: '플레이어별 전적목록' });

test.describe('모바일 신고', () => {
    test('전적 시트에서 봇을 "욕설"로 신고하면 → 접수 안내가 뜨고 DB reports에 이 판·이 사유 줄이 하나 생김 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        const target = t.bots[0];
        await user.page.getByRole('button', { name: '플레이어별 전적목록' }).click();
        await recordSheet(user.page).getByRole('button', { name: `${target.nickname} 신고` }).click();
        const report = user.page.getByTestId('report-sheet');
        await report.getByRole('radio', { name: '욕설' }).click();
        await report.getByRole('button', { name: '신고하기' }).click();
        await expect(report.getByText('신고가 접수되었습니다. 운영자가 확인합니다.')).toBeVisible();
        const rows = await query('SELECT reason_code, game_id FROM reports WHERE reporter_id = ? AND target_id = ?', [user.account.uuid, target.account.uuid]);
        expect(rows).toEqual([{ reason_code: 'ABUSE', game_id: t.gameId }]);
    });
});

test.describe('모바일 이모티콘 팔레트', () => {
    async function gotoPalette(page) {
        await page.goto('/mypage/emoticons');
        await ui.skipIntro(page);
        await expect(page.getByRole('group', { name: '팔레트 슬롯' }).getByRole('button', { name: /번 슬롯$/ })).toHaveCount(8);
    }

    test('1번 슬롯에 헤롱을 넣고 저장한 뒤 새로 열면 → 1번 슬롯이 헤롱 그대로', async ({ user }) => {
        const { page } = user;
        await gotoPalette(page);
        await page.getByRole('button', { name: '1번 슬롯' }).click();
        await page.getByRole('button', { name: '헤롱 팔레트에 넣기' }).click();
        await expect(page.getByRole('button', { name: '1번 슬롯' }).getByRole('img', { name: '헤롱' })).toBeVisible();
        await page.getByRole('button', { name: '저장' }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await gotoPalette(page);
        await expect(page.getByRole('button', { name: '1번 슬롯' }).getByRole('img', { name: '헤롱' })).toBeVisible();
    });

    test('슬롯을 바꾸고 저장 안 한 채 새로 열면 → 바꾸기 전 그대로 (저장해야만 남음)', async ({ user }) => {
        const { page } = user;
        await gotoPalette(page);
        const before = await page.getByRole('button', { name: '1번 슬롯' }).getByRole('img').getAttribute('alt');
        await page.getByRole('button', { name: '1번 슬롯' }).click();
        await page.getByRole('button', { name: '헤롱 팔레트에 넣기' }).click();
        await expect(page.getByRole('button', { name: '1번 슬롯' }).getByRole('img', { name: '헤롱' })).toBeVisible();
        // 떠날 때 묻는 창이 뜨면 떠나기로 (안 뜨면 그냥 지나감)
        page.on('dialog', (d) => d.accept().catch(() => {}));
        await gotoPalette(page);
        await expect(page.getByRole('button', { name: '1번 슬롯' }).getByRole('img', { name: before })).toBeVisible();
    });
});
