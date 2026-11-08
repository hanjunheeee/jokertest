// 부하 시험 판 하나 파일, 방장이 방 만들기 → 나머지 코드로 입장 → 모두 준비 → 시작 → 끝까지 → 판 나가기
// run.js가 판마다 부름 (가짜 사용자 묶음은 판이 끝나도 다음 판에 다시 씀)
const { sleep } = require("./bot");

// 방 설정: 가장 짧은 시간들 (토론·투표·밤 30초), 광대 1명, 코드 입장
const roomSettingsFor = (players) => ({
    accessType: "code",
    maxPlayers: Math.max(4, Math.min(10, players)),
    jokerCount: 1,
    lightsOut: false,
    soulBetting: false,
    voteReveal: false,
    dayDiscussionTime: 30,
    dayVoteTime: 30,
    nightActionTime: 30,
});

// 판 하나 돌리기, 결과 글자 돌려줌 (ENDED·실패 이유)
async function playGame(bots, { pollMs, chatChance, gameMaxMs, stats }) {
    const [host, ...guests] = bots;

    const created = await host.request("create_room", roomSettingsFor(bots.length));
    if (!created?.ok) return `방 만들기 실패: ${created?.code ?? created?.message ?? "응답 없음"}`;
    const { roomId, roomCode, settingsVersion } = created.room;

    // 입장: 답 함수 없는 사건이라 room_joined 사건 오는 시간을 잼
    const joined = await Promise.all(guests.map(async (bot) => {
        const started = performance.now();
        const wait = Promise.race([bot.waitFor("room_joined"), bot.waitFor("room_join_failed").then(() => null)]);
        bot.emit("join_room_by_code", { roomCode });
        const room = await wait;
        if (room) stats.latency("join_room_by_code", performance.now() - started);
        else stats.error("join_room_by_code:failed_or_timeout");
        return Boolean(room);
    }));
    if (joined.some((ok) => !ok)) {
        await Promise.all(bots.map((bot) => bot.emit("leave_room")));
        return "입장 실패";
    }

    await Promise.all(bots.map((bot) => bot.request("set_ready", { isReady: true, roomId, expectedSettingsVersion: settingsVersion })));

    // 시작: 준비 알림이 늦게 퍼질 수 있어 몇 번 다시 해 봄
    const startedWaits = bots.map((bot) => bot.waitFor("game_started", 20000));
    let start = null;
    for (let attempt = 0; attempt < 10; attempt += 1) {
        start = await host.request("start_game", { roomId, expectedSettingsVersion: settingsVersion });
        if (start?.ok) break;
        await sleep(500);
    }
    if (!start?.ok) {
        await Promise.all(bots.map((bot) => bot.emit("leave_room")));
        return `시작 실패: ${start?.code ?? start?.message ?? "응답 없음"}`;
    }
    await Promise.all(startedWaits);
    stats.gamesStarted += 1;
    const { gameId } = start;

    const outcomes = await Promise.all(bots.map((bot) => bot.playUntilEnded(gameId, { pollMs, chatChance, maxMs: gameMaxMs })));
    await Promise.all(bots.map((bot) => bot.request("leave_game_session", { gameId })));

    if (outcomes.every((o) => o === "ENDED" || o === "LOST")) {
        stats.gamesEnded += 1;
        return "ENDED";
    }
    stats.gamesFailed += 1;
    return `끝까지 못 감: ${[...new Set(outcomes)].join(",")}`;
}

module.exports = { playGame, roomSettingsFor };
