'use strict';

// 아 묶음 장면 (나가기·끊김·탈주, 5명 판) 6줄 — 산 사람·죽은 사람 나가기 확인 창, 탈주 막힘, 60초 안/넘겨 돌아옴, 죽은 뒤 풀림, 다른 기기 로그인
// run.js가 읽음 — 창을 닫거나 판을 나가 판이 망가지므로 장면마다 새 판, 시간이 흐르면 안 되는 것(탈주 5분·초대 3분)은 보여 줄 때(show), 도우미는 _sa-kit.js
const S = require('./_sa-kit');

const { U, K, HH, expect } = S;

// 사람 1 + 봇 4 (봇 방장 귀족·귀족·의사·광대) — 사람이 죽거나 나가도 광대 1 : 나머지 3이라 판이 이어짐
const FIVE = ['CITIZEN', 'CITIZEN', 'DOCTOR', 'JOKER'];
const inGame = (s) => /\/ingame/.test(s.main.url());

// 판 열고 첫 낮까지, 떠 있는 안내 창 닫음 → Table
async function dayOne(s, humans, botRoles = FIVE) {
    const t = await S.openTable(s, { humans, botRoles });
    await K.toDay(t);
    for (const h of humans) await K.clear(h.page);
    return t;
}

module.exports = [
    {
        id: '아-01',
        async prepare(s) {
            const me = await s.person({ label: '나 (산 사람)' });
            await dayOne(s, [me]);
            s.note('5명 판 첫 낮, 나는 산 귀족');
            s.note('사람이 누를 것: 왼쪽 위 "게임 나가기" → 확인 창 글을 보고 "취소" (확인 창은 브라우저 창이라 사진에 안 찍힘)');
        },
        still: inGame,
    },
    {
        id: '아-02',
        async prepare(s) {
            const me = await s.person({ label: '나 (처형됨)' });
            const t = await S.openTable(s, { humans: [me], botRoles: FIVE });
            // 봇 4표로 나를 처형 (나는 기권) → 사망 창
            await K.execute(t, U(me));
            await K.waitDeadChoice(me.page);
            s.note('봇 표로 내가 처형됨 → "사망 후 선택" 창');
            s.note('사람이 누를 것: 사망 창(또는 왼쪽 위)의 "게임 나가기" → 확인 창 글을 보고 "취소"');
        },
        still: (s) => K.deadChoice(s.main).isVisible(),
    },
    {
        id: '아-03',
        showTimeoutMs: 120_000,
        async prepare(s) {
            const me = await s.person({ label: '나 (탈주)' });
            // 초대를 보낼 친구 봇은 판 전에 맺어 둠
            s.state.friend = await S.befriend(s, me);
            await dayOne(s, [me]);
            s.note('보여 줄 때 내가 산 채로 "게임 나가기"(탈주 1번째 → 5분 막힘) → 도구가 방 만들기를 한 번 눌러 봄');
        },
        async show(s) {
            const page = s.main;
            const [me] = s.people;
            await K.leaveAlive(page);
            s.state.desertedAt = Date.now();
            const room = await S.inviteFrom(s.state.friend, me);
            const text = await K.createRoomAlert(page);
            s.note(`도구가 방 만들기를 눌러 본 글: "${text}" (알림 창은 닫았고 같은 글이 화면 위 띠에 남음)`);
            s.note(`사람이 해 볼 것: 코드 입장 "${room.roomCode}" / 로비 친구 목록 → "게임 초대" → ${s.state.friend.nickname} 초대 수락 (초대는 3분 뒤 사라짐) — 모두 탈주 글로 막혀야 함`);
        },
        // 첫 탈주 막힘 5분 (조금 앞서 지나감으로 알림)
        still: (s) => Date.now() - (s.state.desertedAt ?? Date.now()) < 290_000,
    },
    {
        id: '아-04',
        async prepare(s) {
            const a = await s.person({ label: '사람1 (60초 안에 돌아옴)' });
            const b = await s.person({ label: '사람2 (60초 넘겨 돌아옴)' });
            // 5명 판: 사람 2 + 봇 3 (봇 방장 귀족·의사·광대)
            const t = await dayOne(s, [a, b], ['CITIZEN', 'DOCTOR', 'JOKER']);
            // 둘 다 창 닫기 → 서버가 끊김을 앎
            await Promise.all([S.closeTab(t, a), S.closeTab(t, b)]);
            // 사람1: 몇 초 만에 같은 브라우저 새 창으로 로비 → 판으로 되돌아감
            const back = Date.now();
            const tabA = await S.reopen(s, a);
            await tabA.goto('/lobby');
            await expect(tabA).toHaveURL(/\/ingame/, { timeout: 20_000 });
            await K.returnedAt(t, U(a), back);
            await K.clear(tabA);
            // 사람2: 60초를 손잡이로 끝냄 → 탈락 → 새 창으로 판 화면
            await expect.poll(async () => (await t.expireGraces()).fired, { timeout: 15_000, message: '사람2 탈락' }).toContain(U(b));
            const tabB = await S.reopen(s, b);
            // 창 보이는 모드는 알림 창을 사람이 닫게 둠 → 글만 받아 둠 (창 없는 모드는 session이 닫음)
            const seen = [];
            tabB.on('dialog', (d) => seen.push(d.message()));
            await tabB.goto('/ingame', { waitUntil: 'commit' });
            await expect.poll(() => seen.includes(K.FORFEIT_TEXT), { timeout: 30_000, message: `까닭 글 알림 (받은 글 ${JSON.stringify(seen)})` }).toBe(true);
            s.note('사람1(큰 창): 판 중 창을 닫고 몇 초 만에 새 창으로 돌아옴 → 판 그대로 이어짐 (로비 주소로 와도 판으로 되돌아감)');
            s.note(`사람2(작은 창): 창을 닫고 60초를 도구 손잡이로 넘김 → 새 창에 알림 "${K.FORFEIT_TEXT}" (창 보이는 모드는 알림 창을 직접 닫음 → 방 목록)`);
            s.note('사람1 창에 역할 창이 다시 뜰 수 있음 (낮 토론 중 다시 들어오면 뜨는 게 지금 동작, 바-15) → "확인"으로 닫고 판을 봄');
            s.note('60초를 진짜로 기다리진 않음 (진짜 시간은 e2e A09-H-003이 봄)');
        },
        still: inGame,
    },
    {
        id: '아-05',
        showTimeoutMs: 90_000,
        async prepare(s) {
            const me = await s.person({ label: '나 (죽은 뒤 나감)' });
            s.state.friend = await S.befriend(s, me);
            const t = await S.openTable(s, { humans: [me], botRoles: FIVE });
            await K.execute(t, U(me));
            await K.pressDeadExit(me.page, { accept: true });
            await expect(me.page).toHaveURL(/\/multiplay/, { timeout: 15_000 });
            await S.ui.gotoLobby(me.page);
            s.note('봇 표로 내가 처형됨 → 사망 창 "게임 나가기" → 로비 (판은 아직 계속 중)');
        },
        async show(s) {
            const room = await S.inviteFrom(s.state.friend, s.people[0]);
            s.note(`사람이 해 볼 것 (하나만): "방 만들기" → "게임 만들기" / 코드 입장 "${room.roomCode}" / 친구 목록 → "게임 초대" → ${s.state.friend.nickname} 초대 수락 — 탈주 글 없이 바로 대기방`);
            s.note('초대는 3분 뒤 사라짐 → 지나가면 again');
        },
        still: (s) => /\/lobby/.test(s.main.url()),
    },
    {
        id: '아-06',
        settleMs: 15_000,
        async prepare(s) {
            const watcher = await s.person({ label: '보는 사람' });
            const a = await s.person({ label: '사람A (옛 기기)' });
            // 같은 계정 새 기기 창: 아직 로그인 안 함 (보여 준 뒤 로그인)
            const other = await s.person({ label: '사람A (새 기기)', account: a.account, login: false, big: false });
            await dayOne(s, [watcher, a], ['CITIZEN', 'DOCTOR', 'JOKER']);
            await HH.watchStatus(watcher.page, a.account.nickname);
            s.state.pair = { watcher, a, other };
            s.note(`큰 창 = 보는 사람, 작은 창 = 사람A 옛 기기·새 기기. 보여 주고 5초 뒤 도구가 새 기기로 같은 계정 로그인`);
            s.note(`볼 곳: 큰 창의 ${a.account.nickname} 카드에 "연결 끊김" 표시가 1~2초 보이다 사라지고 판은 이어짐 (옛 기기는 로그인 화면)`);
        },
        async show(s) {
            const { watcher, a, other } = s.state.pair;
            s.background((async () => {
                await S.sleep(5000);
                await s.act(async () => {
                    await S.ui.loginViaApi(other.context, a.account);
                    await other.page.goto('/lobby');
                    await expect(other.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
                });
                await S.sleep(5000);
                const spans = await HH.statusSpans(watcher.page, a.account.nickname);
                const blips = spans.filter((x) => x.status === 'disconnected').map((x) => `${(x.ms / 1000).toFixed(1)}초`);
                s.note(`도구가 잰 끊김 표시: ${blips.length ? blips.join(', ') : '안 잡힘'} · 지금 상태 ${spans.at(-1)?.status ?? '?'}`);
            })());
        },
        still: inGame,
    },
];
