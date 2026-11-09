// 문의 창 브라우저 시험 (데스크톱, AD-274·276·277): 고객센터 → 문의 쓰기 → 내 목록 답 기다림, 너무 자주 안내, 금지어 가려짐
// 서버는 2-14 문의 경로(/inquiries) 그대로, 금지어는 시험마다 무작위 낱말로 넣고 뺌
const { test, expect } = require('../../helpers/fixtures');
const { addBannedWords, removeBannedWords } = require('../../helpers/bannedWords');

const menu = (page) => page.getByRole('navigation', { name: '로비 메뉴' });
const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// 고객센터 → 문의 창 열고 문의 쓰기 칸으로
async function openForm(page) {
    await menu(page).getByRole('button', { name: '고객센터' }).click();
    const dialog = page.getByRole('dialog', { name: '고객센터 문의' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '문의 쓰기' }).click();
    return dialog;
}

// 종류·제목·내용 채우고 보내기
async function writeAndSend(dialog, { category = '버그', title, body }) {
    await dialog.getByRole('radio', { name: category }).click();
    await dialog.getByLabel('제목').fill(title);
    await dialog.getByLabel('내용').fill(body);
    await dialog.getByRole('button', { name: '문의 보내기' }).click();
}

test('AD-274 로비 고객센터 → 문의 쓰기 → 내 문의 목록에 답 기다림으로 보임', async ({ user }) => {
    const { page } = user;
    const dialog = await openForm(page);
    const title = `밤에 멈춤 ${uniq()}`;
    await writeAndSend(dialog, { category: '버그', title, body: '투표 때 화면이 멈춰요' });
    await expect(dialog.getByRole('status').filter({ hasText: '문의를 보냈어요' })).toBeVisible();
    const row = dialog.getByRole('listitem').filter({ hasText: title });
    await expect(row).toContainText('답 기다림');

    // 다시 열어도 서버 목록에 남아 있음
    await dialog.getByRole('button', { name: '문의 창 닫기' }).last().click();
    await expect(dialog).toHaveCount(0);
    await menu(page).getByRole('button', { name: '고객센터' }).click();
    await expect(page.getByRole('dialog', { name: '고객센터 문의' }).getByRole('listitem').filter({ hasText: title })).toContainText('답 기다림');
});

test('AD-276 1분에 너무 자주 쓰면 → 잠시 뒤 다시 안내, 쓴 글은 그대로', async ({ user }) => {
    const { page } = user;
    const dialog = await openForm(page);
    // 한 사람 1분 2번까지 → 세 번째는 막힘
    for (let i = 0; i < 2; i += 1) {
        await writeAndSend(dialog, { category: '기타', title: `질문 ${i} ${uniq()}`, body: '궁금해요' });
        await expect(dialog.getByRole('status').filter({ hasText: '문의를 보냈어요' })).toBeVisible();
        await dialog.getByRole('button', { name: '문의 쓰기' }).click();
    }
    await writeAndSend(dialog, { category: '기타', title: '세 번째', body: '또 궁금해요' });
    await expect(dialog.getByRole('alert')).toContainText('잠시 뒤');
    await expect(dialog.getByLabel('제목')).toHaveValue('세 번째');
});

test('AD-277 금지어 넣은 문의 → 내 목록에서 가려져 보임', async ({ user }) => {
    const { page } = user;
    const word = `금지${uniq()}`;
    await addBannedWords([word]);
    try {
        const dialog = await openForm(page);
        await writeAndSend(dialog, { category: '계정', title: `나쁜말 ${word} 들어감`, body: `내용에도 ${word}` });
        await expect(dialog.getByRole('status').filter({ hasText: '문의를 보냈어요' })).toBeVisible();
        const row = dialog.getByRole('listitem').filter({ hasText: '나쁜말' });
        await expect(row).toBeVisible();
        await expect(row).not.toContainText(word);
        await row.getByRole('button').click();
        await expect(dialog.getByTestId('inquiry-detail')).toBeVisible();
        await expect(dialog.getByTestId('inquiry-detail')).not.toContainText(word);
    } finally {
        await removeBannedWords([word]);
    }
});
