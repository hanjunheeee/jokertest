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

// F-04 AC-01: 닉네임 변경도 가입(F-02)과 같은 벡터로 판정이 갈리지 않는지 확인한다.
const FIXTURE_PATH = path.join(__dirname, "..", "..", "tests", "fixtures", "f02-signup-validation.json");
const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));

const TOKEN = generateToken({ uuid: "uuid-1", role: "USER", sessionId: "session-1" });

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
