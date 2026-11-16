'use strict';

// 판 보드·역할 창 모양 브라우저 시험 (PC) — 카드 수·닉네임이 읽힘·카드 색이 서로 다름·창 크기마다 역할 창이 화면 안·내 스킨 그림
// 목록 A02-판시작-역할.md 번호 A02-E-109~124 — 카드는 첫 낮(손잡이로 감)에 보고, 역할 창은 판이 열리자마자 봄
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { backend } = require('../../helpers/db');
const night = require('./b-night/_night');
const day = require('./a-day/_lib');

const ROLE_NAME = ui.ROLE_LABELS;
const revealDialog = (page) => page.getByRole('dialog', { name: '내 역할 보기' });
const cards = (page) => page.locator('[data-ingame-player-nickname]');

/**
 * 직업 수 구성 (결정 "구성 칸": 자동은 6명부터 의사·8명부터 경비원·10명부터 마녀사냥꾼, 직접은 준 것만, 남는 자리 시민)
 * @example countsOf(10, { custom: { JOKER: 1, DOCTOR: 2 } }) // { JOKER: 1, DOCTOR: 2, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: 7 }
 */
function countsOf(n, { jokers = 1, custom = null } = {}) {
    const c = custom
        ? { JOKER: 0, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, ...custom }
        : { JOKER: jokers, DOCTOR: n >= 6 ? 1 : 0, GUARD: n >= 8 ? 1 : 0, WITCH_HUNTER: n >= 10 ? 1 : 0 };
    c.CITIZEN = n - c.JOKER - c.DOCTOR - c.GUARD - c.WITCH_HUNTER;
    return c;
}

// 봇 직업 줄: 사람 직업 하나 빼고 펼침, 같은 직업 봇이 맨 앞(= 동료는 t.bots[0])
function botRolesFor(counts, humanRole) {
    const left = { ...counts, [humanRole]: counts[humanRole] - 1 };
    const order = [...new Set([humanRole, 'JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER', 'CITIZEN'])];
    return order.flatMap((role) => Array(left[role]).fill(role));
}

async function openTable(table, user, { n, role = 'CITIZEN', custom = null }) {
    const counts = countsOf(n, { custom });
    const settings = custom ? night.custom(custom) : {};
    return night.setup(table, { humans: [user], bots: n - 1, settings, humanRoles: [role], botRoles: botRolesFor(counts, role) });
}

// 첫 낮까지 손잡이로: 역할 창이 뜰 때까지 기다려 닫기 → 첫 낮 → "낮이 되었습니다" 닫기
// 창이 늦게 뜬 채 낮으로 넘기면 낮에 역할 창이 새로 떠서 낮 안내가 안 나옴(A02-E-116 흔들림) → 뜬 걸 보고 닫은 뒤 넘김
async function toFirstDay(t, page) {
    await day.closeReveal(page);
    await t.advanceUntil('DAY');
    await day.closeNotice(page, '낮이 되었습니다');
}

// A02-E-109~114: 인원 5~10 → 판 카드 N개, 닉네임 다 읽힘
for (const [i, n] of [5, 6, 7, 8, 9, 10].entries()) {
    const id = `A02-E-${String(109 + i).padStart(3, '0')}`;
    const smoke = i === 0 ? ' @smoke' : '';
    test(`${id} ${n}명 판 → 판 카드 ${n}개, 닉네임이 다 읽힘 @game${smoke}`, async ({ user, table }) => {
        test.setTimeout(180_000);
        const page = user.page;
        const t = await openTable(table, user, { n });
        await toFirstDay(t, page);
        await expect(cards(page)).toHaveCount(n);
        const nicknames = [user.account.nickname, ...t.bots.map((b) => b.nickname)];
        for (const nick of nicknames) await expectReadable(night.cardStatus(page, nick).getByText(nick, { exact: true }));
    });
}

// A02-E-115~116: 5명 / 10명 → 카드 이름표 색(계산된 글자색)이 서로 다름
for (const [no, n] of [[115, 5], [116, 10]]) {
    test(`A02-E-${no} ${n}명 판 → 카드 색이 서로 다름 @game`, async ({ user, table }) => {
        test.setTimeout(180_000);
        const page = user.page;
        const t = await openTable(table, user, { n });
        await toFirstDay(t, page);
        await expect(cards(page)).toHaveCount(n);
        // 카드마다 닉네임 이름표의 글자색 → 예: ['rgb(242, 201, 76)', 'rgb(120, 200, 255)', …]
        const colors = await cards(page).evaluateAll((els) => els.map((el) => {
            const nick = el.getAttribute('data-ingame-player-nickname');
            const plate = [...el.querySelectorAll('p')].find((p) => p.textContent.trim() === nick);
            return plate ? getComputedStyle(plate).color : null;
        }));
        expect(colors.every(Boolean), `이름표 못 찾음: ${JSON.stringify(colors)}`).toBe(true);
        expect(new Set(colors).size, `색: ${JSON.stringify(colors)}`).toBe(n);
    });
}

// A02-E-117~122: 창 크기 3 × (시민 5명 · 의사 동료 있는 10명 J1D2) → 역할 창 글·확인 단추·동료 줄이 화면 안에서 읽힘
const SIZES = [[1024, 768], [1280, 720], [1920, 1080]];
const LAYOUTS = [
    { label: '시민 5명', n: 5, role: 'CITIZEN' },
    { label: '의사 동료 있는 10명', n: 10, role: 'DOCTOR', custom: { JOKER: 1, DOCTOR: 2 } },
];
const VIEW_CASES = SIZES.flatMap(([width, height], s) => LAYOUTS.map((l, k) => ({ no: 117 + s * 2 + k, width, height, ...l })));

for (const c of VIEW_CASES) {
    test(`A02-E-${c.no} 창 ${c.width}×${c.height} ${c.label} → 역할 창·확인 단추·동료 줄이 화면 안에서 읽힘 @game`, async ({ user, table }) => {
        test.setTimeout(180_000);
        const page = user.page;
        await page.setViewportSize({ width: c.width, height: c.height });
        const t = await openTable(table, user, c);
        const dialog = revealDialog(page);
        await expect(dialog).toBeVisible({ timeout: 20_000 });
        await expectReadable(dialog.getByText(ROLE_NAME[c.role], { exact: true }));
        await expectReadable(dialog.getByRole('button', { name: '확인' }));
        if (c.role !== 'CITIZEN') {
            await expectReadable(dialog.getByText(`동료 ${ROLE_NAME[c.role]}`, { exact: true }));
            await expectReadable(dialog.getByText(t.bots[0].nickname, { exact: true }));
        }
    });
}

// A02-E-123~124: 의사 스킨 그림 (6명 자동, 사람 의사)
// 상점 의사 스킨 (backend services/economy/catalog.js 이름, 화면 서 있는 그림 파일 이름과 같음)
const DOCTOR_SKIN_ID = 'player-skin-주치의-미스테리';
const DOCTOR_SKIN_FILE = '주치의-미스테리.webp';
// 스킨 안 낀 의사 기본 서 있는 그림 (frontend skinCardWearCatalog.js 기본 스킨 "주치의")
const DOCTOR_DEFAULT_FILE = 'jobs-standing/주치의.webp';

// 시험 계정에 의사 스킨을 주고 끼움 (상점에서 산 것과 같은 보유 줄 + 장착)
async function equipDoctorSkin(uuid) {
    const { economyService } = backend();
    await economyService.grantAchievementItem({ userId: uuid, itemId: DOCTOR_SKIN_ID, itemType: 'SKIN', referenceEventId: `e2e-a02-skin-${uuid}` });
    await economyService.equipItem({ userId: uuid, slot: 'JOB_SKIN_DOCTOR', itemId: DOCTOR_SKIN_ID });
}

// 역할 창 그림 중 파일 이름이 맞는 것 (주소는 한글이 인코딩·NFD로 와서 풀어서 봄)
async function revealImage(dialog, fileName) {
    let index = -1;
    await expect.poll(async () => {
        const srcs = await dialog.locator('img').evaluateAll((imgs) => imgs.map((img) => decodeURIComponent(img.getAttribute('src') ?? '').normalize('NFC')));
        index = srcs.findIndex((src) => src.includes(fileName));
        return index;
    }, { message: `역할 창에 ${fileName} 그림 없음` }).toBeGreaterThanOrEqual(0);
    return dialog.locator('img').nth(index);
}

test('A02-E-123 의사 스킨 장착 계정, 6명 → 역할 창 그림이 그 스킨 @game', async ({ user, table }) => {
    await equipDoctorSkin(user.account.uuid);
    await openTable(table, user, { n: 6, role: 'DOCTOR' });
    const dialog = revealDialog(user.page);
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expectReadable(await revealImage(dialog, DOCTOR_SKIN_FILE), { contrast: false });
});

test('A02-E-124 스킨 안 낀 계정, 6명 의사 → 역할 창 그림이 의사 기본 그림 @game', async ({ user, table }) => {
    await openTable(table, user, { n: 6, role: 'DOCTOR' });
    const dialog = revealDialog(user.page);
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expectReadable(await revealImage(dialog, DOCTOR_DEFAULT_FILE), { contrast: false });
});
