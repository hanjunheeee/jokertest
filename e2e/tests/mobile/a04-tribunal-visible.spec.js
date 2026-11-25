'use strict';

// 모바일 재판 창 보임 시험: 폰 세로·가로·태블릿·작은 폰·사파리에서 단추와 피고 카드가 화면 안·안 가려짐, 긴 닉네임 피고
// 목록 A04-E-126~130·178 (시험목록/A04-재판.md "브라우저 — 간단" 모바일 몫)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const A = require('../ingame/_a04-multi');

const { trial, VOTE_LABEL } = A;

// 합친 뒤 재판 화면은 두 모양 (frontend-mobile overlays/tribunal/TribunalGate.jsx·talk/TalkLayout.jsx)
// - 넓은 배치(폰 가로·태블릿, hooks/chat/useWideChat.js와 같은 기준): 전면 재판 창이 카드 크게(intro) → 카드가 줄고 채팅이 열린 모양(split)
// - 세로 카톡형: 고발 연출(enter → exit) 뒤 채팅 틀 "최후의 변론" 단추 → 시트 안에 피고 카드·유죄·무죄 (옛 "split" 값은 없음)
const WIDE_QUERY = '(orientation: landscape) and (max-height: 540px) and (min-width: 560px), (min-width: 48rem)';
const isWide = (page) => page.evaluate((q) => window.matchMedia(q).matches, WIDE_QUERY);

// 재판 화면이 자리 잡은 뒤 단추·피고 카드가 읽히는지
async function expectTrialReadable(page, nickname) {
    if (await isWide(page)) {
        const win = page.locator('[data-ingame-tribunal-presentation]');
        await expect(win).toHaveAttribute('data-ingame-tribunal-layout', 'split', { timeout: 10000 });
        const card = win.locator('[data-tribunal-defendant]');
        await expectReadable(card, { contrast: false });
        await expect(card).toContainText(nickname);
        for (const vote of ['GUILTY', 'NOT_GUILTY']) {
            const button = win.getByRole('button', { name: VOTE_LABEL[vote], exact: true });
            await expectReadable(button, { contrast: false });
            await expect(button).toBeEnabled();
            await A.readable(button.getByText(VOTE_LABEL[vote], { exact: true }), { uncovered: false });
        }
        return;
    }
    // 세로: 고발 연출이 끝나 "최후의 변론" 단추가 뜬 뒤 시트를 열어 봄
    await expect(page.getByTestId('tribunal-presentation-open')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-ingame-tribunal-presentation]')).toHaveCount(0);
    await A.expectCardReadable(page, nickname);
    await A.expectButtonsReadable(page);
}

// 화면 크기는 판에 들어온 뒤 바꿈 (대기방까지는 기본 폰 세로)
const SIZES = [
    ['126', '폰 세로', { width: 375, height: 812 }, 6, ' @smoke'],
    ['127', '폰 가로', { width: 812, height: 375 }, 7, ''],
    ['128', '태블릿', { width: 768, height: 1024 }, 5, ''],
    ['129', '작은 폰', { width: 320, height: 568 }, 8, ''],
];
for (const [no, name, size, n, tag] of SIZES) {
    test(`A04-E-${no} ${name}(${size.width}x${size.height})에서 재판 단추·피고 카드가 화면 안·안 가려짐 (모바일 ${n}명) @game${tag}`, async ({ user, table }) => {
        const page = user.page;
        const t = await A.openTable(table, { humans: [user], bots: n - 1, roles: A.plainRoles() });
        await page.setViewportSize(size);
        await A.toVote(t, 1);
        const d = t.bots[n - 2];
        await A.toTribunal(t, d);
        await expectTrialReadable(page, d.nickname);
    });
}

test('A04-E-130 사파리에서 재판 단추·피고 카드가 화면 안·안 가려짐 (모바일 6명) @game @safari', async ({ user, table }) => {
    const { d } = await A.startTrial(table, { humans: [user], bots: 5 });
    await expectTrialReadable(user.page, d.nickname);
});

// A04-E-131(투표 현황을 열어 둔 채 재판이 열려도 재판 단추가 안 가려짐)은 지움: 연출 때 시트를 저절로 닫는 규칙이 모바일(상대 화면)에 없음 (커밋 d71ab651에서 뺌)

test('A04-E-178 가장 긴 닉네임(8자) 피고도 카드 이름이 읽히고 단추가 안 밀려남 (모바일 6명) @game', async ({ user, players, accounts, table }) => {
    const page = user.page;
    // 닉네임을 정하려고 피고를 다른 사람(브라우저)으로 둠: 한글 8자 (가입 규칙 최대 길이)
    const tail = Array.from({ length: 6 }, () => '가나다라마바사아자차카타파하'[Math.floor(Math.random() * 14)]).join('');
    const longNick = `맘모${tail}`;
    const defendant = await players.add({ mobile: true, account: await accounts.create({ nickname: longNick }) });
    const { d } = await A.startTrial(table, { humans: [user, defendant], bots: 4, pick: () => defendant });
    expect(A.nickOf(d)).toBe(longNick);
    await expectTrialReadable(page, longNick);
    // 이름판 글자: 카드 그림 위 글이라 사진으로 대비를 봄 (누름 통과 칸이라 가려짐 검사는 카드 쪽)
    const name = trial.card(page).getByText(longNick, { exact: true });
    await A.readable(name, { uncovered: false });
    // 말줄임으로 잘리지 않고 다 보임
    expect(await name.evaluate((el) => el.scrollWidth > el.clientWidth), '이름이 잘려 말줄임 됨').toBe(false);
});
