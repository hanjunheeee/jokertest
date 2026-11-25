'use strict';

// 모바일 역할 확인 10초 동안 조작 브라우저 시험 — 채팅 막힘·이모티콘 안 됨(낮에만)·투표·준비 단추 없음 + 폰 폭마다 역할 창이 화면 안에 읽힘
// 목록 A02-판시작-역할.md 번호 A02-E-171~176 (사파리도: E-174), 조작은 판이 아직 역할 확인 단계일 때만 뜻이 있어 그때인지 서버 값으로 확인
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { closeOverlays } = require('../../helpers/ui');
const { talk, toDay, overflowX, useWideBoard } = require('./_talk');

const revealDialog = (page) => page.getByRole('dialog', { name: '내 역할 보기' });

// 사람 1(시민) + 봇 5 = 6명 판 → 역할 창 확인 눌러 닫음 (창이 판 화면을 덮어서)
async function openRevealPhase(table, user) {
    const me = user.account.uuid;
    const t = await table.setup({ humans: [user], bots: 5, roles: { [me]: 'CITIZEN' } });
    const dialog = revealDialog(user.page);
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole('button', { name: '확인' }).click();
    await expect(dialog).toHaveCount(0);
    // 세로 카톡형엔 카드 판(내 칸)이 없음 → 카톡형 화면이 그려졌는지로 봄
    await expect(talk.layout(user.page)).toBeVisible();
    return t;
}

// 본 것이 역할 확인 단계 안이었는지 (10초가 지나 낮이면 이 시험은 뜻이 없음 → 실패로 알림)
async function expectStillRevealPhase(t) {
    const s = await t.state();
    expect(s.phase, '아직 역할 확인 단계').toBe('ROLE_REVEAL');
}

// 역할 확인 동안은 채팅 못 씀 (결정 "확인 10초: 채팅 못 씀") — 모바일(상대 화면)은 입력칸을 끄지 않고 입장 준비 덮개가 화면 전체를 덮어 못 누르게 함
// (frontend-mobile ingame/components/overlays/EntryPreparingOverlay.jsx, 단위 시험 A02-M-603)
test('A02-E-171 모바일 6명 역할 확인 중 → 입장 준비 덮개 "가면무도회에 입장하는 중입니다." 읽힘, 채팅 입력칸 못 누름 @game @smoke', async ({ user, table }) => {
    const t = await openRevealPhase(table, user);
    const page = user.page;
    const cover = page.locator('[data-ingame-entry-preparing]');
    await expectReadable(cover.getByText('가면무도회에 입장하는 중입니다.', { exact: true }));
    // 덮개가 입력칸을 가려서 누르기(시험 삼아)가 덮개에 막힘
    await expect(talk.input(page).click({ trial: true, timeout: 1500 })).rejects.toThrow();
    await expectStillRevealPhase(t);
});

// 이모티콘은 낮에만 — 역할 확인 10초도 안 됨 (결정 2026-11-16 오전 "이모티콘" + 낮 "반장이 정하고 알린 것" 1번)
// 모바일(상대 화면)은 이모티콘 팔레트가 넓은 배치 카드 판(내 칸 길게 누름)에만 있음 → 폰 가로로 돌려서 봄
test('A02-E-172 모바일 6명 역할 확인 중 내 칸 길게 누름 → 이모티콘 팔레트 안 열림·말풍선 없음 (낮이 되면 열림) @game', async ({ user, table }) => {
    const t = await openRevealPhase(table, user);
    const page = user.page;
    await useWideBoard(page);
    // 내 칸 길게 누르기(안드로이드 contextmenu) → 팔레트가 안 열림, 말풍선도 안 그려짐
    await talk.mySlot(page).dispatchEvent('contextmenu');
    await expect(talk.palette(page)).toHaveCount(0);
    await expect(talk.mySlot(page).locator('[data-ingame-emoji-bubble]')).toHaveCount(0);
    expect(t.bots[0].events.some((r) => r.event === 'emoji_shown'), '판 사람에게 이모티콘이 나감').toBe(false);
    await expectStillRevealPhase(t);
    // 견줌: 첫 낮(손잡이로 감)엔 같은 누름으로 팔레트가 열림 (누르는 법이 틀려서 안 열린 것과 가르기)
    // 넓은 배치엔 세로 명패 줄이 없어 단계 글은 안 봄 (서버 단계로 넘김)
    await toDay(t, page, { line: undefined });
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

// A02-E-174~176 폰 폭마다 (광대 동료 있는 7명 판) — 창 틀·확인 단추·동료 줄이 폭마다 화면 안인지 보는 시험
// 의사 짝 판은 모바일(상대 화면) 역할 창 동료 줄이 늘 "동료 광대"라 (E-138~146이 그 버그를 봄) 폭 시험은 광대 짝으로 봄
const WIDTHS = [
    { no: 'A02-E-174', width: 360, height: 780, safari: true },
    { no: 'A02-E-175', width: 375, height: 812 },
    { no: 'A02-E-176', width: 412, height: 915 },
];

WIDTHS.forEach((w) => {
    const tags = ['@game', ...(w.safari ? ['@safari'] : [])].join(' ');
    test(`${w.no} 모바일 폭 ${w.width} 광대 동료 7명 판 → 역할 창·확인 단추·동료 줄이 화면 안에 읽힘 ${tags}`, async ({ user, table }) => {
        const page = user.page;
        const me = user.account.uuid;
        await page.setViewportSize({ width: w.width, height: w.height });
        const t = await table.setup({
            humans: [user],
            bots: 6,
            settings: { jokerCount: 2 },
            roles: ({ bots }) => ({ [me]: 'JOKER', [bots[0].account.uuid]: 'JOKER' }),
        });
        const s = await t.state();
        expect(s.players.find((p) => p.uuid === me)?.role, '미리 정한 내 직업').toBe('JOKER');
        const partner = s.players.find((p) => p.uuid !== me && p.role === 'JOKER');

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
        await expectReadable(dialog.getByText('동료 광대', { exact: true }));
        await expectReadable(dialog.getByRole('listitem').filter({ hasText: partner.nickname }));
        expect(await overflowX(page), '가로 넘침').toBeLessThanOrEqual(0);
    });
});
