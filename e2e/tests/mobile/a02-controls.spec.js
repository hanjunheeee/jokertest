'use strict';

// 모바일 역할 확인 10초 동안 조작 브라우저 시험 — 채팅 막힘·이모티콘 안 됨(낮에만)·투표·준비 단추 없음 + 폰 폭마다 역할 창이 화면 안에 읽힘
// 목록 A02-판시작-역할.md 번호 A02-E-171~176 (사파리도: E-174), 조작은 판이 아직 역할 확인 단계일 때만 뜻이 있어 그때인지 서버 값으로 확인
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { customRoleSettings } = require('../../helpers/game');
const { closeOverlays } = require('../../helpers/ui');
const { talk, toDay, overflowX } = require('./_talk');

const revealDialog = (page) => page.getByRole('dialog', { name: '내 역할 보기' });

// 사람 1(시민) + 봇 5 = 6명 판 → 역할 창 확인 눌러 닫음 (창이 판 화면을 덮어서)
async function openRevealPhase(table, user) {
    const me = user.account.uuid;
    const t = await table.setup({ humans: [user], bots: 5, roles: { [me]: 'CITIZEN' } });
    const dialog = revealDialog(user.page);
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole('button', { name: '확인' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(talk.mySlot(user.page)).toBeVisible();
    return t;
}

// 본 것이 역할 확인 단계 안이었는지 (10초가 지나 낮이면 이 시험은 뜻이 없음 → 실패로 알림)
async function expectStillRevealPhase(t) {
    const s = await t.state();
    expect(s.phase, '아직 역할 확인 단계').toBe('ROLE_REVEAL');
}

// 역할 확인 동안은 입력칸·보내기가 꺼지고 입력칸 자리에 까닭 글 (결정 "확인 10초: 채팅 못 씀", 화면 utils/inGameChatChannel.js 글)
test('A02-E-171 모바일 6명 역할 확인 중 → 채팅 입력칸·보내기 꺼짐, 까닭 글 @game @smoke', async ({ user, table }) => {
    const t = await openRevealPhase(table, user);
    const page = user.page;
    await expect(talk.input(page)).toBeDisabled();
    await expect(talk.send(page)).toBeDisabled();
    await expect(talk.input(page)).toHaveAttribute('placeholder', '역할 확인이 끝나면 채팅할 수 있습니다');
    await expectStillRevealPhase(t);
});

// 이모티콘은 낮에만 — 역할 확인 10초도 안 됨 (결정 2026-11-16 오전 "이모티콘" + 낮 "반장이 정하고 알린 것" 1번)
test('A02-E-172 모바일 6명 역할 확인 중 내 칸 길게 누름 → 이모티콘 팔레트 안 열림·말풍선 없음 (낮이 되면 열림) @game', async ({ user, table }) => {
    const t = await openRevealPhase(table, user);
    const page = user.page;
    // 내 칸 길게 누르기(안드로이드 contextmenu) → 팔레트가 안 열림, 말풍선도 안 그려짐
    await talk.mySlot(page).dispatchEvent('contextmenu');
    await expect(talk.palette(page)).toHaveCount(0);
    await expect(talk.mySlot(page).locator('[data-ingame-emoji-bubble]')).toHaveCount(0);
    expect(t.bots[0].events.some((r) => r.event === 'emoji_shown'), '판 사람에게 이모티콘이 나감').toBe(false);
    await expectStillRevealPhase(t);
    // 견줌: 첫 낮(손잡이로 감)엔 같은 누름으로 팔레트가 열림 (누르는 법이 틀려서 안 열린 것과 가르기)
    await toDay(t, page);
    await talk.mySlot(page).dispatchEvent('contextmenu');
    await expect(talk.palette(page)).toBeVisible();
});

test('A02-E-173 모바일 6명 역할 확인 중 → 투표·준비 단추 없음 @game', async ({ user, table }) => {
    const t = await openRevealPhase(table, user);
    const page = user.page;
    await expect(talk.layout(page)).toBeVisible();
    await expect(page.getByRole('button', { name: '기권' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /투표 시작 준비|준비 중|준비 완료|투표하기/ })).toHaveCount(0);
    await expectStillRevealPhase(t);
});

// A02-E-174~176 폰 폭마다 (의사 동료 있는 7명 판)
const WIDTHS = [
    { no: 'A02-E-174', width: 360, height: 780, safari: true },
    { no: 'A02-E-175', width: 375, height: 812 },
    { no: 'A02-E-176', width: 412, height: 915 },
];

WIDTHS.forEach((w) => {
    const tags = ['@game', ...(w.safari ? ['@safari'] : [])].join(' ');
    test(`${w.no} 모바일 폭 ${w.width} 의사 동료 7명 판 → 역할 창·확인 단추·동료 줄이 화면 안에 읽힘 ${tags}`, async ({ user, table }) => {
        const page = user.page;
        const me = user.account.uuid;
        await page.setViewportSize({ width: w.width, height: w.height });
        const t = await table.setup({
            humans: [user],
            bots: 6,
            settings: customRoleSettings({ JOKER: 1, DOCTOR: 2 }),
            roles: ({ bots }) => ({ [me]: 'DOCTOR', [bots[0].account.uuid]: 'DOCTOR' }),
        });
        const s = await t.state();
        expect(s.players.find((p) => p.uuid === me)?.role, '미리 정한 내 직업').toBe('DOCTOR');
        const partner = s.players.find((p) => p.uuid !== me && p.role === 'DOCTOR');

        // 10초에 저절로 닫히면 위 줄 "내 역할 보기"로 다시 엶
        const dialog = revealDialog(page);
        await expect(async () => {
            if (await dialog.isVisible().catch(() => false)) return;
            await closeOverlays(page, { names: ['단계 전환 안내', '알림'], rounds: 2 });
            await page.getByRole('button', { name: '내 역할 보기', exact: true }).click({ timeout: 1500 });
            await expect(dialog).toBeVisible({ timeout: 1500 });
        }).toPass({ timeout: 20_000 });

        // 창 틀은 글이 아니라 화면 안·안 가려짐만, 글·단추는 대비까지
        await expectReadable(dialog, { contrast: false });
        await expectReadable(dialog.getByRole('button', { name: '확인' }));
        await expectReadable(dialog.getByText('동료 의사', { exact: true }));
        await expectReadable(dialog.getByRole('listitem').filter({ hasText: partner.nickname }));
        expect(await overflowX(page), '가로 넘침').toBeLessThanOrEqual(0);
    });
});
