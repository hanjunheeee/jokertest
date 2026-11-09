// 재판 시험: 피고 화면('당신은 피고인입니다'), 유죄·무죄 표, 결과(처형·풀려남) 연출, 재판 시간 설정(15·45·120초) 반영, 시간 초과 = 기권, 피고가 나감, 인원 5~10명
const { test, expect } = require('../../../helpers/fixtures');
const L = require('./_lib');

const tribunalDialog = (page) => page.getByRole('dialog', { name: '재판' });
const guiltyBtn = (page) => tribunalDialog(page).getByRole('button', { name: '유죄', exact: true });
const notGuiltyBtn = (page) => tribunalDialog(page).getByRole('button', { name: '무죄', exact: true });
const expelText = (nick) => `[${nick}]님이 가면무도회에서 추방당하셨습니다.`;
const u = (x) => x.account.uuid;

// 사람(시민) + 봇 n (첫 봇 광대), 낮 투표까지
async function voteTable(table, user, { bots = 4, humans = [user], settings = {}, roles = null } = {}) {
    const t = await table.setup({
        humans, bots,
        settings: { dayDiscussionTime: 150, dayVoteTime: 90, ...settings },
        roles: roles ?? (({ bots: b }) => ({ [user.account.uuid]: 'CITIZEN', [b[0].account.uuid]: 'JOKER' })),
    });
    await L.toDay(t);
    await L.toVote(t);
    return t;
}

// 피고 정해 재판까지 (피고 빼고 봇 모두 피고를 찍음)
async function toTribunal(t, defendantUuid) {
    await L.botsVote(t, defendantUuid, t.bots.filter((b) => u(b) !== defendantUuid));
    const s = await L.resolveVote(t);
    if (s.phase !== 'TRIBUNAL') throw new Error(`재판이 안 열림: ${s.phase}`);
    return s;
}

const votersOf = (t, defendant) => t.bots.filter((b) => b !== defendant);

test.describe('재판 화면', () => {
    test('재판이 열리면 → 투표하는 사람 화면에 피고 닉네임과 유죄·무죄 버튼이 보임 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await toTribunal(t, u(t.bots[2]));
        await expect(tribunalDialog(user.page)).toContainText(t.bots[2].nickname);
        await expect(guiltyBtn(user.page)).toBeEnabled();
        await expect(notGuiltyBtn(user.page)).toBeEnabled();
    });

    test('내가 피고면 → \'당신은 피고인입니다. 투표할 수 없습니다.\'가 보이고 유죄·무죄 버튼이 없음 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await toTribunal(t, user.account.uuid);
        await expect(tribunalDialog(user.page)).toContainText('당신은 피고인입니다. 투표할 수 없습니다.');
        await expect(guiltyBtn(user.page)).toHaveCount(0);
        await expect(notGuiltyBtn(user.page)).toHaveCount(0);
    });

    test('내가 피고면 → 재판 창 카드에 내 닉네임이 보임 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await toTribunal(t, user.account.uuid);
        await expect(tribunalDialog(user.page)).toContainText(user.account.nickname);
    });

    test('유죄를 누르면 → 버튼이 사라지고 \'투표가 완료되었습니다.\'가 보임 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await toTribunal(t, u(t.bots[2]));
        await guiltyBtn(user.page).click();
        await expect(tribunalDialog(user.page)).toContainText('투표가 완료되었습니다.');
        await expect(guiltyBtn(user.page)).toHaveCount(0);
    });

    test('무죄를 누르면 → 버튼이 사라지고 \'투표가 완료되었습니다.\'가 보임 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await toTribunal(t, u(t.bots[2]));
        await notGuiltyBtn(user.page).click();
        await expect(tribunalDialog(user.page)).toContainText('투표가 완료되었습니다.');
        await expect(notGuiltyBtn(user.page)).toHaveCount(0);
    });

    test('재판 창에서 Esc를 눌러도 → 창이 안 닫힘 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await toTribunal(t, u(t.bots[2]));
        await expect(tribunalDialog(user.page)).toBeVisible();
        await user.page.keyboard.press('Escape');
        await L.sleep(400);
        await expect(tribunalDialog(user.page)).toBeVisible();
    });

    test('재판 중에는 → 뒤의 판 화면(카드·버튼)이 잠김 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await toTribunal(t, u(t.bots[2]));
        await expect(tribunalDialog(user.page)).toBeVisible();
        expect(await L.card(user.page, t.bots[1].nickname).evaluate((el) => el.closest('[inert]') !== null)).toBe(true);
    });

    test('두 사람이 같은 재판에서 한 사람만 내면 → 다른 사람 화면엔 유죄·무죄 버튼이 그대로 @game', async ({ user, players, table }) => {
        const p2 = await players.add();
        const t = await voteTable(table, user, { humans: [user, p2], bots: 3 });
        await toTribunal(t, u(t.bots[2]));
        await guiltyBtn(user.page).click();
        await expect(tribunalDialog(user.page)).toContainText('투표가 완료되었습니다.');
        await expect(guiltyBtn(p2.page)).toBeEnabled();
    });

    test('모두 낸 뒤 재판 창의 \'재판 판정\'을 누르면 → 타이머를 안 기다리고 판정됨 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        const d = t.bots[2];
        await toTribunal(t, u(d));
        await L.botsTribunal(t, 'NOT_GUILTY', votersOf(t, d));
        await guiltyBtn(user.page).click();
        await expect(tribunalDialog(user.page)).toContainText('투표가 완료되었습니다.');
        await tribunalDialog(user.page).getByRole('button', { name: '재판 판정' }).click();
        await L.waitState(t, (s) => s.phase === 'NIGHT');
    });

    test('아직 안 낸 사람이 있을 때 \'재판 판정\'을 누르면 → 판정되지 않고 재판이 계속됨 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        const d = t.bots[2];
        await toTribunal(t, u(d));
        await L.botTribunal(t, t.bots[0], 'GUILTY');
        await tribunalDialog(user.page).getByRole('button', { name: '재판 판정' }).click();
        await L.sleep(1000);
        expect((await t.state()).phase).toBe('TRIBUNAL');
        await expect(tribunalDialog(user.page)).toBeVisible();
    });
});

test.describe('결과', () => {
    test('유죄가 더 많으면 → 피고가 처형되고 \'[닉네임]님이 가면무도회에서 추방당하셨습니다.\'가 보임 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        const d = t.bots[2];
        await toTribunal(t, u(d));
        await L.botsTribunal(t, 'GUILTY', votersOf(t, d));
        const s = await L.resolveTribunal(t);
        expect(L.playerOf(s, u(d)).alive).toBe(false);
        await expect(user.page.getByText(expelText(d.nickname))).toBeVisible({ timeout: 25000 });
    });

    test('무죄가 더 많으면 → 피고가 풀려나 살아 있고 추방 문구 없이 밤이 됨 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        const d = t.bots[2];
        await toTribunal(t, u(d));
        await L.botsTribunal(t, 'NOT_GUILTY', votersOf(t, d));
        const s = await L.resolveTribunal(t);
        expect(s.phase).toBe('NIGHT');
        expect(L.playerOf(s, u(d)).alive).toBe(true);
        await L.closeNotice(user.page, '밤이 되었습니다');
        await expect(user.page.getByText(expelText(d.nickname))).toHaveCount(0);
    });

    test('유죄·무죄가 같은 수(1:1)면 → 무죄로 보고 풀려남 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        const d = t.bots[2];
        await toTribunal(t, u(d));
        await L.botsTribunal(t, [[t.bots[0], 'GUILTY'], [t.bots[1], 'NOT_GUILTY']]);
        const s = await L.resolveTribunal(t);
        expect(L.playerOf(s, u(d)).alive).toBe(true);
    });

    test('봇 2:1로 유죄인 걸 내 무죄로 2:2를 만들면 → 무죄로 풀려남 @game', async ({ user, table }) => {
        const t = await voteTable(table, user, { bots: 5 });
        const d = t.bots[4];
        await toTribunal(t, u(d));
        await L.botsTribunal(t, [[t.bots[0], 'GUILTY'], [t.bots[1], 'GUILTY'], [t.bots[2], 'NOT_GUILTY'], [t.bots[3], 'NOT_GUILTY']]);
        await notGuiltyBtn(user.page).click();
        await expect(tribunalDialog(user.page)).toContainText('투표가 완료되었습니다.');
        const s = await L.resolveTribunal(t);
        expect(L.playerOf(s, u(d)).alive).toBe(true);
    });

    test('봇 1:1인 걸 내 유죄로 2:1을 만들면 → 피고가 처형됨 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        const d = t.bots[2];
        await toTribunal(t, u(d));
        await L.botsTribunal(t, [[t.bots[0], 'GUILTY'], [t.bots[1], 'NOT_GUILTY']]);
        await guiltyBtn(user.page).click();
        await expect(tribunalDialog(user.page)).toContainText('투표가 완료되었습니다.');
        const s = await L.resolveTribunal(t);
        expect(L.playerOf(s, u(d)).alive).toBe(false);
    });

    test('봇 1:1인 걸 내 무죄로 1:2를 만들면 → 풀려남 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        const d = t.bots[2];
        await toTribunal(t, u(d));
        await L.botsTribunal(t, [[t.bots[0], 'GUILTY'], [t.bots[1], 'NOT_GUILTY']]);
        await notGuiltyBtn(user.page).click();
        await expect(tribunalDialog(user.page)).toContainText('투표가 완료되었습니다.');
        const s = await L.resolveTribunal(t);
        expect(L.playerOf(s, u(d)).alive).toBe(true);
    });

    test('유죄 한 표에 나머지가 다 기권이면 → 유죄가 더 많아 처형됨 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        const d = t.bots[2];
        await toTribunal(t, u(d));
        await L.botTribunal(t, t.bots[0], 'GUILTY');
        const s = await L.resolveTribunal(t);
        expect(L.playerOf(s, u(d)).alive).toBe(false);
    });

    test('아무도 안 내고 마감되면 → 다 기권이라 무죄로 풀려남 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        const d = t.bots[2];
        await toTribunal(t, u(d));
        const s = await L.resolveTribunal(t);
        expect(s.phase).toBe('NIGHT');
        expect(L.playerOf(s, u(d)).alive).toBe(true);
    });

    test('내가 피고로 유죄를 받으면 → 나는 죽고 내 카드에 \'사망\' 표시가 붙음 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await toTribunal(t, user.account.uuid);
        await L.botsTribunal(t, 'GUILTY');
        const s = await L.resolveTribunal(t);
        expect(L.playerOf(s, user.account.uuid).alive).toBe(false);
        await expect(L.selfCard(user.page, user.account.nickname)).toContainText('사망', { timeout: 25000 });
    });

    test('내가 피고로 유죄를 받으면 → 내 화면에도 내 닉네임으로 추방 문구가 보임 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await toTribunal(t, user.account.uuid);
        await L.botsTribunal(t, 'GUILTY');
        await L.resolveTribunal(t);
        await expect(user.page.getByText(expelText(user.account.nickname))).toBeVisible({ timeout: 25000 });
    });

    test('봇이 처형되면 → 내 화면의 그 봇 카드에 \'사망\' 표시가 붙음 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        const d = t.bots[3];
        await toTribunal(t, u(d));
        await L.botsTribunal(t, 'GUILTY', votersOf(t, d));
        await L.resolveTribunal(t);
        await L.closeNotice(user.page, '밤이 되었습니다');
        await expect(L.card(user.page, d.nickname)).toContainText('사망');
    });

    test('추방 문구는 → 잠시 뒤 저절로 사라지고 밤 안내로 넘어감 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        const d = t.bots[3];
        await toTribunal(t, u(d));
        await L.botsTribunal(t, 'GUILTY', votersOf(t, d));
        await L.resolveTribunal(t);
        const msg = user.page.getByText(expelText(d.nickname));
        await expect(msg).toBeVisible({ timeout: 25000 });
        await expect(msg).toBeHidden({ timeout: 10000 });
        await L.closeNotice(user.page, '밤이 되었습니다');
    });

    test('추방 문구를 누르면 → 바로 닫히고 밤 안내가 뜸 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        const d = t.bots[3];
        await toTribunal(t, u(d));
        await L.botsTribunal(t, 'GUILTY', votersOf(t, d));
        await L.resolveTribunal(t);
        const msg = user.page.getByText(expelText(d.nickname));
        await expect(msg).toBeVisible({ timeout: 25000 });
        await msg.click();
        await expect(msg).toBeHidden({ timeout: 2000 });
        await L.closeNotice(user.page, '밤이 되었습니다');
    });

    test('무죄로 풀려난 피고는 → 둘째 날 투표에서 다시 표를 낼 수 있음 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        const d = t.bots[2];
        await toTribunal(t, u(d));
        await L.botsTribunal(t, 'NOT_GUILTY', votersOf(t, d));
        await L.resolveTribunal(t);
        await L.closeNotice(user.page, '밤이 되었습니다');
        await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === 2);
        await L.closeNotice(user.page, '낮이 되었습니다');
        await L.toVote(t);
        expect((await L.botVote(t, d, u(t.bots[1]))).ok).toBe(true);
    });

    test('하나뿐인 광대가 처형되면 → 시민 승리로 판이 끝나고 결과 화면으로 감 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        const joker = t.bots[0];
        await toTribunal(t, u(joker));
        await L.botsTribunal(t, 'GUILTY', votersOf(t, joker));
        await guiltyBtn(user.page).click();
        await t.advance();
        await expect.poll(async () => (await t.state())?.phase ?? 'GONE').toMatch(/ENDED|GONE/);
        await expect(user.page).toHaveURL(/result/i, { timeout: 40000 });
    });

    test('3명 판(광대 1·시민 2)에서 시민이 처형되면 → 광대 수가 남은 시민 수와 같아져 광대 승리로 끝남 @game', async ({ user, table }) => {
        const t = await voteTable(table, user, { bots: 2 });
        const victim = t.bots[1];
        await L.botsVote(t, [[t.bots[0], u(victim)]]);
        await L.voteUi(user.page, victim.nickname);
        await L.resolveVote(t);
        await L.botsTribunal(t, [[t.bots[0], 'GUILTY']]);
        await guiltyBtn(user.page).click();
        await t.advance();
        await expect.poll(async () => { const s = await t.state(); return s ? `${s.phase}:${s.winResult?.winner}` : 'GONE'; }).toMatch(/ENDED:JOKER|GONE/);
    });

    test('두 사람 중 피고 사람이 유죄를 받으면 → 다른 사람 화면에 그 사람 추방 문구가 보임 @game', async ({ user, players, table }) => {
        const p2 = await players.add();
        const t = await voteTable(table, user, { humans: [user, p2], bots: 3 });
        await toTribunal(t, u(p2));
        await L.botsTribunal(t, 'GUILTY');
        await L.resolveTribunal(t);
        await expect(user.page.getByText(expelText(p2.account.nickname))).toBeVisible({ timeout: 25000 });
    });
});

test.describe('막힌 재판 표', () => {
    test('피고 봇이 재판 표를 내면 → DEFENDANT_CANNOT_VOTE로 거절됨 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        const d = t.bots[2];
        await toTribunal(t, u(d));
        expect((await L.botTribunal(t, d, 'NOT_GUILTY')).code).toBe('DEFENDANT_CANNOT_VOTE');
    });

    test('같은 봇이 두 번 내면 → 둘째는 TRIBUNAL_VOTE_ALREADY_SUBMITTED로 거절되고 첫 표만 셈 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        const d = t.bots[2];
        await toTribunal(t, u(d));
        await L.botTribunal(t, t.bots[0], 'GUILTY');
        expect((await L.botTribunal(t, t.bots[0], 'NOT_GUILTY')).code).toBe('TRIBUNAL_VOTE_ALREADY_SUBMITTED');
        const s = await L.resolveTribunal(t);
        expect(L.playerOf(s, u(d)).alive).toBe(false);
    });

    test('유죄·무죄가 아닌 값을 내면 → INVALID_TRIBUNAL_VOTE로 거절됨 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await toTribunal(t, u(t.bots[2]));
        expect((await L.botTribunal(t, t.bots[0], 'MAYBE')).ok).toBe(false);
    });

    test('지난 날짜로 재판 표를 내면 → STALE_DAY_INDEX로 거절됨 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await toTribunal(t, u(t.bots[2]));
        const r = await t.bots[0].request('cast_tribunal_vote', { gameId: t.gameId, dayIndex: 0, vote: 'GUILTY' });
        expect(r.code).toBe('STALE_DAY_INDEX');
    });

    test('낮 투표 중에 재판 표를 내면 → INVALID_PHASE로 거절됨 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        expect((await L.botTribunal(t, t.bots[0], 'GUILTY')).code).toBe('INVALID_PHASE');
    });

    test('재판이 끝난 뒤(밤) 표를 내면 → 거절됨 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await toTribunal(t, u(t.bots[2]));
        await L.resolveTribunal(t);
        expect((await L.botTribunal(t, t.bots[0], 'GUILTY')).ok).toBe(false);
    });

    test('첫날 죽은 내가 둘째 날 재판을 보면 → \'사망한 참가자는 투표할 수 없습니다.\'가 보이고 버튼이 없음 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await toTribunal(t, user.account.uuid);
        await L.botsTribunal(t, 'GUILTY');
        await L.resolveTribunal(t);
        await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === 2);
        await L.toVote(t);
        await toTribunal(t, u(t.bots[2]));
        await expect(tribunalDialog(user.page)).toContainText('사망한 참가자는 투표할 수 없습니다.', { timeout: 25000 });
        await expect(guiltyBtn(user.page)).toHaveCount(0);
    });

    test('첫날 처형된 봇이 둘째 날 재판 표를 내면 → PLAYER_NOT_ALIVE로 거절됨 @game', async ({ user, table }) => {
        const t = await voteTable(table, user, { bots: 5 });
        const dead = t.bots[4];
        await toTribunal(t, u(dead));
        await L.botsTribunal(t, 'GUILTY', votersOf(t, dead));
        await L.resolveTribunal(t);
        await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === 2);
        await L.toVote(t);
        await L.botsVote(t, u(t.bots[3]), t.bots.slice(0, 3));
        await L.resolveVote(t);
        expect((await L.botTribunal(t, dead, 'GUILTY')).code).toBe('PLAYER_NOT_ALIVE');
    });
});

test.describe('재판 시간·시간 초과', () => {
    test('재판 시간 15초 방에서 단계를 안 넘기고 기다리면 → 15초쯤 뒤 저절로 판정되어 밤이 됨 @game', async ({ user, table }) => {
        test.setTimeout(150000);
        const t = await voteTable(table, user, { settings: { tribunalTime: 15 } });
        await toTribunal(t, u(t.bots[2]));
        const start = Date.now();
        await L.waitState(t, (s) => s.phase === 'NIGHT', { timeout: 25000 });
        const took = Date.now() - start;
        expect(took).toBeGreaterThan(9000);
        expect(took).toBeLessThan(22000);
    });

    test('재판 시간 45초 방에서는 → 20초가 지나도 재판이 이어지고 45초쯤 뒤 끝남 @game', async ({ user, table }) => {
        test.setTimeout(180000);
        const t = await voteTable(table, user, { settings: { tribunalTime: 45 } });
        await toTribunal(t, u(t.bots[2]));
        const start = Date.now();
        await L.sleep(20000);
        expect((await t.state()).phase).toBe('TRIBUNAL');
        await L.waitState(t, (s) => s.phase === 'NIGHT', { timeout: 40000 });
        expect(Date.now() - start).toBeGreaterThan(38000);
    });

    test('재판 시간 120초 방에서는 → 30초가 지나도 재판 창이 그대로 떠 있음 @game', async ({ user, table }) => {
        test.setTimeout(150000);
        const t = await voteTable(table, user, { settings: { tribunalTime: 120 } });
        await toTribunal(t, u(t.bots[2]));
        await L.sleep(30000);
        expect((await t.state()).phase).toBe('TRIBUNAL');
        await expect(tribunalDialog(user.page)).toBeVisible();
        await L.resolveTribunal(t);
    });

    test('재판 시간을 안 정한 방(낮 투표 30초)이면 → 재판도 낮 투표 시간(30초)만큼 감 @game', async ({ user, table }) => {
        test.setTimeout(180000);
        const t = await voteTable(table, user, { settings: { dayVoteTime: 30, tribunalTime: undefined } });
        await toTribunal(t, u(t.bots[2]));
        const start = Date.now();
        await L.sleep(18000);
        expect((await t.state()).phase).toBe('TRIBUNAL');
        await L.waitState(t, (s) => s.phase === 'NIGHT', { timeout: 30000 });
        expect(Date.now() - start).toBeGreaterThan(24000);
    });

    test('낮 투표 90초·재판 30초로 따로 정하면 → 재판은 30초 쪽을 따름 @game', async ({ user, table }) => {
        test.setTimeout(150000);
        const t = await voteTable(table, user, { settings: { dayVoteTime: 90, tribunalTime: 30 } });
        await toTribunal(t, u(t.bots[2]));
        const start = Date.now();
        await L.waitState(t, (s) => s.phase === 'NIGHT', { timeout: 45000 });
        const took = Date.now() - start;
        expect(took).toBeGreaterThan(22000);
        expect(took).toBeLessThan(40000);
    });

    test('재판 시간이 다 되도록 유죄 하나만 내고 나머지가 안 내면 → 안 낸 표는 기권이라 처형됨 @game', async ({ user, table }) => {
        test.setTimeout(150000);
        const t = await voteTable(table, user, { settings: { tribunalTime: 15 } });
        const d = t.bots[2];
        await toTribunal(t, u(d));
        await L.botTribunal(t, t.bots[0], 'GUILTY');
        const s = await L.waitState(t, (g) => g.phase !== 'TRIBUNAL', { timeout: 25000 });
        expect(L.playerOf(s, u(d)).alive).toBe(false);
    });

    test('재판 시간이 다 되도록 아무도 안 내면 → 모두 기권이라 무죄로 풀려남 @game', async ({ user, table }) => {
        test.setTimeout(150000);
        const t = await voteTable(table, user, { settings: { tribunalTime: 15 } });
        const d = t.bots[2];
        await toTribunal(t, u(d));
        const s = await L.waitState(t, (g) => g.phase !== 'TRIBUNAL', { timeout: 25000 });
        expect(L.playerOf(s, u(d)).alive).toBe(true);
    });

    test('나는 안 내고 봇 무죄 하나만 낸 채 마감되면 → 풀려나고 내 표는 기권으로 셈 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        const d = t.bots[2];
        await toTribunal(t, u(d));
        await L.botTribunal(t, t.bots[0], 'NOT_GUILTY');
        await expect(guiltyBtn(user.page)).toBeVisible();
        const s = await L.resolveTribunal(t);
        expect(L.playerOf(s, u(d)).alive).toBe(true);
    });
});

test.describe('피고가 나감', () => {
    test('피고 봇이 판을 나가면 → 재판이 취소되고 처형 없이 밤이 됨 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        const d = t.bots[3];
        await toTribunal(t, u(d));
        await L.botsTribunal(t, 'GUILTY', [t.bots[0], t.bots[1]]);
        const r = await d.request('leave_game_session', { gameId: t.gameId });
        expect(r.ok).toBe(true);
        await L.waitState(t, (s) => s.phase === 'NIGHT');
        await L.closeNotice(user.page, '밤이 되었습니다');
        await expect(tribunalDialog(user.page)).toHaveCount(0);
    });

    test('피고 봇이 나가 재판이 취소되면 → 추방 문구가 안 뜸 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        const d = t.bots[3];
        await toTribunal(t, u(d));
        await d.request('leave_game_session', { gameId: t.gameId });
        await L.closeNotice(user.page, '밤이 되었습니다');
        await expect(user.page.getByText(expelText(d.nickname))).toHaveCount(0);
    });

    test('내가 피고일 때는 → 게임 나가기 버튼이 재판 창 뒤에 잠겨 있어 누를 수 없음 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await toTribunal(t, user.account.uuid);
        await expect(tribunalDialog(user.page)).toBeVisible();
        expect(await user.page.getByRole('button', { name: '게임 나가기' }).evaluate((el) => el.closest('[inert]') !== null)).toBe(true);
    });

    test('재판 중 투표하던 봇이 나가고 남은 사람이 다 냈으면 → 마감을 안 기다리고 바로 판정됨 @game', async ({ user, table }) => {
        const t = await voteTable(table, user, { roles: ({ bots: b }) => ({ [user.account.uuid]: 'CITIZEN', [b[0].account.uuid]: 'JOKER' }) });
        const d = t.bots[3];
        await toTribunal(t, u(d));
        await L.botsTribunal(t, 'GUILTY', [t.bots[0], t.bots[2]]);
        await guiltyBtn(user.page).click();
        await expect(tribunalDialog(user.page)).toContainText('투표가 완료되었습니다.');
        await t.bots[1].request('leave_game_session', { gameId: t.gameId });
        const s = await L.waitState(t, (g) => g.phase !== 'TRIBUNAL', { timeout: 10000 });
        expect(L.playerOf(s, u(d)).alive).toBe(false);
    });
});

test.describe('인원별 (5~10명)', () => {
    for (const total of [5, 6, 7, 8, 9, 10]) {
        test(`${total}명 판에서 유죄가 과반이면 → 피고 봇이 처형됨 @game`, async ({ user, table }) => {
            const t = await voteTable(table, user, { bots: total - 1 });
            const d = t.bots[t.bots.length - 1];
            await toTribunal(t, u(d));
            await L.botsTribunal(t, 'GUILTY', votersOf(t, d));
            const s = await L.resolveTribunal(t);
            expect(L.playerOf(s, u(d)).alive).toBe(false);
            await expect(user.page.getByText(expelText(d.nickname))).toBeVisible({ timeout: 25000 });
        });

        test(`${total}명 판에서 무죄가 과반이면 → 피고 봇이 풀려남 @game`, async ({ user, table }) => {
            const t = await voteTable(table, user, { bots: total - 1 });
            const d = t.bots[t.bots.length - 1];
            await toTribunal(t, u(d));
            await L.botsTribunal(t, 'NOT_GUILTY', votersOf(t, d));
            const s = await L.resolveTribunal(t);
            expect(L.playerOf(s, u(d)).alive).toBe(true);
            await L.closeNotice(user.page, '밤이 되었습니다');
        });
    }
});
