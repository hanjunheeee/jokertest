'use strict';

// 마이페이지 이모티콘 팔레트 브라우저 시험 (PC): 칸 바꿔 저장·새 계정 목록(안 가진 것은 잠금)·산 이모티콘이 목록에·두 탭 저장 충돌·되돌리기
// 목록 A12 브라우저 간단 A12-E-061~065 (쓰는 동안 안 돌림: npx playwright test --list tests/mypage/a12-emoji-palette.spec.js)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const st = require('../store/store-tools');

const SAVED = '팔레트를 저장했습니다.';
const CONFLICT = '팔레트가 다른 곳에서 먼저 변경되어 최신 값을 불러왔습니다. 확인한 뒤 다시 저장해 주세요.';
// 기본 지급 8종 이름 (새 계정이 가진 것 전부)
const BASIC_NAMES = ['거절', '눈물', '분노', '사랑', '씨익', '안녕', '항복', '헤롱'];

const wheel = (page) => page.getByRole('group', { name: '팔레트 슬롯' });
const slot = (page, n) => wheel(page).getByRole('button', { name: `${n}번 슬롯`, exact: true });
const slotEmoji = (page, n) => slot(page, n).locator('img');
const list = (page) => page.getByRole('list', { name: '이모티콘 목록' });

/** 팔레트 화면 열기 (불러오기가 끝나 1번 칸을 누를 수 있을 때까지) */
async function openPalette(page) {
    await page.goto('/mypage/emoticons');
    await expect(slot(page, 1)).toBeEnabled();
    await expect(slotEmoji(page, 1)).toHaveAttribute('alt', /.+/);
}

/** 1~8번 칸 이모티콘 이름 */
async function slotNames(page) {
    const names = [];
    for (let n = 1; n <= 8; n += 1) names.push(await slotEmoji(page, n).getAttribute('alt'));
    return names;
}

/** a번 칸을 고르고 b번 칸에 든 것을 넣음 (같은 것이 두 칸에 못 들어가 둘이 자리를 바꿈) */
async function swap(page, a, b) {
    const name = await slotEmoji(page, b).getAttribute('alt');
    await slot(page, a).click();
    await expect(slot(page, a)).toHaveAttribute('aria-pressed', 'true');
    await list(page).getByRole('button', { name: `${name} 팔레트에 넣기`, exact: true }).click();
    await expect(slotEmoji(page, a)).toHaveAttribute('alt', name);
}

/** 저장 → 저장 완료 창 확인 */
async function save(page) {
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await expectReadable(page.getByText(SAVED));
    await page.getByRole('button', { name: '확인', exact: true }).click();
    await expect(page.getByText(SAVED)).toHaveCount(0);
}

test('A12-E-061 3번 칸과 1번 칸을 바꿔 저장 → 새로고침 → 바꾼 그대로 @smoke', async ({ user }) => {
    const { page } = user;
    await openPalette(page);
    const before = await slotNames(page);
    await swap(page, 3, 1);
    const expected = [...before];
    [expected[0], expected[2]] = [before[2], before[0]];
    expect(await slotNames(page)).toEqual(expected);
    await save(page);
    await page.reload();
    await expect(slot(page, 1)).toBeEnabled();
    await expect(slotEmoji(page, 3)).toHaveAttribute('alt', expected[2]);
    expect(await slotNames(page)).toEqual(expected);
});

test('A12-E-062 새 계정 → 목록 23개: 기본 8종만 누를 수 있고 상점 15종은 잠금(미보유) (사용자 결정 오전 둘째 8번)', async ({ user }) => {
    const { page } = user;
    await openPalette(page);
    // 목록엔 23개 전부
    await expect(list(page).getByRole('listitem')).toHaveCount(23);
    const usable = list(page).getByRole('button', { name: / 팔레트에 넣기$/ });
    await expect(usable).toHaveCount(8);
    const labels = await usable.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label').replace(/ 팔레트에 넣기$/, '')));
    expect([...labels].sort()).toEqual([...BASIC_NAMES].sort());
    // 안 가진 것도 다 보이되 못 누름
    const locked = list(page).getByRole('button', { name: / \(미보유\)$/ });
    await expect(locked).toHaveCount(15);
    await expect(locked.first()).toBeDisabled();
});

test('A12-E-063 상점에서 "깜짝" 이모티콘 삼 → 팔레트 목록에서 잠금이 풀려 누를 수 있음', async ({ user }) => {
    const { page, account } = user;
    await st.grant(account.uuid, 'GOLD', 500);
    await st.gotoStore(page);
    await st.pickCategory(page, '이모티콘');
    await st.pickItem(page, '깜짝 500');
    await st.detail(page).getByRole('button', { name: '구매', exact: true }).click();
    await expect(st.detail(page).getByText('구매가 완료되었습니다.')).toBeVisible();

    await openPalette(page);
    const plate = list(page).getByRole('button', { name: '깜짝 팔레트에 넣기', exact: true });
    await expect(plate).toBeEnabled();
    await expectReadable(plate, { contrast: false });
    await expect(list(page).getByRole('button', { name: '깜짝 (미보유)', exact: true })).toHaveCount(0);
});

test('A12-E-064 두 탭이 같은 팔레트 → 탭 1 저장 → 탭 2 저장 → 탭 2에 충돌 안내 + 탭 1 값으로 다시 그림', async ({ user }) => {
    const { page, context } = user;
    const other = await context.newPage();
    await openPalette(page);
    await openPalette(other);

    await swap(page, 2, 1);
    const firstSaved = await slotNames(page);
    await save(page);

    await swap(other, 4, 3);
    await other.getByRole('button', { name: '저장', exact: true }).click();
    await expectReadable(other.getByText(CONFLICT));
    await expect(slotEmoji(other, 1)).toHaveAttribute('alt', firstSaved[0]);
    expect(await slotNames(other)).toEqual(firstSaved);
});

test('A12-E-065 칸을 바꾼 뒤 "되돌리기" 단추 → 저장 전 값', async ({ user }) => {
    const { page } = user;
    await openPalette(page);
    const before = await slotNames(page);
    await swap(page, 5, 2);
    expect(await slotNames(page)).not.toEqual(before);
    await page.getByRole('button', { name: '되돌리기', exact: true }).click();
    await expect(slotEmoji(page, 5)).toHaveAttribute('alt', before[4]);
    expect(await slotNames(page)).toEqual(before);
    // 저장 안 했으니 서버 값도 그대로
    await page.reload();
    await expect(slot(page, 1)).toBeEnabled();
    expect(await slotNames(page)).toEqual(before);
});
