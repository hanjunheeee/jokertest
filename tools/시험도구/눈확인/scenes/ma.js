'use strict';

// 마 묶음 장면 (방 설정 화면·대기방, 방장 사람 + 손님 봇) — 마-01~07
// run.js가 읽음 — 방 만들기·설정 칸·시작 막힘은 e2e 방 시험 도우미(_a01a-kit), 추방 창·폰 방 만들기는 _a01b-kick-kit 그대로
const { fromE2e, e2eRequire } = require('../lib/paths');

const { expect } = e2eRequire('@playwright/test');
const { createRoomUi, blockedDialog } = fromE2e('tests/room/roomHelpers');
const K = fromE2e('tests/room/_a01a-kit');
const Kick = fromE2e('tests/room/_a01b-kick-kit');

// 마-02·06에 쓰는 직접 지정 구성 (광대2·의사2·경비원2·마녀사냥꾼2 = 8명)
const J2D2G2W2 = Object.freeze({ JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 });
const startButton = (page) => page.getByRole('button', { name: '게임시작' });

module.exports = [
    {
        id: '마-01',
        async prepare(s) {
            const me = await s.person();
            await K.openSetupPage(me.page);
            await K.selectTab(me.page, '일반');
            // 지운 3칸이 정말 없는지 도구가 먼저 봄 (두 탭 다 훑고 일반 탭으로 돌아옴)
            await K.expectNoRemovedFields(me.page);
            await K.selectTab(me.page, '일반');
            s.note('방 설정 화면 일반 탭 — "불이 꺼진 무도회·영혼의 베팅·투표 공개" 칸이 없어야 함');
        },
    },
    {
        id: '마-02',
        async prepare(s) {
            const me = await s.person();
            await K.openSetupPage(me.page);
            await K.fill(me.page, { maxPlayers: 7, custom: J2D2G2W2 });
            const error = me.page.getByText(K.MSG.SUM_OVER);
            await expect(error).toBeVisible();
            // 오류 글이 설정 칸 맨 아래라 화면 밖에 있음 → 보이게 내려 둠
            await error.scrollIntoViewIfNeeded();
            await expect(me.page.getByRole('button', { name: '게임 만들기' })).toBeDisabled();
            s.note('정원 7 + 광대2·의사2·경비원2·마녀사냥꾼2 — 합 넘음 오류 글과 꺼진 "게임 만들기"를 봄');
        },
    },
    {
        id: '마-03',
        async prepare(s) {
            const me = await s.person();
            await createRoomUi(me, { maxPlayers: 8 });
            await expect(startButton(me.page)).toBeDisabled();
            s.note('정원 8로 방을 만들어 혼자 대기방에 있음');
        },
    },
    {
        id: '마-04',
        async prepare(s) {
            const me = await s.person();
            const bots = await s.spawnBots(4);
            // 5명 중 방장 + 봇 2만 준비 → "준비 3/5"
            const room = await K.createRoomOn(me, { maxPlayers: 8, jokers: 1 });
            await K.botsJoin(bots, room.roomCode);
            await K.botsReady(bots.slice(0, 2), K.U(me));
            await K.readyMe(me.page);
            // K.expectStartLocked는 expectReadable(test.step)을 써서 시험 밖에선 못 부름 → 꺼짐·까닭 글만 직접 봄
            await expect(startButton(me.page)).toBeDisabled();
            await expect(K.startLockedReason(me.page)).toHaveText(K.startNotReadyText(3, 5), { timeout: 15_000 });
            s.note('방장(나) + 봇 4, 봇 2는 준비 안 함 — "게임시작" 꺼짐 + "준비 3/5" 까닭 글');
        },
    },
    {
        id: '마-05',
        async prepare(s) {
            const me = await s.person();
            const bots = await s.spawnBots(3);
            const room = await createRoomUi(me, { maxPlayers: 6, code: true });
            await K.botsJoin(bots, room.roomCode);
            await Kick.expectParty(me.page, 4);
            await Kick.openKick(me.page);
            s.note('방장(나) + 봇 3, 추방 창을 열어 둠 → 봇 한 줄의 "추방"을 한 번 눌러 바로 나가는지 봄');
        },
    },
    {
        id: '마-06',
        async prepare(s) {
            const me = await s.person();
            const bots = await s.spawnBots(4);
            // 정원 10 직접 지정 8명 구성인데 5명뿐 → 전원 준비 뒤 시작하면 구성 거절 막힘 창
            await K.readyRoom(me, bots, { maxPlayers: 10, custom: J2D2G2W2 });
            await expect(startButton(me.page)).toBeEnabled();
            await startButton(me.page).click();
            await expect(blockedDialog(me.page).getByRole('alert')).toHaveText(K.MSG.ROLE_MISMATCH);
            s.note('막힘 창이 떠 있음 → Enter(또는 "확인")로 닫고, Tab을 눌러 초점이 대기방 안 단추로 가는지 봄');
        },
    },
    {
        id: '마-07',
        needs: ['mobile'],
        async prepare(s) {
            const me = await s.person({ mobile: true, contextOptions: { viewport: { width: 360, height: 800 } } });
            const bots = await s.spawnBots(2);
            // 폰 설정 화면에서 정원 8 방 → 봇 2 입장 → "3/8", 봇 하나만 준비 (준비 글·대기 글 둘 다 보이게)
            const room = await Kick.createRoomOnPhone(me, { maxPlayers: 8 });
            await K.botsJoin(bots, room.roomCode);
            await K.botsReady(bots.slice(0, 1), K.U(me));
            await Kick.expectParty(me.page, 3);
            await expect(Kick.capacity(me.page)).toHaveText('3/8');
            s.note('폰 폭 360 대기방 — 방 이름·"3/8"·준비 글·까닭 글이 겹치지 않고 읽혀야 함');
        },
    },
];
