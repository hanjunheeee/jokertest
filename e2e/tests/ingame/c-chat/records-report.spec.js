// 기록 시트(플레이어별 전적목록)와 판 중 신고: 목록·내 줄엔 신고 없음·신고 창·접수·중복·채팅 증거 남는지
// 증거는 서버 메모리 채팅 보관함 → 신고 때 report_chat_evidence 표에 저장 (db.query로 확인)
const { test, expect } = require('../../../helpers/fixtures');
const c = require('./_lib');
const db = require('../../../helpers/db');

const sheet = (page) => page.getByRole('dialog', { name: '플레이어별 전적목록' });
const reportDialog = (page) => page.getByRole('dialog', { name: '플레이어 신고' });

async function solo({ user, table, phase = 'DAY', bots = 3 }) {
    const t = await c.startGame(table, { humans: [user], bots, roles: ({ bots: b }) => ({ [user.account.uuid]: 'CITIZEN', [b[0].account.uuid]: 'JOKER' }) });
    await c.phaseTo(t, phase);
    await c.readyToChat(user.page);
    return t;
}
async function openSheet(page) {
    await page.getByRole('button', { name: '플레이어별 전적목록' }).first().click();
    await expect(sheet(page)).toBeVisible();
}
async function openReport(page, nickname) {
    await openSheet(page);
    await sheet(page).getByRole('button', { name: `${nickname} 신고` }).click();
    await expect(reportDialog(page)).toBeVisible();
}
async function submitReport(page, { reason = '욕설', memo = null } = {}) {
    await reportDialog(page).getByRole('radio', { name: reason }).check();
    if (memo !== null) await reportDialog(page).getByRole('textbox', { name: '메모' }).fill(memo);
    await reportDialog(page).getByRole('button', { name: '신고하기' }).click();
}
async function evidenceOf(reporterUuid, targetUuid) {
    const rows = await db.query(
        'SELECT e.messages FROM report_chat_evidence e JOIN reports r ON r.id = e.report_id WHERE r.reporter_id = ? AND r.target_id = ?',
        [reporterUuid, targetUuid],
    );
    if (!rows.length) return null;
    const m = rows[0].messages;
    return typeof m === 'string' ? JSON.parse(m) : m;
}

test.describe('기록 시트', () => {
    test('플레이어별 전적목록을 누르면 → 판 사람 수만큼 줄이 보임 @game', async ({ user, table }) => {
        await solo({ user, table });
        await openSheet(user.page);
        await expect(sheet(user.page).getByRole('list', { name: '플레이어 전적 목록' }).getByRole('listitem')).toHaveCount(4);
    });

    test('기록 시트의 내 줄에는 → 신고 버튼이 없음 @game', async ({ user, table }) => {
        await solo({ user, table });
        await openSheet(user.page);
        await expect(sheet(user.page).getByRole('button', { name: `${user.account.nickname} 신고` })).toHaveCount(0);
    });

    test('기록 시트의 다른 사람 줄에는 → 신고 버튼이 있음 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await openSheet(user.page);
        for (const b of t.bots) await expect(sheet(user.page).getByRole('button', { name: `${b.nickname} 신고` })).toBeVisible();
    });

    test('새 계정끼리 판이면 → 전적이 "0판 | 0%"로 보임 @game', async ({ user, table }) => {
        await solo({ user, table });
        await openSheet(user.page);
        await expect(sheet(user.page).getByText('0판 | 0%').first()).toBeVisible();
    });

    test('기록 시트에서 Esc를 누르면 → 시트가 닫힘 @game', async ({ user, table }) => {
        await solo({ user, table });
        await openSheet(user.page);
        await user.page.keyboard.press('Escape');
        await expect(sheet(user.page)).toHaveCount(0);
    });

    test('기록 시트 닫기 버튼을 누르면 → 시트가 닫힘 @game', async ({ user, table }) => {
        await solo({ user, table });
        await openSheet(user.page);
        await sheet(user.page).getByRole('button', { name: '플레이어별 전적목록 닫기' }).click();
        await expect(sheet(user.page)).toHaveCount(0);
    });

    test('죽은 뒤에도 → 기록 시트를 열 수 있음 @game', async ({ user, table }) => {
        const t = await solo({ user, table, bots: 4 });
        await c.executeByBots(t, user.account.uuid);
        await c.readyToChat(user.page);
        await openSheet(user.page);
        await expect(sheet(user.page).getByRole('listitem')).toHaveCount(5);
    });
});

test.describe('판 중 신고', () => {
    test('신고 버튼을 누르면 → 신고 창에 그 사람 닉네임·사유 넷·메모 칸이 보임 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await openReport(user.page, t.bots[1].nickname);
        const d = reportDialog(user.page);
        await expect(d.getByText(t.bots[1].nickname, { exact: true })).toBeVisible();
        for (const r of ['욕설', '비매너', '부정행위', '기타']) await expect(d.getByRole('radio', { name: r })).toBeVisible();
        await expect(d.getByRole('textbox', { name: '메모' })).toBeVisible();
    });

    test('사유를 안 고르고 신고하기를 누르면 → "신고 사유를 골라 주세요." @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await openReport(user.page, t.bots[1].nickname);
        await reportDialog(user.page).getByRole('button', { name: '신고하기' }).click();
        await expect(reportDialog(user.page)).toContainText('신고 사유를 골라 주세요.');
    });

    test('기타를 고르고 메모 없이 신고하면 → "기타 사유는 메모를 적어 주세요." @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await openReport(user.page, t.bots[1].nickname);
        await submitReport(user.page, { reason: '기타' });
        await expect(reportDialog(user.page)).toContainText('기타 사유는 메모를 적어 주세요.');
    });

    test('욕설로 신고하면 → "신고가 접수되었습니다" 안내가 뜸 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await openReport(user.page, t.bots[1].nickname);
        await submitReport(user.page);
        await expect(reportDialog(user.page)).toContainText('신고가 접수되었습니다. 운영자가 확인합니다.');
    });

    test('신고하면 → reports 표에 사유 ABUSE·OPEN으로 한 줄 남음 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await openReport(user.page, t.bots[1].nickname);
        await submitReport(user.page);
        await expect.poll(async () => {
            const rows = await db.query('SELECT reason_code, status, game_id FROM reports WHERE reporter_id = ? AND target_id = ?', [user.account.uuid, t.bots[1].account.uuid]);
            return rows.length ? `${rows[0].reason_code}/${rows[0].status}/${rows[0].game_id === t.gameId}` : 'none';
        }).toBe('ABUSE/OPEN/true');
    });

    test('같은 판 같은 사람을 또 신고하면 → 신고됨 표시로 다시 못 누르거나 중복 안내 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await openReport(user.page, t.bots[1].nickname);
        await submitReport(user.page);
        await expect(reportDialog(user.page)).toContainText('신고가 접수되었습니다');
        await user.page.keyboard.press('Escape');
        await c.sleep(300);
        if (!(await sheet(user.page).isVisible())) await openSheet(user.page);
        const row = sheet(user.page).getByRole('button', { name: new RegExp(`^${t.bots[1].nickname} 신고`) });
        const text = await row.innerText();
        if (/신고됨/.test(text) || await row.isDisabled()) return;
        await row.click();
        await submitReport(user.page);
        await expect(reportDialog(user.page)).toContainText('이미 이 판에서 신고한 플레이어입니다.');
    });

    test('신고하면 → 그 판 채팅이 증거로 함께 저장됨 (상대가 한 낮 채팅 원문 포함) @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        const text = c.uniq('나쁜말');
        expect((await c.botSay(t, 1, text))?.ok).toBe(true);
        await c.expectLine(user.page, t.bots[1].nickname, text);
        await openReport(user.page, t.bots[1].nickname);
        await submitReport(user.page);
        await expect(reportDialog(user.page)).toContainText('신고가 접수되었습니다');
        const ev = await evidenceOf(user.account.uuid, t.bots[1].account.uuid);
        expect(ev.some((m) => m.text === text && m.channel === 'DAY' && m.senderUuid === t.bots[1].account.uuid)).toBe(true);
    });

    test('밤 같은 직업 채팅도 → 신고 증거에 직업 채널로 남음 @game', async ({ user, table }) => {
        const t = await solo({ user, table, phase: 'NIGHT' });
        const text = c.uniq('밤증거');
        expect((await c.botNightSay(t, 1, text))?.ok).toBe(true);
        await c.expectLine(user.page, t.bots[1].nickname, text);
        await openReport(user.page, t.bots[1].nickname);
        await submitReport(user.page);
        await expect(reportDialog(user.page)).toContainText('신고가 접수되었습니다');
        const ev = await evidenceOf(user.account.uuid, t.bots[1].account.uuid);
        expect(ev.some((m) => m.text === text && m.channel === 'CITIZEN')).toBe(true);
    });

    test('죽은 사람 채팅도 → 신고 증거에 DEAD 채널로 남음 @game', async ({ user, table }) => {
        const t = await solo({ user, table, bots: 4 });
        await c.executeByBots(t, user.account.uuid);
        const text = c.uniq('죽은증거');
        await c.say(user.page, text);
        await openReport(user.page, t.bots[1].nickname);
        await submitReport(user.page);
        await expect(reportDialog(user.page)).toContainText('신고가 접수되었습니다');
        const ev = await evidenceOf(user.account.uuid, t.bots[1].account.uuid);
        expect(ev.some((m) => m.text === text && m.channel === 'DEAD' && m.senderUuid === user.account.uuid)).toBe(true);
    });

    test('신고 창에서 취소를 누르면 → 창이 닫히고 신고가 안 남음 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await openReport(user.page, t.bots[1].nickname);
        await reportDialog(user.page).getByRole('radio', { name: '욕설' }).check();
        await reportDialog(user.page).getByRole('button', { name: '취소' }).click();
        await expect(reportDialog(user.page)).toHaveCount(0);
        const rows = await db.query('SELECT id FROM reports WHERE reporter_id = ?', [user.account.uuid]);
        expect(rows.length).toBe(0);
    });

    test('메모를 적어 신고하면 → 메모가 앞뒤 공백 빠져 저장됨 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await openReport(user.page, t.bots[1].nickname);
        await submitReport(user.page, { reason: '비매너', memo: '  계속 방해함  ' });
        await expect(reportDialog(user.page)).toContainText('신고가 접수되었습니다');
        const rows = await db.query('SELECT reason_code, memo FROM reports WHERE reporter_id = ?', [user.account.uuid]);
        expect(rows[0].reason_code).toBe('GRIEFING');
        expect(rows[0].memo).toBe('계속 방해함');
    });
});

test.describe('금지어 가리기', () => {
    let word = null;
    test.afterEach(async () => { if (word) await c.removeBannedWord(word).catch(() => {}); word = null; });

    test('금지어가 든 낮 채팅을 보내면 → 내 화면엔 그 자리가 *로 가려져 보임 @game', async ({ user, table }) => {
        await solo({ user, table });
        word = await c.addBannedWord();
        const head = c.uniq('앞');
        await c.say(user.page, `${head} ${word} 뒤`);
        await expect(c.chatLog(user.page)).toContainText(`${head} ${'*'.repeat(word.length)} 뒤`);
        await expect(c.chatLog(user.page)).not.toContainText(word);
    });

    test('금지어가 든 낮 채팅은 → 봇도 *로 가려진 글을 받음 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        word = await c.addBannedWord();
        const head = c.uniq('봇');
        await c.say(user.page, `${head}${word}`);
        await expect.poll(() => c.botGot(t, 1, 'day_chat_message_received', `${head}${'*'.repeat(word.length)}`)).toBe(true);
    });

    test('봇이 금지어를 말하면 → 내 화면에 *로 가려져 보임 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        word = await c.addBannedWord();
        const head = c.uniq('봇말');
        await c.botSay(t, 1, `${head}${word}`);
        await c.expectLine(user.page, t.bots[1].nickname, `${head}${'*'.repeat(word.length)}`);
    });

    test('금지어를 대문자로 섞어도 → 가려짐 (영문 금지어) @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        word = await c.addBannedWord(`zqx${Math.floor(Math.random() * 1e6)}`);
        await c.botSay(t, 1, `가${word.toUpperCase()}나`);
        await c.expectLine(user.page, t.bots[1].nickname, `가${'*'.repeat(word.length)}나`);
    });

    test('밤 같은 직업 채팅의 금지어도 → *로 가려짐 @game', async ({ user, table }) => {
        const t = await solo({ user, table, phase: 'NIGHT' });
        word = await c.addBannedWord();
        await c.botNightSay(t, 1, `밤${word}`);
        await c.expectLine(user.page, t.bots[1].nickname, `밤${'*'.repeat(word.length)}`);
    });

    test('죽은 사람 채팅의 금지어도 → *로 가려짐 @game', async ({ user, table }) => {
        const t = await solo({ user, table, bots: 4 });
        await c.executeByBots(t, user.account.uuid);
        word = await c.addBannedWord();
        await c.say(user.page, `죽${word}`);
        await c.expectLine(user.page, user.account.nickname, `죽${'*'.repeat(word.length)}`);
    });

    test('금지어를 가려도 → 신고 증거엔 원문 그대로 남음 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        word = await c.addBannedWord();
        const text = `${c.uniq('원문')}${word}`;
        await c.botSay(t, 1, text);
        await c.expectLine(user.page, t.bots[1].nickname, text.replace(word, '*'.repeat(word.length)));
        await openReport(user.page, t.bots[1].nickname);
        await submitReport(user.page);
        await expect(reportDialog(user.page)).toContainText('신고가 접수되었습니다');
        const ev = await evidenceOf(user.account.uuid, t.bots[1].account.uuid);
        expect(ev.some((m) => m.text === text)).toBe(true);
    });

    test('금지어를 지우고 다시 읽으면 → 같은 낱말이 더는 안 가려짐 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        word = await c.addBannedWord();
        await c.removeBannedWord(word);
        const kept = word; word = null;
        await c.botSay(t, 1, `풀림${kept}`);
        await c.expectLine(user.page, t.bots[1].nickname, `풀림${kept}`);
    });

    test('금지어가 없는 글은 → 그대로 보임 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        word = await c.addBannedWord();
        const text = c.uniq('평범한말');
        await c.botSay(t, 1, text);
        await c.expectLine(user.page, t.bots[1].nickname, text);
    });
});

test('신고가 접수되면 → 기록 시트 그 사람 줄 버튼이 "신고됨"으로 바뀜 @game', async ({ user, table }) => {
    const t = await solo({ user, table });
    await openReport(user.page, t.bots[2].nickname);
    await submitReport(user.page);
    await expect(reportDialog(user.page)).toContainText('신고가 접수되었습니다');
    await reportDialog(user.page).getByRole('button', { name: /닫기/ }).first().click();
    if (!(await sheet(user.page).isVisible())) await openSheet(user.page);
    await expect(sheet(user.page).getByRole('button', { name: new RegExp(`^${t.bots[2].nickname} 신고`) })).toContainText('신고됨');
});
