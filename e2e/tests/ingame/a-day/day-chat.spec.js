// 낮 토론 채팅 시험: 보내기(버튼·Enter)·받기·글자 수 제한·빈 글·숨은 문자·연타 제한·금지어 가리기(*)
const { test, expect } = require('../../../helpers/fixtures');
const L = require('./_lib');

const input = (scope) => scope.getByRole('textbox', { name: '채팅 입력' });
const sendBtn = (scope) => scope.getByRole('button', { name: '채팅 보내기' });
const chatBox = (page) => page.getByRole('complementary', { name: '채팅' });
const alertIn = (page) => chatBox(page).getByRole('alert');
const line = (nick, text) => `${nick}:"${text}"`; // 화면 글은 닉네임·글 사이 띄어쓰기 없이 이어짐 (span 두 개)

// 사람 하나 + 봇 넷, 낮 토론까지
async function dayTable(table, user, { bots = 4, humans = [user], settings = { dayDiscussionTime: 150 } } = {}) {
    const t = await table.setup({ humans, bots, settings, roles: ({ bots: b }) => ({ [user.account.uuid]: 'CITIZEN', [b[0].account.uuid]: 'JOKER' }) });
    await L.toDay(t);
    return t;
}

test.describe('보내기·받기', () => {
    test('글을 쓰고 보내기 버튼을 누르면 → 채팅 내역에 "내 닉네임: 글"이 보임 @game', async ({ user, table }) => {
        await dayTable(table, user);
        await L.sendChatOk(user.page, '안녕하세요 반가워요');
        await expect(L.chatLog(user.page)).toContainText(line(user.account.nickname, '안녕하세요 반가워요'));
    });

    test('글을 쓰고 Enter를 누르면 → 보내져서 채팅 내역에 보임 @game', async ({ user, table }) => {
        await dayTable(table, user);
        await input(user.page).fill('엔터로 보냄');
        await input(user.page).press('Enter');
        await expect(input(user.page)).toHaveValue('');
        await expect(L.chatLog(user.page)).toContainText('엔터로 보냄');
    });

    test('Shift+Enter를 누르면 → 안 보내지고 입력칸에 줄바꿈만 들어감 @game', async ({ user, table }) => {
        await dayTable(table, user);
        await input(user.page).fill('첫 줄');
        await input(user.page).press('Shift+Enter');
        await input(user.page).pressSequentially('둘째 줄');
        await expect(input(user.page)).toHaveValue('첫 줄\n둘째 줄');
        await expect(L.chatLog(user.page).getByRole('listitem')).toHaveCount(0);
    });

    test('두 줄로 쓴 글을 보내면 → 두 줄이 그대로 한 메시지로 보임 @game', async ({ user, table }) => {
        await dayTable(table, user);
        await input(user.page).fill('첫 줄');
        await input(user.page).press('Shift+Enter');
        await input(user.page).pressSequentially('둘째 줄');
        await input(user.page).press('Enter');
        await expect(input(user.page)).toHaveValue('');
        await expect(L.chatLog(user.page)).toContainText('첫 줄');
        await expect(L.chatLog(user.page)).toContainText('둘째 줄');
        await expect(L.chatLog(user.page).getByRole('listitem')).toHaveCount(1);
    });

    test('보내고 나면 → 입력칸이 비워짐 @game', async ({ user, table }) => {
        await dayTable(table, user);
        await input(user.page).fill('비워지나');
        await sendBtn(user.page).click();
        await expect(input(user.page)).toHaveValue('');
    });

    test('앞뒤에 빈칸을 넣어 보내면 → 빈칸이 잘린 글로 보임 @game', async ({ user, table }) => {
        await dayTable(table, user);
        await L.sendChatOk(user.page, '   가운데 글   ');
        await expect(L.chatLog(user.page)).toContainText(line(user.account.nickname, '가운데 글'));
    });

    test('한글·영어·숫자·기호를 섞어 보내면 → 그대로 보임 @game', async ({ user, table }) => {
        await dayTable(table, user);
        const text = 'Hello 광대 123 !?~ ^^';
        await L.sendChatOk(user.page, text);
        await expect(L.chatLog(user.page)).toContainText(line(user.account.nickname, text));
    });

    test('두 사람이 같은 판일 때 한 사람이 보내면 → 다른 사람 채팅 내역에도 보임 @game', async ({ user, players, table }) => {
        const p2 = await players.add();
        await dayTable(table, user, { humans: [user, p2], bots: 3 });
        await L.sendChatOk(user.page, '둘째 사람 보여요?');
        await expect(L.chatLog(p2.page)).toContainText(line(user.account.nickname, '둘째 사람 보여요?'));
    });

    test('두 사람이 번갈아 보내면 → 양쪽 화면에 같은 순서로 보임 @game', async ({ user, players, table }) => {
        const p2 = await players.add();
        await dayTable(table, user, { humans: [user, p2], bots: 3 });
        await L.sendChatOk(user.page, '하나');
        await expect(L.chatLog(p2.page)).toContainText('하나');
        await L.sendChatOk(p2.page, '둘');
        await expect(L.chatLog(user.page)).toContainText('둘');
        for (const page of [user.page, p2.page]) {
            await expect(L.chatLog(page).getByRole('listitem').nth(0)).toContainText('하나');
            await expect(L.chatLog(page).getByRole('listitem').nth(1)).toContainText('둘');
        }
    });

    test('봇이 낮 채팅을 보내면 → 사람 채팅 내역에 "봇 닉네임: 글"로 보임 @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        expect((await L.botChat(t, t.bots[2], '봇이 말함')).ok).toBe(true);
        await expect(L.chatLog(user.page)).toContainText(line(t.bots[2].nickname, '봇이 말함'));
    });

    test('사람이 보내면 → 봇도 같은 글을 낮 채팅으로 받음 @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        const since = Date.now();
        await L.sendChatOk(user.page, '봇아 들리니');
        const got = await t.bots[1].waitForEvent('day_chat_message_received', { since, match: (p) => p.text === '봇아 들리니' });
        expect(got.senderUuid).toBe(user.account.uuid);
        expect(got.nickname).toBe(user.account.nickname);
    });

    test('세 번 이어 보내면 → 보낸 순서대로 쌓임 @game', async ({ user, table }) => {
        await dayTable(table, user);
        for (const text of ['첫째', '둘째', '셋째']) {
            await L.sendChatOk(user.page, text);
            await L.sleep(600);
        }
        const rows = L.chatLog(user.page).getByRole('listitem');
        await expect(rows).toHaveCount(3);
        await expect(rows.nth(0)).toContainText('첫째');
        await expect(rows.nth(1)).toContainText('둘째');
        await expect(rows.nth(2)).toContainText('셋째');
    });

    test('여러 봇이 말하면 → 사람 화면에 봇마다 자기 닉네임으로 보임 @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        for (const [i, bot] of t.bots.entries()) await L.botChat(t, bot, `봇${i} 인사`);
        for (const [i, bot] of t.bots.entries()) await expect(L.chatLog(user.page)).toContainText(line(bot.nickname, `봇${i} 인사`));
    });

    test('낮 투표 단계에도 → 채팅을 보낼 수 있음 @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        await L.toVote(t);
        await L.sendChatOk(user.page, '투표 중 말');
        await expect(L.chatLog(user.page)).toContainText('투표 중 말');
    });

    test('토론 때 보낸 글은 → 투표 단계로 넘어가도 채팅 내역에 남음 @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        await L.sendChatOk(user.page, '토론 때 말');
        await L.toVote(t);
        await expect(L.chatLog(user.page)).toContainText('토론 때 말');
    });

    test('첫째 날 낮 글은 → 밤을 지나 둘째 날 낮에도 채팅 내역에 남음 @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        await L.sendChatOk(user.page, '첫날 기록');
        await L.toVote(t);
        await L.resolveVote(t);
        await L.closeNotice(user.page, '밤이 되었습니다');
        await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === 2);
        await L.closeNotice(user.page, '낮이 되었습니다');
        await expect(L.chatLog(user.page)).toContainText('첫날 기록');
    });

    test('채팅 크게 보기를 열고 보내면 → 크게 보기 창과 보드 채팅 둘 다에 보임 @game', async ({ user, table }) => {
        await dayTable(table, user);
        await chatBox(user.page).getByRole('button', { name: '채팅 크게 보기' }).focus();
        await user.page.keyboard.press('Enter');
        const big = user.page.getByRole('dialog', { name: '채팅 클로즈업' });
        await expect(big).toBeVisible();
        await L.sendChatOk(user.page, '크게 보기에서 보냄', { scope: big });
        await expect(L.chatLog(big)).toContainText('크게 보기에서 보냄');
        await user.page.keyboard.press('Escape');
        await expect(big).toBeHidden();
        await expect(L.chatLog(chatBox(user.page))).toContainText('크게 보기에서 보냄');
    });
});

test.describe('글 검사 (빈 글·글자 수·숨은 문자)', () => {
    test('아무것도 안 쓰고 보내기를 누르면 → \'메시지를 입력해주세요.\'가 뜨고 아무것도 안 보내짐 @game', async ({ user, table }) => {
        await dayTable(table, user);
        await sendBtn(user.page).click();
        await expect(alertIn(user.page)).toHaveText('메시지를 입력해주세요.');
        await expect(L.chatLog(user.page).getByRole('listitem')).toHaveCount(0);
    });

    test('빈칸만 쓰고 보내면 → \'메시지를 입력해주세요.\'가 뜸 @game', async ({ user, table }) => {
        await dayTable(table, user);
        await input(user.page).fill('      ');
        await sendBtn(user.page).click();
        await expect(alertIn(user.page)).toHaveText('메시지를 입력해주세요.');
    });

    test('줄바꿈만 쓰고 보내면 → \'메시지를 입력해주세요.\'가 뜸 @game', async ({ user, table }) => {
        await dayTable(table, user);
        await input(user.page).fill('\n\n');
        await sendBtn(user.page).click();
        await expect(alertIn(user.page)).toHaveText('메시지를 입력해주세요.');
    });

    test('딱 150자를 보내면 → 그대로 보내져 보임 @game', async ({ user, table }) => {
        await dayTable(table, user);
        const text = '가'.repeat(150);
        await L.sendChatOk(user.page, text);
        await expect(L.chatLog(user.page)).toContainText(`"${text}"`);
    });

    test('151자를 보내면 → \'메시지는 150자 이하로 입력해주세요.\'가 뜨고 입력칸 글은 남음 @game', async ({ user, table }) => {
        await dayTable(table, user);
        const text = '나'.repeat(151);
        await input(user.page).fill(text);
        await sendBtn(user.page).click();
        await expect(alertIn(user.page)).toHaveText('메시지는 150자 이하로 입력해주세요.');
        await expect(input(user.page)).toHaveValue(text);
        await expect(L.chatLog(user.page).getByRole('listitem')).toHaveCount(0);
    });

    test('입력칸에 160자를 쳐도 → 칸에서 자르지 않고 160자 그대로 들어감 @game', async ({ user, table }) => {
        await dayTable(table, user);
        await input(user.page).fill('a'.repeat(160));
        await expect(input(user.page)).toHaveValue('a'.repeat(160));
    });

    test('앞뒤 빈칸 빼면 150자인 글은 → 151자가 넘어도 보내짐 @game', async ({ user, table }) => {
        await dayTable(table, user);
        const body = '다'.repeat(150);
        await L.sendChatOk(user.page, `  ${body}  `);
        await expect(L.chatLog(user.page)).toContainText(`"${body}"`);
    });

    test('글 방향을 바꾸는 숨은 문자를 넣으면 → \'사용할 수 없는 문자가 포함되어 있습니다.\'가 뜸 @game', async ({ user, table }) => {
        await dayTable(table, user);
        await input(user.page).fill('정상‮글');
        await sendBtn(user.page).click();
        await expect(alertIn(user.page)).toHaveText('사용할 수 없는 문자가 포함되어 있습니다.');
    });

    test('안 보이는 방향 표시 문자(\\u200e)를 넣어도 → 같은 안내가 뜨고 안 보내짐 @game', async ({ user, table }) => {
        await dayTable(table, user);
        await input(user.page).fill('숨은‎문자');
        await sendBtn(user.page).click();
        await expect(alertIn(user.page)).toHaveText('사용할 수 없는 문자가 포함되어 있습니다.');
        await expect(L.chatLog(user.page).getByRole('listitem')).toHaveCount(0);
    });

    test('안내가 뜬 뒤 제대로 된 글을 보내면 → 안내가 사라짐 @game', async ({ user, table }) => {
        await dayTable(table, user);
        await sendBtn(user.page).click();
        await expect(alertIn(user.page)).toBeVisible();
        await L.sendChatOk(user.page, '이제 제대로');
        await expect(alertIn(user.page)).toHaveCount(0);
    });

    test('봇이 151자를 보내면 → 서버가 MESSAGE_TOO_LONG으로 거절하고 사람 화면에 안 보임 @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        const r = await L.botChat(t, t.bots[1], 'x'.repeat(151));
        expect(r.ok).toBe(false);
        expect(r.code).toBe('MESSAGE_TOO_LONG');
        await L.sleep(500);
        await expect(L.chatLog(user.page).getByRole('listitem')).toHaveCount(0);
    });

    test('봇이 빈칸만 보내면 → 서버가 EMPTY_MESSAGE로 거절함 @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        const r = await L.botChat(t, t.bots[1], '   ');
        expect(r.code).toBe('EMPTY_MESSAGE');
    });

    test('봇이 제어 문자를 보내면 → 서버가 INVALID_CHARACTERS로 거절함 @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        const r = await L.botChat(t, t.bots[1], '벨\u0007소리');
        expect(r.code).toBe('INVALID_CHARACTERS');
    });

    test('봇이 딱 150자를 보내면 → 받아들여져 사람 화면에 보임 @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        const text = 'b'.repeat(150);
        expect((await L.botChat(t, t.bots[1], text)).ok).toBe(true);
        await expect(L.chatLog(user.page)).toContainText(`"${text}"`);
    });
});

test.describe('연타 제한 (0.5초)', () => {
    test('보내자마자 또 보내면 → 둘째 글은 \'요청을 처리할 수 없습니다.\'로 막히고 입력칸에 남음 @game', async ({ user, table }) => {
        await dayTable(table, user);
        await L.sendChatOk(user.page, '첫 글');
        await input(user.page).fill('바로 둘째 글');
        await sendBtn(user.page).click();
        await expect(alertIn(user.page)).toHaveText('요청을 처리할 수 없습니다.');
        await expect(input(user.page)).toHaveValue('바로 둘째 글');
        await expect(L.chatLog(user.page)).not.toContainText('바로 둘째 글');
    });

    test('막힌 뒤 0.5초 넘게 기다렸다 다시 보내면 → 보내짐 @game', async ({ user, table }) => {
        await dayTable(table, user);
        await L.sendChatOk(user.page, '첫 글');
        await input(user.page).fill('둘째 글');
        await sendBtn(user.page).click();
        await expect(alertIn(user.page)).toBeVisible();
        await L.sleep(700);
        await sendBtn(user.page).click();
        await expect(input(user.page)).toHaveValue('');
        await expect(L.chatLog(user.page)).toContainText('둘째 글');
    });

    test('Enter를 아주 빠르게 세 번 누르면 → 메시지는 한 번만 올라감 @game', async ({ user, table }) => {
        await dayTable(table, user);
        await input(user.page).fill('연타 시험');
        await input(user.page).press('Enter');
        await input(user.page).press('Enter');
        await input(user.page).press('Enter');
        await expect(L.chatLog(user.page)).toContainText('연타 시험');
        await L.sleep(800);
        await expect(L.chatLog(user.page).getByRole('listitem').filter({ hasText: '연타 시험' })).toHaveCount(1);
    });

    test('봇이 0.5초 안에 두 번 보내면 → 둘째는 RATE_LIMITED로 거절됨 @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        expect((await L.botChat(t, t.bots[1], '봇 첫 말')).ok).toBe(true);
        const r = await L.botChat(t, t.bots[1], '봇 둘째 말');
        expect(r.code).toBe('RATE_LIMITED');
        await expect(L.chatLog(user.page)).toContainText('봇 첫 말');
        await expect(L.chatLog(user.page)).not.toContainText('봇 둘째 말');
    });

    test('봇이 0.6초 쉬고 다시 보내면 → 둘 다 보임 @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        await L.botChat(t, t.bots[1], '쉬기 전');
        await L.sleep(650);
        expect((await L.botChat(t, t.bots[1], '쉰 뒤')).ok).toBe(true);
        await expect(L.chatLog(user.page)).toContainText('쉰 뒤');
    });

    test('연타 제한은 사람마다 따로라서 → 다른 봇 둘이 동시에 보내면 둘 다 보임 @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        const [a, b] = await Promise.all([L.botChat(t, t.bots[1], '봇1 동시'), L.botChat(t, t.bots[2], '봇2 동시')]);
        expect(a.ok && b.ok).toBe(true);
        await expect(L.chatLog(user.page)).toContainText('봇1 동시');
        await expect(L.chatLog(user.page)).toContainText('봇2 동시');
    });

    test('내가 보낸 바로 뒤 봇이 보내도 → 둘 다 보임 (제한은 내 것만) @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        await L.sendChatOk(user.page, '사람 먼저');
        expect((await L.botChat(t, t.bots[1], '봇 바로 뒤')).ok).toBe(true);
        await expect(L.chatLog(user.page)).toContainText('사람 먼저');
        await expect(L.chatLog(user.page)).toContainText('봇 바로 뒤');
    });
});

test.describe('금지어 가리기', () => {
    // 시험마다 무작위 금지어를 넣고 끝나면 지움
    let cleanup = null;
    test.afterEach(async () => { if (cleanup) await cleanup(); cleanup = null; });

    test('봇이 금지어를 보내면 → 사람 화면에는 그 자리가 *로 가려져 보임 @game', async ({ user, table }) => {
        const w = L.randomWord();
        cleanup = await L.addBannedWords([w]);
        const t = await dayTable(table, user);
        await L.botChat(t, t.bots[1], `너 ${w} 같아`);
        await expect(L.chatLog(user.page)).toContainText(`"너 ${'*'.repeat(w.length)} 같아"`);
        await expect(L.chatLog(user.page)).not.toContainText(w);
    });

    test('내가 금지어를 보내면 → 내 화면에도 가려진 글로 보임 @game', async ({ user, table }) => {
        const w = L.randomWord();
        cleanup = await L.addBannedWords([w]);
        await dayTable(table, user);
        await L.sendChatOk(user.page, `나는 ${w} 아님`);
        await expect(L.chatLog(user.page)).toContainText(`"나는 ${'*'.repeat(w.length)} 아님"`);
    });

    test('내가 금지어를 보내면 → 다른 사람 화면에도 가려져 보임 @game', async ({ user, players, table }) => {
        const w = L.randomWord();
        cleanup = await L.addBannedWords([w]);
        const p2 = await players.add();
        await dayTable(table, user, { humans: [user, p2], bots: 3 });
        await L.sendChatOk(user.page, `${w}!`);
        await expect(L.chatLog(p2.page)).toContainText(`"${'*'.repeat(w.length)}!"`);
    });

    test('금지어를 가린 * 수는 → 금지어 글자 수와 같음 (8글자 → ********) @game', async ({ user, table }) => {
        const w = L.randomWord(8);
        cleanup = await L.addBannedWords([w]);
        const t = await dayTable(table, user);
        await L.botChat(t, t.bots[1], w);
        await expect(L.chatLog(user.page)).toContainText('"********"');
    });

    test('금지어를 대문자로 보내도 → 가려짐 (대소문자 안 가림) @game', async ({ user, table }) => {
        const w = L.randomWord();
        cleanup = await L.addBannedWords([w]);
        const t = await dayTable(table, user);
        await L.botChat(t, t.bots[1], `큰글 ${w.toUpperCase()}`);
        await expect(L.chatLog(user.page)).toContainText(`"큰글 ${'*'.repeat(w.length)}"`);
    });

    test('금지어가 다른 글자에 붙어 있어도 → 금지어 부분만 가려짐 @game', async ({ user, table }) => {
        const w = L.randomWord();
        cleanup = await L.addBannedWords([w]);
        const t = await dayTable(table, user);
        await L.botChat(t, t.bots[1], `앞${w}뒤`);
        await expect(L.chatLog(user.page)).toContainText(`"앞${'*'.repeat(w.length)}뒤"`);
    });

    test('금지어가 두 번 나오면 → 둘 다 가려짐 @game', async ({ user, table }) => {
        const w = L.randomWord();
        cleanup = await L.addBannedWords([w]);
        const t = await dayTable(table, user);
        await L.botChat(t, t.bots[1], `${w} 그리고 ${w}`);
        const stars = '*'.repeat(w.length);
        await expect(L.chatLog(user.page)).toContainText(`"${stars} 그리고 ${stars}"`);
    });

    test('서로 다른 금지어 둘을 섞어 보내면 → 둘 다 가려짐 @game', async ({ user, table }) => {
        const w1 = L.randomWord(5);
        const w2 = L.randomWord(7);
        cleanup = await L.addBannedWords([w1, w2]);
        const t = await dayTable(table, user);
        await L.botChat(t, t.bots[1], `${w1}와 ${w2}`);
        await expect(L.chatLog(user.page)).toContainText(`"${'*'.repeat(5)}와 ${'*'.repeat(7)}"`);
    });

    test('금지어가 없는 글은 → 금지어 목록이 있어도 그대로 보임 @game', async ({ user, table }) => {
        const w = L.randomWord();
        cleanup = await L.addBannedWords([w]);
        const t = await dayTable(table, user);
        await L.botChat(t, t.bots[1], '평범한 낮 인사');
        await expect(L.chatLog(user.page)).toContainText('"평범한 낮 인사"');
    });

    test('봇끼리도 → 가려진 글을 받음 (보낸 원문은 안 감) @game', async ({ user, table }) => {
        const w = L.randomWord();
        cleanup = await L.addBannedWords([w]);
        const t = await dayTable(table, user);
        const since = Date.now();
        await L.botChat(t, t.bots[1], `봇 ${w}`);
        const got = await t.bots[2].waitForEvent('day_chat_message_received', { since, match: (p) => p.senderUuid === t.bots[1].account.uuid });
        expect(got.text).toBe(`봇 ${'*'.repeat(w.length)}`);
    });

    test('꺼 둔 금지어(is_active 0)는 → 가리지 않음 @game', async ({ user, table }) => {
        const w = L.randomWord();
        const db = require('../../../helpers/db');
        await db.query('INSERT INTO banned_words (word, is_active, created_at, updated_at) VALUES (?, 0, NOW(), NOW())', [w]);
        cleanup = async () => { await db.query('DELETE FROM banned_words WHERE word = ?', [w]); };
        const { internal } = require('../../../helpers/internal');
        await internal.reloadBannedWords();
        const t = await dayTable(table, user);
        await L.botChat(t, t.bots[1], `꺼진 ${w}`);
        await expect(L.chatLog(user.page)).toContainText(`"꺼진 ${w}"`);
    });

    test('금지어를 지우고 다시 읽으면 → 그 뒤 글은 안 가려짐 @game', async ({ user, table }) => {
        const w = L.randomWord();
        const remove = await L.addBannedWords([w]);
        cleanup = remove;
        const t = await dayTable(table, user);
        await L.botChat(t, t.bots[1], `전 ${w}`);
        await expect(L.chatLog(user.page)).toContainText(`"전 ${'*'.repeat(w.length)}"`);
        await remove();
        cleanup = null;
        await L.sleep(600);
        await L.botChat(t, t.bots[1], `후 ${w}`);
        await expect(L.chatLog(user.page)).toContainText(`"후 ${w}"`);
    });

    test('재판 채팅(최후의 반론)에서도 → 금지어가 가려짐 @game', async ({ user, table }) => {
        const w = L.randomWord();
        cleanup = await L.addBannedWords([w]);
        const t = await dayTable(table, user);
        await L.toVote(t);
        await L.botsVote(t, t.bots[1].account.uuid, [t.bots[0], t.bots[2], t.bots[3]]);
        await L.resolveVote(t);
        const panel = user.page.getByLabel('최후의 반론 채팅');
        await expect(panel).toBeVisible({ timeout: 10000 });
        await L.botChat(t, t.bots[1], `반론 ${w}`);
        await expect(L.chatLog(panel)).toContainText(`"반론 ${'*'.repeat(w.length)}"`);
    });
});

test.describe('재판 중 채팅', () => {
    async function toTribunal(t, defendant) {
        await L.toVote(t);
        await L.botsVote(t, defendant, t.bots.filter((b) => b.account.uuid !== defendant));
        await L.resolveVote(t);
    }

    test('재판 창이 뜨고 잠시 뒤 → 오른쪽에 \'최후의 반론\' 채팅이 열림 @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        await toTribunal(t, t.bots[1].account.uuid);
        await expect(user.page.getByRole('dialog', { name: '재판' })).toBeVisible();
        await expect(user.page.getByLabel('최후의 반론 채팅')).toBeVisible({ timeout: 10000 });
    });

    test('재판 중 투표하는 사람이 보내면 → 최후의 반론 채팅에 보임 @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        await toTribunal(t, t.bots[1].account.uuid);
        const panel = user.page.getByLabel('최후의 반론 채팅');
        await expect(panel).toBeVisible({ timeout: 10000 });
        await L.sendChatOk(user.page, '왜 그랬어요', { scope: panel });
        await expect(L.chatLog(panel)).toContainText(line(user.account.nickname, '왜 그랬어요'));
    });

    test('내가 피고일 때 반론을 보내면 → 봇들이 받고 내 화면에도 보임 @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        await toTribunal(t, user.account.uuid);
        const panel = user.page.getByLabel('최후의 반론 채팅');
        await expect(panel).toBeVisible({ timeout: 10000 });
        const since = Date.now();
        await L.sendChatOk(user.page, '저는 시민입니다', { scope: panel });
        await expect(L.chatLog(panel)).toContainText('저는 시민입니다');
        const got = await t.bots[0].waitForEvent('day_chat_message_received', { since, match: (p) => p.text === '저는 시민입니다' });
        expect(got.senderUuid).toBe(user.account.uuid);
    });

    test('피고 봇이 반론하면 → 사람의 최후의 반론 채팅에 보임 @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        await toTribunal(t, t.bots[2].account.uuid);
        const panel = user.page.getByLabel('최후의 반론 채팅');
        await expect(panel).toBeVisible({ timeout: 10000 });
        await L.botChat(t, t.bots[2], '억울합니다');
        await expect(L.chatLog(panel)).toContainText(line(t.bots[2].nickname, '억울합니다'));
    });

    test('낮에 한 말은 → 재판 채팅 창에도 이어서 보임 @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        await L.sendChatOk(user.page, '낮에 한 말');
        await toTribunal(t, t.bots[1].account.uuid);
        const panel = user.page.getByLabel('최후의 반론 채팅');
        await expect(L.chatLog(panel)).toContainText('낮에 한 말', { timeout: 10000 });
    });
});
