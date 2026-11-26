'use strict';

// 바 묶음 뒤쪽 장면 (판 안: 새로고침·끊김·나가기·초대·폰 재판·폰 채팅·업적·서고) 바-15~27
// run.js가 읽음 — 판 차리기는 _ba2-kit(tableOf = e2e table 손잡이 흉내), 판 굴리기·고르개는 e2e 판 시험 도우미(_a04·_a09·c-chat·_talk·_a13)를 그대로 불러 씀
const { fromE2e, e2eRequire } = require('../lib/paths');
const { start } = require('../lib/table');
const K = require('./_ba2-kit');

const { expect } = e2eRequire('@playwright/test');
const ui = fromE2e('helpers/ui');
const db = fromE2e('helpers/db');
const { customRoleSettings } = fromE2e('helpers/game');
const A = fromE2e('tests/ingame/_a04-multi');
const K4 = fromE2e('tests/ingame/_a04-pc');
const K9 = fromE2e('tests/ingame/_a09-simple-kit');
const K9h = fromE2e('tests/ingame/_a09-hard-kit');
const C = fromE2e('tests/ingame/c-chat/_lib');
const night = fromE2e('tests/ingame/b-night/_night');
const m = fromE2e('tests/mobile/_talk');
const K13 = fromE2e('tests/social/_a13-kit');

const { U } = K;
// 화면 글 (frontend constants/actions/ingameActionPanel.js ACTION_DISCONNECTED_TEXT, frontend-mobile 채팅 글자 수 오류)
const DISCONNECTED_TEXT = '연결이 끊겼습니다. 다시 연결된 뒤 눌러 주세요.';
const TOO_LONG = '메시지는 150자 이하로 입력해주세요.';
const VOTE_10 = 'record-2-extra-mask';
const GAMES_3 = 'record-1-masquerade';

const inviteNotice = (page) => page.locator('[data-ingame-invite-notice]');
const settingsSheet = (page) => page.getByRole('dialog', { name: '인게임 설정' });
const voteStatus = (page) => page.getByRole('dialog', { name: '투표 현황' });
const sameText = (page, text) => page.getByText(text, { exact: true });

/**
 * 폰 1일 재판 (바-20·21이 같이 씀): 8자 닉네임 봇이 피고, 채팅방에 피고·봇 말 두 줄
 * 같은 판을 이어 받으면 그대로 돌려줌
 */
async function phoneTrial(s) {
    const tr = await K.phoneTable(s, { longName: true });
    if (!tr.trial) {
        const page = tr.me.page;
        await A.toVote(tr.t, 1);
        await A.toTribunal(tr.t, tr.long);
        await m.waitTrialTalk(page);
        await m.botSay(tr.t, tr.t.bots.indexOf(tr.long), '저는 억울합니다');
        await m.botSay(tr.t, 1, '변명은 그만 들을게요');
        tr.trial = true;
    }
    return tr;
}

/** 폰 낮 토론 채팅방이 쓸 수 있게 될 때까지 (연출 창·멈춘 영상 닫으며, e2e a06-talk-chat ready와 같은 방식) */
async function phoneChatReady(page) {
    await expect(async () => {
        const stuck = page.locator('[data-ingame-night-success-kill] button').first();
        if (await stuck.isVisible().catch(() => false)) await stuck.click({ timeout: 1000 }).catch(() => {});
        await m.clearOverlays(page);
        expect(await m.talk.input(page).evaluate((el) => !el.closest('[inert]') && !el.disabled, null, { timeout: 1000 })).toBe(true);
    }).toPass({ timeout: 40_000 });
}

/** 화면 소켓 글에서 업적 받음 신호를 기다렸다 덧붙임 한 줄 (표 낸 때·낮 투표 마감 때와 견줌) */
async function noteGrant(s, frames, { timeoutMs = 200_000 } = {}) {
    const until = Date.now() + timeoutMs;
    while (!s.closed && Date.now() < until) {
        const grant = frames.got.find((f) => f.dir === 'in' && f.event === 'achievement_granted' && f.data?.achievementId === VOTE_10);
        if (grant) {
            const vote = frames.got.find((f) => f.dir === 'out' && f.event === 'cast_day_vote');
            const resolved = frames.got.find((f) => f.dir === 'in' && f.event === 'day_vote_resolved');
            const sec = (from) => (from ? `${((grant.at - from.at) / 1000).toFixed(1)}초` : '?');
            s.note(`도구 확인: 업적 받음 신호 = 표 낸 뒤 ${sec(vote)} · 낮 투표 마감 알림 뒤 ${sec(resolved)}`);
            return true;
        }
        await K.sleep(300);
    }
    return false;
}

module.exports = [
    // ── PC: 새로고침·끊김·나가기·초대 (판이 망가져 장면마다 새 판) ──
    {
        id: '바-15',
        async prepare(s) {
            const me = await s.person({ label: '나 (귀족)' });
            const { t, d } = await A.startTrial(K.tableOf(s), { humans: [me], bots: 4 });
            s.state.t = t;
            s.note(`5명 판 1일 재판 중 (피고 봇 ${d.nickname}) — 보여 줄 때 도구가 이 창을 새로고침함`);
            s.note('새로고침 뒤 역할 확인 창이 다시 안 떠 유죄·무죄 단추를 안 가려야 함 · 내 직업은 위 줄 "내 역할 보기"로 봄 · F5로 다시 해 봐도 됨');
        },
        async show(s) {
            const page = s.main;
            await page.reload();
            await expect(A.trial.win(page)).toBeVisible({ timeout: 20_000 });
            await K.sleep(2500);
            const shown = await K.roleDialog(page).isVisible().catch(() => false);
            s.note(`도구 확인: 새로고침 2.5초 뒤 역할 확인 창 ${shown ? '보임 (이상)' : '안 보임'}`);
        },
        still: (s) => A.trial.win(s.main).isVisible(),
    },
    {
        id: '바-16',
        async prepare(s) {
            const me = await s.person({ label: '나 (귀족)' });
            const { t, d } = await A.startTrial(K.tableOf(s), { humans: [me], bots: 5 });
            s.state.t = t;
            s.state.d = d;
            s.note(`6명 판 1일 재판 중 (피고 봇 ${d.nickname}) — 보여 주고 3초 뒤 도구가 피고 봇을 판에서 스스로 나가게 함`);
            s.note('재판 창이 닫히고 추방 글 없이 밤 · 피고 카드는 사망 ("재판 취소" 아님)');
            s.note('뽑히는 순간 이미 끊긴 경우(재판 없이 밤)는 이 장면에서 안 봄');
        },
        async show(s) {
            const page = s.main;
            const { t, d } = s.state;
            await K.sleep(3000);
            const reply = await d.request('leave_game_session', { gameId: t.gameId });
            if (!reply?.ok) throw new Error(`피고 봇 나가기 실패: ${reply?.code ?? '답 없음'}`);
            await expect(A.trial.win(page)).toBeHidden({ timeout: 15_000 });
            const after = await A.waitState(t, (g) => g.phase !== 'TRIBUNAL');
            const row = A.playerOf(after, U(d));
            s.note(`도구 확인: 판 단계 ${after.phase}, 피고 ${row?.alive === false ? '사망' : '살아 있음 (이상)'}`);
        },
        still: async (s) => (await s.state.t.state())?.phase === 'NIGHT',
    },
    {
        id: '바-17',
        async prepare(s) {
            const me = await s.person({ label: '나 (귀족, 처형됨)' });
            const t = await K.tableOf(s).setup({ humans: [me], bots: 4, roles: A.plainRoles() });
            s.state.t = t;
            await ui.readRoleReveal(me.page);
            // 봇 표로 나를 처형 → 봇은 멈춤 (판이 저절로 안 끝나게)
            await C.executeByBots(t, U(me));
            await t.stopBots();
            await K9.waitDeadChoice(me.page);
            s.note('5명 판 1일 재판에서 처형됨 — 보여 줄 때 도구가 "사망 후 선택" 창의 "게임 나가기" → 확인을 누름');
            s.note('나간 뒤 "연결이 끊겨 이 게임에서 제외되었습니다" 알림이 안 떠야 함 → 방 목록 "방 만들기" → "게임 만들기"로 대기방까지 가는지 봄');
            s.note('산 채로 나간 경우는 탈주 막힘(5분)이 있어 방 만들기는 안 됨 — 이 장면은 죽은 뒤 나가기');
        },
        async show(s) {
            const page = s.main;
            await K9.pressDeadExit(page, { accept: true });
            await expect(page).toHaveURL(/\/multiplay/, { timeout: 15_000 });
            await K.sleep(4000);
            if (s.headless) {
                const forfeit = s.alerts.filter((a) => /제외/.test(a));
                s.note(`도구 확인: 나간 뒤 4초 동안 제외 알림 ${forfeit.length > 0 ? `뜸 (이상): ${forfeit[0]}` : '없음'}`);
            }
        },
        still: (s) => !/\/ingame/.test(s.main.url()),
    },
    {
        id: '바-18',
        async prepare(s) {
            const dead = await s.person({ label: '나 (죽은 사람)' });
            const alive = await s.person({ label: '산 사람' });
            // 판 밖 친구 봇: 두 사람과 친구 → 자기 대기방을 만들어 둠 (보여 줄 때 초대)
            const [friend] = await s.spawnBots(1);
            await K13.befriendBot(dead, friend);
            await K13.befriendBot(alive, friend);
            const room = await K13.botRoom(friend);
            const t = await K.tableOf(s).setup({
                humans: [dead, alive], bots: 5, settings: customRoleSettings({ JOKER: 1 }), roles: A.plainRoles(),
            });
            await Promise.all([dead, alive].map((h) => ui.readRoleReveal(h.page)));
            await C.executeByBots(t, U(dead));
            await t.stopBots();
            await K4.watchAsDead(dead.page);
            await A.calm(alive.page);
            Object.assign(s.state, { t, friend, room, dead, alive });
            s.note(`7명 판 — 큰 창 = 처형된 나(관전 중), 작은 창 = 산 사람 · 판 밖 친구 봇 ${friend.nickname}`);
            s.note('보여 줄 때 친구 봇이 두 사람을 대기방에 초대 → 큰 창 위에 "… 님이 대기방으로 초대했습니다 … 로비로 가면 수락" 한 줄 + 닫기, 작은 창(산 사람)엔 안 옴');
            s.note('안내 줄은 8초 뒤 저절로 사라짐 → 다시 보려면 again');
        },
        async show(s) {
            const { friend, room, dead, alive } = s.state;
            await K13.botInvite(friend, dead, room);
            await expect(inviteNotice(dead.page)).toBeVisible({ timeout: 10_000 });
            let aliveResult;
            try {
                await K13.botInvite(friend, alive, room);
                aliveResult = '서버가 받음';
            } catch (error) {
                aliveResult = `서버가 거절 (${String(error.message).split('\n')[0]})`;
            }
            await K.sleep(1500);
            const aliveSaw = await inviteNotice(alive.page).count();
            s.note(`도구 확인: 산 사람 초대 → ${aliveResult}, 산 사람 화면 안내 줄 ${aliveSaw > 0 ? '보임 (이상)' : '없음'}`);
        },
        still: (s) => inviteNotice(s.state.dead.page).isVisible(),
    },
    {
        id: '바-19',
        async prepare(s) {
            // 화면 소켓 길목은 로비 소켓이 열리기 전에 걸어야 함 → 로그인만 하고 길목 건 뒤 로비로
            const me = await s.person({ lobby: false, label: '나 (귀족)' });
            const gate = await K9h.socketGate(me);
            await ui.gotoLobby(me.page);
            const t = await A.openTable(K.tableOf(s), { humans: [me], bots: 4, roles: A.plainRoles() });
            await t.advanceUntil('DAY');
            const ready = me.page.getByRole('button', { name: '투표 시작 준비' });
            await A.calm(me.page, async () => { await expect(ready).toBeVisible({ timeout: 1000 }); });
            Object.assign(s.state, { t, gate, ready });
            s.note('5명 판 1일 낮 토론 — 보여 줄 때 도구가 이 창 연결을 끊고(오프라인) "투표 시작 준비"를 누름');
            s.note('행동 칸에 "연결이 끊겼습니다. 다시 연결된 뒤 눌러 주세요."가 보여야 함 · 다른 행동 단추(카드 "투표하기" 등)도 눌러 봐도 됨');
            s.note('끊긴 채 60초가 지나면 판에서 빠짐 → 다시 보려면 again');
        },
        async show(s) {
            const page = s.main;
            const { t, gate, ready } = s.state;
            const since = Date.now();
            await gate.cut();
            await K9.droppedAt(t, U(s.people[0]), since);
            await K.sleep(1000);
            await ready.click({ timeout: 5000 });
            await expect(sameText(page, DISCONNECTED_TEXT)).toBeVisible({ timeout: 5000 });
        },
        still: (s) => sameText(s.main, DISCONNECTED_TEXT).isVisible(),
    },

    // ── 폰 재판 한 판 (바-20 → 21 → 22, chain '바-폰재판'): 8자 피고 → 151자 → 내가 죽은 뒤 둘째 날 재판 ──
    {
        id: '바-20',
        chain: '바-폰재판',
        needs: ['mobile'],
        async prepare(s) {
            const tr = await phoneTrial(s);
            await A.openTrial(tr.me.page);
            const name = A.trial.card(tr.me.page).getByText(tr.long.nickname, { exact: true });
            await expect(name).toBeVisible({ timeout: 5_000 });
            const clipped = await name.evaluate((el) => el.scrollWidth > el.clientWidth).catch(() => null);
            s.note(`6명 폰 판 1일 재판("최후의 변론" 시트 엶) — 피고 = 8자 닉네임 봇 "${tr.long.nickname}"`);
            s.note('피고 카드 이름이 안 잘리고 유죄·무죄 단추가 안 밀려 화면 안에 있어야 함 · 시트 뒤 채팅방엔 피고·봇 말 두 줄');
            s.note(`도구 확인: 피고 이름 ${clipped === null ? '칸 못 찾음' : clipped ? '잘림 (이상)' : '안 잘림'}`);
        },
        still: (s) => A.trial.win(s.main).isVisible(),
    },
    {
        id: '바-21',
        chain: '바-폰재판',
        needs: ['mobile'],
        async prepare(s) {
            const tr = await phoneTrial(s);
            const page = tr.me.page;
            // 합친 뒤 세로 카톡형: 재판 중 말은 채팅방 바닥 입력 줄 그대로 씀 (e2e A06-E-136과 같은 방식)
            await m.waitTrialTalk(page);
            const text = `${A.uniq('긴글')}${'가'.repeat(151)}`.slice(0, 151);
            await m.talk.input(page).fill(text);
            await m.talk.send(page).click();
            await expect(m.talk.chat(page).getByRole('alert')).toHaveText(TOO_LONG, { timeout: 10_000 });
            s.note('폰 재판 중 채팅방 입력 줄에 151자를 보냄 — 오류 글 "메시지는 150자 이하로 입력해주세요."가 입력칸 위에서 읽혀야 함');
        },
        still: (s) => A.trial.win(s.main).isVisible(),
    },
    {
        id: '바-22',
        chain: '바-폰재판',
        needs: ['mobile'],
        async prepare(s) {
            const tr = await K.phoneTable(s, { longName: true });
            const { t, me } = tr;
            const page = me.page;
            // 1일 재판 중이면 아무도 안 내고 마감 (무죄 → 밤)
            if ((await t.state())?.phase === 'TRIBUNAL') {
                await t.advance();
                await A.waitState(t, (g) => g.phase !== 'TRIBUNAL');
                tr.trial = false;
            }
            // 1일 밤 광대 봇(첫 봇)이 나를 죽임 → 2일 낮
            const joker = t.bots[0];
            await night.toTurn(t, 'JOKER', { dayIndex: 1 });
            const reply = await night.botNight(t, joker, U(me));
            if (!reply?.ok) throw new Error(`광대 봇 밤 행동 실패: ${reply?.code ?? '답 없음'}`);
            await night.toDay(t, { dayIndex: 2 });
            await night.waitDead(t, U(me));
            await K.keepWatchingDead(page);
            await A.toVote(t, 2, { screens: false });
            // 겹 창: 설정 시트를 열어 둠 → 재판이 열리면 닫혀야 함
            await expect(async () => {
                await ui.closeOverlays(page, { keepWatching: true, clickTimeoutMs: 1000 });
                if (!(await settingsSheet(page).isVisible())) await page.getByRole('button', { name: '인게임 설정', exact: true }).click({ timeout: 1500 });
                await expect(settingsSheet(page)).toBeVisible({ timeout: 1500 });
            }).toPass({ timeout: 30_000 });
            const s2 = await t.state();
            s.state.victim = t.bots.find((b) => b !== joker && b !== tr.long && A.playerOf(s2, U(b))?.alive);
            s.note('폰 판 2일 낮 투표 — 나는 1일 밤에 죽어 관전 중, 설정 시트를 열어 둠');
            s.note(`보여 줄 때 봇들이 ${s.state.victim.nickname}을 재판에 세움 → 설정 시트(겹 창)가 닫히고, 채팅방 위에 "죽은 사람끼리" 표시가 보여야 함`);
        },
        async show(s) {
            const { t, me } = s.state.phone;
            const page = me.page;
            await A.toTribunal(t, s.state.victim, { humansVote: false });
            await m.waitTrialTalk(page);
            await K.sleep(500);
            const sheetOpen = await settingsSheet(page).isVisible().catch(() => false);
            const band = await m.talk.deadBanner(page).isVisible().catch(() => false);
            s.note(`도구 확인: 설정 시트 ${sheetOpen ? '남음 (이상)' : '닫힘'}, 재판 채팅 "죽은 사람끼리" ${band ? '보임' : '안 보임 (이상)'}`);
        },
        still: (s) => A.trial.win(s.main).isVisible(),
    },

    // ── 폰 낮 한 판 (바-23 → 24, chain '바-폰낮') ──
    {
        id: '바-23',
        chain: '바-폰낮',
        needs: ['mobile'],
        async prepare(s) {
            const { t, me } = await K.phoneTable(s, { key: 'phoneDay' });
            const page = me.page;
            if ((await t.state())?.phase !== 'DAY') await m.toDay(t, page);
            await phoneChatReady(page);
            await m.botSay(t, 1, '어젯밤엔 아무 일도 없었네요');
            await m.botSay(t, 2, '광대가 누군지 같이 찾아봐요');
            await m.say(page, '저는 귀족입니다');
            s.note('5명 폰 판 1일 낮 토론 채팅방 — 봇 말 두 줄 + 내 말 한 줄: 이름만 그 사람 색 + 띠, 말은 짙은 글');
            s.note('나머지 두 곳: 재판 창 채팅은 바-20(봇 말 두 줄), 크게 보기는 폰 가로(812×375) 채팅 틀 오른쪽 위 네 귀 화살표 — 이 장면 창은 세로라 안 보임');
        },
        still: async (s) => (await s.state.phoneDay.t.state())?.dayPhase === 'DAY_DISCUSSION',
    },
    {
        id: '바-24',
        chain: '바-폰낮',
        needs: ['mobile'],
        async prepare(s) {
            const { t, me } = await K.phoneTable(s, { key: 'phoneDay' });
            const page = me.page;
            await A.toVote(t, 1);
            // 투표 현황 칸은 낮 투표가 집계된 뒤에만 나옴 (그 전엔 "집계 전") → 봇 둘만 한 봇을 찍고 마감 → 기권이 많아 재판 없이 밤
            const s1 = await t.state();
            const target = t.bots[3];
            await A.botsDayVote(t, U(target), t.bots.slice(1, 3));
            await t.advance();
            await A.waitState(t, (g) => g.phase !== 'DAY' || g.dayIndex !== s1.dayIndex);
            await A.calm(page, async () => {
                if (!(await voteStatus(page).isVisible())) await page.getByRole('button', { name: '투표 현황 열기' }).click({ timeout: 1500 });
                await expect(voteStatus(page).getByText('투표 가능', { exact: true })).toBeVisible({ timeout: 1500 });
            });
            s.note('5명 폰 판 1일 낮 투표 집계 뒤(봇 둘이 한 봇을 찍고 나머지 기권 → 재판 없이 밤) 투표 현황 창');
            s.note('첫 줄 이름표가 "투표 가능"(값 = 산 사람 수), 아래 "기권"·"결과"(기권이 많아 재판 없음) — 집계 전엔 "집계 전"만 보임');
        },
        still: (s) => voteStatus(s.main).isVisible(),
    },

    // ── 폰 판 시작 (판 시작은 보여 줄 때 — 역할 창이 진짜로 뜨게) ──
    {
        id: '바-25',
        needs: ['mobile'],
        async prepare(s) {
            const me = await s.person({ mobile: true, label: '나 (폰, 광대)' });
            // 6명: 나 + 봇 5, 광대 둘(나·봇 1번 — 동료 표시), 나머지 귀족
            s.state.seated = await K.seatWith(s, {
                humans: [me],
                bots: 5,
                settings: customRoleSettings({ JOKER: 2 }),
                roles: ({ humans, bots }) => ({
                    [U(humans[0])]: 'JOKER',
                    ...Object.fromEntries(bots.map((b, i) => [U(b), i === 1 ? 'JOKER' : 'CITIZEN'])),
                }),
            });
            s.note('6명 폰 판, 나는 광대(동료 광대 봇 하나) — 보여 줄 때 판을 시작함');
            s.note('역할 창 높이가 폰 화면에 맞고 "동료" 배지가 다른 글과 안 겹쳐야 함 · 10초 뒤 저절로 닫히면 도구가 "내 역할 보기"로 다시 열어 둠');
        },
        async show(s) {
            const t = await start(s.state.seated);
            s.state.t = t;
            s.keep(() => t.stopBots().catch(() => {}));
            await expect(K.roleDialog(s.main)).toBeVisible({ timeout: 20_000 });
            s.background(K.keepRoleOpen(s, s.main));
        },
        still: (s) => K.roleDialog(s.main).isVisible(),
    },

    // ── PC: 업적·서고 (옛 판 기록을 시험 DB에 넣어 계정을 만듦) ──
    {
        id: '바-26',
        async prepare(s) {
            const me = await s.person({ label: '나 (귀족)' });
            const frames = K.watchFrames(me.page);
            // 옛 판 5개(끝까지 감) × 낮 표 2 = 10 → "투표에 10회 참여" 기준은 채웠는데 업적은 아직 못 받은 계정
            // (판 수 3 업적도 기준을 넘음 → 이미 받은 것으로 적어 투표 업적 하나만 새로 받게)
            await K.seedGames(s, U(me), { count: 5, votes: 2 });
            await K.markGranted(U(me), [GAMES_3]);
            const t = await A.openTable(K.tableOf(s), { humans: [me], bots: 4, roles: A.plainRoles() });
            await A.toVote(t, 1);
            // 봇 넷은 모두 기권 → 내가 내면 다 낸 것 → 5초 뒤 낮 마감 (기권이 많아 재판 없이 밤)
            t.playBots({ readyForVote: false, dayVote: 'abstain', tribunal: 'skip', night: 'skip' });
            Object.assign(s.state, { t, frames });
            s.note('5명 판 1일 낮 투표 — 이 계정은 앞 판들에서 낮 표 10번을 채웠지만 "투표에 10회 참여" 업적을 아직 못 받음, 봇 넷은 기권');
            s.note('카드 눌러 "투표하기" → 그 순간엔 업적 효과음이 안 나고, 다 낸 뒤 5초 뒤 낮이 끝날 때 한 번 남 (소리 켜 둠)');
            s.note('판 화면엔 글 알림이 없음 (업적 알림 = 효과음, 글은 로비 알림 종의 "업적 달성" 줄) — 확인 필요');
        },
        async show(s) {
            const { t, frames } = s.state;
            s.background(noteGrant(s, frames));
            // 창 없는 모드: 사람 대신 도구가 표를 내고 업적 신호 때를 적음 (근거용)
            if (s.headless) {
                await A.dayVoteUi(s.main, t.bots[1].nickname);
                const until = Date.now() + 20_000;
                while (!s.notes.some((n) => n.startsWith('도구 확인: 업적')) && Date.now() < until) await K.sleep(300);
                if (!s.notes.some((n) => n.startsWith('도구 확인: 업적'))) s.note('도구 확인: 표 낸 뒤 20초 안에 업적 받음 신호 없음 (이상)');
            }
        },
        still: async (s) => (await s.state.t.state())?.dayPhase === 'DAY_VOTE',
    },
    {
        id: '바-27',
        async prepare(s) {
            const me = await s.person({ label: '나 (귀족, 탈주 1판)' });
            const page = me.page;
            // 옛 판: 끝까지 간 판 4개 × 낮 표 2 = 8표, 산 채로 나간(탈주) 판 1개 × 1표
            await K.seedGames(s, U(me), { count: 4, votes: 2 });
            await K.seedGames(s, U(me), { count: 1, votes: 1, deserted: true });
            // 진짜 판 하나: 1일 낮 표를 내고 산 채로 나감 → 봇 광대도 나가 판 끝(시민 승)
            const t = await A.openTable(K.tableOf(s), { humans: [me], bots: 4, roles: A.plainRoles() });
            await A.toVote(t, 1);
            await A.dayVoteUi(page, t.bots[1].nickname);
            await K9.leaveAlive(page);
            const reply = await t.bots[0].request('leave_game_session', { gameId: t.gameId });
            if (!reply?.ok) throw new Error(`광대 봇 나가기 실패: ${reply?.code ?? '답 없음'}`);
            await K.waitSaved(t.gameId);
            const [row] = await db.query('SELECT death_reason FROM game_result_players WHERE game_id = ? AND user_id = ?', [t.gameId, U(me)]);
            // 로비 → 기억의 서고 → 금지된 기록 → 다음 쪽(기록 II)
            await ui.gotoLobby(page);
            await page.getByRole('navigation', { name: '로비 메뉴' }).getByRole('button', { name: '기억의 서고' }).click();
            await expect(page).toHaveURL(/\/library/, { timeout: 15_000 });
            await page.getByRole('button', { name: '금지된 기록', exact: true }).click({ timeout: 15_000 });
            // 첫 쪽 = 기록 I → "다음 페이지" 한 번이면 기록 II (쪽 번호 = frontend library spreadMeta 차례)
            const next = page.getByRole('button', { name: '다음 페이지' });
            await expect(next).toBeEnabled({ timeout: 15_000 });
            await next.click();
            const progress = page.getByText(/^\d+\/10회 참여$/);
            // 탈주 표까지 세면 10이 되어 업적을 받아 버림 → 진행 글 대신 받은 쪽 모양이 나올 수 있어 실패로 안 침 (글로 알림)
            const seen = await progress.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true, () => false);
            s.note('끝까지 간 판 표 8개 + 탈주한 판 표 2개(옛 판 1 + 방금 판 1) → 진행 글이 "8/10회 참여"면 통과 (10/10이면 탈주 표까지 셈)');
            s.note(`도구 확인: 방금 판 내 줄 죽은 이유 ${row?.death_reason ?? '없음'}, 진행 글 ${seen ? `"${await progress.innerText()}"` : '안 보임 (이미 받은 업적 쪽일 수 있음 — 이상)'}`);
        },
        still: (s) => s.main.getByText(/^\d+\/10회 참여$/).isVisible(),
    },
];
