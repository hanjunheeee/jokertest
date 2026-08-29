const test   = require("node:test");
const assert = require("node:assert/strict");

// 실제 DB 없이 기동 경로만 태웁니다. models는 require 캐시상 싱글턴이라 여기서 갈아끼운
// db.User / db.UserStats / db.sequelize.transaction을 repositories가 그대로 씁니다.
// 서비스가 아니라 db를 스텁하는 이유는, 서비스→리포지토리→Sequelize로 transaction
// 옵션이 실제로 전달되는지까지 확인해야 AC-01이 의미를 갖기 때문입니다.
const db             = require("../models");
const userRepository = require("../repositories/user.repositories");
const authService    = require("../service/auth.service");

// 커밋된 테이블과 트랜잭션 안에서만 보이는 스테이징을 나눠 둡니다. 커밋에 도달하지
// 못하면 스테이징은 통째로 버려지므로 "롤백되어 남지 않았다"를 관찰할 수 있습니다.
const setupFakeDb = (t, { statsCreateFails = false } = {}) => {
    const original = {
        transaction: db.sequelize.transaction,
        User:        db.User,
        UserStats:   db.UserStats,
    };

    const committed = { users: [], user_stats: [] };
    const seenTransactions = [];
    let staged = null;

    db.sequelize.transaction = async (work) => {
        const tx = { id: "tx-1" };
        staged = { users: [], user_stats: [] };

        try {
            const result = await work(tx);
            committed.users.push(...staged.users);
            committed.user_stats.push(...staged.user_stats);
            return result;
        } finally {
            staged = null;
        }
    };

    const requireTransaction = (options, label) => {
        assert.ok(staged, `${label}가 트랜잭션 밖에서 실행되었습니다`);
        assert.ok(options?.transaction, `${label}에 transaction 옵션이 전달되지 않았습니다`);
        seenTransactions.push(options.transaction);
    };

    db.User = {
        findOne: async () => null,          // 이메일·닉네임 중복 없음
        create:  async (data, options) => {
            requireTransaction(options, "createUser");
            const row = { uuid: "uuid-1", ...data };
            staged.users.push(row);
            return row;
        },
    };

    db.UserStats = {
        create: async (data, options) => {
            requireTransaction(options, "createUserStats");
            if (statsCreateFails) throw new Error("user_stats insert 실패");
            staged.user_stats.push(data);
            return data;
        },
    };

    t.after(() => {
        db.sequelize.transaction = original.transaction;
        db.User                  = original.User;
        db.UserStats             = original.UserStats;
    });

    return { committed, seenTransactions };
};

const SIGNUP_INPUT = { email: "a@b.com", password: "pw1234!", nickname: "닉" };

test("user_stats 생성이 실패하면 user도 함께 롤백되어 두 테이블 모두 비어 있다", async (t) => {
    const { committed } = setupFakeDb(t, { statsCreateFails: true });

    await assert.rejects(
        authService.signup(SIGNUP_INPUT),
        /user_stats insert 실패/,
        "원래 에러가 삼켜지면 컨트롤러가 실패를 성공으로 응답합니다"
    );

    assert.deepEqual(committed.users, [], "user 행이 반쪽으로 남았습니다");
    assert.deepEqual(committed.user_stats, [], "user_stats 행이 남았습니다");
});

test("정상 가입이면 user와 user_stats가 같은 트랜잭션으로 함께 커밋된다", async (t) => {
    const { committed, seenTransactions } = setupFakeDb(t);

    const user = await authService.signup(SIGNUP_INPUT);

    assert.equal(user.uuid, "uuid-1");
    assert.equal(committed.users.length, 1);
    assert.deepEqual(committed.user_stats, [{ user_id: "uuid-1" }]);

    assert.equal(seenTransactions.length, 2, "두 INSERT가 모두 트랜잭션을 받아야 합니다");
    assert.equal(
        seenTransactions[0],
        seenTransactions[1],
        "서로 다른 트랜잭션이면 한쪽만 커밋되어 롤백 보장이 사라집니다"
    );
});

test("이메일·닉네임 사전 중복 검사는 트랜잭션을 열기 전에 409로 끝난다", async (t) => {
    const { committed } = setupFakeDb(t);
    db.User.findOne = async ({ where }) => (where.email ? { uuid: "other" } : null);

    await assert.rejects(authService.signup(SIGNUP_INPUT), (error) => {
        assert.equal(error.status, 409);
        return true;
    });

    assert.deepEqual(committed.users, []);
});

test("createUser의 options 인자는 선택적이라 기존 호출부가 그대로 동작한다", async (t) => {
    setupFakeDb(t);
    // 스텁의 requireTransaction을 우회해 시그니처만 확인합니다.
    db.User.create      = async (data, options) => ({ ...data, options });
    db.UserStats.create = async (data, options) => ({ ...data, options });

    const user  = await userRepository.createUser({ email: "x@y.com" });
    const stats = await userRepository.createUserStats("uuid-1");

    assert.deepEqual(user.options, {});
    assert.deepEqual(stats.options, {});
});
