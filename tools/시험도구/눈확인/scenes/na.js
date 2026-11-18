'use strict';

// 나 묶음 장면 (혼자 폰: 로그인·가입·소셜 가입·마이페이지·비밀번호 바꾸기·친구 끊기) 7줄
// run.js가 읽음 — 들어가는 법·통과 글은 목록 글에서 번호로 채워짐, 여기엔 폰 창(5174)으로 그 화면까지 가는 준비만 (e2e 모바일 시험 도우미를 불러 씀)
const { fromE2e, e2eRequire } = require('../lib/paths');

const { expect } = e2eRequire('@playwright/test');
const { E2E } = fromE2e('helpers/env');
const accounts = fromE2e('helpers/accounts');
const A = fromE2e('tests/auth/authHelpers');
const M = fromE2e('tests/auth/_a11a-kit');
const k = fromE2e('tests/auth/_a11b-kit');
const social = fromE2e('tests/auth/socialHelpers');
const K = fromE2e('tests/social/_a13-kit');

const MOBILE_ONLY = ['mobile'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 그 주소 요청만 ms만큼 늦게 보냄 → 누르는 동안 꺼진 단추·"확인 중" 글을 사람이 볼 틈
async function slowDown(page, url, ms = 3000) {
    await page.route(url, async (route) => {
        await sleep(ms);
        await route.continue().catch(() => {});
    });
}

// 폰 창 하나 (기본 로그인·로비)
const phone = (s, o = {}) => s.person({ mobile: true, ...o });

// 폰 친구 시트에 봇 친구 하나 (가 묶음 friendWithBot의 폰판)
async function friendWithBot(s) {
    const me = await phone(s);
    const [bot] = await s.spawnBots(1);
    await K.befriendBot(me, bot);
    await K.showList(me.page);
    const row = K.friendRow(me.page, bot.account.uuid);
    await expect(row).toBeVisible();
    return { me, bot, row };
}

module.exports = [
    {
        id: '나-01',
        needs: MOBILE_ONLY,
        async prepare(s) {
            const account = await accounts.createAccount();
            const me = await phone(s, { login: false, account });
            await slowDown(me.page, `${E2E.apiUrl}/auth/login`);
            await A.fillLogin(me.page, account.email, account.password);
            s.note('로그인 칸은 채워 둠 → "로그인"을 누르면 요청을 일부러 3초 늦춰 둬서 그동안 단추가 꺼져 있는지 봄');
            s.note('고객센터 링크는 시험 화면 빌드에 VITE_SUPPORT_URL 값이 없어 안 보임 → 그 부분만 손으로 (개발 서버에 값 넣고)');
        },
    },
    {
        id: '나-02',
        needs: MOBILE_ONLY,
        async prepare(s) {
            const me = await phone(s, { login: false });
            await me.page.goto('/login?socialError=OAUTH_CANCELLED');
            await expect(me.page.getByRole('alert')).toHaveText('소셜 로그인을 취소했습니다.');
        },
    },
    {
        id: '나-03',
        needs: MOBILE_ONLY,
        async prepare(s) {
            // 폰 창 하나에 가-03~05 세 가지를 차례로 (중복 확인 결과 → 인증번호 7자 → 비밀번호 두 칸은 비워 둠)
            const me = await phone(s, { login: false });
            const taken = await accounts.createAccount();
            const email = M.newEmail('eye');
            await M.openSignup(me.page);
            await M.fillSignup(me.page, { email });
            await me.page.getByRole('button', { name: '이메일 중복확인' }).click();
            await expect(me.page.getByText('사용할 수 있는 이메일입니다.')).toBeVisible();
            await M.requestCode(me.page, email);
            await M.codeInput(me.page).click();
            await me.page.keyboard.type('1234567');
            await expect(M.codeInput(me.page)).toHaveValue('123456');
            // 다시 중복 확인을 눌러 볼 때 "확인 중" 글이 3초 보이게
            await slowDown(me.page, (url) => url.href.startsWith(`${E2E.apiUrl}/auth/check-email`));
            s.note('이메일 중복 확인 = 초록 글(두 줄 꺾임) · 인증번호 칸에 1234567을 쳐 둠 → 123456만 남아야 함');
            s.note('비밀번호 두 칸은 비워 둠 → 칸 안내 "(8~64자, 영문·숫자 포함)" 보고, 영문만(예 abcdefgh) 두 칸에 쳐서 닉네임 칸 Enter → 알림 글');
            s.note(`빨강 글을 보려면 이메일 칸을 있는 주소 ${taken.email} 로 바꿔 중복 확인 (3초 동안 "확인 중" 글)`);
        },
    },
    {
        id: '나-04',
        needs: MOBILE_ONLY,
        async prepare(s) {
            // 소셜 가입 시작 = 제공자 왕복 대신 시험 DB에 가입 의도 + 이 브라우저 시도 쿠키 (e2e A11-H-008과 같은 법) → /login?socialIntent=…
            const me = await phone(s, { login: false });
            const intent = await social.prepareSocialSignup(me.context, { provider: 'google', email: M.newEmail('eyes') });
            await me.page.goto(`/login?socialIntent=${encodeURIComponent(intent.intentToken)}`);
            await M.nicknameBox(me.page).fill(M.newNickname('n'));
            await M.agreeAll(me.page);
            // 생년월일을 비운 채 가입 완료 → 화면이 막고 오류 줄을 띄움
            await me.page.getByRole('button', { name: '가입 완료' }).click();
            await expect(me.page.getByRole('alert').first()).toBeVisible();
            s.note('소셜 가입 칸에서 생년월일을 비우고 "가입 완료"를 눌러 둠 → 칸 아래 빨간 오류 줄이 읽히는지 봄');
        },
    },
    {
        id: '나-05',
        needs: MOBILE_ONLY,
        async prepare(s) {
            const me = await phone(s);
            await k.gotoMyPage(me.page);
            await expect(k.statValue(me.page, '전체 판수')).toBeVisible();
            s.note('새 계정이라 숫자는 0·0% → 피의 기록 틀 안 숫자가 읽히는지 봄');
        },
    },
    {
        id: '나-06',
        needs: MOBILE_ONLY,
        async prepare(s) {
            const me = await phone(s);
            await k.gotoAccount(me.page);
            const button = await k.fillPasswordChange(me.page, { current: me.account.password, next: k.testPassword() });
            await button.scrollIntoViewIfNeeded();
            s.note('맞는 현재 비밀번호·새 비밀번호를 채워 둠 → "변경"을 누름 (성공하면 로그인 화면으로 감). 여러 번 보려면 again (새 계정으로 다시 채움)');
        },
    },
    {
        id: '나-07',
        needs: MOBILE_ONLY,
        async prepare(s) {
            const { bot, row } = await friendWithBot(s);
            await row.getByRole('button', { name: `${bot.nickname} 친구 끊기`, exact: true }).click();
            await expect(row.getByText('친구를 끊을까요?', { exact: true })).toBeVisible();
            s.note(`봇(${bot.nickname})과 친구를 맺고 "끊기"를 한 번 눌러 둠 → 이름을 눌러도 안 넘어가는지, 취소·확인 둘 다 눌러 봄`);
        },
    },
];
