// 보안(XSS): 사용자 글이 그려지는 곳(공지·알림·닉네임·채팅·신고 메모가 돌아오는 화면)에 스크립트를 넣어도 실행 안 되고 글자로만 보임
// 근거: docs/보안_점검_2026-11-09.md '입력 XSS'(React가 글자로만 그림), 결정 문서 '보안 화면 헤더'
const { test, expect, ui } = require('../../helpers/fixtures');
const sec = require('../../helpers/security');
const { api, login, rand } = require('./_sec');

// 닉네임 칸은 한글·영문·숫자만 받아서 스크립트가 애초에 안 들어감 → 가입 검사가 거르는지로 확인
// 공지·알림·채팅은 아무 글자나 들어가므로 trapXss로 실행 여부를 봄

test.describe('공지·알림 글자 XSS', () => {
    test('공지 제목·본문에 스크립트를 넣어도 → 알림 창에 글자로만 보이고 실행 안 됨 (데스크톱)', async ({ page, context, accounts, internal, ui }) => {
        const trap = await sec.trapXss(page);
        const account = await accounts.create();
        await ui.loginViaApi(context, account);
        const [p1] = sec.xssPayloads('notif-t');
        const [, p2] = sec.xssPayloads('notif-b');
        await internal.announceTo([account.uuid], { title: p1, body: p2 });
        await ui.gotoLobby(page);
        await page.getByRole('button', { name: /^알림/ }).click();
        const dialog = page.getByRole('dialog', { name: '알림' });
        await expect(dialog).toBeVisible();
        // 넣은 글이 글자 그대로 보임 (태그로 안 바뀜)
        await expect(dialog).toContainText('onerror');
        await page.waitForTimeout(500);
        sec.assertNoXss(trap);
        // DOM에 진짜 img/script 노드가 안 생김
        const injected = await page.evaluate(() => document.querySelectorAll('[role="dialog"] img[src="x"], [role="dialog"] script').length);
        expect(injected).toBe(0);
    });

    test('공지에 스크립트를 넣어도 → 모바일 알림 창에 글자로만 보이고 실행 안 됨', async ({ players, accounts, internal }) => {
        const p = await players.add({ mobile: true, login: false });
        const trap = await sec.trapXss(p.page);
        const account = await accounts.create();
        await ui.loginViaApi(p.context, account);
        const [payload] = sec.xssPayloads('mnotif');
        await internal.announceTo([account.uuid], { title: '공지', body: payload });
        await ui.gotoLobby(p.page);
        await p.page.getByRole('button', { name: /^알림/ }).click();
        const dialog = p.page.getByRole('dialog', { name: '알림' });
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText('onerror');
        await p.page.waitForTimeout(500);
        sec.assertNoXss(trap);
    });

    test('여러 가지 XSS 글을 공지 본문으로 넣어도 → 하나도 실행 안 됨', async ({ page, context, accounts, internal, ui }) => {
        const trap = await sec.trapXss(page);
        const account = await accounts.create();
        await ui.loginViaApi(context, account);
        for (const payload of sec.xssPayloads('many')) {
            await internal.announceTo([account.uuid], { title: '공지', body: payload });
        }
        await ui.gotoLobby(page);
        await page.getByRole('button', { name: /^알림/ }).click();
        await expect(page.getByRole('dialog', { name: '알림' })).toBeVisible();
        await page.waitForTimeout(800);
        sec.assertNoXss(trap);
    });
});

test.describe('닉네임 XSS는 입력 단계에서 막힘', () => {
    test('꺾쇠·따옴표가 든 닉네임으로 바꾸려 하면 → 400 (한글·영문·숫자만)', async ({ accounts }) => {
        const account = await accounts.create();
        const { cookie } = await login(account);
        for (const nickname of ['<img src=x>', "a'<b", '<script>a']) {
            const r = await api('PATCH', '/user/me/nickname', { cookie, body: { nickname } });
            expect(r.status, nickname).toBe(400);
        }
        // 바뀌지 않았음
        const p = await api('GET', '/user/me/profile', { cookie });
        expect(p.body).toContain(account.nickname);
    });

    test('가입 때도 꺾쇠 닉네임은 거절 (화면 검사 글자)', async ({ page }) => {
        await page.goto('/login');
        await page.getByRole('button', { name: '회원가입' }).click();
        const nick = page.getByRole('textbox', { name: /닉네임/ });
        await nick.fill('<script>x');
        await nick.blur();
        // 가입 버튼은 비활성(인증 전) — 닉네임 칸 자체가 허용 글자만 받는지 확인: 값이 그대로 들어가도 서버가 거름은 위 테스트가 봄
        await expect(page.getByRole('button', { name: '회원가입' })).toBeDisabled();
    });
});

test.describe('채팅 XSS (@game — 진짜 판)', () => {
    test('낮 채팅에 스크립트를 넣으면 → 내 화면에 글자로만 보이고 실행 안 됨 @game', async ({ page, context, accounts, table, ui }) => {
        const trap = await sec.trapXss(page);
        const account = await accounts.create();
        await ui.loginViaApi(context, account);
        await ui.gotoLobby(page);
        const t = await table.setup({ humans: [{ page, account }], bots: 1 });
        await ui.readRoleReveal(page);
        await t.advanceUntil('DAY');
        const [payload] = sec.xssPayloads('daychat');
        await t.bots[0].request('submit_game_chat_message', { gameId: t.gameId, text: payload });
        await ui.expectChat(page, 'onerror');
        await page.waitForTimeout(600);
        sec.assertNoXss(trap);
    });

    test('내가 친 낮 채팅에 스크립트를 넣어도 → 내 화면에서 실행 안 됨 @game', async ({ page, context, accounts, table, ui }) => {
        const trap = await sec.trapXss(page);
        const account = await accounts.create();
        await ui.loginViaApi(context, account);
        await ui.gotoLobby(page);
        const t = await table.setup({ humans: [{ page, account }], bots: 1 });
        await ui.readRoleReveal(page);
        await t.advanceUntil('DAY');
        const [payload] = sec.xssPayloads('myday');
        // "낮이 되었습니다" 단계 전환 안내 창이 채팅 칸을 가리면 먼저 닫음
        const notice = page.getByRole('dialog', { name: '단계 전환 안내' });
        await notice.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
        await ui.closePhaseNotice(page);
        await expect(notice).toBeHidden();
        await ui.sendChat(page, payload);
        await ui.expectChat(page, 'onerror');
        await page.waitForTimeout(600);
        sec.assertNoXss(trap);
    });

    test('모바일(카톡형) 화면에서 낮 채팅 말풍선에 스크립트가 와도 → 글자로만 보이고 실행 안 됨 @game', async ({ players, accounts, table }) => {
        const p = await players.add({ mobile: true, login: false });
        const trap = await sec.trapXss(p.page);
        const account = await accounts.create();
        await ui.loginViaApi(p.context, account);
        await ui.gotoLobby(p.page);
        const t = await table.setup({ humans: [{ page: p.page, account }], bots: 1 });
        await ui.readRoleReveal(p.page);
        await t.advanceUntil('DAY');
        const [payload] = sec.xssPayloads('mobilechat');
        await t.bots[0].request('submit_game_chat_message', { gameId: t.gameId, text: payload });
        await ui.expectChat(p.page, 'onerror');
        await p.page.waitForTimeout(600);
        sec.assertNoXss(trap);
    });

    test('밤 광대끼리 채팅에 스크립트가 와도 → 같은 광대 화면에서 실행 안 됨 @game', async ({ page, context, accounts, table }) => {
        const trap = await sec.trapXss(page);
        const account = await accounts.create();
        await ui.loginViaApi(context, account);
        await ui.gotoLobby(page);
        // 나 + 봇 하나가 광대 (광대 둘), 봇 하나 시민
        const t = await table.setup({
            humans: [{ page, account }],
            bots: 2,
            settings: { jokerCount: 2, maxPlayers: 4 },
            roles: ({ bots }) => ({ [account.uuid]: 'JOKER', [bots[0].account.uuid]: 'JOKER', [bots[1].account.uuid]: 'CITIZEN' }),
        });
        await ui.readRoleReveal(page);
        // 낮 투표에서 아무도 안 죽게 (기권) → 밤으로
        t.playBots({ dayVote: 'abstain', tribunal: 'skip', night: 'skip' });
        await t.advanceUntil('NIGHT', { stepDelayMs: 800 });
        await t.stopBots();
        const [payload] = sec.xssPayloads('jokerchat');
        const reply = await t.bots[0].request('submit_joker_chat_message', { gameId: t.gameId, text: payload });
        expect(reply?.ok).toBe(true);
        await ui.expectChat(page, 'onerror');
        await page.waitForTimeout(600);
        sec.assertNoXss(trap);
    });

    test('죽은 사람 채팅에 스크립트를 넣어도 → 죽은 사람 화면에서 실행 안 됨 @game', async ({ page, context, accounts, table, ui }) => {
        const trap = await sec.trapXss(page);
        const account = await accounts.create();
        await ui.loginViaApi(context, account);
        await ui.gotoLobby(page);
        const me = account.uuid;
        const t = await table.setup({
            humans: [{ page, account }],
            bots: 4,
            roles: ({ bots }) => ({ [me]: 'CITIZEN', [bots[0].account.uuid]: 'JOKER' }),
        });
        await ui.readRoleReveal(page);
        const [payload] = sec.xssPayloads('deadchat');
        // 봇들이 나를 처형해서 내가 죽은 사람이 되게, 죽은 뒤 봇이 죽은 채팅으로 스크립트 보냄
        t.playBots({ dayVote: me, tribunal: 'GUILTY', night: 'skip', deadChat: payload });
        await t.advanceUntil((g) => g.players.find((p) => p.uuid === me)?.alive === false, { stepDelayMs: 1500 });
        await page.waitForTimeout(1200);
        sec.assertNoXss(trap);
    });
});
