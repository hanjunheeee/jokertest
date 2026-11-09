// 밤 같은 직업끼리 채팅: 광대끼리 보임·다른 직업은 못 봄·직업이 나 혼자일 때·낮 채팅과 안 섞임
// 판: 봇 방장 + 사람 하나·둘, 역할은 미리 정함 (직접 구성은 roleCounts)
const { test, expect } = require('../../../helpers/fixtures');
const c = require('./_lib');

const CUSTOM = (counts) => ({ roleCompositionMode: 'custom', roleCounts: { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, ...counts }, jokerCount: counts.JOKER ?? 1 });

// 나·p2 둘 다 광대 (광대 2 : 시민 3)
async function twoJokers({ user, players, table }) {
    const p2 = await players.add();
    const t = await c.startGame(table, {
        humans: [user, p2], bots: 3, settings: { jokerCount: 2 },
        roles: { [user.account.uuid]: 'JOKER', [p2.account.uuid]: 'JOKER' },
    });
    await c.phaseTo(t, 'NIGHT');
    await c.phaseReady([user.page, p2.page]);
    return { t, p2 };
}

// 나 혼자 사람, 내 역할 role (봇 셋, 봇0은 광대 아니면 광대)
async function soloAs({ user, table, role, settings = {}, bots = 3 }) {
    const t = await c.startGame(table, {
        humans: [user], bots, settings,
        roles: ({ bots: b }) => (role === 'JOKER'
            ? { [user.account.uuid]: 'JOKER' }
            : { [user.account.uuid]: role, [b[0].account.uuid]: 'JOKER' }),
    });
    await c.phaseTo(t, 'NIGHT');
    return t;
}

const EVT = 'joker_chat_message';

test.describe('광대끼리', () => {
    test('밤에 내가 광대 채팅을 쓰면 → 동료 광대 p2 화면에 보임 @game', async ({ user, players, table }) => {
        const { p2 } = await twoJokers({ user, players, table });
        const text = c.uniq('누구죽일까');
        await c.say(user.page, text);
        await c.expectLine(p2.page, user.account.nickname, text);
    });

    test('밤에 동료 광대 p2가 쓰면 → 내 화면에 p2 닉네임으로 보임 @game', async ({ user, players, table }) => {
        const { p2 } = await twoJokers({ user, players, table });
        const text = c.uniq('p2광대');
        await c.say(p2.page, text);
        await c.expectLine(user.page, p2.account.nickname, text);
    });

    test('광대 둘이 번갈아 쓰면 → 두 화면 모두 보낸 순서대로 쌓임 @game', async ({ user, players, table }) => {
        const { p2 } = await twoJokers({ user, players, table });
        const a = c.uniq('첫째'); const b = c.uniq('둘째'); const d = c.uniq('셋째');
        await c.say(user.page, a);
        await c.expectLine(p2.page, user.account.nickname, a);
        await c.say(p2.page, b);
        await c.expectLine(user.page, p2.account.nickname, b);
        await c.say(user.page, d);
        for (const page of [user.page, p2.page]) {
            await expect(c.chatLog(page).getByRole('listitem')).toHaveText([c.line(user.account.nickname, a), c.line(p2.account.nickname, b), c.line(user.account.nickname, d)]);
        }
    });

    test('광대 밤 채팅은 → 시민 봇 셋 누구도 사건을 못 받음 @game', async ({ user, players, table }) => {
        const { t, p2 } = await twoJokers({ user, players, table });
        const text = c.uniq('시민몰래');
        await c.say(user.page, text);
        await c.expectLine(p2.page, user.account.nickname, text);
        await c.sleep(800);
        t.bots.forEach((_, i) => expect(c.botGot(t, i, EVT, text)).toBe(false));
    });

    test('광대 봇이 밤 채팅을 쓰면 → 광대인 내 화면에 그 봇 닉네임으로 보임 @game', async ({ user, table }) => {
        const t = await c.startGame(table, { humans: [user], bots: 4, settings: { jokerCount: 2 }, roles: ({ bots: b }) => ({ [user.account.uuid]: 'JOKER', [b[0].account.uuid]: 'JOKER' }) });
        await c.phaseTo(t, 'NIGHT');
        const text = c.uniq('봇광대');
        expect((await c.botNightSay(t, 0, text))?.ok).toBe(true);
        await c.readyToChat(user.page);
        await c.expectLine(user.page, t.bots[0].nickname, text);
    });

    test('광대인 내가 밤에 쓰면 → 동료 광대 봇이 사건을 받고 시민 봇은 못 받음 @game', async ({ user, table }) => {
        const t = await c.startGame(table, { humans: [user], bots: 4, settings: { jokerCount: 2 }, roles: ({ bots: b }) => ({ [user.account.uuid]: 'JOKER', [b[0].account.uuid]: 'JOKER' }) });
        await c.phaseTo(t, 'NIGHT');
        const text = c.uniq('동료봇');
        await c.say(user.page, text);
        await expect.poll(() => c.botGot(t, 0, EVT, text)).toBe(true);
        for (let i = 1; i < t.bots.length; i += 1) expect(c.botGot(t, i, EVT, text)).toBe(false);
    });

    test('광대가 의사 차례(밤 둘째 차례)에 써도 → 동료 광대에게 보임 @game', async ({ user, players, table }) => {
        const p2 = await players.add();
        const t = await c.startGame(table, {
            humans: [user, p2], bots: 4, settings: { ...CUSTOM({ JOKER: 2, DOCTOR: 1 }) },
            roles: { [user.account.uuid]: 'JOKER', [p2.account.uuid]: 'JOKER' },
        });
        await t.advanceUntil((s) => s.phase === 'NIGHT' && s.nightTurnRole === 'DOCTOR', { stepDelayMs: 500 });
        const text = c.uniq('의사차례');
        await c.say(user.page, text);
        await c.expectLine(p2.page, user.account.nickname, text);
    });
});

test.describe('다른 직업은 못 봄', () => {
    test('광대 p2가 밤 채팅을 쓰면 → 시민인 내 화면에는 안 보임 @game', async ({ user, players, table }) => {
        const p2 = await players.add();
        const t = await c.startGame(table, { humans: [user, p2], bots: 3, roles: { [user.account.uuid]: 'CITIZEN', [p2.account.uuid]: 'JOKER' } });
        await c.phaseTo(t, 'NIGHT');
        await c.phaseReady([user.page, p2.page]);
        const text = c.uniq('광대비밀');
        await c.say(p2.page, text);
        await c.expectLine(p2.page, p2.account.nickname, text);
        await c.readyToChat(user.page);
        await c.expectNoText(user.page, text);
    });

    test('시민인 내가 밤에 쓰면 → 광대 p2 화면에는 안 보임 @game', async ({ user, players, table }) => {
        const p2 = await players.add();
        const t = await c.startGame(table, { humans: [user, p2], bots: 3, roles: { [user.account.uuid]: 'CITIZEN', [p2.account.uuid]: 'JOKER' } });
        await c.phaseTo(t, 'NIGHT');
        await c.phaseReady([user.page, p2.page]);
        const text = c.uniq('시민밤');
        await c.say(user.page, text);
        await c.expectLine(user.page, user.account.nickname, text);
        await c.readyToChat(p2.page);
        await c.expectNoText(p2.page, text);
    });

    test('시민인 내가 밤에 쓰면 → 시민 봇은 사건을 받고 광대 봇은 못 받음 @game', async ({ user, table }) => {
        const t = await soloAs({ user, table, role: 'CITIZEN' });
        const text = c.uniq('시민끼리');
        await c.say(user.page, text);
        await expect.poll(() => c.botGot(t, 1, EVT, text)).toBe(true);
        expect(c.botGot(t, 2, EVT, text)).toBe(true);
        expect(c.botGot(t, 0, EVT, text)).toBe(false);
    });

    test('시민 둘(나·p2)이면 → 밤에 내가 쓴 글이 p2에게 보임 @game', async ({ user, players, table }) => {
        const p2 = await players.add();
        const t = await c.startGame(table, { humans: [user, p2], bots: 3, roles: ({ bots: b }) => ({ [user.account.uuid]: 'CITIZEN', [p2.account.uuid]: 'CITIZEN', [b[0].account.uuid]: 'JOKER' }) });
        await c.phaseTo(t, 'NIGHT');
        await c.phaseReady([user.page, p2.page]);
        const text = c.uniq('시민둘');
        await c.say(user.page, text);
        await c.expectLine(p2.page, user.account.nickname, text);
    });

    test('시민 봇이 밤에 쓰면 → 광대인 내 화면엔 안 보임 @game', async ({ user, table }) => {
        const t = await soloAs({ user, table, role: 'JOKER' });
        const text = c.uniq('시민봇밤');
        expect((await c.botNightSay(t, 1, text))?.ok).toBe(true);
        await c.readyToChat(user.page);
        await c.expectNoText(user.page, text);
    });

    test('시민 봇이 밤에 쓰면 → 시민인 내 화면엔 보임 @game', async ({ user, table }) => {
        const t = await soloAs({ user, table, role: 'CITIZEN' });
        const text = c.uniq('시민봇');
        expect((await c.botNightSay(t, 1, text))?.ok).toBe(true);
        await c.readyToChat(user.page);
        await c.expectLine(user.page, t.bots[1].nickname, text);
    });

    test('의사인 내가 밤에 쓰면 → 시민 봇·광대 봇 아무도 못 받음 @game', async ({ user, table }) => {
        const t = await soloAs({ user, table, role: 'DOCTOR', settings: CUSTOM({ DOCTOR: 1 }) });
        const text = c.uniq('의사혼자');
        await c.say(user.page, text);
        await c.expectLine(user.page, user.account.nickname, text);
        await c.sleep(800);
        t.bots.forEach((_, i) => expect(c.botGot(t, i, EVT, text)).toBe(false));
    });

    test('시민 봇이 밤에 쓰면 → 의사인 내 화면엔 안 보임 @game', async ({ user, table }) => {
        const t = await soloAs({ user, table, role: 'DOCTOR', settings: CUSTOM({ DOCTOR: 1 }) });
        const text = c.uniq('시민말');
        expect((await c.botNightSay(t, 1, text))?.ok).toBe(true);
        await c.readyToChat(user.page);
        await c.expectNoText(user.page, text);
    });

    test('경비원인 내가 밤에 쓰면 → 나만 보이고 봇들은 못 받음 @game', async ({ user, table }) => {
        const t = await soloAs({ user, table, role: 'GUARD', settings: CUSTOM({ GUARD: 1 }) });
        const text = c.uniq('경비원');
        await c.say(user.page, text);
        await c.expectLine(user.page, user.account.nickname, text);
        await c.sleep(800);
        t.bots.forEach((_, i) => expect(c.botGot(t, i, EVT, text)).toBe(false));
    });

    test('마녀사냥꾼인 내가 밤에 쓰면 → 나만 보이고 봇들은 못 받음 @game', async ({ user, table }) => {
        const t = await soloAs({ user, table, role: 'WITCH_HUNTER', settings: CUSTOM({ WITCH_HUNTER: 1 }) });
        const text = c.uniq('마녀');
        await c.say(user.page, text);
        await c.expectLine(user.page, user.account.nickname, text);
        await c.sleep(800);
        t.bots.forEach((_, i) => expect(c.botGot(t, i, EVT, text)).toBe(false));
    });

    test('의사 둘(나·p2)이면 → 밤에 서로 쓴 글이 보임 @game', async ({ user, players, table }) => {
        const p2 = await players.add();
        const t = await c.startGame(table, { humans: [user, p2], bots: 3, settings: CUSTOM({ DOCTOR: 2 }), roles: { [user.account.uuid]: 'DOCTOR', [p2.account.uuid]: 'DOCTOR' } });
        await c.phaseTo(t, 'NIGHT');
        await c.phaseReady([user.page, p2.page]);
        const text = c.uniq('의사둘');
        await c.say(p2.page, text);
        await c.expectLine(user.page, p2.account.nickname, text);
    });

    test('경비원 둘(나·p2)이면 → 밤에 서로 보이고 시민 봇은 못 받음 @game', async ({ user, players, table }) => {
        const p2 = await players.add();
        const t = await c.startGame(table, { humans: [user, p2], bots: 3, settings: CUSTOM({ GUARD: 2 }), roles: { [user.account.uuid]: 'GUARD', [p2.account.uuid]: 'GUARD' } });
        await c.phaseTo(t, 'NIGHT');
        await c.phaseReady([user.page, p2.page]);
        const text = c.uniq('경비둘');
        await c.say(user.page, text);
        await c.expectLine(p2.page, user.account.nickname, text);
        const s = await t.state();
        t.bots.forEach((b, i) => { if (s.players.find((p) => p.uuid === b.account.uuid).role !== 'GUARD') expect(c.botGot(t, i, EVT, text)).toBe(false); });
    });

    test('의사 p2가 밤에 쓰면 → 경비원인 내 화면엔 안 보임 @game', async ({ user, players, table }) => {
        const p2 = await players.add();
        const t = await c.startGame(table, { humans: [user, p2], bots: 3, settings: CUSTOM({ DOCTOR: 1, GUARD: 1 }), roles: { [user.account.uuid]: 'GUARD', [p2.account.uuid]: 'DOCTOR' } });
        await c.phaseTo(t, 'NIGHT');
        await c.phaseReady([user.page, p2.page]);
        const text = c.uniq('의사말');
        await c.say(p2.page, text);
        await c.expectLine(p2.page, p2.account.nickname, text);
        await c.readyToChat(user.page);
        await c.expectNoText(user.page, text);
    });
});

test.describe('낮 채팅과 안 섞임', () => {
    test('낮에서 밤으로 바뀌면 → 채팅 내역에서 낮 대화가 안 보임 @game', async ({ user, table }) => {
        const t = await c.startGame(table, { humans: [user], bots: 3, roles: ({ bots: b }) => ({ [user.account.uuid]: 'CITIZEN', [b[0].account.uuid]: 'JOKER' }) });
        await c.phaseTo(t, 'DAY');
        const text = c.uniq('낮말');
        await c.say(user.page, text);
        await c.expectLine(user.page, user.account.nickname, text);
        await c.phaseTo(t, 'NIGHT');
        await c.readyToChat(user.page);
        await expect(c.chatLog(user.page)).not.toContainText(text);
    });

    test('밤에서 다음 낮으로 바뀌면 → 첫 낮 대화가 다시 보이고 밤 대화는 안 보임 @game', async ({ user, table }) => {
        const t = await c.startGame(table, { humans: [user], bots: 3, roles: ({ bots: b }) => ({ [user.account.uuid]: 'CITIZEN', [b[0].account.uuid]: 'JOKER' }) });
        await c.phaseTo(t, 'DAY');
        const day = c.uniq('첫낮');
        await c.say(user.page, day);
        await c.phaseTo(t, 'NIGHT');
        const night = c.uniq('밤만');
        await c.say(user.page, night);
        await c.expectLine(user.page, user.account.nickname, night);
        await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === 2, { stepDelayMs: 500 });
        await c.readyToChat(user.page);
        await c.expectLine(user.page, user.account.nickname, day);
        await expect(c.chatLog(user.page)).not.toContainText(night);
    });

    test('첫 밤 광대 대화는 → 둘째 밤이 되면 다시 보임 @game', async ({ user, players, table }) => {
        const { t, p2 } = await twoJokers({ user, players, table });
        const text = c.uniq('첫밤');
        await c.say(user.page, text);
        await c.expectLine(p2.page, user.account.nickname, text);
        await t.advanceUntil((s) => s.phase === 'NIGHT' && s.dayIndex === 2, { stepDelayMs: 500 });
        await c.readyToChat(p2.page);
        await c.expectLine(p2.page, user.account.nickname, text);
    });

    test('광대 밤 대화는 → 다음 낮 채팅 내역에 안 보임 @game', async ({ user, players, table }) => {
        const { t, p2 } = await twoJokers({ user, players, table });
        const text = c.uniq('밤비밀');
        await c.say(user.page, text);
        await c.expectLine(p2.page, user.account.nickname, text);
        await c.phaseTo(t, 'DAY');
        await c.readyToChat(p2.page);
        await expect(c.chatLog(p2.page)).not.toContainText(text);
    });

    test('산 봇이 밤에 낮 채팅을 보내면 → 거절되고 내 화면에 안 보임 @game', async ({ user, table }) => {
        const t = await soloAs({ user, table, role: 'CITIZEN' });
        const text = c.uniq('밤낮채팅');
        const reply = await c.botSay(t, 1, text);
        expect(reply?.ok).toBe(false);
        await c.readyToChat(user.page);
        await c.expectNoText(user.page, text);
    });

    test('낮에 봇이 밤 채팅을 보내면 → 거절되고 시민인 내 화면에 안 보임 @game', async ({ user, table }) => {
        const t = await c.startGame(table, { humans: [user], bots: 3, roles: ({ bots: b }) => ({ [user.account.uuid]: 'CITIZEN', [b[0].account.uuid]: 'JOKER' }) });
        await c.phaseTo(t, 'DAY');
        const text = c.uniq('낮밤채팅');
        const reply = await c.botNightSay(t, 1, text);
        expect(reply?.ok).toBe(false);
        await c.readyToChat(user.page);
        await c.expectNoText(user.page, text);
    });

    test('밤 시민 대화는 → 다음 낮에 광대 봇도 낮 채팅 사건으로 못 받음 @game', async ({ user, table }) => {
        const t = await soloAs({ user, table, role: 'CITIZEN' });
        const text = c.uniq('밤시민');
        await c.say(user.page, text);
        await c.phaseTo(t, 'DAY');
        expect(c.botGot(t, 0, 'day_chat_message_received', text)).toBe(false);
        expect(c.botGot(t, 0, EVT, text)).toBe(false);
    });
});

test.describe('밤 채팅 입력', () => {
    test('밤에 빈 글로 보내면 → "메시지를 입력해주세요." 오류가 뜨고 안 보내짐 @game', async ({ user, table }) => {
        const t = await soloAs({ user, table, role: 'CITIZEN' });
        await c.readyToChat(user.page);
        await c.chatBox(user.page).fill('   ');
        await c.chatBox(user.page).press('Enter');
        await expect(user.page.getByRole('alert').filter({ hasText: '메시지를 입력해주세요.' })).toBeVisible();
        expect(c.botGot(t, 1, EVT, '')).toBe(false);
    });

    test('밤에 151자를 보내면 → 150자 오류가 뜨고 시민 봇은 못 받음 @game', async ({ user, table }) => {
        const t = await soloAs({ user, table, role: 'CITIZEN' });
        const long = '가'.repeat(151);
        await c.say(user.page, long, { expectCleared: false });
        await expect(user.page.getByRole('alert').filter({ hasText: '메시지는 150자 이하로 입력해주세요.' })).toBeVisible();
        await c.sleep(500);
        expect(c.botGot(t, 1, EVT, long)).toBe(false);
    });

    test('밤에 딱 150자를 보내면 → 같은 직업 봇이 그대로 받음 @game', async ({ user, table }) => {
        const t = await soloAs({ user, table, role: 'CITIZEN' });
        const text = `${c.uniq('긴')}${'나'.repeat(150)}`.slice(0, 150);
        await c.say(user.page, text);
        await expect.poll(() => c.botGot(t, 1, EVT, text)).toBe(true);
    });

    test('밤에 보내기 버튼을 눌러도 → 같은 직업에게 보내짐 @game', async ({ user, table }) => {
        const t = await soloAs({ user, table, role: 'CITIZEN' });
        const text = c.uniq('버튼밤');
        await c.say(user.page, text, { via: 'button' });
        await expect.poll(() => c.botGot(t, 1, EVT, text)).toBe(true);
    });

    test('밤에 Shift+Enter를 누르면 → 안 보내지고 입력칸에 줄바꿈이 들어감 @game', async ({ user, table }) => {
        const t = await soloAs({ user, table, role: 'CITIZEN' });
        const box = await c.readyToChat(user.page);
        await box.fill('첫줄');
        await box.press('Shift+Enter');
        await box.pressSequentially('둘째줄');
        await expect(box).toHaveValue('첫줄\n둘째줄');
        await c.sleep(600);
        expect(t.bots[1].events.some((r) => r.event === EVT)).toBe(false);
    });

    test('밤에 두 줄 글을 보내면 → 같은 직업 봇이 줄바꿈 그대로 받음 @game', async ({ user, table }) => {
        const t = await soloAs({ user, table, role: 'CITIZEN' });
        const box = await c.readyToChat(user.page);
        const head = c.uniq('윗줄');
        await box.fill(`${head}\n아랫줄`);
        await box.press('Enter');
        await expect(box).toHaveValue('');
        await expect.poll(() => c.botGot(t, 1, EVT, `${head}\n아랫줄`)).toBe(true);
    });

    test('밤에 앞뒤 공백을 넣어 보내면 → 공백 뺀 글로 받음 @game', async ({ user, table }) => {
        const t = await soloAs({ user, table, role: 'CITIZEN' });
        const text = c.uniq('공백');
        await c.say(user.page, `   ${text}   `);
        await expect.poll(() => c.botGot(t, 1, EVT, text)).toBe(true);
    });

    test('밤에 숨은 방향 문자(U+202E)를 넣으면 → "사용할 수 없는 문자" 오류 @game', async ({ user, table }) => {
        await soloAs({ user, table, role: 'CITIZEN' });
        await c.say(user.page, `abc‮def`, { expectCleared: false });
        await expect(user.page.getByRole('alert').filter({ hasText: '사용할 수 없는 문자가 포함되어 있습니다.' })).toBeVisible();
    });

    test('봇이 밤 채팅을 0.5초 안에 두 번 보내면 → 두 번째는 거절됨 @game', async ({ user, table }) => {
        const t = await soloAs({ user, table, role: 'CITIZEN' });
        const first = await c.botNightSay(t, 1, c.uniq('빠름1'));
        const second = await c.botNightSay(t, 1, c.uniq('빠름2'));
        expect(first?.ok).toBe(true);
        expect(second?.ok).toBe(false);
    });
});

test.describe('내 직업이 나 혼자일 때', () => {
    test('2인 판 시민인 나 혼자 밤에 쓰면 → 내 줄만 보이고 광대 봇은 못 받음 @game', async ({ user, table }) => {
        const t = await c.startGame(table, { humans: [user], bots: 1, roles: ({ bots: b }) => ({ [user.account.uuid]: 'CITIZEN', [b[0].account.uuid]: 'JOKER' }) });
        await c.phaseTo(t, 'NIGHT');
        const text = c.uniq('혼자시민');
        await c.say(user.page, text);
        await c.expectLine(user.page, user.account.nickname, text);
        await c.sleep(800);
        expect(c.botGot(t, 0, EVT, text)).toBe(false);
    });

    test('광대가 나 하나뿐이면 → 밤에 쓴 글이 시민 봇 누구에게도 안 감 @game', async ({ user, table }) => {
        const t = await soloAs({ user, table, role: 'JOKER' });
        const text = c.uniq('혼자광대');
        await c.say(user.page, text);
        await c.expectLine(user.page, user.account.nickname, text);
        await c.sleep(800);
        t.bots.forEach((_, i) => expect(c.botGot(t, i, EVT, text)).toBe(false));
    });

    test('같은 직업 봇이 받은 밤 채팅 사건에는 → 판 id·보낸 사람·메시지 id가 실림 @game', async ({ user, table }) => {
        const t = await soloAs({ user, table, role: 'CITIZEN' });
        const text = c.uniq('실린값');
        await c.say(user.page, text);
        await expect.poll(() => c.botGot(t, 1, EVT, text)).toBe(true);
        const row = t.bots[1].events.find((r) => r.event === EVT && r.payload.text === text);
        expect(row.payload.gameId).toBe(t.gameId);
        expect(row.payload.senderUuid).toBe(user.account.uuid);
        expect(typeof row.payload.messageId).toBe('string');
    });
});

test('시민 봇 둘이 밤에 서로 말하면 → 시민인 내 화면에 둘 다 보임 @game', async ({ user, table }) => {
    const t = await soloAs({ user, table, role: 'CITIZEN' });
    const a = c.uniq('시민봇1'); const b = c.uniq('시민봇2');
    expect((await c.botNightSay(t, 1, a))?.ok).toBe(true);
    expect((await c.botNightSay(t, 2, b))?.ok).toBe(true);
    await c.readyToChat(user.page);
    await c.expectLine(user.page, t.bots[1].nickname, a);
    await c.expectLine(user.page, t.bots[2].nickname, b);
});
