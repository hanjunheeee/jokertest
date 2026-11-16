'use strict';

// 서버 2대 로그인 잠금·친구 접속 표시 브라우저 시험 (어려움) — 틀린 비번을 두 서버에 나눠 쳐도 5번에 잠기고, 친구가 다른 서버 방으로 옮겨 붙는 동안 접속 표시가 꺼졌다 켜지지 않음
// 목록 A17-서버-여러대.md 번호 A17-H-039~040 (PC 로그인 실패 글은 브라우저 알림 창이라 글만 봄, E2E_NODES=2에서만 돎), 모임만: E2E_NODES=2 npx playwright test --list --no-deps tests/multinode/a17-auth.spec.js
const K = require('./_a17-kit');
const { ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { makeFriends } = require('../../helpers/friends');
const L = require('../lobby/lobbyHelpers');
const C = require('../ingame/c-chat/_lib');

const { test, expect, mn, N1, N2, U } = K;

const LOCKED = '비밀번호 연속 오류로 계정이 잠겼습니다. 잠시 후 다시 시도해주세요.';
const WRONG_PASSWORD = 'Wrong!pass-0000';

// 이 창의 로그인 요청은 그 서버가 받게 함 (앞단이 주소의 ?node=를 보고 고름)
async function loginVia(page, node) {
    await page.route('**/auth/login', (route) => route.continue({ url: `${route.request().url()}?node=${encodeURIComponent(node)}` }));
}

// 로그인 칸 채우고 "로그인" → 뜬 알림 글
async function loginAlert(page, email, password) {
    await page.goto('/login');
    await page.getByPlaceholder('이메일을 입력하세요').fill(email);
    await page.getByPlaceholder('비밀번호를 입력하세요', { exact: true }).fill(password);
    return ui.captureAlert(page, () => page.getByRole('button', { name: '로그인', exact: true }).click());
}

test('A17-H-039 틀린 비번을 창1(서버 ㄱ) 3번·창2(서버 ㄴ) 2번 → 5번째에 "비밀번호를 5회 잘못 입력하여 15분간 계정이 잠깁니다." @hard @smoke', async ({ accounts, players }) => {
    const account = await accounts.create();
    const first = await players.add({ login: false, lobby: false });
    const second = await players.add({ login: false, lobby: false });
    await loginVia(first.page, N1);
    await loginVia(second.page, N2);

    // 서버 ㄱ으로 3번 (아직 잠금 글 아님)
    for (let i = 1; i <= 3; i += 1) {
        expect(await loginAlert(first.page, account.email, WRONG_PASSWORD), `서버 ㄱ ${i}번째 틀림`).not.toBe(K.TEXT.loginLocked);
    }
    // 서버 ㄴ으로 2번: 합쳐 4번째는 아직, 5번째에 잠금 글
    expect(await loginAlert(second.page, account.email, WRONG_PASSWORD), '서버 ㄴ 1번째(합 4번째) 틀림').not.toBe(K.TEXT.loginLocked);
    expect(await loginAlert(second.page, account.email, WRONG_PASSWORD), '서버 ㄴ 2번째(합 5번째) 틀림').toBe(K.TEXT.loginLocked);

    // 잠긴 뒤엔 맞는 비번도 어느 서버에서나 거절, 로그인 화면 그대로
    expect(await loginAlert(first.page, account.email, account.password), '잠긴 뒤 맞는 비번 (서버 ㄱ)').toBe(LOCKED);
    await expect(first.page).toHaveURL(/\/login/);
    await expectReadable(first.page.getByRole('button', { name: '로그인', exact: true }), { contrast: false });
});

test('A17-H-040 ㄴ이 친구 목록을 띄운 채 ㄱ이 서버 ㄱ 로비에서 서버 ㄴ 방 코드로 옮김 → ㄴ 화면 ㄱ 표시가 한 번도 오프라인이 안 됨 @hard', async ({ crowd, bots }) => {
    const a = await crowd.on(N1);
    const b = await crowd.on(N2);
    await makeFriends(a, b);

    // ㄴ: 로비를 다시 열어(이때부터 받는 알림을 적어 둠) 친구 목록을 띄움 → ㄱ "접속 중"
    const frames = C.watchSocket(b.page);
    await K.lobbyOn(b, N2);
    const panel = await L.openFriendPanel(b.page);
    const row = panel.locator(`[data-friend-id="${U(a)}"]`);
    await expectReadable(row.getByText('접속 중', { exact: true }), { timeout: 15_000 });

    // ㄱ 줄의 접속 표시가 바뀔 때마다 적어 둠 (잠깐 스친 것도 잡음): ONLINE = "접속 중" 줄이 보임
    await b.page.evaluate((id) => {
        const log = [];
        window.__a17Presence = log;
        let last = null;
        const scan = () => {
            const el = document.querySelector(`[data-friend-id="${id}"]`);
            const now = el && el.textContent.includes('접속 중') ? 'ONLINE' : 'NOT_ONLINE';
            if (now !== last) { log.push(now); last = now; }
        };
        new MutationObserver(scan).observe(document.body, { subtree: true, childList: true, characterData: true });
        scan();
    }, U(a));
    const seen = () => b.page.evaluate(() => window.__a17Presence);

    // ㄱ: 서버 ㄱ 로비 → 서버 ㄴ 방 코드 → 서버 ㄴ으로 옮겨 붙음 (소켓이 한 번 끊겼다 다시 붙음)
    const [host] = await mn.botsOn(bots, 1, N2);
    const room = await host.createRoom();
    await ui.joinRoomByCodeUi(a.page, room.roomCode);
    expect(await K.roomNodeOf(U(a)), 'ㄱ이 들어간 방의 서버').toBe(N2);
    await expect.poll(() => K.hintOf(a.page), { message: 'ㄱ이 옮겨 붙은 서버 힌트' }).toBe(N2);
    expect(await seen(), '옮기는 동안 ㄱ 표시').toEqual(['ONLINE']);

    // 끝 표시: ㄱ이 진짜로 나감(창 닫음) → 그제야 처음으로 접속 중이 아님
    await a.context.close();
    await expect.poll(async () => (await seen()).at(-1), { timeout: 30_000, message: 'ㄱ이 나간 뒤 표시' }).toBe('NOT_ONLINE');
    expect(await seen(), 'ㄱ 표시가 바뀐 차례').toEqual(['ONLINE', 'NOT_ONLINE']);
    // 받은 접속 알림도 같음: ㄱ의 OFFLINE은 맨 끝 한 번뿐
    const statuses = frames.filter((r) => r.event === 'friend_status_change' && r.payload?.uuid === U(a)).map((r) => r.payload.status);
    expect(statuses.filter((s) => s === 'OFFLINE'), 'ㄱ OFFLINE 알림 수').toHaveLength(1);
    expect(statuses.at(-1), '마지막 알림').toBe('OFFLINE');
});
