const test   = require("node:test");
const assert = require("node:assert/strict");

const { buildPoolConfig } = require("../config/dbPool");

const POOL_KEYS = ["max", "min", "idle", "acquire"];

test("환경변수가 없으면 네 값 모두 명시된 유효값을 갖는다", () => {
    const pool = buildPoolConfig({}, {});

    // Sequelize 암묵적 기본값에 기대지 않고 네 값을 직접 명시했는지 확인합니다.
    assert.deepEqual(Object.keys(pool).sort(), [...POOL_KEYS].sort());

    for (const key of POOL_KEYS) {
        assert.equal(Number.isInteger(pool[key]), true, `${key}가 정수가 아닙니다`);
    }

    assert.ok(pool.max > 0, "max는 1 이상이어야 합니다");
    assert.ok(pool.min >= 0, "min은 0 이상이어야 합니다");
    assert.ok(pool.min <= pool.max, "min이 max보다 클 수 없습니다");
    assert.ok(pool.idle > 0, "idle은 0보다 커야 합니다");
    assert.ok(pool.acquire > 0, "acquire는 0보다 커야 합니다");
});

test("DB_POOL_* 환경변수로 max·min·idle·acquire를 모두 덮어쓸 수 있다", () => {
    const pool = buildPoolConfig({}, {
        DB_POOL_MAX:     "25",
        DB_POOL_MIN:     "3",
        DB_POOL_IDLE:    "5000",
        DB_POOL_ACQUIRE: "7000",
    });

    assert.deepEqual(pool, { max: 25, min: 3, idle: 5000, acquire: 7000 });
});

test("환경변수를 일부만 주면 나머지는 기본값을 유지한다", () => {
    const defaults = buildPoolConfig({}, {});
    const pool     = buildPoolConfig({}, { DB_POOL_MAX: "42" });

    assert.equal(pool.max, 42);
    assert.equal(pool.min, defaults.min);
    assert.equal(pool.idle, defaults.idle);
    assert.equal(pool.acquire, defaults.acquire);
});

test("유효하지 않은 환경변수 값은 무시하고 기본값을 유지한다", () => {
    const defaults = buildPoolConfig({}, {});

    // 환경변수는 항상 문자열이라 이런 값들이 실제로 들어올 수 있습니다.
    // 하나라도 통과하면 풀 설정에 NaN이나 음수가 섞여 AC-06이 깨집니다.
    const pool = buildPoolConfig({}, {
        DB_POOL_MAX:     "abc",
        DB_POOL_MIN:     "-1",
        DB_POOL_IDLE:    "",
        DB_POOL_ACQUIRE: "3.5",
    });

    assert.deepEqual(pool, defaults);
});

test("config.json의 pool 값보다 환경변수가 우선한다", () => {
    const pool = buildPoolConfig({ max: 7, idle: 1000 }, { DB_POOL_MAX: "9" });

    assert.equal(pool.max, 9, "환경변수가 config.json을 덮어써야 합니다");
    assert.equal(pool.idle, 1000, "환경변수가 없으면 config.json 값이 남아야 합니다");
});

test("min은 0으로 덮어쓸 수 있고 충돌하는 min/max는 유효한 풀로 보정된다", () => {
    assert.equal(buildPoolConfig({ min: 3 }, { DB_POOL_MIN: "0" }).min, 0);
    assert.deepEqual(
        buildPoolConfig({}, { DB_POOL_MAX: "2", DB_POOL_MIN: "3" }),
        { max: 2, min: 0, idle: 10000, acquire: 30000 }
    );
});

test("생성된 Sequelize 인스턴스에 풀 설정이 실제로 반영된다", () => {
    // buildPoolConfig가 옳아도 Sequelize가 options.pool을 버리면 AC-02가 깨지므로,
    // 살아 있는 인스턴스에서 적용된 값을 직접 읽어 확인합니다.
    const db       = require("../models");
    const applied  = db.sequelize.options.pool;
    const expected = buildPoolConfig({}, process.env);

    for (const key of POOL_KEYS) {
        assert.equal(applied[key], expected[key], `pool.${key}가 인스턴스에 반영되지 않았습니다`);
    }
});
