// 보안(소켓): 다른 Origin 거절, 사건 수 제한(10초 120 넘으면 버림·360 넘으면 끊음), 64KB 넘는 메시지 끊김, 방·판 소속 아닌 사건 거절
// 근거: docs/보안_점검_2026-11-09.md '소켓 Origin·요청 수·큰 메시지', 결정 '보안 소켓 제한'·'DP-034 소켓 Origin 검사'
const { test, expect } = require('../../helpers/fixtures');
const { login, sec, rand, E2E } = require('./_sec');

const openWith = async (account, origin) => {
    const { cookie } = await login(account);
    return sec.openRawSocket({ cookie, origin });
};

test.describe('Origin 검사', () => {
    test('남의 사이트 Origin으로 열면 → 연결 거절, 화면 Origin이면 연결됨', async ({ accounts }) => {
        const account = await accounts.create();
        const evil = await openWith(account, 'https://evil.example');
        expect(evil.connected).toBe(false);
        const good = await openWith(account, E2E.desktopUrl);
        expect(good.connected).toBe(true);
        good.close();
    });

    test('모바일 화면 Origin도 연결됨', async ({ accounts }) => {
        const good = await openWith(await accounts.create(), E2E.mobileUrl);
        expect(good.connected).toBe(true);
        good.close();
    });

    test('화면 주소를 앞에 붙인 비슷한 남의 Origin(…evil.example)은 거절', async ({ accounts }) => {
        const s = await openWith(await accounts.create(), `${E2E.desktopUrl}.evil.example`);
        expect(s.connected).toBe(false);
    });

    test('끝 슬래시만 다른 화면 Origin은 연결됨 (다듬어 비교)', async ({ accounts }) => {
        const s = await openWith(await accounts.create(), `${E2E.desktopUrl}/`);
        expect(s.connected).toBe(true);
        s.close();
    });

    test('쿠키 없이 열면 → 연결 거절', async () => {
        const s = await sec.openRawSocket({ cookie: null, origin: E2E.desktopUrl });
        expect(s.connected).toBe(false);
    });

    test('서명 틀린 쿠키로 열면 → 연결 거절', async () => {
        const s = await sec.openRawSocket({ cookie: 'accessToken=not-a-real-token', origin: E2E.desktopUrl });
        expect(s.connected).toBe(false);
    });
});

test.describe('사건 수 제한', () => {
    test('짧은 시간에 120번 넘게 사건을 보내면 → 넘은 사건은 RATE_LIMITED로 버려짐', async ({ accounts }) => {
        const s = await openWith(await accounts.create(), E2E.desktopUrl);
        expect(s.connected).toBe(true);
        let limited = 0;
        // get_public_rooms는 부작용 없는 조회 사건 (답 함수 있음)
        for (let i = 0; i < 200; i += 1) {
            const reply = await s.emitAck('get_public_rooms', {});
            if (reply?.code === 'RATE_LIMITED') limited += 1;
        }
        expect(limited).toBeGreaterThan(0);
        s.close();
    });

    test('계속 퍼부으면 → 연결이 끊김 (360 넘음)', async ({ accounts }) => {
        const s = await openWith(await accounts.create(), E2E.desktopUrl);
        expect(s.connected).toBe(true);
        const gone = new Promise((resolve) => { s.socket.once('disconnect', () => resolve('disconnect')); });
        // 답 안 기다리고 빠르게 400번 쏘기
        for (let i = 0; i < 400; i += 1) s.socket.emit('get_public_rooms', {});
        const result = await Promise.race([gone, new Promise((r) => setTimeout(() => r('stay'), 9000))]);
        expect(result).toBe('disconnect');
    });

    test('보통 속도(열 몇 번)로 보내면 → 안 막힘', async ({ accounts }) => {
        const s = await openWith(await accounts.create(), E2E.desktopUrl);
        let limited = 0;
        for (let i = 0; i < 15; i += 1) {
            const reply = await s.emitAck('get_public_rooms', {});
            if (reply?.code === 'RATE_LIMITED') limited += 1;
            await new Promise((r) => setTimeout(r, 30));
        }
        expect(limited).toBe(0);
        s.close();
    });
});

test.describe('큰 메시지', () => {
    test('64KB 넘는 메시지를 보내면 → 서버가 연결을 끊음', async ({ accounts }) => {
        const s = await openWith(await accounts.create(), E2E.desktopUrl);
        expect(s.connected).toBe(true);
        const gone = new Promise((resolve) => { s.socket.once('disconnect', () => resolve('disconnect')); });
        s.socket.emit('get_public_rooms', { big: 'x'.repeat(70 * 1024) });
        expect(await Promise.race([gone, new Promise((r) => setTimeout(() => r('stay'), 9000))])).toBe('disconnect');
    });

    test('작은 메시지는 그대로 답을 받음', async ({ accounts }) => {
        const s = await openWith(await accounts.create(), E2E.desktopUrl);
        const reply = await s.emitAck('get_public_rooms', { note: 'x'.repeat(100) });
        expect(reply).toBeTruthy();
        s.close();
    });
});

test.describe('방·판 소속 아닌 사건', () => {
    test('내가 안 낀 판에 채팅 사건을 보내면 → 거절(ok:false), 서버가 안 죽음', async ({ accounts }) => {
        const s = await openWith(await accounts.create(), E2E.desktopUrl);
        const reply = await s.emitAck('submit_game_chat_message', { gameId: '99999999-9999-4999-8999-999999999999', text: '낄 자리 없음' });
        expect(reply?.ok).not.toBe(true);
        s.close();
    });

    test('내가 안 낀 판에 밤 행동·투표를 보내면 → 거절', async ({ accounts }) => {
        const s = await openWith(await accounts.create(), E2E.desktopUrl);
        const gameId = '99999999-9999-4999-8999-999999999999';
        for (const [event, payload] of [
            ['submit_night_action', { gameId, targetId: '00000000-0000-4000-8000-000000000001' }],
            ['cast_day_vote', { gameId, targetId: '00000000-0000-4000-8000-000000000001' }],
            ['cast_tribunal_vote', { gameId, dayIndex: 1, vote: 'GUILTY' }],
        ]) {
            const reply = await s.emitAck(event, payload);
            expect(reply?.ok, event).not.toBe(true);
        }
        s.close();
    });

    test('내가 안 낀 판의 스냅샷을 달라고 하면 → 못 받음(ok:false)', async ({ accounts }) => {
        const s = await openWith(await accounts.create(), E2E.desktopUrl);
        const reply = await s.emitAck('get_session_snapshot', { gameId: '99999999-9999-4999-8999-999999999999' });
        expect(reply?.ok).not.toBe(true);
        s.close();
    });

    test('남의 방을 방 id로 지우려 하면 → 거절(ok:false)', async ({ accounts }) => {
        const s = await openWith(await accounts.create(), E2E.desktopUrl);
        const reply = await s.emitAck('delete_room', { roomId: 'someone-else-room', expectedSettingsVersion: 1 });
        expect(reply?.ok).not.toBe(true);
        s.close();
    });

    test('남의 방에서 사람을 강퇴하려 하면 → 거절(ok:false)', async ({ accounts }) => {
        const s = await openWith(await accounts.create(), E2E.desktopUrl);
        const reply = await s.emitAck('kick_room_player', { roomId: 'someone-else-room', targetUuid: '00000000-0000-4000-8000-000000000001', expectedSettingsVersion: 1 });
        expect(reply?.ok).not.toBe(true);
        s.close();
    });

    test('안 낀 판에 나가기·투표 준비·밤 확인을 보내도 → 서버가 안 죽음 (나가기는 빈 동작이라 OK여도 남의 판엔 영향 없음)', async ({ accounts }) => {
        const s = await openWith(await accounts.create(), E2E.desktopUrl);
        const gameId = '99999999-9999-4999-8999-999999999999';
        // 이 사건들은 빈 동작(no-op)일 수 있어 ok 여부는 안 봄 — 서버가 죽거나 남의 판을 건드리지 않는지만 봄
        for (const event of ['leave_game_session', 'ready_for_day_vote', 'acknowledge_role_reveal', 'acknowledge_night_action_success']) {
            await s.emitAck(event, { gameId });
        }
        // 소켓은 아직 살아 있음 (서버가 안 죽음)
        const alive = await s.emitAck('get_public_rooms', {});
        expect(alive).toBeTruthy();
        s.close();
    });

    test('남의 소켓 자리에 있는 척 start_game을 보내도 → 거절(ok:false)', async ({ accounts }) => {
        const s = await openWith(await accounts.create(), E2E.desktopUrl);
        const reply = await s.emitAck('start_game', { roomId: 'someone-else-room', expectedSettingsVersion: 1 });
        expect(reply?.ok).not.toBe(true);
        s.close();
    });

    test('모양이 틀린 본문(gameId가 숫자·객체)으로 사건을 보내도 → 서버가 안 죽음', async ({ accounts }) => {
        const s = await openWith(await accounts.create(), E2E.desktopUrl);
        for (const gameId of [123, { a: 1 }, null, 'x'.repeat(500)]) {
            const reply = await s.emitAck('get_session_snapshot', { gameId });
            if (reply !== undefined && reply !== null) expect(reply?.ok).not.toBe(true);
        }
        const alive = await s.emitAck('get_public_rooms', {});
        expect(alive).toBeTruthy();
        s.close();
    });
});
