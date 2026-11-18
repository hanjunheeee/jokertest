'use strict';

// 사 묶음 장면 (판 끝·결과, 5명 판을 끝까지) 6줄 — 결과 화면·새로고침/끊김·대기방으로·로비로·끊겨 빠진 사람·창 닫고 새 창
// run.js가 읽음 — 앉히기·시작은 미리(prepare), 결과 화면은 180초 뒤 저절로 닫혀서 판 끝내기는 보여 줄 때(show), 도우미는 _sa-kit.js
const S = require('./_sa-kit');

const { U, K, H, HH, expect } = S;

// 사람 1 + 봇 4 (봇 방장 귀족·귀족·의사·광대) — 광대 봇이 나가거나 처형되면 시민 승
const FIVE = ['CITIZEN', 'CITIZEN', 'DOCTOR', 'JOKER'];
const stillOnResult = (s) => S.onResult(s.main) && S.board(s.main).isVisible();

module.exports = [
    {
        id: '사-01',
        showTimeoutMs: 150_000,
        async prepare(s) {
            const me = await s.person({ label: '나 (귀족)' });
            // 마녀사냥꾼 이름이 결과판에 맞게 나오는지 보려고 마녀사냥꾼 봇을 넣음
            await S.openTable(s, { humans: [me], botRoles: ['CITIZEN', 'DOCTOR', 'WITCH_HUNTER', 'JOKER'] });
            s.note('5명 판: 나(귀족) + 봇 4(귀족 방장·의사·마녀사냥꾼·광대), 보여 줄 때 봇 표로 광대를 처형해 시민 승으로 끝냄 (20~40초)');
        },
        async show(s) {
            const t = s.state.table;
            const st = await t.state();
            const nameOf = (role) => st.players.filter((p) => p.role === role).map((p) => p.nickname).join(', ');
            await S.endByVote(t);
            await S.toResult(s.main, { expulsion: true });
            s.note(`결과판에서 볼 직업: 마녀사냥꾼 = ${nameOf('WITCH_HUNTER')}, 의사 = ${nameOf('DOCTOR')}, 광대 = ${nameOf('JOKER')}`);
            s.note('결과 화면은 180초 뒤 저절로 닫힘 → 지나가면 again');
        },
        still: stillOnResult,
    },
    {
        id: '사-02',
        showTimeoutMs: 120_000,
        // 보여 준 뒤 끊기·잇기가 끝난 화면을 찍음 (4초 + 끊김 6초 + 다시 붙기)
        settleMs: 22_000,
        async prepare(s) {
            const me = await s.person({ label: '나' });
            // 화면 소켓 길목은 판에 들어가기 전에 걸어야 그 뒤 소켓이 이 길로 감
            s.state.gate = await HH.socketGate(me);
            await S.openTable(s, { humans: [me], botRoles: FIVE });
            s.note('보여 줄 때 광대 봇이 나가 판이 끝남 → 결과 화면 → 4초 뒤 도구가 연결을 끊고 6초 뒤 다시 이음');
            s.note('새로고침은 e2e 시험(A08-E-029)대로 "게임 결과를 확인할 수 없습니다"가 뜨는 게 지금 동작 — 이 줄은 끊었다 잇기만 봄');
        },
        async show(s) {
            const page = s.main;
            const { gate } = s.state;
            await S.endByLeave(s.state.table);
            await S.toResult(page);
            s.background((async () => {
                await S.sleep(4000);
                await gate.cut();
                s.note('연결 끊음 (6초 동안)');
                await S.sleep(6000);
                const before = gate.opened;
                await gate.open();
                await expect.poll(() => gate.opened, { timeout: 30_000, message: '화면 소켓이 다시 붙음' }).toBeGreaterThan(before);
                await S.sleep(2000);
                const kept = await S.board(page).isVisible().catch(() => false);
                const gone = await page.getByText(H.TEXT.noResult, { exact: true }).isVisible().catch(() => false);
                s.note(`다시 이은 뒤 (도구가 봄): 결과판 ${kept ? '그대로' : '없음'} · "게임 결과를 확인할 수 없습니다" ${gone ? '뜸' : '안 뜸'}`);
            })());
        },
        still: stillOnResult,
    },
    {
        id: '사-03',
        showTimeoutMs: 150_000,
        settleMs: 8000,
        async prepare(s) {
            const me = await s.person({ label: '나 (먼저 누름)' });
            await S.openTable(s, { humans: [me], botRoles: FIVE });
            s.note(`판 전 방 코드: ${s.state.room.roomCode} (대기방 "초대코드 공유"에서 같은지 봄), 정원 5·토론 150·투표 90·재판 120·밤 120초`);
            s.note('보여 줄 때 판을 끝내고 내가 먼저 "대기방으로" → 5초 뒤 봇 하나가 나중에 누름. 원래 방장 봇은 결과 화면에 그대로 → "방장 자리" 칸 180초');
        },
        async show(s) {
            const t = s.state.table;
            await S.endByLeave(t);
            await S.toResult(s.main);
            await H.pressReturn(s.main);
            const st = await t.state();
            const host = t.bots[0];
            // 나중에 누를 봇: 방장도 광대(나감)도 아닌 봇
            const later = t.bots.find((b) => b !== host && K.roleOf(st, U(b)) !== 'JOKER');
            s.background((async () => {
                await S.sleep(5000);
                await H.botReturn(later, t.gameId);
                s.note(`나중에 누른 사람: ${later.nickname} (5초 뒤) — 대기방 명단에 들어옴, 결과 화면에 남은 방장·광대는 안 끌려옴`);
            })());
        },
        still: (s) => H.hostSeat(s.main).isVisible(),
    },
    {
        id: '사-04',
        showTimeoutMs: 120_000,
        async prepare(s) {
            const me = await s.person({ label: '나' });
            await S.openTable(s, { humans: [me], botRoles: FIVE });
            s.note('보여 줄 때 광대 봇이 나가 판이 끝남 → 결과 화면');
            s.note('사람이 누를 것: 결과 화면 "로비로" → 확인 창 글을 보고 "취소" (확인 창은 브라우저 창이라 사진에 안 찍힘)');
        },
        async show(s) {
            await S.endByLeave(s.state.table);
            await S.toResult(s.main);
        },
        still: stillOnResult,
    },
    {
        id: '사-05',
        showTimeoutMs: 150_000,
        async prepare(s) {
            const me = await s.person({ label: '나 (끊겨 빠짐)' });
            s.state.gate = await HH.socketGate(me);
            await S.openTable(s, { humans: [me], botRoles: FIVE });
            s.note('보여 줄 때: 판 끝 → 결과 화면 → 도구가 연결을 끊고 "대기방으로" (연결 끊김 안내) → 다시 이은 뒤 "대기방으로"를 다시 누름');
        },
        async show(s) {
            const page = s.main;
            const { gate } = s.state;
            await S.endByLeave(s.state.table);
            await S.toResult(page);
            // 끊기는 순간 서버는 끝난 판에서 그 사람을 뺌 (e2e A08-H-046)
            await gate.cut();
            await H.returnButton(page).click();
            await expect(H.leaveNotice(page)).toHaveText(H.TEXT.returnOffline, { timeout: 15_000 });
            await gate.open();
            await expect(async () => {
                await H.returnButton(page).click({ timeout: 2000 });
                await expect(H.leaveNotice(page)).toHaveText(H.TEXT.returnDropped, { timeout: 3000 });
            }).toPass({ timeout: 40_000 });
            s.note('"대기방으로"를 다시 눌러도 같은 글 (결과 화면 시간은 남아 있음)');
        },
        still: (s) => H.leaveNotice(s.main).isVisible(),
    },
    {
        id: '사-06',
        async prepare(s) {
            const me = await s.person({ label: '나 (창 닫았다 새 창)' });
            const t = await S.openTable(s, { humans: [me], botRoles: FIVE });
            // 판 중 창 닫기 → 닫힌 동안 광대 봇이 나가 판 끝 → 같은 브라우저 새 창으로 로비
            await S.closeTab(t, me);
            await S.endByLeave(t);
            await expect.poll(async () => (await t.state())?.phase ?? 'ENDED', { timeout: 20_000, message: '판 끝' }).toBe('ENDED');
            const tab = await S.reopen(s, me);
            await S.ui.gotoLobby(tab);
            s.note('판 중 창을 닫음 → 닫힌 동안 판이 끝남 → 같은 브라우저 새 창으로 로비에 옴');
            s.note('사람이 누를 것: "방 만들기" → "게임 만들기" → "이미 참여 중인 방" 없이 새 대기방이 열려야 함');
            s.note('"산 사람이 판 중이면 판으로 되돌아감"은 아-04(60초 안에 돌아옴)에서 같이 봄');
        },
        still: (s) => /\/lobby/.test(s.main.url()),
    },
];
