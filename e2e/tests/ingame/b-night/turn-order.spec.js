// 밤 차례 순서·차례 안내 창 시험 파일, 직업 구성마다 광대 → 의사 → 경비원 → 마녀사냥꾼(둘째 밤부터) 순서로 열리는지 서버 사건·화면 안내 둘 다 봄
// 사람 1명(시민·관찰)은 화면 기록(recordUi)으로 '○○의 시간입니다' 창 순서를 적고, 봇은 전부 밤 행동 안 함(차례는 단계 넘기기로 마감)
const { test, expect, ui } = require('../../../helpers/fixtures');
const n = require('./_night');

const label = (list) => list.map((r) => n.ROLE_NAMES[r]).join('→');

// 직접 구성 판: 첫 밤 차례 순서
const CUSTOM_FIRST_NIGHT = [
    { name: '광대 1명만 있는 4인', counts: { JOKER: 1 }, bots: 3, order: ['JOKER'] },
    { name: '광대·의사 4인', counts: { JOKER: 1, DOCTOR: 1 }, bots: 3, order: ['JOKER', 'DOCTOR'] },
    { name: '광대·경비원 4인', counts: { JOKER: 1, GUARD: 1 }, bots: 3, order: ['JOKER', 'GUARD'] },
    { name: '광대·의사·경비원 5인', counts: { JOKER: 1, DOCTOR: 1, GUARD: 1 }, bots: 4, order: ['JOKER', 'DOCTOR', 'GUARD'] },
    { name: '광대·마녀사냥꾼 4인', counts: { JOKER: 1, WITCH_HUNTER: 1 }, bots: 3, order: ['JOKER'] },
    { name: '네 직업 다 있는 6인', counts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 }, bots: 5, order: ['JOKER', 'DOCTOR', 'GUARD'] },
    { name: '광대 2명·의사 6인', counts: { JOKER: 2, DOCTOR: 1 }, bots: 5, order: ['JOKER', 'DOCTOR'] },
    { name: '의사 2명·광대 1명 5인', counts: { JOKER: 1, DOCTOR: 2 }, bots: 4, order: ['JOKER', 'DOCTOR'] },
    { name: '경비원 2명·마녀사냥꾼 1명 6인', counts: { JOKER: 1, GUARD: 2, WITCH_HUNTER: 1 }, bots: 5, order: ['JOKER', 'GUARD'] },
    { name: '의사·마녀사냥꾼 5인', counts: { JOKER: 1, DOCTOR: 1, WITCH_HUNTER: 1 }, bots: 4, order: ['JOKER', 'DOCTOR'] },
];

for (const c of CUSTOM_FIRST_NIGHT) {
    test(`${c.name} 판에서 첫 밤이 되면 → 밤 차례가 ${label(c.order)} 순서로 열리고 화면 안내 창도 같은 순서 @game`, async ({ user, table }) => {
        const t = await n.setup(table, { humans: [user], bots: c.bots, settings: n.custom(c.counts), humanRoles: ['CITIZEN'] });
        await ui.readRoleReveal(user.page);
        await n.recordUi(user.page);
        t.playBots({ dayVote: 'abstain', night: 'skip' });
        await n.toDay(t, { dayIndex: 2, stepDelayMs: 1300 });
        expect(n.turnOrder(t.bots[0], 1)).toEqual(c.order);
        await expect.poll(async () => (await n.readUi(user.page)).turns).toEqual(c.order);
    });
}

// 둘째 밤: 마녀사냥꾼 차례가 맨 끝에 붙음
const CUSTOM_SECOND_NIGHT = [
    { name: '광대·마녀사냥꾼 4인', counts: { JOKER: 1, WITCH_HUNTER: 1 }, bots: 3, order: ['JOKER', 'WITCH_HUNTER'] },
    { name: '네 직업 다 있는 6인', counts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 }, bots: 5, order: ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'] },
    { name: '광대·의사·마녀사냥꾼 5인', counts: { JOKER: 1, DOCTOR: 1, WITCH_HUNTER: 1 }, bots: 4, order: ['JOKER', 'DOCTOR', 'WITCH_HUNTER'] },
    { name: '광대·경비원·마녀사냥꾼 5인', counts: { JOKER: 1, GUARD: 1, WITCH_HUNTER: 1 }, bots: 4, order: ['JOKER', 'GUARD', 'WITCH_HUNTER'] },
    { name: '광대·의사·경비원(마녀사냥꾼 없음) 5인', counts: { JOKER: 1, DOCTOR: 1, GUARD: 1 }, bots: 4, order: ['JOKER', 'DOCTOR', 'GUARD'] },
];

for (const c of CUSTOM_SECOND_NIGHT) {
    test(`${c.name} 판에서 둘째 밤이 되면 → 밤 차례가 ${label(c.order)} 순서로 열림 @game`, async ({ user, table }) => {
        const t = await n.setup(table, { humans: [user], bots: c.bots, settings: n.custom(c.counts), humanRoles: ['CITIZEN'] });
        await ui.readRoleReveal(user.page);
        await n.recordUi(user.page);
        t.playBots({ dayVote: 'abstain', night: 'skip' });
        await n.toDay(t, { dayIndex: 2 });
        await n.toDay(t, { dayIndex: 3, stepDelayMs: 1300 });
        expect(n.turnOrder(t.bots[0], 2)).toEqual(c.order);
        const rec = await n.readUi(user.page);
        // 화면 기록은 두 밤치가 이어 붙음 → 뒤쪽이 둘째 밤
        expect(rec.turns.slice(-c.order.length)).toEqual(c.order);
    });
}

// 자동 구성: 인원·광대 수에 따라 6명부터 의사, 8명 경비원, 10명 마녀사냥꾼
const AUTO = [
    { players: 5, jokers: 1, order: ['JOKER'] },
    { players: 6, jokers: 1, order: ['JOKER', 'DOCTOR'] },
    { players: 7, jokers: 2, order: ['JOKER', 'DOCTOR'] },
    { players: 8, jokers: 1, order: ['JOKER', 'DOCTOR', 'GUARD'] },
    { players: 9, jokers: 2, order: ['JOKER', 'DOCTOR', 'GUARD'] },
    { players: 10, jokers: 1, order: ['JOKER', 'DOCTOR', 'GUARD'] },
    { players: 5, jokers: 2, order: ['JOKER'] },
    { players: 6, jokers: 2, order: ['JOKER', 'DOCTOR'] },
    { players: 7, jokers: 1, order: ['JOKER', 'DOCTOR'] },
    { players: 8, jokers: 2, order: ['JOKER', 'DOCTOR', 'GUARD'] },
    { players: 9, jokers: 1, order: ['JOKER', 'DOCTOR', 'GUARD'] },
    { players: 10, jokers: 2, order: ['JOKER', 'DOCTOR', 'GUARD'] },
];

for (const c of AUTO) {
    test(`자동 구성 ${c.players}인·광대 ${c.jokers}명 판에서 첫 밤이 되면 → 차례가 ${label(c.order)} 순서 @game`, async ({ user, table }) => {
        const t = await n.setup(table, { humans: [user], bots: c.players - 1, settings: { jokerCount: c.jokers }, humanRoles: ['CITIZEN'] });
        await ui.readRoleReveal(user.page);
        t.playBots({ dayVote: 'abstain', night: 'skip' });
        await n.toDay(t, { dayIndex: 2 });
        expect(n.turnOrder(t.bots[0], 1)).toEqual(c.order);
    });
}

test('자동 구성 10인 판에서 둘째 밤이 되면 → 마녀사냥꾼 차례까지 네 차례가 열림 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 9, settings: { jokerCount: 2 }, humanRoles: ['CITIZEN'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toDay(t, { dayIndex: 3 });
    expect(n.turnOrder(t.bots[0], 1)).toEqual(['JOKER', 'DOCTOR', 'GUARD']);
    expect(n.turnOrder(t.bots[0], 2)).toEqual(['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER']);
});

// 내 직업 차례 안내 글
const OWN_TURN = [
    { role: 'JOKER', counts: { JOKER: 1, DOCTOR: 1 }, night: 1 },
    { role: 'DOCTOR', counts: { JOKER: 1, DOCTOR: 1 }, night: 1 },
    { role: 'GUARD', counts: { JOKER: 1, GUARD: 1 }, night: 1 },
    { role: 'WITCH_HUNTER', counts: { JOKER: 1, WITCH_HUNTER: 1 }, night: 2 },
];

for (const c of OWN_TURN) {
    test(`${n.ROLE_NAMES[c.role]}인 내 차례가 오면 → '${n.TURN_MESSAGES[c.role]}' 안내 창이 뜨고 시간 바에 ${n.TURN_TAGS[c.role]} 표시 @game`, async ({ user, table }) => {
        const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom(c.counts), humanRoles: [c.role] });
        await ui.readRoleReveal(user.page);
        t.playBots({ dayVote: 'abstain', night: 'skip' });
        await n.toTurn(t, c.role, { dayIndex: c.night });
        const dialog = user.page.getByRole('dialog', { name: '밤 역할 안내' });
        await expect(async () => {
            await n.closeNotices(user.page, { names: ['단계 전환 안내'] });
            await expect(dialog).toContainText(n.TURN_MESSAGES[c.role], { timeout: 1000 });
        }).toPass({ timeout: 20000 });
        await expect(dialog).toContainText('밤이 깊어갑니다');
        await expect(user.page.getByText(n.TURN_TAGS[c.role], { exact: true }).first()).toBeVisible();
    });
}

test('밤이 되면 → "밤이 되었습니다"를 확인하기 전에는 차례 안내 창이 안 뜨고, 확인하면 광대 차례 안내가 뜸 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['CITIZEN'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    // 낮 안내는 닫아 둠
    await n.toDay(t, { dayIndex: 1 });
    await expect(user.page.getByRole('dialog', { name: '단계 전환 안내' })).toContainText('낮이 되었습니다');
    await n.closeNotices(user.page, { names: ['단계 전환 안내'] });
    await n.toTurn(t, 'JOKER');
    const entrance = user.page.getByRole('dialog', { name: '단계 전환 안내' });
    await expect(entrance).toContainText('밤이 되었습니다');
    await n.sleep(1500);
    await expect(user.page.getByRole('dialog', { name: '밤 역할 안내' })).toHaveCount(0);
    await entrance.getByRole('button', { name: '확인' }).click();
    await expect(user.page.getByRole('dialog', { name: '밤 역할 안내' })).toContainText('광대의 시간입니다');
});

test('차례 안내 창을 그냥 두면 → 3초쯤 뒤 저절로 닫힘 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['CITIZEN'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    const dialog = user.page.getByRole('dialog', { name: '밤 역할 안내' });
    await expect(async () => {
        await n.closeNotices(user.page, { names: ['단계 전환 안내'] });
        await expect(dialog).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 20000 });
    await expect(dialog).toBeHidden({ timeout: 6000 });
    // 차례는 그대로 광대
    expect((await t.state()).nightTurnRole).toBe('JOKER');
});

test('차례 안내 창의 확인을 누르면 → 바로 닫히고 밤 화면이 보임 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, GUARD: 1 }), humanRoles: ['CITIZEN'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    const dialog = user.page.getByRole('dialog', { name: '밤 역할 안내' });
    await expect(async () => {
        await n.closeNotices(user.page, { names: ['단계 전환 안내'] });
        await expect(dialog).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 20000 });
    await dialog.getByRole('button', { name: '확인' }).click();
    await expect(dialog).toBeHidden({ timeout: 1500 });
    await expect(user.page.getByText('[밤-광대]', { exact: true }).first()).toBeVisible();
});

test('광대 차례가 끝나 의사 차례가 되면 → 시간 바 표시가 [밤-광대]에서 [밤-의사]로 바뀜 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['CITIZEN'] });
    await ui.readRoleReveal(user.page);
    await n.recordUi(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    await expect(user.page.getByText('[밤-광대]', { exact: true }).first()).toBeVisible();
    await n.toTurn(t, 'DOCTOR');
    await expect(user.page.getByText('[밤-의사]', { exact: true }).first()).toBeVisible();
    await expect(user.page.getByText('[밤-광대]', { exact: true })).toHaveCount(0);
});

test('밤 차례가 열리면 → 화면 타이머가 보이고 서버 마감 시각은 밤 행동 시간(30초) 뒤 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['CITIZEN'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    const started = n.eventsOf(t.bots[0], 'night_turn_started').find((p) => p.role === 'JOKER');
    const startedAt = t.bots[0].events.find((r) => r.event === 'night_turn_started').at;
    expect(started.deadline - startedAt).toBeGreaterThan(27000);
    expect(started.deadline - startedAt).toBeLessThanOrEqual(31000);
    await expect(user.page.getByRole('timer').first()).toBeVisible();
});

test('밤 행동 시간을 60초로 정한 방이면 → 밤 차례 마감 시각이 60초 뒤 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, DOCTOR: 1 }, { nightActionTime: 60 }), humanRoles: ['CITIZEN'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    const row = t.bots[0].events.find((r) => r.event === 'night_turn_started');
    expect(row.payload.deadline - row.at).toBeGreaterThan(57000);
    expect(row.payload.deadline - row.at).toBeLessThanOrEqual(61000);
});

test('직업별 밤 시간을 의사만 90초로 정하면 → 광대 차례는 30초, 의사 차례는 90초 마감 @game', async ({ user, table }) => {
    const t = await n.setup(table, {
        humans: [user], bots: 3,
        settings: n.custom({ JOKER: 1, DOCTOR: 1 }, { roleNightActionTimes: { DOCTOR: 90 } }),
        humanRoles: ['CITIZEN'],
    });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'DOCTOR');
    const rows = t.bots[0].events.filter((r) => r.event === 'night_turn_started');
    const joker = rows.find((r) => r.payload.role === 'JOKER');
    const doctor = rows.find((r) => r.payload.role === 'DOCTOR');
    expect(joker.payload.deadline - joker.at).toBeLessThanOrEqual(31000);
    expect(doctor.payload.deadline - doctor.at).toBeGreaterThan(87000);
});

test('차례가 끝날 때마다 → 서버가 차례 끝 사건을 보내고 다음 차례가 열림 (시작·끝이 짝을 이룸) @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, DOCTOR: 1, GUARD: 1 }), humanRoles: ['CITIZEN'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toDay(t, { dayIndex: 2 });
    const seq = t.bots[0].events
        .filter((r) => (r.event === 'night_turn_started' || r.event === 'night_turn_ended') && r.payload.dayIndex === 1)
        .map((r) => `${r.event === 'night_turn_started' ? '시작' : '끝'}:${r.payload.role}`);
    expect(seq).toEqual(['시작:JOKER', '끝:JOKER', '시작:DOCTOR', '끝:DOCTOR', '시작:GUARD', '끝:GUARD']);
});
