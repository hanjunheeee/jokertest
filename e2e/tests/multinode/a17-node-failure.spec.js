'use strict';

// 서버 2대 중 한 대가 갑자기 꺼지는 브라우저 시험 (어려움) — 다른 서버 판은 끝까지 가고, 꺼진 서버 판 사람은 판 밖 화면으로, 꺼진 서버 방을 고르면 "방을 찾을 수 없습니다"
// 목록 A17-서버-여러대.md 번호 A17-H-015~017 (서버를 죽여서 하나씩만 돎 @serial @shutdown, 끝에 두 서버가 다시 켜진 것까지 기다림, E2E_NODES=2에서만 돎), 모임만: E2E_NODES=2 npx playwright test --list --no-deps tests/multinode/a17-node-failure.spec.js
const K = require('./_a17-kit');
const { ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { openRoomList, findRoomRow } = require('../room/roomHelpers');
const N = require('../ingame/b-night/_night');
const K8 = require('../result/_a08-hard-kit');
const K9 = require('../ingame/_a09-simple-kit');
const { withRedis } = require('../../helpers/redis');
const { redisPrefix } = require('../../helpers/env');

const { test, expect, e2e, mn, N1, N2, U, nick } = K;

// 죽인 서버는 곧 다시 켜짐 → 다음 시험 전에 두 서버·앞단이 제자리인지까지
test.afterEach(async () => {
    await K.settleNodes();
});

// 죽인 서버의 하트비트 줄(`<앞머리>:node:<이름>`)을 그 부팅 값일 때만 지움 → 수명 10초를 안 기다리고 다른 서버가 바로 죽은 것으로 봄
// 다시 켜진 새 부팅 줄은 안 건드림 (부팅 값이 다르면 그대로), 지웠으면 1
const FORGET_BOOT = "if redis.call('HGET', KEYS[1], 'bootEpoch') == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0";
const forgetHeartbeat = (node, bootEpoch) => withRedis((r) => r.eval(FORGET_BOOT, 1, `${redisPrefix()}:node:${node}`, bootEpoch));

// 판 서버에 바로 물어 그 단계가 될 때까지 넘김 (죽은 서버 쪽으로 간 물음이 빈 답으로 오는 것 피함)
async function advanceTo(node, gameId, match, message) {
    await expect(async () => {
        const s = await K.gameAt(node, gameId);
        expect(s, '판이 서버에 있음').not.toBeNull();
        if (!match(s)) await K.advanceAt(node, gameId);
        expect(match(await K.gameAt(node, gameId)), message).toBe(true);
    }).toPass({ timeout: 60_000, intervals: [600] });
}

// 서버 ㄱ이 보는 그 서버 한 줄 { bootEpoch, lastSeen, … } (/internal/cluster는 부를 때마다 하트비트 표를 새로 읽음)
// 서버 ㄱ 눈에 안 보이면 null, 서버 ㄱ이 답을 못 했으면 undefined
async function seenFromN1(node) {
    const r = await K.internalOn(N1, 'GET', '/internal/cluster');
    if (!r.ok || !Array.isArray(r.body?.nodes)) return undefined;
    return r.body.nodes.find((n) => n.id === node) ?? null;
}

test('A17-H-015 서버 ㄱ 5명 판(사람 2 + 봇 3) 중 서버 ㄴ을 강제로 끔 → 서버 ㄱ 판은 낮·밤 계속 → 결과 화면 @game @hard @serial @shutdown @smoke', async ({ crowd, bots }) => {
    test.setTimeout(360_000);
    const a = await crowd.on(N1);
    const b = await crowd.on(N1);
    const [hostBot, ...otherBots] = await mn.botsOn(bots, 3, N1);
    const { t, joker } = await K.startGame({ hostBot, otherBots, people: [a, b] });
    expect(await mn.gameNodeOf(U(a)), '판이 도는 서버').toBe(N1);
    await N.toDay(t, { dayIndex: 1 });

    // 서버 ㄴ을 정리 없이 죽임 (판은 서버 ㄱ)
    await mn.stopNode(N2, { kill: true });
    expect((await mn.nodeHealth(N1))?.ok, '서버 ㄱ은 살아 있음').toBe(true);

    // 판은 그대로 넘어감: 첫 낮 → 밤 → 둘째 날 낮
    await advanceTo(N1, t.gameId, (s) => s.phase === 'NIGHT', '밤으로 넘어감');
    await advanceTo(N1, t.gameId, (s) => s.phase === 'DAY' && s.dayIndex === 2, '둘째 날 낮');
    for (const p of [a, b]) {
        await expect(p.page).toHaveURL(/\/ingame/);
        await expect(async () => {
            await K9.clear(p.page);
            await expectReadable(N.cardStatus(p.page, nick(p)).getByText(nick(p), { exact: true }), { timeout: 2000 });
        }).toPass({ timeout: 30_000 });
    }

    // 광대 봇이 나가 판 끝 → 두 사람 결과 화면
    await K8.jokerLeaves(t, joker);
    await expect.poll(async () => (await K.gameAt(N1, t.gameId))?.phase ?? 'GONE', { timeout: 20_000, message: '판 끝' }).toBe('ENDED');
    await K8.allAtResult([a, b]);
});

test('A17-H-016 서버 ㄴ 5명 판(사람 2 + 봇 3) 중 서버 ㄴ을 강제로 끔 → 새로고침 → 판 밖 화면, 서버에 내 판 없음, 탈락·탈주 글 없음 @game @hard @serial @shutdown', async ({ crowd, bots }) => {
    test.setTimeout(360_000);
    const a = await crowd.on(N2);
    const b = await crowd.on(N2);
    const [hostBot, ...otherBots] = await mn.botsOn(bots, 3, N2);
    const { t } = await K.startGame({ hostBot, otherBots, people: [a, b] });
    expect(await mn.gameNodeOf(U(a)), '판이 도는 서버').toBe(N2);
    await N.toDay(t, { dayIndex: 1 });

    await mn.stopNode(N2, { kill: true });

    for (const p of [a, b]) {
        // 새로고침 뒤 뜨는 알림 글을 모음 (PC는 브라우저 알림 창)
        const said = K.collectDialogs(p.page);
        await p.page.reload();
        // 판이 사라졌으니 판 화면에 못 남음: 방 목록(판 화면이 판을 못 찾으면 가는 곳)·로비 같은 판 밖 화면 (몇 초 늦을 수 있어 넉넉히 — 걸리는 시간은 안 봄)
        await expect(p.page).toHaveURL(/\/(lobby|multiplay)/, { timeout: 60_000 });
        await expect.poll(() => e2e.gameOf(U(p)), { timeout: 30_000, message: '서버에 내 판 없음' }).toBeNull();
        // 서버가 죽어 깨진 판은 탈락·탈주가 아님 (결정 탈주 벌 ②) → "제외되었습니다"·"탈주로" 글이 안 뜸
        // 판이 사라졌다고 따로 알려 주는 글은 출처(MN-108 "다른 서버 로비, 판 사라짐")에도 지금 화면에도 없음 → 안 봄 (넣을지는 보고의 정할 것)
        expect(said.filter((m) => /제외|탈주/.test(m)), '탈락·탈주 글').toEqual([]);
    }
});

test('A17-H-017 서버 ㄴ 공개 방을 서버 ㄱ 사람이 목록에 띄운 뒤 서버 ㄴ을 강제로 끔 → 그 방 입장 → "방을 찾을 수 없습니다…" 글, 화면 그대로 @hard @serial @shutdown', async ({ crowd, bots }) => {
    test.setTimeout(240_000);
    const [host] = await mn.botsOn(bots, 1, N2);
    await host.createRoom({ accessType: 'open', maxPlayers: 6 });
    expect(await K.roomNodeOf(U(host)), '공개 방이 있는 서버').toBe(N2);

    const me = await crowd.on(N1);
    await openRoomList(me.page);
    const title = `${host.nickname}의 방`;
    const row = await findRoomRow(me.page, title, { timeoutMs: 20_000 });
    expect(row, `목록에 "${title}" 줄`).not.toBeNull();
    await row.click();
    const enter = me.page.getByRole('button', { name: '선택한 방 입장' });
    await expect(enter).toBeEnabled();

    // 이 글이 뜨는 틈은 좁음: 서버 ㄱ이 서버 ㄴ을 죽은 것으로 본 뒤 ~ 목록에서 그 방 줄이 빠지기 전(1~2초)·다시 켜진 서버 ㄴ이 옛 방 흔적을 지우기 전
    // 죽이자마자 누르면 서버 ㄱ은 아직 서버 ㄴ이 산 줄 알아 "옮겨 다시 시도"로 답함
    // 시험 환경은 죽인 서버를 0.3초 뒤 다시 켬 → 하트비트 수명(10초)을 기다리면 새 부팅이 옛 방 흔적을 먼저 지워 이 길을 못 볼 때가 많음
    // → 죽인 뒤 옛 부팅 하트비트 줄을 바로 지워 수명이 끝난 것과 같게 함 (새 부팅이 켜지기까지 몇 초의 틈)
    const before = await seenFromN1(N2);
    expect(before?.bootEpoch, '서버 ㄱ이 서버 ㄴ을 봄 (준비)').toBeTruthy();
    await mn.stopNode(N2, { kill: true });
    await forgetHeartbeat(N2, before.bootEpoch);

    // PC 공개 방 입장 거절은 브라우저 알림 창뿐 → 글만 봄 (대비는 못 잼)
    const text = await ui.captureAlert(me.page, async () => {
        // 서버 ㄱ이 서버 ㄴ(옛 부팅)을 더는 산 것으로 안 볼 때까지 → 그 순간 바로 누름
        let seen = before.bootEpoch;
        await expect.poll(async () => {
            const now = await seenFromN1(N2);
            // 서버 ㄱ이 답을 못 했으면 아직 모르는 것으로 둠
            if (now !== undefined) seen = now?.bootEpoch ?? null;
            return seen;
        }, { timeout: 30_000, intervals: [100], message: '서버 ㄱ이 본 서버 ㄴ 부팅 값' }).not.toBe(before.bootEpoch);
        // 벌써 새 부팅 값이 보이면 서버 ㄴ이 다시 켜져 옛 방 흔적을 지운 뒤 → 이 길을 못 봄 (시험 환경 경합: 죽인 서버를 0.3초 뒤 다시 켬, 줄을 지운 뒤엔 드묾)
        expect(seen, '서버 ㄴ이 아직 죽은 채여야 함 (다시 켜진 뒤면 옛 방 흔적이 지워져 "공개 방을 찾을 수 없습니다."가 됨)').toBeNull();
        await enter.click({ timeout: 3000 });
    }, { timeoutMs: 20_000 });
    expect(text).toBe(K.TEXT.nodeGone);
    await expect(me.page).toHaveURL(/\/multiplay/);
    expect(await e2e.roomOf(U(me)), '방에 안 들어감').toBeNull();
    // 목록 화면은 그대로 쓸 수 있음
    await expectReadable(me.page.getByRole('region', { name: '공개 방 목록' }), { contrast: false });
});
