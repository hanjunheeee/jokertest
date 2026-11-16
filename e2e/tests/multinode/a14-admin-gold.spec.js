'use strict';

// 서버 두 대 판 골드 어려운 브라우저 시험 (E2E_NODES=2, 8명 판) — 관리자 화면에서 ㄱ서버로 2 → 서버별 반영 둘 다 "반영됨" → ㄴ서버 8명 판 끝 결과판 "+2골드"
// 목록 시험목록/A14-관리자.md 번호 A14-H-007 — 판 골드는 서버 전체 값이라 @serial, 끝에 1로 되돌림 / 모임만: E2E_NODES=2 npx playwright test --list --no-deps tests/multinode/a14-admin-gold.spec.js
const mn = require('./_mn');
const ui = require('../../helpers/ui');
const { Table } = require('../../helpers/game');
const { expectReadable } = require('../../helpers/visible');
const { resultRow, closeReveals } = require('../room/roomHelpers');
const k = require('../admin/_a14-kit');

const { test, expect, NODE_IDS, botsOn, gameNodeOf, e2e } = mn;
const { H, U } = k;

// 단계가 저절로 안 넘어가게 서버가 받는 가장 긴 시간
const PACE = Object.freeze({ dayDiscussionTime: 150, dayVoteTime: 90, tribunalTime: 120, nightActionTime: 120 });
const resultBoard = (page) => page.getByRole('region', { name: '가면무도회 참가자 정체' });
const VIDEO_COVERS = '[data-ingame-night-success-kill], [data-ingame-tribunal-expulsion], [data-game-result-intro]';

// 관리자 창 쓰기 요청을 그 서버로 (?node=)
async function pinAdminWrites(page, node) {
    await page.route('**/admin-api/**', (route) => {
        const req = route.request();
        if (req.method() === 'GET') return route.continue();
        const url = new URL(req.url());
        url.searchParams.set('node', node);
        return route.continue({ url: url.toString() });
    });
}

// 봇 방장 판 (방장 봇이 붙은 서버에서 돎): 입장 → 준비 → 직업 예약 → 시작
async function startGameOn({ hostBot, otherBots, people, roles }) {
    const room = await hostBot.createRoom({ maxPlayers: 1 + otherBots.length + people.length, ...PACE });
    for (const bot of otherBots) await bot.joinByCode(room.roomCode);
    for (const who of people) await ui.joinRoomByCodeUi(who.page, room.roomCode);
    for (const bot of [hostBot, ...otherBots]) await bot.setReady(room.roomId, room.settingsVersion);
    for (const who of people) await ui.readyUi(who.page);
    await e2e.setRoles(roles, { roomId: room.roomId });
    const started = await hostBot.startGame(room.roomId, room.settingsVersion);
    for (const who of people) await expect(who.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    const t = new Table({ room, bots: [hostBot, ...otherBots], humans: people });
    t.gameId = started.gameId;
    const s = await t.state();
    for (const [uuid, role] of Object.entries(roles)) expect(s.players.find((p) => p.uuid === uuid)?.role, `직업 예약 ${uuid}`).toBe(role);
    return t;
}

// 결과판까지 (가는 길을 막는 연출만 넘김)
async function toResult(page) {
    await expect(async () => {
        const skip = page.locator(VIDEO_COVERS).getByRole('button', { name: '건너뛰기' }).first();
        if (await skip.isVisible().catch(() => false)) await skip.click({ timeout: 1000 }).catch(() => {});
        await expect(resultBoard(page)).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 60_000 });
}

test(`${H(7)} 서버 2대: ㄱ서버에서 2로 → 서버별 반영 둘 다 "반영됨" → ㄴ서버 8명 판 끝 결과판 "+2골드" → 1로 되돌림 @game @hard @serial @smoke`, async ({ browser, onNode, bots }) => {
    test.setTimeout(300_000);
    const [near, far] = NODE_IDS;
    const w = await k.openAdmin(browser);
    try {
        await k.adminApi(w.page, 'PUT', '/game-settings', { goldReward: 1 });
        await pinAdminWrites(w.page, near);
        await k.goMenu(w.page, '판 설정');
        const form = w.page.getByRole('form', { name: '판 골드 바꾸기' });
        await form.getByLabel('판마다 주는 골드').fill('2');
        await form.getByRole('button', { name: '바꾸기' }).click();
        const box = k.dialog(w.page, '판 골드를 바꿀까요?');
        await box.getByRole('button', { name: '바꾸기', exact: true }).click();
        await expect(box).toBeHidden();
        const results = w.page.getByRole('region', { name: '서버별 반영', exact: true }).getByRole('listitem');
        await expect(results).toHaveCount(2);
        await expect(results.filter({ hasText: /반영됨$/ })).toHaveCount(2);
        await expect(results.filter({ hasText: '반영 안 됨' })).toHaveCount(0);
        await expectReadable(results.first());

        // 판은 ㄴ서버: 사람 1 + 봇 7 = 8명, 광대 봇이 나가 시민 승으로 끝
        const person = await onNode.person(far, { mobile: false });
        const list = await botsOn(bots, 7, far);
        const [hostBot, jokerBot] = list;
        const t = await startGameOn({
            hostBot, otherBots: list.slice(1), people: [person],
            roles: { [U(person)]: 'CITIZEN', [U(jokerBot)]: 'JOKER' },
        });
        expect((await t.state()).players).toHaveLength(8);
        expect(await gameNodeOf(U(person)), '판이 도는 서버').toBe(far);
        await closeReveals([person.page]);
        const reply = await jokerBot.request('leave_game_session', { gameId: t.gameId });
        expect(reply?.ok, `광대 봇 나가기 ${reply?.code ?? ''}`).toBe(true);
        await toResult(person.page);
        const chip = resultRow(person.page, person.account.nickname).getByTestId('game-result-gold-reward');
        await expect(chip).toHaveText('+2골드');
        await expectReadable(chip);
    } finally {
        await w.page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
        await k.adminApi(w.page, 'PUT', '/game-settings', { goldReward: 1 }).catch(() => {});
        await w.close();
    }
});
