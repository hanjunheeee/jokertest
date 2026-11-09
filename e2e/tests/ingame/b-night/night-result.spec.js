// 밤 결과 시험 파일, 사망 연출(암살 영상·최종 결과 창·사망 후 선택)·아침 알림('낮이 되었습니다')·카드 사망 표시·살아남음·연출 대기 창
// 시민(밤 행동 없음)인 사람이 보는 화면도 여기서 봄
const { test, expect, ui } = require('../../../helpers/fixtures');
const n = require('./_night');

test('광대가 밤에 한 사람을 죽이면 → 아침에 "낮이 되었습니다" 안내가 뜨고 시간 바가 제 2일 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, humanRoles: ['CITIZEN'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? t.bots[1].account.uuid : 'skip' }));
    await n.toNight(t);
    await n.closeNotices(user.page);
    await n.toDay(t, { dayIndex: 2 });
    await expect(user.page.getByRole('dialog', { name: '단계 전환 안내' })).toContainText('낮이 되었습니다', { timeout: 20000 });
    await expect(user.page.getByText('제 2일')).toBeVisible();
});

test('광대가 밤에 죽인 사람 카드는 → 사람 둘의 화면 모두에서 사망 표시로 바뀜 @game', async ({ user, players, table }) => {
    const p2 = await players.add();
    const t = await n.setup(table, { humans: [user, p2], bots: 3, humanRoles: ['CITIZEN', 'CITIZEN'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    await ui.readRoleReveal(p2.page);
    const victim = t.bots[2];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? victim.account.uuid : 'skip' }));
    await n.toDay(t, { dayIndex: 2 });
    await n.expectCard(user.page, victim.nickname, 'dead');
    await n.expectCard(p2.page, victim.nickname, 'dead');
    // 다른 사람 카드는 그대로
    await n.expectCard(user.page, t.bots[1].nickname, 'alive');
    await n.expectCard(p2.page, user.account.nickname, 'alive');
});

test('밤에 죽은 사람 카드가 → 화면 읽기용 "사망" 글자와 해골 배지 그림을 가짐 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, humanRoles: ['CITIZEN'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    const victim = t.bots[1];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? victim.account.uuid : 'skip' }));
    await n.toDay(t, { dayIndex: 2 });
    const card = n.cardStatus(user.page, victim.nickname);
    await expect(card).toHaveAttribute('data-ingame-player-status', 'dead', { timeout: 15000 });
    await expect(card.getByText('사망', { exact: true })).toHaveCount(1);
    await expect(card.locator('img[src*="게임사망상태"], img[src*="%EA%B2%8C%EC%9E%84%EC%82%AC%EB%A7%9D"]')).toHaveCount(1);
});

test('의사 없는 판에서 광대가 나를 죽이면 → 내 화면에 암살 연출 뒤 "최종 결과, 사망했습니다." 창이 뜸 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, humanRoles: ['CITIZEN'], botRoles: ['JOKER'] });
    const me = user.account.uuid;
    await ui.readRoleReveal(user.page);
    await n.recordUi(user.page);
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? me : 'skip' }));
    await n.toDay(t, { dayIndex: 2 });
    await expect.poll(async () => (await n.readUi(user.page)).kills, { timeout: 15000 }).toBeGreaterThan(0);
    await expect.poll(async () => (await n.readUi(user.page)).finals, { timeout: 20000 }).toEqual(['DEAD']);
});

test('광대가 나를 죽이면 → 최종 결과 창을 닫은 뒤 "당신은 사망했습니다." 사망 후 선택 창이 뜸 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, humanRoles: ['CITIZEN'], botRoles: ['JOKER'] });
    const me = user.account.uuid;
    await ui.readRoleReveal(user.page);
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? me : 'skip' }));
    await n.toDay(t, { dayIndex: 2 });
    const choice = user.page.getByRole('dialog', { name: '사망 후 선택' });
    await expect(async () => {
        await n.closeNotices(user.page, { names: ['단계 전환 안내', '밤 조사 결과'] });
        await expect(choice).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 30000 });
    await expect(choice).toContainText('당신은 사망했습니다.');
    await expect(choice.getByRole('button', { name: '관전 계속하기' })).toBeVisible();
    await expect(choice.getByRole('button', { name: '게임 나가기' })).toBeVisible();
});

test('밤에 죽은 내가 관전 계속하기를 누르면 → 창이 닫히고 판 화면에 남아 내 카드가 사망 표시 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, humanRoles: ['CITIZEN'], botRoles: ['JOKER'] });
    const me = user.account.uuid;
    await ui.readRoleReveal(user.page);
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? me : 'skip' }));
    await n.toDay(t, { dayIndex: 2 });
    const choice = user.page.getByRole('dialog', { name: '사망 후 선택' });
    await expect(async () => {
        await n.closeNotices(user.page, { names: ['단계 전환 안내', '밤 조사 결과'] });
        await expect(choice).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 30000 });
    await choice.getByRole('button', { name: '관전 계속하기' }).click();
    await expect(choice).toBeHidden();
    await expect(user.page).toHaveURL(/\/ingame/);
    await n.expectCard(user.page, user.account.nickname, 'dead');
});

test('아무도 죽지 않은 밤이 지나면 → 모든 카드가 생존 표시이고 사망 표시 카드가 없음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.aliveCount(s)).toBe(5);
    await expect(user.page.getByText('제 2일')).toBeVisible();
    await expect(user.page.locator('[data-ingame-player-status="dead"]')).toHaveCount(0);
    await expect(user.page.locator('[data-ingame-player-status="alive"]')).toHaveCount(5);
});

test('밤에 죽은 사람 카드는 → 다음 날 밤·낮이 지나도 계속 사망 표시 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, humanRoles: ['CITIZEN'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    const victim = t.bots[1];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? (ctx) => (ctx.snapshot.dayIndex === 1 ? victim.account.uuid : undefined) : 'skip' }));
    await n.toDay(t, { dayIndex: 3 });
    await expect(user.page.getByText('제 3일')).toBeVisible();
    await n.expectCard(user.page, victim.nickname, 'dead');
    expect(n.rowOf(await t.state(), victim.account.uuid).alive).toBe(false);
});

test('밤에 사람이 죽으면 → 밤 결과 방송에 죽은 사람 id와 광대(JOKER) 원인 사망 공개가 실림 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, humanRoles: ['CITIZEN'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    const victim = t.bots[2];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? victim.account.uuid : 'skip' }));
    await n.toDay(t, { dayIndex: 2 });
    const applied = n.eventsOf(t.bots[1], 'night_result_applied')[0];
    expect(applied).toMatchObject({ phase: 'DAY', dayIndex: 2, victimUuid: victim.account.uuid });
    expect(applied.deathReveals).toEqual([{ victimUuid: victim.account.uuid, source: 'JOKER' }]);
    // 생존 목록엔 역할이 없음
    expect(applied.players.every((p) => Object.keys(p).sort().join(',') === 'alive,uuid')).toBe(true);
});

test('의사가 살린 밤엔 → 밤 결과 방송의 죽은 사람이 없고 사망 공개도 비어 있음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR'] });
    await ui.readRoleReveal(user.page);
    const victim = t.bots[2];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i <= 1 ? victim.account.uuid : 'skip' }));
    await n.toDay(t, { dayIndex: 2 });
    const applied = n.eventsOf(t.bots[0], 'night_result_applied')[0];
    expect(applied.victimUuid).toBeNull();
    expect(applied.deathReveals).toEqual([]);
    await n.expectCard(user.page, victim.nickname, 'alive');
});

test('밤이 끝날 때 → 판정 끝(night_actions_resolved)이 밤 결과(night_result_applied)보다 먼저 옴 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, humanRoles: ['CITIZEN'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toDay(t, { dayIndex: 2 });
    const names = t.bots[1].events.map((r) => r.event).filter((e) => e === 'night_actions_resolved' || e === 'night_result_applied');
    expect(names).toEqual(['night_actions_resolved', 'night_result_applied']);
});

test('광대가 고른 뒤 의사 차례 동안엔 → 노린 사람 카드가 아직 생존이고 아침에야 사망으로 바뀜 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR'] });
    await ui.readRoleReveal(user.page);
    const victim = t.bots[2];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? victim.account.uuid : 'skip' }));
    await n.toTurn(t, 'DOCTOR');
    expect((await t.player(victim.account.uuid)).alive).toBe(true);
    await n.expectCard(user.page, victim.nickname, 'alive');
    await n.toDay(t, { dayIndex: 2 });
    await n.expectCard(user.page, victim.nickname, 'dead');
});

test('광대가 다른 사람을 죽이는 밤에 구경하는 시민인 나에겐 → 암살 영상은 안 뜨고 "진행을 기다리는 중입니다." 대기 창만 뜸 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR'] });
    await ui.readRoleReveal(user.page);
    await n.recordUi(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    expect(await n.botNight(t, t.bots[0], t.bots[2].account.uuid)).toMatchObject({ ok: true });
    await expect(user.page.getByText('진행을 기다리는 중입니다.')).toBeVisible({ timeout: 10000 });
    await n.toDay(t, { dayIndex: 2 });
    await expect(user.page.getByText('진행을 기다리는 중입니다.')).toBeHidden();
    const rec = await n.readUi(user.page);
    expect(rec.kills).toBe(0);
    expect(rec.waits).toBeGreaterThan(0);
});

test('연출 대기 창이 떠 있다가 → 단계 넘기기로 대기가 풀리면 창이 닫히고 의사 차례가 열림 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    await n.botNight(t, t.bots[0], t.bots[2].account.uuid);
    const wait = user.page.getByText('진행을 기다리는 중입니다.');
    await expect(wait).toBeVisible({ timeout: 10000 });
    await n.toTurn(t, 'DOCTOR');
    await expect(wait).toBeHidden({ timeout: 10000 });
    await expect(user.page.getByText('[밤-의사]', { exact: true }).first()).toBeVisible();
});

test('밤에 죽은 뒤 새로고침해도 → 죽은 사람 카드는 사망 표시 그대로 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, humanRoles: ['CITIZEN'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    const victim = t.bots[2];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? victim.account.uuid : 'skip' }));
    await n.toDay(t, { dayIndex: 2 });
    await n.expectCard(user.page, victim.nickname, 'dead');
    await user.page.reload();
    await n.expectCard(user.page, victim.nickname, 'dead', 25000);
    await n.expectCard(user.page, user.account.nickname, 'alive');
});

test('사람 둘 중 광대에게 죽은 사람에게만 → 사망 후 선택 창이 뜨고 산 사람 화면엔 안 뜸 @game', async ({ user, players, table }) => {
    const p2 = await players.add();
    const t = await n.setup(table, { humans: [user, p2], bots: 3, humanRoles: ['CITIZEN', 'CITIZEN'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    await ui.readRoleReveal(p2.page);
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? p2.account.uuid : 'skip' }));
    await n.toDay(t, { dayIndex: 2 });
    const choice2 = p2.page.getByRole('dialog', { name: '사망 후 선택' });
    await expect(async () => {
        await n.closeNotices(p2.page, { names: ['단계 전환 안내', '밤 조사 결과'] });
        await expect(choice2).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 30000 });
    await n.closeNotices(user.page, { names: ['단계 전환 안내'] });
    await n.sleep(1000);
    await expect(user.page.getByRole('dialog', { name: '사망 후 선택' })).toHaveCount(0);
});

test('밤 하나에 → 광대가 둘이어도 죽는 사람은 많아야 한 명 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom({ JOKER: 2 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i <= 1 ? 'random' : 'skip' }));
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.aliveCount(s)).toBeGreaterThanOrEqual(5);
});

test('밤이 끝나 낮이 되면 → 낮은 토론부터 시작하고 시간 바가 [낮-토론과 투표] @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, humanRoles: ['CITIZEN'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip', readyForVote: false });
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(s.dayPhase).toBe('DAY_DISCUSSION');
    await n.closeNotices(user.page);
    await expect(user.page.getByText('[낮-토론과 투표]', { exact: true }).first()).toBeVisible();
});

// 시민 (밤 행동 없음)
test('시민인 나는 밤에 아무것도 안 해도 → 밤 차례들이 끝나고 다음 날이 옴 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR'] });
    await ui.readRoleReveal(user.page);
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i <= 1 ? t.bots[2].account.uuid : 'skip' }));
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(s.phase).toBe('DAY');
    // 내 스냅샷엔 밤 행동 칸이 안 생김
    expect(n.turnOrder(t.bots[2], 1)).toEqual(['JOKER', 'DOCTOR']);
});

test('시민인 내 화면엔 → 다른 직업 차례 안내(광대·의사·경비원)가 차례대로 다 뜸 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, DOCTOR: 1, GUARD: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR', 'GUARD'] });
    await ui.readRoleReveal(user.page);
    await n.recordUi(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toDay(t, { dayIndex: 2, stepDelayMs: 1300 });
    await expect.poll(async () => (await n.readUi(user.page)).turns).toEqual(['JOKER', 'DOCTOR', 'GUARD']);
});

test('시민인 내 역할 공개 창엔 → 시민으로 나오고 밤 행동 버튼 이름(암살·보호·조사·확인)이 어디에도 없음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, humanRoles: ['CITIZEN'], botRoles: ['JOKER'] });
    expect(await ui.readRoleReveal(user.page)).toBe('시민');
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    await n.closeNotices(user.page);
    for (const label of ['암살', '보호', '조사']) {
        await expect(user.page.getByRole('menuitem', { name: label, exact: true })).toHaveCount(0);
    }
    await expect(n.skipButton(user.page)).toHaveCount(0);
});
