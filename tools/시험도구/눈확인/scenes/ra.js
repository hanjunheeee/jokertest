'use strict';

// 라 묶음 장면 (둘이서: 관리자 정지·접속 끊기, 같은 계정 두 창, 친구 신청 겨루기, 가득 찬·시작된 방 초대 수락) 5줄
// run.js가 읽음 — 관리자 창은 _da-kit openAdmin, 친구·초대·로그인은 e2e 시험 도우미(_a14-kit·_a13-kit·_a01b-join-kit·authHelpers) 그대로
const { fromE2e, e2eRequire } = require('../lib/paths');
const { ROOMY } = require('../lib/table');
const { openAdmin, k } = require('./_da-kit');

const { expect } = e2eRequire('@playwright/test');
const ui = fromE2e('helpers/ui');
const A = fromE2e('tests/auth/authHelpers');
const F = fromE2e('tests/social/_a13-kit');
const J = fromE2e('tests/room/_a01b-join-kit');

// e2e bots 묶음 모양({ spawn })으로 감쌈 → _a01b-join-kit 도우미를 그대로 부름 (봇은 장면이 닫히면 닫힘)
const botsOf = (s) => ({ spawn: (n, o = {}) => s.spawnBots(n, o.account ?? {}) });

// 사람 쪽이 지게 만들기: 친구 추가 탭에서 그 봇 줄을 띄운 뒤 사람 "친구 신청"과 봇 신청을 같은 순간에 → 기다리는 신청 1줄의 보낸 사람이 봇이면 사람이 짐
async function raceOnce(s, me) {
    const [bot] = await s.spawnBots(1);
    await F.search(me.page, bot.nickname);
    const row = F.candidateRow(me.page, bot.account.uuid);
    await expect(row).toBeVisible();
    await Promise.allSettled([F.sendButton(row, bot.nickname).click(), F.botRequest(bot, me)]);
    await expect.poll(async () => (await F.pendingBetween(me, bot)).length, { message: '기다리는 신청 줄 수' }).toBe(1);
    const [pending] = await F.pendingBetween(me, bot);
    return { bot, row, lost: pending.requester_id === bot.account.uuid };
}

module.exports = [
    {
        id: '라-01',
        needs: ['desktop', 'admin'],
        async prepare(s) {
            const player = await s.person({ label: '정지당할 사람' });
            const w = await openAdmin(s, { kind: 'small' });
            const reason = `눈 확인 정지 사유 ${k.rand()}`;
            // 회원 상세 → 제재 칸 "기간 정지" → 1일·사유를 채운 확인 창까지 (누르기 직전)
            await k.banUi(w.page, player, { days: 1, reason });
            s.note(`옆 관리자 창에 1일 정지 창을 채워 둠(사유 "${reason}") → "정지하기"를 누르고 큰 창(로비)에 5초 안 정지 안내·사유 → 로그인 화면으로 가는지 봄`);
        },
    },
    {
        id: '라-02',
        needs: ['desktop', 'admin'],
        async prepare(s) {
            const player = await s.person({ label: '끊길 사람' });
            const w = await openAdmin(s, { kind: 'small' });
            // 회원 상세 → 제재 칸 "강제 접속 종료" → 사유를 채운 확인 창까지 (정지 아님)
            await k.reasonDialog(w.page, player, '강제 접속 종료', '강제 접속 종료', '눈 확인 접속 끊기');
            s.note('옆 관리자 창에 "강제 접속 종료" 창을 채워 둠 → "접속 끊기"를 누르고 큰 창에 끊김 안내만 뜨고 로그인 화면으로 안 가고 로비에 남는지 봄');
        },
    },
    {
        id: '라-03',
        async prepare(s) {
            const first = await s.person({ label: '첫 창 (밀려날 쪽)' });
            // 둘째 창은 다른 창 묶음(쿠키 따로) = 다른 브라우저와 같음 → 같은 계정으로 로그인 칸만 채움
            const second = await s.person({ account: first.account, login: false, label: '둘째 창 (같은 계정)' });
            await A.fillLogin(second.page, first.account.email, first.account.password);
            s.note('옆 둘째 창에 같은 계정 이메일·비밀번호를 채워 둠 → "로그인"을 누르고 큰 첫 창에 "다른 기기 또는 브라우저에서 로그인되어…" 안내가 뜨는지 봄');
        },
    },
    {
        id: '라-04',
        async prepare(s) {
            const me = await s.person();
            // 같은 순간 신청은 누가 이길지 모름 → 사람이 질 때까지 새 봇으로 다시 (몇 번 해도 사람이 이기면 봇이 먼저 신청한 뒤 누름 = 같은 결과)
            let got = null;
            for (let i = 0; i < 4 && !got; i += 1) {
                const r = await raceOnce(s, me);
                if (r.lost) got = r;
            }
            if (!got) {
                const [bot] = await s.spawnBots(1);
                await F.search(me.page, bot.nickname);
                const row = F.candidateRow(me.page, bot.account.uuid);
                await expect(row).toBeVisible();
                await F.botRequest(bot, me);
                await F.sendButton(row, bot.nickname).click();
                got = { bot, row, lost: true };
                s.note('같은 순간 신청에서 사람이 계속 이겨서 봇이 바로 앞에 신청한 뒤 누름 (사람이 진 결과는 같음)');
            }
            await expect(got.row.getByText(F.TEXT.pendingDup, { exact: true })).toBeVisible();
            await got.row.scrollIntoViewIfNeeded();
            s.note(`친구 추가 탭: ${got.bot.nickname} 줄 아래 "이미 친구 신청 중입니다."가 한 줄로 읽히는지 봄`);
        },
    },
    {
        id: '라-05',
        async prepare(s) {
            const me = await s.person();
            const bots = botsOf(s);
            let startedInviteId = null;
            // 판이 시작되면 서버가 그 방 초대를 취소하는 알림을 보냄 → 그 알림만 막아 "시작된 방 초대가 아직 보이는" 때를 만듦 (e2e A01-E-554와 같은 법)
            const lateUpdate = J.eventFrame('game_invite_updated');
            const tap = await J.tapSocket(me.page, {
                // 초대 id를 못 읽었으면 그 이름 알림을 다 막음 (가득 찬 방 초대에는 시작 알림이 안 옴)
                down: (m, t) => (t.on && lateUpdate(m) && (!startedInviteId || m.includes(startedInviteId)) ? 'drop' : null),
            });

            // ① 가득 찰 방: 정원 5에 봇 2 → 초대 → 봇 3 더 (e2e A01-E-552)
            const full = await J.botRoom(bots, { max: 5, count: 2 });
            await J.befriendBot(me, full.host);
            await J.botInvite(full.host, J.U(me));
            await J.addBots(bots, full.room, 3);

            // ② 시작될 방: 봇 5 전원 준비 → 초대 → (아래에서) 판 시작, 단계 시간은 길게 (판이 빨리 끝나 방이 돌아오지 않게)
            const started = await J.botRoom(bots, { max: 6, count: 5, ready: true, settings: { ...J.customRoleSettings({ JOKER: 1 }), ...ROOMY } });
            await J.befriendBot(me, started.host);
            await J.fixBotRoles(started);
            const invite = await J.botInvite(started.host, J.U(me));
            startedInviteId = invite?.inviteId ? String(invite.inviteId) : null;

            // 소켓 가로채기는 새로 붙는 줄부터 → 로비를 다시 열고 초대 탭
            await ui.gotoLobby(me.page);
            await J.openInvites(me.page);
            for (const r of [full, started]) await expect(J.acceptButton(J.inviteRow(me.page, r.host.nickname))).toBeVisible({ timeout: 15_000 });
            tap.on = true;
            await started.host.startGame(started.room.roomId, started.room.settingsVersion);
            s.note(`게임 초대 탭: ${full.host.nickname} = 가득 찬 방, ${started.host.nickname} = 이미 시작된 방 → 각 줄 "초대 수락"을 누르고 한 줄 글·"끝난 초대" 줄로 남는지 봄`);
            s.note('보내는 쪽 단추(확인 필요였던 것): 대기방 "친구 초대" → 친구초대 창 → "<닉네임> 게임 초대" (e2e _a01b-join-kit openInviteModal·inviteFriendButton). 이 장면은 봇이 보냄');
        },
    },
];
