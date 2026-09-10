process.env.JWT_SECRET = "account-paths-test-secret";
// models/index.js는 require 시점에 DATABASE_URL을 파싱합니다(연결은 하지 않습니다).
// npm test는 --env-file=.env.test로 이 값을 주지만, 파일 하나만 직접 실행할 때도
// 동작하도록 없을 때만 더미 값을 채웁니다.
process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test";

const test         = require("node:test");
const assert       = require("node:assert/strict");
const { once }     = require("node:events");
const express      = require("express");
const cookieParser = require("cookie-parser");
const fs           = require("node:fs");
const path         = require("node:path");

const db = require("../models");
const { generateToken } = require("../utils/jwt");
const { notFoundHandler, globalErrorHandler } = require("../middleware/errorHandler");

// F-04 AC-02: 실제 격리 DB에서 유니크 제약이 동작하는지 확인하려면 애플리케이션 db 싱글턴이
// 아니라(이 파일의 다른 테스트들이 db.User를 스텁으로 바꿔 쓰므로 공유할 수 없다) 독립된
// Sequelize 연결이 필요하다. backend/tests/db/f02-signup.integration.test.js와 같은
// 원칙(F01_TEST_DATABASE_URL이 없거나 연결에 실패하면 실패가 아니라 t.skip으로 "미검증")을
// 그대로 따른다.
const { Sequelize }          = require("sequelize");
const migrationRunner        = require("../db/migrationRunner");
const baseline                = require("../db/migrations/0001-legacy-baseline");
const expandNicknameSnapshot  = require("../db/migrations/0002-expand-nickname-snapshot");
const addRefreshTokenRotation = require("../db/migrations/0003-add-refresh-token-rotation");
const addRefreshTokenHistory  = require("../db/migrations/0004-add-refresh-token-history");
// F-05 R-IMPL(CODEX-2/VERIFY-10): external_identities/oauth_states/social_signup_intents도
// 같은 격리 DB를 공유한다. 관리 목록·드롭 순서·대상 DB 확인은
// backend/tests/helpers/isolatedTestDb.js에 공통으로 모아 다섯 스위트가 항상 같은 정의를
// 쓰게 한다.
const addSocialAuth           = require("../db/migrations/0005-add-social-auth");
const { buildManagedSchema, resetManagedSchema } = require("../tests/helpers/isolatedTestDb");

// F-04 AC-01: 닉네임 변경도 가입(F-02)과 같은 벡터로 판정이 갈리지 않는지 확인한다.
const FIXTURE_PATH = path.join(__dirname, "..", "..", "tests", "fixtures", "f02-signup-validation.json");
const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));

const TOKEN = generateToken({ uuid: "uuid-1", role: "USER", sessionId: "session-1" });

// F-04 AC-02: 각 테스트가 stubDb로 db.User를 교체하기 전, 원본 User 모델 정의를 미리 잡아
// 둔다 — DB 유니크 제약 존재 여부를 실행 순서와 무관하게 확인하기 위해서다.
const USER_MODEL_ATTRIBUTES = typeof db.User.getAttributes === "function"
    ? db.User.getAttributes()
    : db.User.rawAttributes;

const startServer = async (t) => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use("/user", require("../routes/user.routes"));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);

    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(() => new Promise((resolve) => server.close(resolve)));

    return `http://127.0.0.1:${server.address().port}`;
};

// 인증 미들웨어를 통과시키기 위한 온라인 세션 + 테스트마다 갈아끼울 User 대체 객체.
const stubDb = (t, user) => {
    const originalUser    = db.User;
    const originalSession = db.UserSession;
    const originalBan     = db.UserBan;

    db.User        = { findOne: async () => null, ...user };
    db.UserSession = { findOne: async () => ({ id: "session-1", user_id: "uuid-1", is_online: true }) };
    db.UserBan     = { findOne: async () => null };

    t.after(() => {
        db.User = originalUser;
        db.UserSession = originalSession;
        db.UserBan = originalBan;
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

// 실제 dialect가 만드는 에러를 그대로 씁니다. name이 'SequelizeUniqueConstraintError'인지가
// 리포지토리 변환의 유일한 트리거이므로, 직접 조립한 유사 객체로는 검증이 약해집니다.
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
    // 사전 조회(findByNickname)는 경합 창을 좁힐 뿐 막지 못한다 — 두 요청이 동시에 그 조회를
    // 통과하면 애플리케이션 코드만으로는 중복을 막을 수 없다. 이 위의 두 테스트("MySQL이
    // 인덱스 이름만...", "사전 조회로도 같은 409를...")가 실제로 지키는 보장이 되려면
    // 0001-legacy-baseline.js가 만드는 users_nickname_unique 인덱스와 이 모델 정의가
    // 일치해야 한다 — 여기서 그 정의를 직접 확인한다.
    assert.equal(USER_MODEL_ATTRIBUTES.nickname.unique, true);
});

test("AC-02: 실제 격리 DB에서 애플리케이션 사전 조회 없이 UPDATE만 보내도 users_nickname_unique 제약이 막는다", async (t) => {
    // 재검토 지적: 위 정적 확인(모델 정의의 unique:true)만으로는 "실제 DB 경합"의 증거가
    // 되지 못한다 — 모델 정의와 실제 배포 DB의 인덱스가 어긋나 있어도 이 정적 검사는 여전히
    // 통과하기 때문이다. 여기서는 findByNickname 같은 애플리케이션 사전 조회를 완전히
    // 우회하고, 순수 SQL UPDATE 두 건이 실제 MySQL 컬럼 제약만으로 충돌하는지 직접 본다.
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

        // findByNickname 사전 조회를 거치지 않고 직접 UPDATE한다 — 이 요청이 막히는 이유가
        // 애플리케이션 코드가 아니라 컬럼 제약이어야 한다.
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
    // 사전 조회 통과 직후 경쟁자가 먼저 같은 닉네임으로 커밋을 끝내는 경합을 흉내낸다.
    // findByNickname은 아직 빈 값을 보고 통과시키지만, 뒤따르는 UPDATE는 그 사이 생긴
    // 유니크 위반으로 실패해야 하고, 그 실패 후에도 저장된 닉네임은 바뀌면 안 된다.
    //
    // stored는 update가 성공하면 실제로 바뀌는 상태다(재검토 지적: 이전 회차는 findOne이
    // 항상 같은 상수를 돌려줘 "안 바뀌었다"는 단언이 update 호출 여부와 무관하게 참이었다).
    // 아래에서 같은 update 함수로 성공 케이스도 한 번 태워, 이 상태가 실제로 변할 수 있는데도
    // 경합 실패 시에는 변하지 않았다는 것을 보인다 — "원래 못 바뀌는 상수라서"가 아니라
    // "이 UPDATE가 실패해서" 보존됐다는 근거다.
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

    // 같은 update 함수가 실제로 값을 바꿀 수 있다는 것 자체를 증명한다 — 위 보존이 죽은
    // 코드(항상 실패하거나 원래 아무 것도 못 쓰는 스텁)가 아니라 경합 실패의 결과임을 보인다.
    const retry = await patchNickname(base, "재시도닉네임");
    assert.equal(retry.status, 200);
    assert.equal(stored, "재시도닉네임", "경합 없이 재시도하면 같은 update 함수가 실제로 값을 바꿔야 합니다");
});

test("MySQL이 인덱스 이름만 알려줘도 409로 분류된다", async (t) => {
    // dialect에 따라 path가 컬럼명이 아니라 users_nickname_unique 같은 인덱스 이름입니다.
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
    // Sequelize v6는 errors를 안 넘기면 []가 아니라 {}로 채웁니다. 변환기가 여기서
    // TypeError를 내면 409가 다시 500으로 되돌아갑니다.
    stubDb(t, {
        update: async () => { throw new db.Sequelize.UniqueConstraintError({}); },
    });
    const base = await startServer(t);

    const res = await patchNickname(base, "중복닉");
    assert.equal(res.status, 409);
    assert.match((await res.json()).message, /이미 사용 중인/);
});

test("unique 위반이 아닌 오류는 여전히 500으로 남는다", async (t) => {
    // 모든 실패를 409로 뭉개면 진짜 장애가 '중복'으로 위장됩니다.
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
    // LEFT JOIN이라 UserStat이 null로 돌아오는 상황을 그대로 재현합니다.
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
        reputation:        0,
        title:             "신참",
        total_games:       0,
        survival_count:    0,
        execution_count:   0,
        most_played_role:  null,
    });
});

test("user_stats가 있으면 그 값이 그대로 나온다", async (t) => {
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

    assert.equal(body.data.reputation, 42);
    assert.equal(body.data.title, "베테랑");
    assert.equal(body.data.most_played_role, "마피아");
    assert.equal(body.data.profile_image_url, "https://example.com/a.png");
});

test("Sequelize 인스턴스로 넘어온 통계도 평탄화되어 노출된다", async (t) => {
    // 실제 조회 결과는 평범한 객체가 아니라 인스턴스라, get({plain:true})를 거치지 않으면
    // 스프레드 시 dataValues 같은 내부 속성만 남고 값이 전부 기본값으로 떨어집니다.
    const instance = {
        get: ({ plain }) => (plain ? { reputation: 5, title: "중수", most_played_role: null } : null),
    };
    stubDb(t, { findOne: async () => ({ nickname: "n", profile_image_url: null, UserStat: instance }) });
    const base = await startServer(t);

    const body = await (await getProfile(base)).json();

    assert.equal(body.data.reputation, 5);
    assert.equal(body.data.title, "중수");
    assert.equal(body.data.total_games, 0, "누락된 필드는 기본값으로 채워져야 합니다");
});

test("존재하지 않는 유저의 프로필 조회는 404를 유지한다", async (t) => {
    stubDb(t, { findOne: async () => null });
    const base = await startServer(t);

    assert.equal((await getProfile(base)).status, 404);
});
