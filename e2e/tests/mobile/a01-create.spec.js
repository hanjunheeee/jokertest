'use strict';

// 모바일 방 만들기 브라우저 시험 — 정원 5·7·10 × 공개/코드, 지운 3칸 없음, 정원·광대·시간 칸 끝값, 재판이 투표 따라감, 직접 지정 합 넘음, 방 이름·코드 읽힘, 폭 360·375·412
// 목록 A01a-방만들기-설정-시작.md 번호 A01-E-101~115 (사파리도: E-101·113), 돌리지 않고 모임만: npx playwright test --list tests/mobile/a01-create.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const K = require('../room/_a01a-kit');

const pad = (n) => String(n).padStart(3, '0');
const createButton = (page) => page.getByRole('button', { name: '게임 만들기' });

// A01-E-101~106: 정원 5·7·10 × 공개/코드
{
    let no = 101;
    for (const max of [5, 7, 10]) {
        for (const code of [false, true]) {
            const id = `A01-E-${pad(no)}`;
            const tags = no === 101 ? ' @safari @smoke' : '';
            test(`${id} 모바일 정원 ${max}·${code ? '코드' : '공개'}로 만들기 → 대기방, 코드 6자리 보임, 서버 값 맞음${tags}`, async ({ user }) => {
                const page = user.page;
                const room = await K.createRoomOn(user, { maxPlayers: max, code });
                const shown = await K.openShownCode(page);
                expect(shown.code).toMatch(/^[A-Z0-9]{6}$/);
                expect(shown.code, '화면 코드 = 서버 코드').toBe(room.roomCode);
                await expectReadable(shown.cell);
                await shown.close();
                expect(room.settings.maxPlayers).toBe(max);
                expect((await K.liveRoom(room.roomId))?.accessType).toBe(code ? 'code' : 'open');
            });
            no += 1;
        }
    }
}

test('A01-E-107 모바일 만들기 화면 두 탭 → "불이 꺼진 무도회"·"영혼의 베팅"·"투표 공개" 없음', async ({ user }) => {
    await K.openSetupPage(user.page);
    await K.expectNoRemovedFields(user.page);
});

test('A01-E-108 모바일 정원 10 +·5 −·광대 1 −·2 + 꺼짐', async ({ user }) => {
    const page = user.page;
    await K.openSetupPage(page);
    await K.expectEdges(page, K.EDGES.MAX);
    await K.expectEdges(page, K.EDGES.JOKER);
});

test('A01-E-109 모바일 토론·투표·재판·밤 끝값에서 단추 꺼짐', async ({ user }) => {
    const page = user.page;
    await K.openSetupPage(page);
    for (const key of ['TALK', 'VOTE', 'TRIAL', 'NIGHT']) await K.expectEdges(page, K.EDGES[key]);
});

test('A01-E-110 모바일 투표 90으로 → 재판 칸 90', async ({ user }) => {
    const page = user.page;
    await K.openSetupPage(page);
    await K.fill(page, { vote: 90 });
    expect(await K.numberOf(page, K.L.TRIAL)).toBe(90);
});

test('A01-E-111 모바일 정원 7 + 광대2·의사2·경비원2·마녀사냥꾼2 → 합 넘음 오류 글 읽힘, "게임 만들기" 꺼짐', async ({ user }) => {
    const page = user.page;
    await K.openSetupPage(page);
    await K.fill(page, { maxPlayers: 7, custom: { JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 } });
    const error = page.locator('[data-setup-role-composition-summary]').getByRole('alert');
    await expect(error).toHaveText(K.MSG.SUM_OVER);
    await expectReadable(error);
    await expect(createButton(page)).toBeDisabled();
});

test('A01-E-112 모바일 대기방 위 줄 "닉네임의 방"·코드 6자리 읽힘', async ({ user }) => {
    const page = user.page;
    const room = await K.createRoomOn(user);
    await expect(K.roomTitle(page)).toHaveText(K.titleOf(user));
    await expectReadable(K.roomTitle(page));
    const shown = await K.openShownCode(page);
    expect(shown.code).toBe(room.roomCode);
    await expectReadable(shown.cell);
});

// A01-E-113~115: 폭마다 만들기 화면 (정원 칸 값·"게임 만들기"가 화면 안·안 가려짐·읽힘)
for (const [i, width] of [[113, 360], [114, 375], [115, 412]]) {
    const tags = i === 113 ? ' @safari' : '';
    test(`A01-E-${i} 모바일 폭 ${width} 만들기 화면 → 정원 칸·"게임 만들기" 읽힘${tags}`, async ({ user }) => {
        const page = user.page;
        await page.setViewportSize({ width, height: 812 });
        await K.openSetupPage(page);
        const maxValue = page.getByRole('group', { name: K.L.MAX, exact: true }).locator('[aria-live]');
        await expect(maxValue).toHaveText('10');
        await expectReadable(maxValue);
        await createButton(page).scrollIntoViewIfNeeded();
        await expectReadable(createButton(page));
    });
}
