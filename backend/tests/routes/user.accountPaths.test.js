process.env.JWT_SECRET = "account-paths-test-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test";

const test         = require("node:test");
const assert       = require("node:assert/strict");
const { once }     = require("node:events");
const express      = require("express");
const cookieParser = require("cookie-parser");
const fs           = require("node:fs");
const path         = require("node:path");

const db = require("../../models");
const { generateToken } = require("../../utils/jwt");
const { notFoundHandler, globalErrorHandler } = require("../../middleware/errorHandler");

const { Sequelize }          = require("sequelize");
const migrationRunner        = require("../../db/migrationRunner");
const baseline                = require("../../db/migrations/0001-legacy-baseline");
const expandNicknameSnapshot  = require("../../db/migrations/0002-expand-nickname-snapshot");
const addRefreshTokenRotation = require("../../db/migrations/0003-add-refresh-token-rotation");
const addRefreshTokenHistory  = require("../../db/migrations/0004-add-refresh-token-history");
const addSocialAuth           = require("../../db/migrations/0005-add-social-auth");
const { buildManagedSchema, resetManagedSchema } = require("../helpers/isolatedTestDb");

const FIXTURE_PATH = path.join(__dirname, "..", "..", "..", "tests", "fixtures", "f02-signup-validation.json");
const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));

const TOKEN = generateToken({ uuid: "uuid-1", role: "USER", sessionId: "session-1" });

const USER_MODEL_ATTRIBUTES = typeof db.User.getAttributes === "function"
    ? db.User.getAttributes()
    : db.User.rawAttributes;

const startServer = async (t) => {
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

const stubDb = (t, user, gameResultPlayer) => {
    const originalUser             = db.User;
    const originalSession          = db.UserSession;
    const originalBan              = db.UserBan;
    const originalGameResultPlayer = db.GameResultPlayer;

    db.User        = { findOne: async () => null, ...user };
    db.UserSession = { findOne: async () => ({ id: "session-1", user_id: "uuid-1", is_online: true }) };
    db.UserBan     = { findOne: async () => null };
    db.GameResultPlayer = { findAll: async () => [], ...gameResultPlayer };

    t.after(() => {
        db.User = originalUser;
        db.UserSession = originalSession;
        db.UserBan = originalBan;
        db.GameResultPlayer = originalGameResultPlayer;
    });
};

const patchNickname = (base, nickname) =>
    fetch(`${base}/user/me/nickname`, {
        method:  "PATCH",
        headers: { "content-type": "application/json", cookie: `accessToken=${TOKEN}` },
        body:    JSON.stringify({ nickname }),
    });

const getProfile = (base) =>
    fetch(`${base}/user/me/profile`, { headers: { cookie: `accessToken=${TOKEN}` } });

const uniqueConstraintError = ({ paths = [], fields = {} } = {}) =>
    new db.Sequelize.UniqueConstraintError({
        errors: paths.map((path) => ({ path, message: "must be unique" })),
        fields,
    });

test("AC-01: 가입과 같은 fixture 무효 닉네임은 변경 요청에서도 400으로 거부된다", async (t) => {
    stubDb(t, { update: async () => { throw new Error("검증에서 걸러져야 하며 update가 호출되면 안 됩니다"); } });
    const base = await startServer(t);

    for (const { value, reason } of fixture.nickname.invalid) {
        const res  = await patchNickname(base, value);
        const body = await res.json();
        assert.equal(res.status, 400, `"${value}"(${reason})는 400이어야 합니다`);
        assert.equal(body.success, false);
    }
});

test("AC-01: 가입과 같은 fixture 유효 닉네임(2~8자 경계 포함)은 변경이 허용된다", async (t) => {
    const calls = [];
    stubDb(t, { update: async (values) => { calls.push(values); return [1]; } });
    const base = await startServer(t);

    for (const value of fixture.nickname.valid) {
        const res = await patchNickname(base, value);
        assert.equal(res.status, 200, `"${value}"는 200이어야 합니다`);
    }
    assert.equal(calls.length, fixture.nickname.valid.length);
});

test("중복 닉네임 PATCH는 500이 아니라 409를 반환한다", async (t) => {
    stubDb(t, { update: async () => { throw uniqueConstraintError({ paths: ["nickname"] }); } });
    const base = await startServer(t);

    const res  = await patchNickname(base, "중복닉");
    const body = await res.json();

    assert.equal(res.status, 409, "unique 위반이 그대로 새어나가 500이 되고 있습니다");
    assert.equal(body.success, false);
    assert.match(body.message, /닉네임/);
});

test("중복 닉네임은 UPDATE 전에 사전 조회로도 같은 409를 반환한다", async (t) => {
    let updates = 0;
    stubDb(t, {
        findOne: async ({ where }) => where.nickname ? { uuid: "other-user" } : null,
        update: async () => { updates += 1; return [1]; },
    });
    const base = await startServer(t);

    const res = await patchNickname(base, "중복닉");
    assert.equal(res.status, 409);
    assert.match((await res.json()).message, /닉네임/);
    assert.equal(updates, 0);
});

test("AC-02: nickname은 애플리케이션 사전 조회가 아니라 실제 users 테이블 유니크 제약으로도 보호된다", () => {
    assert.equal(USER_MODEL_ATTRIBUTES.nickname.unique, true);
});

test("AC-02: 실제 격리 DB에서 애플리케이션 사전 조회 없이 UPDATE만 보내도 users_nickname_unique 제약이 막는다", async (t) => {
    const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
    if (!TEST_DB_URL) {
        t.skip("F01_TEST_DATABASE_URL이 설정되지 않았습니다 — 실제 MySQL 격리 DB 없이는 DB 유니크 제약 자체를 검증할 수 없습니다 (미검증).");
        return;
    }

    const sequelize = new Sequelize(TEST_DB_URL, { logging: false });
    try {
        await sequelize.authenticate();
    } catch (error) {
        t.skip(`격리 DB(${TEST_DB_URL.replace(/:[^:@]*@/, ":***@")})에 연결할 수 없습니다 — 미검증: ${error.message}`);
        await sequelize.close();
        return;
    }

    try {
        const MIGRATIONS = [baseline, expandNicknameSnapshot, addRefreshTokenRotation, addRefreshTokenHistory];
        const { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER } = buildManagedSchema({
            baseline, addRefreshTokenHistory, addSocialAuth, migrationRunner,
        });

        await resetManagedSchema(sequelize, TEST_DB_URL, { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER });
        await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

        const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
        const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
        await sequelize.query(
            `INSERT INTO users (uuid, password_hash, nickname, email, birth_date, created_at, updated_at)
             VALUES (:userA, 'x', :nicknameA, :emailA, '2000-01-01', NOW(), NOW()),
                    (:userB, 'x', :nicknameB, :emailB, '2000-01-01', NOW(), NOW())`,
            {
                replacements: {
                    userA: USER_A, nicknameA: "DB유니크1", emailA: "db-unique-1@example.com",
                    userB: USER_B, nicknameB: "DB유니크2", emailB: "db-unique-2@example.com",
                },
            },
        );

        await assert.rejects(
            () => sequelize.query(
                "UPDATE users SET nickname = :nickname WHERE uuid = :uuid",
                { replacements: { nickname: "DB유니크1", uuid: USER_B } },
            ),
            /nickname|Duplicate|unique/i,
            "사전 조회 없이 보낸 UPDATE도 DB 유니크 제약으로 거부되어야 합니다",
        );

        const [rows] = await sequelize.query(
            "SELECT nickname FROM users WHERE uuid = :uuid",
            { replacements: { uuid: USER_B } },
        );
        assert.equal(rows[0].nickname, "DB유니크2", "제약 위반 UPDATE 이후에도 저장된 닉네임은 바뀌면 안 됩니다");
    } finally {
        await sequelize.close();
    }
});

test("AC-02: 사전 조회를 통과해도 UPDATE 시점 동시 중복이면 409이고 닉네임은 이전 값 그대로 남는다", async (t) => {
    let stored = "이전유지닉";
    let simulateRaceOnce = true;
    stubDb(t, {
        findOne: async ({ where }) => (where.nickname ? null : { uuid: "uuid-1", nickname: stored }),
        update: async (values) => {
            if (simulateRaceOnce) {
                simulateRaceOnce = false;
                throw uniqueConstraintError({ paths: ["nickname"] });
            }
            if (Object.prototype.hasOwnProperty.call(values, "nickname")) stored = values.nickname;
            return [1];
        },
    });
    const base = await startServer(t);

    const res = await patchNickname(base, "경쟁닉네임");
    assert.equal(res.status, 409);

    const profile = await (await getProfile(base)).json();
    assert.equal(profile.data.nickname, stored, "동시 중복 실패 후에도 저장된 닉네임이 바뀌면 안 됩니다");
    assert.equal(stored, "이전유지닉", "실패한 UPDATE는 상태를 건드리면 안 됩니다");

    const retry = await patchNickname(base, "재시도닉네임");
    assert.equal(retry.status, 200);
    assert.equal(stored, "재시도닉네임", "경합 없이 재시도하면 같은 update 함수가 실제로 값을 바꿔야 합니다");
});

test("MySQL이 인덱스 이름만 알려줘도 409로 분류된다", async (t) => {
    stubDb(t, {
        update: async () => { throw uniqueConstraintError({ paths: ["users_nickname_unique"] }); },
    });
    const base = await startServer(t);

    const res = await patchNickname(base, "중복닉");
    assert.equal(res.status, 409);
    assert.match((await res.json()).message, /닉네임/);
});

test("errors 없이 fields만 채워져 와도 409로 분류된다", async (t) => {
    stubDb(t, { update: async () => { throw uniqueConstraintError({ fields: { nickname: "중복닉" } }); } });
    const base = await startServer(t);

    assert.equal((await patchNickname(base, "중복닉")).status, 409);
});

test("errors가 배열이 아닌 UniqueConstraintError도 터지지 않고 409가 된다", async (t) => {
    stubDb(t, {
        update: async () => { throw new db.Sequelize.UniqueConstraintError({}); },
    });
    const base = await startServer(t);

    const res = await patchNickname(base, "중복닉");
    assert.equal(res.status, 409);
    assert.match((await res.json()).message, /이미 사용 중인/);
});

test("unique 위반이 아닌 오류는 여전히 500으로 남는다", async (t) => {
    stubDb(t, { update: async () => { throw new Error("ER_LOCK_WAIT_TIMEOUT"); } });
    const base = await startServer(t);

    assert.equal((await patchNickname(base, "새닉")).status, 500);
});

test("정상 닉네임 변경은 회귀 없이 200이다", async (t) => {
    const calls = [];
    stubDb(t, { update: async (values, options) => { calls.push({ values, options }); return [1]; } });
    const base = await startServer(t);

    const res = await patchNickname(base, "  새닉  ");

    assert.equal(res.status, 200);
    assert.deepEqual(calls[0].values, { nickname: "새닉" }, "공백 trim이 유지되어야 합니다");
    assert.deepEqual(calls[0].options.where, { uuid: "uuid-1" });
});

test("user_stats 행이 없는 계정도 프로필 조회가 200으로 성공한다", async (t) => {
    stubDb(t, {
        findOne: async () => ({ nickname: "통계없음", profile_image_url: null, UserStat: null }),
    });
    const base = await startServer(t);

    const res  = await getProfile(base);
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.deepEqual(body.data, {
        nickname:          "통계없음",
        profile_image_url: null,
        title:             "신참",
        total_games:       0,
        account_win_rate:  0,
        survival_count:    0,
        execution_count:   0,
        most_played_role:  null,
        highest_win_rate_role: null,
    });
    assert.equal(Object.hasOwn(body.data, "reputation"), false);
});

test("user_stats가 있어도 표시 판수·승률은 전적 조회 모집단에서 나오고 명성 키는 없다", async (t) => {
    stubDb(t, {
        findOne: async () => ({
            nickname:          "통계있음",
            profile_image_url: "https://example.com/a.png",
            UserStat: {
                reputation: 42, title: "베테랑", total_games: 10,
                survival_count: 7, execution_count: 3, most_played_role: "마피아",
            },
        }),
    });
    const base = await startServer(t);

    const body = await (await getProfile(base)).json();

    assert.equal(Object.hasOwn(body.data, "reputation"), false, "명성이 아직 응답에 실린다");
    assert.equal(body.data.total_games, 0, "원본 UserStats.total_games를 그대로 흘려보내면 안 된다");
    assert.equal(body.data.account_win_rate, 0);
    assert.equal(body.data.title, "베테랑");
    assert.equal(body.data.survival_count, 7);
    assert.equal(body.data.execution_count, 3);
    assert.equal(body.data.most_played_role, "마피아");
    assert.equal(body.data.profile_image_url, "https://example.com/a.png");
});

test("F-30 AC-02: 인증 계정의 확정 전적만 합산되어 표시 판수·승률이 나간다", async (t) => {
    const seenOptions = [];
    stubDb(t, {
        findOne: async () => ({
            nickname: "합산", profile_image_url: null,
            UserStat: { reputation: 7, title: "신참", total_games: 999, survival_count: 1, execution_count: 0, most_played_role: "CITIZEN" },
        }),
    }, {
        findAll: async (options) => {
            seenOptions.push(options);
            return [
                { user_id: "uuid-1", role: "CITIZEN", won: true,  is_alive: true,  GameResult: { settings: { gameSource: { v: 1, value: "production" } } } },
                { user_id: "uuid-1", role: "CITIZEN", won: false, is_alive: false, GameResult: { settings: { gameSource: { v: 1, value: "production" } } } },
                { user_id: "uuid-1", role: "JOKER",   won: true,  is_alive: true,  GameResult: { settings: { gameSource: { v: 1, value: "production" } } } },
            ];
        },
    });
    const base = await startServer(t);

    const body = await (await getProfile(base)).json();

    assert.equal(body.data.total_games, 3);
    assert.equal(body.data.account_win_rate, 2 / 3, "최고 직업 승률(1.0)이나 직업별 평균(0.75)이 아니다");
    assert.equal(Object.hasOwn(body.data, "reputation"), false);

    const statsQuery = seenOptions.find((options) => options.include);
    assert.ok(statsQuery, "전적 집계 조회가 include를 걸지 않았다");
    assert.equal(statsQuery.where.user_id, "uuid-1");
    assert.deepEqual(statsQuery.where.won, { [db.Sequelize.Op.ne]: null }, "won 미확정 행을 DB에서 걸러야 한다");
    assert.equal(statsQuery.include[0].required, true, "소속 game_results가 없는 행이 섞이면 안 된다");
});

test("Sequelize 인스턴스로 넘어온 통계도 평탄화되어 노출된다", async (t) => {
    const instance = {
        get: ({ plain }) => (plain ? { reputation: 5, title: "중수", most_played_role: null } : null),
    };
    stubDb(t, { findOne: async () => ({ nickname: "n", profile_image_url: null, UserStat: instance }) });
    const base = await startServer(t);

    const body = await (await getProfile(base)).json();

    assert.equal(Object.hasOwn(body.data, "reputation"), false);
    assert.equal(body.data.title, "중수");
    assert.equal(body.data.total_games, 0, "누락된 필드는 기본값으로 채워져야 합니다");
    assert.equal(body.data.account_win_rate, 0);
});

test("존재하지 않는 유저의 프로필 조회는 404를 유지한다", async (t) => {
    stubDb(t, { findOne: async () => null });
    const base = await startServer(t);

    assert.equal((await getProfile(base)).status, 404);
});
