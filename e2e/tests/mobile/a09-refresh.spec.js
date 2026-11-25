'use strict';

// 모바일 판 중 새로고침 브라우저 시험 — 새로고침해도 같은 단계 글·줄어든 남은 시간·내 직업과 동료·앞 채팅이 그대로, 결과 화면 새로고침은 결과를 못 봄
// 목록 A09-끊김-나가기-탈주.md 번호 A09-E-042·043·045·052·102 (모바일 줄) — 그 단계까지는 손잡이로 감
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { closeOverlays } = require('../../helpers/ui');
const { talk, clearOverlays, say, botSay, expectRosterCount } = require('./_talk');
const K = require('../ingame/_a09-simple-kit');

const revealDialog = (page) => page.getByRole('dialog', { name: '내 역할 보기' });

// 새로고침 → 카톡형 판 화면 그대로, 연출 창 닫음
async function reloadIngame(page) {
    await page.reload();
    await expect(page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    await expect(talk.layout(page)).toBeVisible({ timeout: 20_000 });
    await clearOverlays(page);
}

// 위 단계 줄 "제 1일 · 낮 토론 0:25"의 남은 초
async function phaseLineSeconds(page) {
    const text = await talk.phaseLine(page).innerText();
    const m = /(\d+):(\d\d)/.exec(text);
    if (!m) throw new Error(`단계 줄에서 남은 시간을 못 읽음: ${text}`);
    return Number(m[1]) * 60 + Number(m[2]);
}

// 남은 초가 지난 시간만큼 줄었는지 (늘거나 처음 값으로 돌아가면 실패, 초 단위 표시라 ±2초)
function expectCountedDown(before, after, elapsedMs) {
    expect(after, '새로고침 뒤 남은 초가 늘지 않음').toBeLessThanOrEqual(before);
    expect(before - after, '줄어든 초가 지난 시간보다 훨씬 작지 않음').toBeGreaterThanOrEqual(Math.floor(elapsedMs / 1000) - 2);
    expect(before - after, '줄어든 초가 지난 시간보다 훨씬 크지 않음').toBeLessThanOrEqual(Math.ceil(elapsedMs / 1000) + 2);
}

// 단계: 판 인원 · 단계 줄 글 · 서버 단계 · 그 단계까지 가는 법
const PHASES = [
    { no: 'A09-E-042', n: 6, label: '낮', line: '낮', phase: 'DAY', go: (t) => K.toDay(t) },
    { no: 'A09-E-043', n: 7, label: '밤', line: '밤', phase: 'NIGHT', go: (t) => K.toNight(t, 1) },
];

PHASES.forEach((p, i) => {
    const smoke = i === 0 ? ' @smoke' : '';
    test(`${p.no} 모바일 ${p.n}명 판 ${p.label}에 새로고침 → 같은 단계 글, 남은 시간은 줄어든 값 @game${smoke}`, async ({ user, table }) => {
        const page = user.page;
        const t = await K.seat(table, user, { n: p.n });
        await p.go(t);
        await expect(talk.phaseLine(page)).toContainText(p.line, { timeout: 15_000 });
        const before = await phaseLineSeconds(page);
        const readAt = Date.now();
        expect(before, '새로고침 전 남은 초').toBeGreaterThan(0);

        await reloadIngame(page);
        await expect(talk.phaseLine(page)).toContainText(p.line, { timeout: 15_000 });
        await expectReadable(talk.phaseLine(page));
        const after = await phaseLineSeconds(page);
        expectCountedDown(before, after, Date.now() - readAt);
        await expectRosterCount(page, p.n);
        expect((await t.state()).phase, '서버 단계').toBe(p.phase);
    });
});

test('A09-E-045 모바일 10명 판(광대 2), 새로고침 뒤 내 직업 "광대"와 "동료 광대" + 상대 닉네임 그대로 @game', async ({ user, table }) => {
    const page = user.page;
    const me = K.U(user);
    const t = await K.seat(table, user, { n: 10, role: 'JOKER', settings: { jokerCount: 2 } });
    const partner = K.botOf(t, await t.state(), 'JOKER');
    await K.toDay(t);
    await expect(talk.phaseLine(page)).toContainText('낮', { timeout: 15_000 });
    await reloadIngame(page);
    // 떠 있는 안내 창을 닫으며 위 줄 "내 역할 보기"로 역할 창 다시 엶
    const dialog = revealDialog(page);
    await expect(async () => {
        if (await dialog.isVisible().catch(() => false)) return;
        await closeOverlays(page, { names: ['단계 전환 안내', '밤 역할 안내', '알림', '밤 조사 결과'], rounds: 2 });
        await page.getByRole('button', { name: '내 역할 보기', exact: true }).click({ timeout: 1500 });
        await expect(dialog).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 20_000 });
    await expectReadable(dialog.getByText('광대', { exact: true }));
    await expectReadable(dialog.getByText('동료 광대', { exact: true }));
    await expect(dialog.getByRole('listitem')).toHaveText([partner.nickname]);
    await expectReadable(dialog.getByRole('listitem').filter({ hasText: partner.nickname }));
    expect(K.roleOf(await t.state(), me)).toBe('JOKER');
});

test('A09-E-052 모바일 6명 판, 새로고침 뒤 앞 채팅 줄 그대로 @game', async ({ user, table }) => {
    const page = user.page;
    const t = await K.seat(table, user, { n: 6 });
    await K.toDay(t);
    await expect(talk.phaseLine(page)).toContainText('낮', { timeout: 15_000 });
    await clearOverlays(page);
    const tag = Math.random().toString(36).slice(2, 7);
    const mine = `새로고침 전 내 말 ${tag}`;
    const theirs = `새로고침 전 봇 말 ${tag}`;
    await say(page, mine);
    expect((await botSay(t, 0, theirs))?.ok, '봇 채팅을 서버가 받음').toBe(true);
    await expect(talk.others(page).filter({ hasText: theirs })).toBeVisible();

    await reloadIngame(page);
    // 말풍선은 줄 통째로는 대비를 못 셈 → 보임·화면 안·안 가려짐만
    await expectReadable(talk.mine(page).filter({ hasText: mine }).last(), { contrast: false });
    await expectReadable(talk.others(page).filter({ hasText: theirs }).last(), { contrast: false });
});

test('A09-E-102 모바일 7명 판, 결과 화면 새로고침 → "게임 결과를 확인할 수 없습니다" + "로비로 돌아가기" @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const t = await K.seat(table, user, { n: 7 });
    await K.toCitizenWin(t, page);
    await page.reload();
    await expectReadable(page.getByText('게임 결과를 확인할 수 없습니다', { exact: true }));
    const back = page.getByRole('button', { name: '로비로 돌아가기' });
    await expectReadable(back);
    await back.click();
    await expect(page).toHaveURL(/\/lobby/, { timeout: 15_000 });
});
