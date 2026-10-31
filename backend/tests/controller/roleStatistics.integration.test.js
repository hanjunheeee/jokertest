process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "role-statistics-integration-test-secret";

const test   = require("node:test");
const assert = require("node:assert/strict");
const { once }     = require("node:events");
const express      = require("express");
const cookieParser = require("cookie-parser");

const db                      = require("../../models");
const gameResultRepository    = require("../../repositories/gameResult.repositories");
const roleStatisticsController = require("../../controller/roleStatistics.controller");
const profileController       = require("../../controller/profile.controller");
const userRepository          = require("../../repositories/user.repositories");
const gameSessionCore         = require("../../game-core/gameSession");

const { buildGameResultRecord } = gameSessionCore;

gameResultRepository.__setEconomyServiceForTests({
    getPublicProfileLoadouts: async (userIds) =>
        Object.fromEntries(userIds.map((id) => [id, { profilePhotoId: null, profileBorderId: null }])),
});

const setupFixtureDb = (t) => {
    const original = {
        GameResultPlayer: db.GameResultPlayer,
        GameResult:       db.GameResult,
        User:             db.User,
    };

    let players = [];
    let games = new Map();
    let users = new Map();

    db.GameResultPlayer = {
        findAll: async ({ where, include }) => {
            const gameById = games;
            const excludesNullWon = where.won !== undefined;
            const requiresGame = Array.isArray(include) && include.some((entry) => entry.required === true);
            return players
                .filter((row) => !excludesNullWon || (row.won !== null && row.won !== undefined))
                .filter((row) => where.user_id === undefined || row.user_id === where.user_id)
                .filter((row) => where.role === undefined || row.role === where.role)
                .filter((row) => !requiresGame || games.has(row.game_id))
                .map((row) => ({
                    user_id: row.user_id,
                    role: row.role,
                    won: row.won,
                    is_alive: row.is_alive,
                    GameResult: {
                        settings: gameById.get(row.game_id)?.settings ?? null,
                        completed: gameById.get(row.game_id)?.completed ?? null,
                    },
                }));
        },
    };
    db.User = {
        findAll: async ({ where }) => {
            const uuids = new Set(where.uuid);
            return [...users.values()].filter((u) => uuids.has(u.uuid));
        },
        findOne: async ({ where }) => {
            const user = users.get(where.uuid);
            if (!user) return null;
            return { get: () => ({ ...user }) };
        },
    };

    t.after(() => {
        db.GameResultPlayer = original.GameResultPlayer;
        db.GameResult       = original.GameResult;
        db.User             = original.User;
    });

    return {
        addGame: (gameId, settings, { completed = true } = {}) => games.set(gameId, { settings, completed }),
        addPlayer: (row) => players.push(row),
        addUser: (uuid, fields) => users.set(uuid, { uuid, ...fields }),
        reset: () => { players = []; games = new Map(); users = new Map(); },
    };
};

const productionGame = (v = 1) => ({ v, value: "production" });
const developmentGame = (v = 1) => ({ v, value: "development" });

const playerRow = (gameId, userId, role, won, isAlive = true) => ({
    game_id: gameId, user_id: userId, role, won, is_alive: isAlive,
});

const callController = async (fn, req) => {
    let status;
    let body;
    const res = {
        status(code) { status = code; return this; },
        json(payload) { body = payload; return this; },
    };
    await fn(req, res, (err) => { throw err; });
    return { status, body };
};

test("AC-01/AC-02: 5개 직업이 항상 채워지고, 판을 하지 않은 직업은 games:0이다", async (t) => {
    const fixture = setupFixtureDb(t);
    fixture.addGame("g1", { gameSource: productionGame() });
    fixture.addPlayer(playerRow("g1", "u1", "CITIZEN", true));
    fixture.addPlayer(playerRow("g1", "u1", "CITIZEN", false, false));

    const stats = await gameResultRepository.getMyRoleStatistics("u1");

    assert.equal(stats.length, 5);
    assert.deepEqual(stats.map((s) => s.role), ["CITIZEN", "JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER"]);
    const citizen = stats.find((s) => s.role === "CITIZEN");
    assert.equal(citizen.games, 2);
    assert.equal(citizen.wins, 1);
    assert.equal(citizen.survivalCount, 1);
    assert.equal(citizen.winRate, 0.5);
    const joker = stats.find((s) => s.role === "JOKER");
    assert.deepEqual(joker, { user_id: "u1", role: "JOKER", games: 0, wins: 0, survivalCount: 0, winRate: 0 });
});

test("AC-01: 중단 경기 잔류자(won=null)는 판수에 들어가지 않는다", async (t) => {
    const fixture = setupFixtureDb(t);
    fixture.addGame("g1", { gameSource: productionGame() });
    fixture.addPlayer(playerRow("g1", "u1", "CITIZEN", null, true));

    const stats = await gameResultRepository.getMyRoleStatistics("u1");
    assert.equal(stats.find((s) => s.role === "CITIZEN").games, 0);
});

test("AC-02: 컨트롤러 응답의 role은 고정 5개 한국어 이름과 함께 나간다", async (t) => {
    setupFixtureDb(t);
    const { status, body } = await callController(roleStatisticsController.getMyRoleStatistics, { user: { uuid: "u1" } });

    assert.equal(status, 200);
    assert.deepEqual(body.data.map((d) => `${d.role}=${d.roleName}`), [
        "CITIZEN=귀족", "JOKER=광대", "DOCTOR=주치의", "GUARD=경비원", "WITCH_HUNTER=마녀사냥꾼",
    ]);
});

test("A-09: 다른 계정의 user_id를 body/query에 실어도 내 전적은 req.user.uuid만 본다", async (t) => {
    const fixture = setupFixtureDb(t);
    fixture.addGame("g1", { gameSource: productionGame() });
    fixture.addPlayer(playerRow("g1", "victim", "CITIZEN", true));

    const { body } = await callController(roleStatisticsController.getMyRoleStatistics, {
        user: { uuid: "attacker" },
        body: { user_id: "victim" },
        query: { user_id: "victim" },
    });

    assert.equal(body.data.find((d) => d.role === "CITIZEN").games, 0, "attacker 계정에는 victim의 전적이 보이면 안 된다");
});

test("AC-03: 알 수 없는 role은 400으로 거부되고 쿼리에 그대로 실리지 않는다", async (t) => {
    setupFixtureDb(t);
    const { status, body } = await callController(roleStatisticsController.getRoleRanking, {
        user: { uuid: "u1" },
        query: { role: "ADMIN'; DROP TABLE users; --" },
    });
    assert.equal(status, 400);
    assert.equal(body.success, false);
});

test("AC-03: 최소 10판 미만 사용자는 랭킹에서 빠지고, 나머지는 승률↓판수↓UUID↑로 전체가 나간다", async (t) => {
    const fixture = setupFixtureDb(t);
    fixture.addGame("g1", { gameSource: productionGame() });
    fixture.addUser("under-10", { nickname: "구판수", profile_image_url: null });
    fixture.addUser("b-user", { nickname: "비유저", profile_image_url: "/b.png" });
    fixture.addUser("a-user", { nickname: "에이유저", profile_image_url: "/a.png" });
    fixture.addUser("c-user", { nickname: "씨유저", profile_image_url: "/c.png" });

    for (let i = 0; i < 9; i += 1) fixture.addPlayer(playerRow("g1", "under-10", "JOKER", true));
    for (let i = 0; i < 10; i += 1) fixture.addPlayer(playerRow("g1", "b-user", "JOKER", i < 8));
    for (let i = 0; i < 20; i += 1) fixture.addPlayer(playerRow("g1", "a-user", "JOKER", i < 10));
    for (let i = 0; i < 10; i += 1) fixture.addPlayer(playerRow("g1", "c-user", "JOKER", i < 5));

    const ranking = await gameResultRepository.getRoleRanking("JOKER");

    assert.deepEqual(ranking.map((r) => r.uuid), ["b-user", "a-user", "c-user"], "9판 사용자는 빠지고 승률→판수→UUID 순서다");
    assert.deepEqual(ranking.map((r) => r.rank), [1, 2, 3], "순위는 전체 목록 기준 1부터 부여된다(화면 페이지 이동과 무관)");
    assert.equal(ranking[0].nickname, "비유저");
    assert.equal(ranking[0].profile_image_url, "/b.png");
});

test("F-13 AC-05: getRoleRanking은 계정별로 서로 다른 실제 장착 사진·테두리를 랭킹 각 행에 싣는다(순위·승률 계산은 그대로다)", async (t) => {
    const fixture = setupFixtureDb(t);
    fixture.addGame("g1", { gameSource: productionGame() });
    fixture.addUser("b-user", { nickname: "비유저", profile_image_url: "/b.png" });
    fixture.addUser("a-user", { nickname: "에이유저", profile_image_url: "/a.png" });

    for (let i = 0; i < 10; i += 1) fixture.addPlayer(playerRow("g1", "b-user", "JOKER", i < 8));
    for (let i = 0; i < 10; i += 1) fixture.addPlayer(playerRow("g1", "a-user", "JOKER", i < 5));

    let seenUserIds = null;
    gameResultRepository.__setEconomyServiceForTests({
        getPublicProfileLoadouts: async (userIds) => {
            seenUserIds = userIds;
            return {
                "b-user": { profilePhotoId: "player-profile-기사", profileBorderId: "profile-border-귀족" },
                "a-user": { profilePhotoId: "player-profile-드워프", profileBorderId: "profile-border-평민" },
            };
        },
    });
    t.after(() => {
        gameResultRepository.__setEconomyServiceForTests({
            getPublicProfileLoadouts: async (userIds) =>
                Object.fromEntries(userIds.map((id) => [id, { profilePhotoId: null, profileBorderId: null }])),
        });
    });

    const ranking = await gameResultRepository.getRoleRanking("JOKER");

    assert.deepEqual([...seenUserIds].sort(), ["a-user", "b-user"]);
    assert.deepEqual(ranking.map((r) => r.uuid), ["b-user", "a-user"], "승률 순위 계산은 이 필드 추가와 무관하게 그대로여야 한다");
    const b = ranking.find((r) => r.uuid === "b-user");
    const a = ranking.find((r) => r.uuid === "a-user");
    assert.equal(b.accountProfilePhotoId, "player-profile-기사");
    assert.equal(b.accountProfileBorderId, "profile-border-귀족");
    assert.equal(a.accountProfilePhotoId, "player-profile-드워프");
    assert.equal(a.accountProfileBorderId, "profile-border-평민");
    assert.notEqual(b.accountProfilePhotoId, a.accountProfilePhotoId, "서로 다른 계정은 서로 다른 값이어야 한다(고정값이 아니다)");
});

test("A-10: 랭킹 응답은 화면이 페이지를 넘기기 전에 잘리지 않는다(전체 적격 사용자)", async (t) => {
    const fixture = setupFixtureDb(t);
    fixture.addGame("g1", { gameSource: productionGame() });
    for (let n = 0; n < 8; n += 1) {
        const uuid = `user-${n}`;
        fixture.addUser(uuid, { nickname: `닉${n}`, profile_image_url: null });
        for (let i = 0; i < 10; i += 1) fixture.addPlayer(playerRow("g1", uuid, "GUARD", true));
    }

    const ranking = await gameResultRepository.getRoleRanking("GUARD");
    assert.equal(ranking.length, 8, "기존 상위 5명 상한(INVITED_GUESTS_MASTERY_RANKING_LIMIT)으로 잘리면 안 된다");
});

test("AC-05: settings.gameSource가 아예 없는(이 기능 이전) 과거 경기는 운영 기록으로 소급 집계된다", async (t) => {
    const fixture = setupFixtureDb(t);
    fixture.addGame("legacy-1", {});
    fixture.addPlayer(playerRow("legacy-1", "u1", "DOCTOR", true));

    const stats = await gameResultRepository.getMyRoleStatistics("u1");
    assert.equal(stats.find((s) => s.role === "DOCTOR").games, 1, "과거 기록을 개발 경기로 임의 재분류해 제외하면 안 된다");
});

test("AC-05/A-07: settings.gameSource.value가 development인 경기는 내 전적·랭킹 모두에서 제외된다", async (t) => {
    const fixture = setupFixtureDb(t);
    fixture.addGame("dev-1", { gameSource: developmentGame() });
    fixture.addUser("u1", { nickname: "닉1", profile_image_url: null });
    for (let i = 0; i < 10; i += 1) fixture.addPlayer(playerRow("dev-1", "u1", "GUARD", true));

    const stats = await gameResultRepository.getMyRoleStatistics("u1");
    assert.equal(stats.find((s) => s.role === "GUARD").games, 0);

    const ranking = await gameResultRepository.getRoleRanking("GUARD");
    assert.deepEqual(ranking, []);
});

test("AC-05: 중단 경기의 이탈자 패배 전적은 유지되고 won=null 잔류자는 생존 수에도 들어가지 않는다", async (t) => {
    const fixture = setupFixtureDb(t);
    fixture.addGame("abort-1", { gameSource: productionGame() });
    fixture.addPlayer(playerRow("abort-1", "leaver", "CITIZEN", false, false));
    fixture.addPlayer(playerRow("abort-1", "stayer", "CITIZEN", null, true));

    const leaverStats = await gameResultRepository.getMyRoleStatistics("leaver");
    const citizen = leaverStats.find((s) => s.role === "CITIZEN");
    assert.equal(citizen.games, 1);
    assert.equal(citizen.wins, 0);
    assert.equal(citizen.survivalCount, 0);

    const stayerStats = await gameResultRepository.getMyRoleStatistics("stayer");
    assert.equal(stayerStats.find((s) => s.role === "CITIZEN").games, 0, "잔류자의 미확정 전적은 판수에 들어가면 안 된다");
});

test("AC-04: 운명의 가면은 최다 플레이가 아니라 최소 1판 이상 최고 승률 직업이다", async (t) => {
    const fixture = setupFixtureDb(t);
    fixture.addGame("g1", { gameSource: productionGame() });
    for (let i = 0; i < 20; i += 1) fixture.addPlayer(playerRow("g1", "u1", "CITIZEN", i < 8));
    for (let i = 0; i < 5; i += 1) fixture.addPlayer(playerRow("g1", "u1", "JOKER", true));

    const result = await gameResultRepository.getHighestWinRateRole("u1");
    assert.equal(result.role, "JOKER");
});

test("AC-04: 전적이 전혀 없으면 null이다(더미로 대체하지 않는다)", async (t) => {
    setupFixtureDb(t);
    const result = await gameResultRepository.getHighestWinRateRole("nobody");
    assert.equal(result, null);
});

test("A-11: getMyProfile은 most_played_role을 그대로 유지하면서 highest_win_rate_role을 별도 필드로 추가한다", async (t) => {
    const fixture = setupFixtureDb(t);
    const originalUserRepo = userRepository.getMyProfile;
    userRepository.getMyProfile = async (uuid) => (uuid === "u1"
        ? {
            nickname: "닉1",
            profile_image_url: null,
            UserStat: { reputation: 10, title: "신참", total_games: 5, survival_count: 3, execution_count: 1, most_played_role: "CITIZEN" },
        }
        : null);
    t.after(() => { userRepository.getMyProfile = originalUserRepo; });

    fixture.addGame("g1", { gameSource: productionGame() });
    for (let i = 0; i < 3; i += 1) fixture.addPlayer(playerRow("g1", "u1", "JOKER", true));

    const { status, body } = await callController(profileController.getMyProfile, { user: { uuid: "u1" } });

    assert.equal(status, 200);
    assert.equal(body.data.most_played_role, "CITIZEN", "기존 필드 의미가 바뀌면 안 된다");
    assert.equal(body.data.highest_win_rate_role, "광대", "최고 승률 직업(JOKER=광대)이 별도 필드로 나가야 한다");
});

test("A-11: 전적이 없는 계정은 highest_win_rate_role이 null이다", async (t) => {
    setupFixtureDb(t);
    const originalUserRepo = userRepository.getMyProfile;
    userRepository.getMyProfile = async () => ({
        nickname: "닉1", profile_image_url: null,
        UserStat: { reputation: 0, title: "신참", total_games: 0, survival_count: 0, execution_count: 0, most_played_role: null },
    });
    t.after(() => { userRepository.getMyProfile = originalUserRepo; });

    const { body } = await callController(profileController.getMyProfile, { user: { uuid: "u1" } });
    assert.equal(body.data.highest_win_rate_role, null);
});

const stubProfileUser = (t, overrides = {}) => {
    const original = userRepository.getMyProfile;
    userRepository.getMyProfile = async (uuid) => (uuid === "u1"
        ? {
            nickname: "닉1",
            profile_image_url: null,
            UserStat: {
                title: "신참",
                total_games: 999,
                survival_count: 3,
                execution_count: 1,
                most_played_role: "CITIZEN",
                ...overrides,
            },
        }
        : null);
    t.after(() => { userRepository.getMyProfile = original; });
};

const getMyProfileData = async (req = { user: { uuid: "u1" } }) =>
    (await callController(profileController.getMyProfile, req)).body.data;

test("F-30 AC-02: 표시 판수·승률은 계정 전체 유효 종료 경기의 판수·승수다(최고 직업 승률도 직업별 평균도 아니다)", async (t) => {
    const fixture = setupFixtureDb(t);
    stubProfileUser(t);

    fixture.addGame("g1", { gameSource: productionGame() });
    fixture.addGame("g2", { gameSource: productionGame() });
    fixture.addGame("g3", { gameSource: productionGame() });
    fixture.addPlayer(playerRow("g1", "u1", "CITIZEN", true));
    fixture.addPlayer(playerRow("g2", "u1", "CITIZEN", false));
    fixture.addPlayer(playerRow("g3", "u1", "JOKER", true));

    const data = await getMyProfileData();

    assert.equal(data.total_games, 3);
    assert.equal(data.account_win_rate, 2 / 3);
    assert.equal(data.highest_win_rate_role, "광대");
    assert.notEqual(data.account_win_rate, 1, "특정 직업의 최고 승률을 계정 승률로 쓰면 안 된다");
    assert.notEqual(data.account_win_rate, 0.75, "직업별 승률의 평균(0.5·1.0)을 계정 승률로 쓰면 안 된다");
    assert.notEqual(data.total_games, 999);
});

test("F-30 AC-02: 중단 이탈자의 패배는 포함되고, 잔류자·개발 경기·타 계정 행은 들어가지 않는다", async (t) => {
    const fixture = setupFixtureDb(t);
    stubProfileUser(t);

    fixture.addGame("g1", { gameSource: productionGame() });
    fixture.addGame("g2", { gameSource: productionGame() });
    fixture.addGame("g3", { gameSource: productionGame() });
    fixture.addPlayer(playerRow("g1", "u1", "CITIZEN", true));
    fixture.addPlayer(playerRow("g2", "u1", "CITIZEN", false));
    fixture.addPlayer(playerRow("g3", "u1", "JOKER", true));

    fixture.addGame("abort-1", { gameSource: productionGame() }, { completed: false });
    fixture.addPlayer(playerRow("abort-1", "u1", "GUARD", false, false));

    let data = await getMyProfileData();
    assert.equal(data.total_games, 4);
    assert.equal(data.account_win_rate, 1 / 2);

    fixture.addPlayer(playerRow("abort-1", "u1", "DOCTOR", null, true));
    fixture.addGame("dev-1", { gameSource: developmentGame() });
    fixture.addPlayer(playerRow("dev-1", "u1", "JOKER", true));
    fixture.addPlayer(playerRow("g1", "other", "CITIZEN", true));
    fixture.addPlayer(playerRow("no-such-game", "u1", "CITIZEN", true));

    data = await getMyProfileData();
    assert.equal(data.total_games, 4, "잔류자·개발 경기·타 계정·JOIN 대상 없는 행이 표시 판수에 섞였다");
    assert.equal(data.account_win_rate, 1 / 2);

    fixture.addGame("legacy-1", {});
    fixture.addPlayer(playerRow("legacy-1", "u1", "CITIZEN", true));

    data = await getMyProfileData();
    assert.equal(data.total_games, 5);
    assert.equal(data.account_win_rate, 3 / 5);
});

test("F-30 AC-02: DB의 0/1 표현도 boolean과 같은 판수·승률을 만든다", async (t) => {
    const fixture = setupFixtureDb(t);
    stubProfileUser(t);

    fixture.addGame("g1", { gameSource: productionGame() });
    fixture.addGame("g2", { gameSource: productionGame() });
    fixture.addPlayer(playerRow("g1", "u1", "CITIZEN", 1));
    fixture.addPlayer(playerRow("g2", "u1", "CITIZEN", 0));

    const data = await getMyProfileData();
    assert.equal(data.total_games, 2);
    assert.equal(data.account_win_rate, 0.5);
});

test("F-30 AC-03: 전적이 전혀 없는 계정은 0판·승률 0이다(원본 판수 999는 쓰지 않는다)", async (t) => {
    setupFixtureDb(t);
    stubProfileUser(t);

    const data = await getMyProfileData();
    assert.equal(data.total_games, 0);
    assert.equal(data.account_win_rate, 0, "0판에서 0으로 나눈 NaN이 나가면 안 된다");
    assert.equal(Number.isFinite(data.account_win_rate), true);
});

test("F-30 AC-04: 프로필 응답에 reputation 키 자체가 없고 나머지 필드는 그대로다", async (t) => {
    const fixture = setupFixtureDb(t);
    stubProfileUser(t, { reputation: 1280 });
    fixture.addGame("g1", { gameSource: productionGame() });
    fixture.addPlayer(playerRow("g1", "u1", "CITIZEN", true));

    const data = await getMyProfileData();

    assert.equal(Object.hasOwn(data, "reputation"), false, "명성이 아직 응답에 실린다");
    assert.equal(data.nickname, "닉1");
    assert.equal(data.title, "신참");
    assert.equal(data.survival_count, 3);
    assert.equal(data.execution_count, 1);
    assert.equal(data.most_played_role, "CITIZEN");
    assert.equal(typeof data.account_win_rate, "number");
});

test("F-30 AC-02: 내 프로필도 req.user.uuid만 본다 — body/query의 다른 uuid는 무시된다", async (t) => {
    const fixture = setupFixtureDb(t);
    stubProfileUser(t);
    fixture.addGame("g1", { gameSource: productionGame() });
    for (let i = 0; i < 5; i += 1) fixture.addPlayer(playerRow("g1", "victim", "CITIZEN", true));
    fixture.addPlayer(playerRow("g1", "u1", "CITIZEN", false));

    const data = await getMyProfileData({
        user: { uuid: "u1" },
        body: { user_id: "victim" },
        query: { user_id: "victim" },
    });

    assert.equal(data.total_games, 1, "다른 계정의 전적이 내 표시 판수에 들어왔다");
    assert.equal(data.account_win_rate, 0);
});

test("F-30 AC-03: 전적 조회가 실패하면 0판 성공 응답으로 위장하지 않고 오류로 이어진다", async (t) => {
    setupFixtureDb(t);
    stubProfileUser(t);
    db.GameResultPlayer.findAll = async () => { throw new Error("전적 조회 실패"); };

    await assert.rejects(
        () => callController(profileController.getMyProfile, { user: { uuid: "u1" } }),
        /전적 조회 실패/,
        "조회 실패가 total_games=0 성공 응답으로 바뀌면 안 된다",
    );
});

test("F-30 AC-03: 사용자가 없으면 여전히 404이고 전적 집계로 넘어가지 않는다", async (t) => {
    setupFixtureDb(t);
    stubProfileUser(t);

    const { status, body } = await callController(profileController.getMyProfile, { user: { uuid: "nobody" } });
    assert.equal(status, 404);
    assert.equal(body.success, false);
});

test("F-30 AC-02: buildGameResultRecord가 만든 정상·중단 레코드가 표시 판수·승률에 그대로 반영된다", async (t) => {
    const fixture = setupFixtureDb(t);
    stubProfileUser(t);

    const endedSession = {
        id: "win-1", roomId: "room-1", phase: "ENDED", dayIndex: 1, jokerCount: 0,
        roleComposition: { JOKER: 0, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: 1 },
        timerSettings: { dayDiscussionTime: null, dayVoteTime: null, nightActionTime: null, roleNightActionTimes: {} },
        startedAt: 1, endedAt: 2, winResult: { winner: "CITIZEN" }, gameSource: "production",
        players: new Map([["u1", { uuid: "u1", nickname: "닉1", role: "CITIZEN", team: "CITIZEN", alive: true, deathReason: null }]]),
    };
    const abortedSession = {
        id: "abort-2", roomId: "room-2", phase: "NIGHT", dayIndex: 1, jokerCount: 0,
        roleComposition: { JOKER: 0, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: 2 },
        timerSettings: { dayDiscussionTime: null, dayVoteTime: null, nightActionTime: null, roleNightActionTimes: {} },
        startedAt: 3, gameSource: "production",
        players: new Map([
            ["u1", { uuid: "u1", nickname: "닉1", role: "GUARD", team: "CITIZEN", alive: true, deathReason: null }],
            ["u2", { uuid: "u2", nickname: "닉2", role: "CITIZEN", team: "CITIZEN", alive: true, deathReason: null }],
        ]),
    };

    for (const [session, options] of [
        [endedSession, { completed: true }],
        [abortedSession, { completed: false, disconnectedUuid: "u1" }],
    ]) {
        const record = buildGameResultRecord(session, options);
        fixture.addGame(record.result.id, record.result.settings, { completed: record.result.completed });
        for (const player of record.players) fixture.addPlayer(player);
    }

    const data = await getMyProfileData();
    assert.equal(data.total_games, 2);
    assert.equal(data.account_win_rate, 0.5);

    const stayerStats = await gameResultRepository.getMyRoleStatistics("u2");
    assert.equal(stayerStats.reduce((sum, entry) => sum + entry.games, 0), 0, "중단 잔류자는 표시 판수가 0이어야 한다");
});

test("저장 레코드의 settings.gameSource가 조회 경로의 개발 경기 판정에 그대로 쓰인다", async (t) => {
    const fixture = setupFixtureDb(t);
    const session = {
        id: "g1", roomId: "room-1", phase: "ENDED", dayIndex: 1, jokerCount: 0,
        roleComposition: { JOKER: 0, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: 1 },
        timerSettings: { dayDiscussionTime: null, dayVoteTime: null, nightActionTime: null, roleNightActionTimes: {} },
        startedAt: 1, endedAt: 2, winResult: { winner: "CITIZEN" }, gameSource: "development",
        players: new Map([["u1", { uuid: "u1", nickname: "닉1", role: "CITIZEN", team: "CITIZEN", alive: true, deathReason: null }]]),
    };
    const record = buildGameResultRecord(session, { completed: true });
    fixture.addGame(record.result.id, record.result.settings);
    for (const player of record.players) fixture.addPlayer(player);

    const stats = await gameResultRepository.getMyRoleStatistics("u1");
    assert.equal(stats.find((s) => s.role === "CITIZEN").games, 0, "개발 경기 출처가 저장→조회 왕복 후에도 제외되어야 한다");
});

const { generateToken } = require("../../utils/jwt");
const { notFoundHandler, globalErrorHandler } = require("../../middleware/errorHandler");

const ROUTE_TOKEN = generateToken({ uuid: "route-u1", role: "USER", sessionId: "route-session-1" });

const startRouteServer = async (t) => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use("/user", require("../../routes/user.routes"));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);

    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return `http://127.0.0.1:${server.address().port}`;
};

const stubAuthDb = (t) => {
    const original = { UserSession: db.UserSession, UserBan: db.UserBan };
    db.UserSession = { findOne: async () => ({ id: "route-session-1", user_id: "route-u1", is_online: true }) };
    db.UserBan = { findOne: async () => null };
    t.after(() => {
        db.UserSession = original.UserSession;
        db.UserBan = original.UserBan;
    });
};

test("A-09: 쿠키 없이 /user/me/role-statistics를 요청하면 401이다(라우트가 실제로 verifyToken 뒤에 있다)", async (t) => {
    const base = await startRouteServer(t);
    const res = await fetch(`${base}/user/me/role-statistics`);
    assert.equal(res.status, 401);
});

test("A-09: 쿠키 없이 /user/role-statistics/ranking을 요청하면 401이다", async (t) => {
    const base = await startRouteServer(t);
    const res = await fetch(`${base}/user/role-statistics/ranking?role=CITIZEN`);
    assert.equal(res.status, 401);
});

test("AC-06: 인증된 요청은 실제 라우터→컨트롤러→리포지토리를 통해 200을 받는다", async (t) => {
    setupFixtureDb(t);
    stubAuthDb(t);
    const base = await startRouteServer(t);

    const statsRes = await fetch(`${base}/user/me/role-statistics`, { headers: { cookie: `accessToken=${ROUTE_TOKEN}` } });
    assert.equal(statsRes.status, 200);
    const statsBody = await statsRes.json();
    assert.equal(statsBody.data.length, 5);

    const rankingRes = await fetch(`${base}/user/role-statistics/ranking?role=CITIZEN`, { headers: { cookie: `accessToken=${ROUTE_TOKEN}` } });
    assert.equal(rankingRes.status, 200);
    const rankingBody = await rankingRes.json();
    assert.deepEqual(rankingBody.data.ranking, []);
});
