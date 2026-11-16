'use strict';

// 직업별 낮 화면 브라우저 시험 (PC) — 낮엔 어떤 직업이든 직업 능력 단추가 없고, 투표 대상은 나 빼고 산 사람 전부
// 목록 A03-낮투표.md 번호 A03-E-224~244 — 자동 구성(6명 의사·8명 경비원·10명 마녀사냥꾼)대로 판을 차리고 사람 직업만 바꿔 봄
const { test, expect } = require('../../helpers/fixtures');
const { ROLE_LABELS } = require('../../helpers/ui');
const L = require('./a-day/_lib');

const U = (x) => x.account.uuid;

// 낮에 뜨면 안 되는 직업 능력 이름 (밤 행동·취소·건너뛰기, 화면 constants/actions/ingameActionPanel.js·playerCardMenu.js 글)
const ABILITY_NAMES = Object.freeze(['암살', '보호', '조사', '확인', '밤 행동', '취소하기', '건너뛰기']);
// 판 화면 단추 중 능력 이름 (확인은 안내 창 단추와 겹쳐 카드 메뉴에서만 봄)
const PAGE_ABILITY_NAMES = ABILITY_NAMES.filter((name) => name !== '확인');
// 밤 행동 메뉴 단추는 읽기 이름 앞에 대상 이름이 붙음("닉네임 암살"·"닉네임 · 동료 의사 보호") → 이름이 능력 글이거나 그 글로 끝나는지로 봄
const isAbilityName = (label, name) => label === name || label.endsWith(` ${name}`);
const abilityNameRe = (name) => new RegExp(`(^| )${name}$`);

// 인원별 자동 구성 특수 직업 (광대 1, 6명부터 의사, 8명부터 경비원, 10명부터 마녀사냥꾼 — 결정 "방 만들기" 자동 구성)
function specialsOf(n) {
    return ['JOKER', ...(n >= 6 ? ['DOCTOR'] : []), ...(n >= 8 ? ['GUARD'] : []), ...(n >= 10 ? ['WITCH_HUNTER'] : [])];
}

// 직업 전부 정함: 사람은 role, 남은 특수 직업은 봇 앞자리부터, 나머지 시민 → 무작위 없음
function rolesFor(n, role) {
    const left = [...specialsOf(n)];
    const at = left.indexOf(role);
    if (at >= 0) left.splice(at, 1);
    return ({ humans, bots }) => {
        const out = { [U(humans[0])]: role };
        bots.forEach((b, i) => { out[U(b)] = left[i] ?? 'CITIZEN'; });
        return out;
    };
}

// n명 판 차리고 직업이 정한 대로 됐는지 한 번 확인 (서버 예약이 가끔 못 맞음)
async function openTable(table, user, n, role) {
    const roles = rolesFor(n, role);
    const t = await table.setup({ humans: [user], bots: n - 1, roles });
    const want = roles({ humans: t.humans, bots: t.bots });
    const s = await t.state();
    expect(s.players).toHaveLength(n);
    for (const p of s.players) expect(p.role, `${p.nickname} 직업`).toBe(want[p.uuid]);
    return t;
}

// 판 화면에 직업 능력 단추·메뉴 항목이 하나도 없는지 (구석 건너뛰기 표시 포함)
async function expectNoAbilityButtons(page) {
    for (const name of PAGE_ABILITY_NAMES) {
        await expect(page.getByRole('button', { name, exact: true }), `능력 단추 "${name}"`).toHaveCount(0);
        await expect(page.getByRole('menuitem', { name: abilityNameRe(name) }), `능력 메뉴 "${name}"`).toHaveCount(0);
    }
    await expect(page.locator('[data-ingame-phase-action="nightSkip"]')).toHaveCount(0);
}

// 카드 눌러 메뉴 항목 읽고 Esc로 닫음 → [{ name, enabled }]
async function readCardMenu(page, nickname) {
    await L.card(page, nickname).click();
    const menu = page.getByRole('menu', { name: '플레이어 행동' });
    await expect(menu).toBeVisible();
    const items = await menu.locator('[role="menuitem"]').evaluateAll((els) => els.map((el) => ({
        name: el.getAttribute('aria-label'),
        enabled: !el.disabled,
    })));
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    return items;
}

// (판 인원, 사람 직업) 21개 — 목록 줄 순서 그대로 (5명 광대·시민 → 10명 +마녀사냥꾼)
const CASES = [
    [5, ['JOKER', 'CITIZEN']],
    [6, ['JOKER', 'CITIZEN', 'DOCTOR']],
    [7, ['JOKER', 'CITIZEN', 'DOCTOR']],
    [8, ['JOKER', 'CITIZEN', 'DOCTOR', 'GUARD']],
    [9, ['JOKER', 'CITIZEN', 'DOCTOR', 'GUARD']],
    [10, ['JOKER', 'CITIZEN', 'DOCTOR', 'GUARD', 'WITCH_HUNTER']],
].flatMap(([n, roles]) => roles.map((role) => ({ n, role })));

CASES.forEach(({ n, role }, i) => {
    const id = `A03-E-${224 + i}`;
    const smoke = i === 0 ? ' @smoke' : '';
    test(`${id} PC ${n}명 판 사람 ${ROLE_LABELS[role]} → 낮에 직업 능력 단추 없음, 투표 대상은 나 빼고 산 사람 ${n - 1}명 @game${smoke}`, async ({ user, table }) => {
        const t = await openTable(table, user, n, role);
        const page = user.page;
        const myNick = user.account.nickname;

        // 토론: 능력 단추 없음 (준비 단추만)
        await L.toDay(t);
        await expect(page.getByRole('button', { name: '투표 시작 준비' })).toBeVisible();
        await expectNoAbilityButtons(page);

        // 투표: 능력 단추 없음 + 다른 사람 카드마다 누를 수 있는 "투표하기"만, 능력 항목 없음
        await L.toVote(t);
        await expectNoAbilityButtons(page);
        const s = await t.state();
        const others = s.players.filter((p) => p.alive && p.uuid !== U(user));
        expect(others).toHaveLength(n - 1);
        let votable = 0;
        for (const p of others) {
            const items = await readCardMenu(page, p.nickname);
            const abilities = items.filter((it) => ABILITY_NAMES.some((name) => isAbilityName(it.name, name))).map((it) => it.name);
            expect(abilities, `${p.nickname} 카드 메뉴의 능력 항목`).toEqual([]);
            if (items.some((it) => it.name === '투표하기' && it.enabled)) votable += 1;
        }
        expect(votable).toBe(n - 1);

        // 내 카드는 눌러도 메뉴가 안 열림 (나 자신은 투표 대상 아님)
        const mine = L.selfCard(page, myNick);
        await mine.click();
        await expect(mine).toHaveAttribute('aria-expanded', 'false');
        await expect(page.getByRole('menu', { name: '플레이어 행동' })).toHaveCount(0);
    });
});
