'use strict';

// 가 묶음 장면 (혼자 PC: 로그인·가입·비밀번호·마이페이지·상점·친구·방 코드) 20줄
// run.js가 읽음 — 들어가는 법·통과 글은 목록 글에서 번호로 채워짐, 여기엔 그 화면까지 가는 준비만 (e2e 시험 도우미를 불러 씀)
const crypto = require('node:crypto');
const { fromE2e, e2eRequire } = require('../lib/paths');

const { expect } = e2eRequire('@playwright/test');
const { E2E } = fromE2e('helpers/env');
const accounts = fromE2e('helpers/accounts');
const db = fromE2e('helpers/db');
const A = fromE2e('tests/auth/authHelpers');
const k = fromE2e('tests/auth/_a11b-kit');
const st = fromE2e('tests/store/store-tools');
const K = fromE2e('tests/social/_a13-kit');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 그 주소 요청만 ms만큼 늦게 보냄 → 누르는 동안 꺼진 단추·"확인 중" 글을 사람이 볼 틈
async function slowDown(page, url, ms = 3000) {
    await page.route(url, async (route) => {
        await sleep(ms);
        await route.continue().catch(() => {});
    });
}

// 로그아웃 상태 창 + 쓸 계정 (재설정·로그인 장면용)
async function loggedOut(s, o = {}) {
    const account = await accounts.createAccount();
    return s.person({ login: false, account, ...o });
}

// ── 재설정 링크 (메일은 파일로만 받음: e2e/.runtime/mail) ──
async function resetLink(me) {
    const since = Date.now() - 1000;
    await k.requestResetApi(me.context, me.account.email);
    return k.resetLinkFor(me.account.email, { since });
}

// ── 상점 (e2e 상점 시험과 같은 스킨 두 개) ──
const SKIN = Object.freeze({ slot: '귀족 블러드 500', id: 'player-skin-귀족1-블러드' });
const SKIN2 = Object.freeze({ slot: '귀족 로코코 500', id: 'player-skin-귀족2-로코코' });
const buyButton = (page, name = '구매') => st.detail(page).getByRole('button', { name, exact: true });
async function openSkin(page, skin = SKIN) {
    await st.gotoStore(page);
    await st.pickCategory(page, '스킨');
    await st.pickItem(page, skin.slot);
}
// 화면 말고 서버로 먼저 사 둠 → 화면에서 사면 서버가 "이미 가짐"으로 거절 (실패를 만드는 법)
async function buyByApi(context, itemIds) {
    const res = await context.request.post(`${E2E.apiUrl}/economy/purchases/bulk`, {
        data: { items: itemIds.map((itemId) => ({ itemId })), referenceEventId: `eye:${crypto.randomBytes(6).toString('hex')}` },
        headers: { origin: E2E.desktopUrl },
    });
    if (res.status() >= 300) throw new Error(`서버로 먼저 사기 실패 ${res.status()}`);
}

// ── 친구 창 (e2e 친구 시험과 같은 고르개) ──
const askButton = (row, name) => row.getByRole('button', { name: `${name} 친구 끊기`, exact: true });
async function friendWithBot(s) {
    const me = await s.person();
    const [bot] = await s.spawnBots(1);
    await K.befriendBot(me, bot);
    await K.showList(me.page);
    const row = K.friendRow(me.page, bot.account.uuid);
    await expect(row).toBeVisible();
    return { me, bot, row };
}

// ── 이모티콘 팔레트 ──
const slot = (page, n) => page.getByRole('group', { name: '팔레트 슬롯' }).getByRole('button', { name: `${n}번 슬롯`, exact: true });

module.exports = [
    {
        id: '가-01',
        async prepare(s) {
            const me = await loggedOut(s);
            await slowDown(me.page, `${E2E.apiUrl}/auth/login`);
            await A.fillLogin(me.page, me.account.email, me.account.password);
            s.note('로그인 칸은 채워 둠 → "로그인"을 누르면 요청을 일부러 3초 늦춰 둬서 그동안 단추가 꺼져 있는지 봄');
            s.note('고객센터 링크는 시험 화면 빌드에 VITE_SUPPORT_URL 값이 없어 안 보임 → 그 부분만 손으로 (개발 서버에 값 넣고)');
        },
    },
    {
        id: '가-02',
        async prepare(s) {
            const me = await s.person({ login: false });
            await me.page.goto('/login?socialError=OAUTH_CANCELLED');
            await expect(me.page.getByText('소셜 로그인을 취소했습니다.')).toBeVisible();
        },
    },
    {
        id: '가-03',
        async prepare(s) {
            const me = await s.person({ login: false });
            // 이메일 인증·닉네임·생일·약관까지 채우고 비밀번호 두 칸만 비움 (빈 칸이라야 안내 글이 보임)
            await A.prepareValidSignup(me.page, { password: '', passwordConfirm: '' });
            await me.page.getByRole('region', { name: '회원가입 입력' }).getByRole('textbox', { name: '비밀번호를 입력하세요' }).focus();
            s.note('비밀번호 두 칸에 영문만(예 abcdefgh) 또는 숫자만 치고 닉네임 칸에서 Enter → 알림 글 (1280×800에선 가입 단추가 접혀 안 보임)');
        },
    },
    {
        id: '가-04',
        async prepare(s) {
            const fresh = await s.person({ login: false, label: '새 이메일' });
            const taken = await s.person({ login: false, big: true, label: '있는 이메일' });
            const existing = await accounts.createAccount();
            for (const [p, email] of [[fresh, A.newEmail('eye')], [taken, existing.email]]) {
                await A.openSignup(p.page);
                await A.fillSignup(p.page, { email });
                await p.page.getByRole('button', { name: '이메일 중복확인' }).click();
            }
            await expect(fresh.page.getByText('사용할 수 있는 이메일입니다.')).toBeVisible();
            await expect(taken.page.getByText('이미 사용 중인 이메일입니다.')).toBeVisible();
            // 다시 눌러 볼 때 "확인 중" 글이 3초 보이게
            for (const p of [fresh, taken]) await slowDown(p.page, (url) => url.href.startsWith(`${E2E.apiUrl}/auth/check-email`));
            s.note('왼쪽 큰 창 = 새 이메일(초록), 옆 창 = 있는 이메일(빨강). 이메일을 고치고 다시 누르면 3초 동안 "확인 중" 글');
        },
    },
    {
        id: '가-05',
        async prepare(s) {
            const me = await s.person({ login: false });
            const email = A.newEmail('eye');
            await A.openSignup(me.page);
            await A.fillSignup(me.page, { email });
            await A.requestCode(me.page, email);
            await A.codeBox(me.page).click();
            await me.page.keyboard.type('1234567');
            s.note('인증번호 칸에 1234567을 쳐 둠 → 123456만 남아야 함 (더 쳐 봐도 됨)');
        },
    },
    {
        id: '가-06',
        async prepare(s) {
            const me = await loggedOut(s);
            await me.page.goto('/password-reset/request');
            await me.page.getByPlaceholder('가입할 때 등록한 이메일을 입력하세요', { exact: true }).fill(me.account.email);
        },
        // 1분 글은 보여 줄 때 요청 (미리 준비하는 동안 1분이 흘러가지 않게)
        async show(s) {
            const page = s.main;
            const res = page.waitForResponse((r) => r.url().includes('/auth/password-reset/request') && r.request().method() === 'POST');
            await page.getByRole('button', { name: '재설정 링크 보내기' }).click();
            if ((await res).status() !== 200) throw new Error('재설정 요청이 200이 아님');
            await expect(page.getByText(/^\d+초 뒤 다시 보낼 수 있습니다\.$/)).toBeVisible();
        },
        still: (s) => s.main.getByText(/^\d+초 뒤 다시 보낼 수 있습니다\.$/).isVisible(),
    },
    {
        id: '가-07',
        async prepare(s) {
            const me = await loggedOut(s);
            const first = await resetLink(me);
            // 1분 안 다시 요청은 서버가 건너뜀 → 첫 링크 만든 시각을 2분 전으로 돌려 둘째 요청이 진짜로 새 링크를 만들게 (시험 DB만)
            await db.query('UPDATE password_reset_tokens SET created_at = ? WHERE user_id = ?', [db.sqlTime(Date.now() - 120_000), me.account.uuid]);
            const second = await resetLink(me);
            if (second === first) throw new Error('둘째 링크가 안 만들어짐');
            await me.page.goto(first);
            await expect(me.page.getByText(/이 링크는 새 링크로 바뀌었어요/)).toBeVisible({ timeout: 15_000 });
            s.note('먼저 온 메일의 링크를 연 화면 (메일은 e2e/.runtime/mail 파일로만 받음, 진짜 메일 없음)');
        },
    },
    {
        id: '가-08',
        async prepare(s) {
            const me = await loggedOut(s);
            await k.openResetLink(me.page, await resetLink(me));
        },
    },
    {
        id: '가-09',
        async prepare(s) {
            const me = await loggedOut(s);
            const url = await resetLink(me);
            // 링크를 받은 뒤 소셜 전용 계정으로 바꿈 (시험 DB의 has_local_password = 0, e2e 소셜 시험과 같은 법)
            await k.makeSocialOnly(me.account.uuid);
            await k.openResetLink(me.page, url);
            await k.submitNewPassword(me.page, k.testPassword());
            await expect(me.page.getByText('소셜 로그인으로 가입한 계정이에요.', { exact: false })).toBeVisible();
            s.note('소셜 전용 계정의 링크로 새 비밀번호를 저장한 뒤 화면 (소셜 전용 판정은 저장할 때 서버가 함)');
        },
    },
    {
        id: '가-10',
        async prepare(s) {
            const me = await s.person();
            await me.page.goto('/roomInvite');
            await me.page.getByRole('textbox', { name: /방 코드/ }).first().click();
            s.note('첫 칸에 초점 둠 → 아무 6자리를 빠르게 침 (방이 없어도 됨, 참여하기는 안 눌러도 됨)');
        },
    },
    {
        id: '가-11',
        async prepare(s) {
            await s.person();
            s.note('로비 오른쪽 위: 톱니 누르고 1초 기다려 주소가 /lobby 그대로인지 → 배너 누르면 마이페이지');
        },
    },
    {
        id: '가-12',
        async prepare(s) {
            const me = await s.person();
            await k.gotoMyPage(me.page);
        },
    },
    {
        id: '가-13',
        async prepare(s) {
            const me = await s.person();
            await k.gotoAccount(me.page);
            await k.failCurrentPassword(me.page, 5);
            const status = await k.changePasswordUi(me.page, { current: me.account.password, next: k.testPassword() });
            if (status !== 429) throw new Error(`잠김 응답이 아님 (${status})`);
            await expect(k.pwSection(me.page).getByText(k.TEXT.currentPwLocked, { exact: true })).toBeVisible();
        },
    },
    {
        id: '가-14',
        async prepare(s) {
            const me = await s.person();
            await k.gotoAccount(me.page);
            const button = await k.fillPasswordChange(me.page, { current: me.account.password, next: k.testPassword() });
            await button.scrollIntoViewIfNeeded();
            s.note('맞는 현재 비밀번호·새 비밀번호를 채워 둠 → "변경"을 누름. 여러 번 보려면 again (새 계정으로 다시 채움)');
        },
    },
    {
        id: '가-15',
        async prepare(s) {
            const me = await s.person();
            // 저장 요청만 500으로 답함 (e2e 상점 시험처럼 가로채기로 실패를 만듦, 서버 값은 안 바뀜)
            await me.page.route(`${E2E.apiUrl}/user/me/emoji-palette`, (route) => (route.request().method() === 'PUT'
                ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, message: '서버 오류가 발생했습니다.' }) })
                : route.fallback()));
            await me.page.goto('/mypage/emoticons');
            await expect(slot(me.page, 1)).toBeEnabled();
            // 3번 칸 고르고 1번 칸 것을 넣어 둘을 바꿈 → 저장
            const name = await slot(me.page, 1).locator('img').getAttribute('alt');
            await slot(me.page, 3).click();
            await me.page.getByRole('list', { name: '이모티콘 목록' }).getByRole('button', { name: `${name} 팔레트에 넣기`, exact: true }).click();
            await me.page.getByRole('button', { name: '저장', exact: true }).click();
            await sleep(1500);
            s.note('저장 요청을 일부러 500으로 답하게 해 둠 → 다시 "저장"을 눌러도 같은 실패');
        },
    },
    {
        id: '가-16',
        async prepare(s) {
            // ① 잔액 모자람: 골드 700 + 500골드 스킨 둘 일괄구매 → 단추 꺼짐 + 까닭
            const poor = await s.person({ label: '잔액 모자람' });
            await st.grant(poor.account.uuid, 'GOLD', 700);
            await openSkin(poor.page);
            await poor.page.getByRole('button', { name: '일괄구매' }).click();
            await poor.page.getByRole('button', { name: SKIN2.slot, exact: true }).click();
            await expect(buyButton(poor.page)).toBeDisabled();
            await expect(st.detail(poor.page).getByTestId('purchase-block-reason')).toBeVisible();
            // ② 하나 구매 실패: 서버로 먼저 사 둔 스킨을 화면에서 삼 → 단추 바로 아래 실패 글
            const one = await s.person({ big: true, label: '하나 구매 실패' });
            await st.grant(one.account.uuid, 'GOLD', 1000);
            await openSkin(one.page);
            await buyByApi(one.context, [SKIN.id]);
            await buyButton(one.page).click();
            await expect(st.detail(one.page).getByText('이미 보유한 상품입니다.')).toBeVisible();
            // ③ 일괄구매 창 실패: 창을 연 사이 그중 하나를 서버로 삼 → 창 안 단추 바로 위 실패 글
            const bulk = await s.person({ big: true, label: '일괄구매 창 실패' });
            await st.grant(bulk.account.uuid, 'GOLD', 1500);
            await openSkin(bulk.page);
            await bulk.page.getByRole('button', { name: '일괄구매' }).click();
            await bulk.page.getByRole('button', { name: SKIN2.slot, exact: true }).click();
            await buyButton(bulk.page).click();
            const dialog = bulk.page.getByRole('dialog', { name: '선택 상품 구매 확인' });
            await expect(dialog).toBeVisible();
            await buyByApi(bulk.context, [SKIN2.id]);
            await dialog.getByRole('button', { name: '구매하기' }).click();
            await expect(dialog.getByText('구매가 거부되었습니다.', { exact: false })).toBeVisible();
            s.note('창 셋: 잔액 모자람(단추 꺼짐+까닭) · 하나 구매 실패(단추 바로 아래) · 일괄구매 창 실패(창 안 단추 바로 위)');
        },
    },
    {
        id: '가-17',
        async prepare(s) {
            const me = await s.person();
            // 지급 대기 주문(시험 DB)을 둔 채 실패 주소로 들어옴 → 그 주문 완료 안내와 카드 거절 안내가 같이 뜸 (e2e A12-E-044와 같은 법, 결제사 요청 없음)
            await st.createTopupOrder(me.account.uuid, { status: 'PENDING_GRANT' });
            await st.gotoStore(me.page, '/store?topup=fail&code=REJECT_CARD_COMPANY');
            await expect(me.page.getByText('카드사에서 결제를 거절했습니다.', { exact: false })).toBeVisible();
            await expect(me.page.getByText('충전이 완료되었습니다.').first()).toBeVisible({ timeout: 20_000 });
            s.note('"충전이 완료되었습니다."(다른 주문)와 카드 거절 안내가 둘 다 보여야 함');
        },
    },
    {
        id: '가-18',
        async prepare(s) {
            await friendWithBot(s);
            s.note('친구 1명(봇)을 맺어 둠');
        },
    },
    {
        id: '가-19',
        async prepare(s) {
            const { bot, row } = await friendWithBot(s);
            await askButton(row, bot.nickname).click();
            await expect(row.getByText('친구를 끊을까요?', { exact: true })).toBeVisible();
            s.note('"끊기"를 한 번 눌러 둠 → 취소·확인 둘 다 눌러 봄 (취소 뒤 다시 끊기를 눌러 확인)');
        },
    },
    {
        id: '가-20',
        async prepare(s) {
            const me = await s.person();
            const [bot] = await s.spawnBots(1);
            const box = await K.search(me.page, bot.nickname);
            const row = K.candidateRow(me.page, bot.account.uuid);
            await K.sendButton(row, bot.nickname).click();
            await expect(row.getByRole('button', { name: K.TEXT.sentDone })).toBeVisible();
            await box.fill('');
            await expect(K.panel(me.page).locator('li[data-outgoing-request-id]').filter({ hasText: bot.nickname })).toBeVisible();
            s.note(`봇(${bot.nickname})에게 신청을 보내 둠 → 보낸 신청 줄의 "취소"를 누름`);
        },
    },
];
