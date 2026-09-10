const test   = require("node:test");
const assert = require("node:assert/strict");

// models/index.js는 require 시점에 DATABASE_URL을 파싱합니다(연결은 시도하지 않습니다) —
// npm test(backend/.env.test) 없이 이 파일만 단독으로 돌릴 때도 Sequelize 생성자가 던지지
// 않도록 economy.route.test.js·user.accountPaths.test.js와 같은 안전한 자리표시자를 둡니다.
process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test";

// 실제 DB 없이 기동 경로만 태웁니다. models는 require 캐시상 싱글턴이라 여기서 갈아끼운
// db.User / db.UserStats / db.sequelize.transaction을 repositories가 그대로 씁니다.
// 서비스가 아니라 db를 스텁하는 이유는, 서비스→리포지토리→Sequelize로 transaction
// 옵션이 실제로 전달되는지까지 확인해야 AC-01이 의미를 갖기 때문입니다.
const db             = require("../models");
const userRepository = require("../repositories/user.repositories");
const authService    = require("../service/auth.service");

// F-08 CODEX-2(AC-03) 대응: signup()이 이제 같은 트랜잭션 안에서
// economyService.ensureDefaultEntitlements(user.uuid, db, { transaction })도 호출한다 —
// 이 함수가 필요로 하는 economy_* 모델(backend/service/economy.service.js의
// economyModels(db) 참고: db.sequelize.models.{EconomyWallet,EconomyEntitlement,
// EconomyLoadout} + db.EconomyLedgerEntry)을 실제 DB 없이 흉내 낸다. 이 파일의 목적은
// economy 지급 로직 자체(그건 economy.service.test.js·f08-economy.integration.test.js가
// 검증한다) 검증이 아니라, "createUser/createUserStats처럼 economy 지급도 같은 트랜잭션
// 경계 안에 있는지"만 확인하는 것이라 최소한으로만 흉내 낸다.
const createEconomyFakes = () => {
    const wallets = new Map();
    const entitlements = [];
    const loadouts = new Map();
    const ledgerEntries = [];
    let nextLedgerId = 1;

    const EconomyWallet = {
        async create({ user_id, balance_gold, balance_diamond }) {
            const record = {
                user_id, balance_gold, balance_diamond,
                async update(patch) { Object.assign(record, patch); },
            };
            wallets.set(user_id, record);
            return record;
        },
        async findOne({ where }) { return wallets.get(where.user_id) ?? null; },
    };

    const EconomyEntitlement = {
        async create({ user_id, item_id, item_type, source }) {
            const record = { user_id, item_id, item_type, source };
            entitlements.push(record);
            return record;
        },
        async findOne({ where }) {
            return entitlements.find((e) => e.user_id === where.user_id && e.item_id === where.item_id) ?? null;
        },
    };

    const EconomyLoadout = {
        async findOrCreate({ where, defaults }) {
            let stored = loadouts.get(where.user_id);
            if (stored) return [stored, false];
            stored = {
                user_id: where.user_id,
                selected_profile_photo_id: null,
                selected_profile_border_id: null,
                selected_card_frame_id: null,
                ...defaults,
            };
            loadouts.set(where.user_id, stored);
            return [stored, true];
        },
        async findOne({ where }) { return loadouts.get(where.user_id) ?? null; },
        async update(patch, { where }) {
            const stored = loadouts.get(where.user_id);
            if (!stored) return [0];
            const matches = Object.entries(where).every(([key, expected]) => stored[key] === expected);
            if (!matches) return [0];
            Object.assign(stored, patch);
            return [1];
        },
    };

    const EconomyLedgerEntry = {
        async create(fields) {
            const record = { id: nextLedgerId++, ...fields };
            ledgerEntries.push(record);
            return record;
        },
        async findOne({ where }) {
            if (!where.reference_event_id) return null;
            return ledgerEntries.find((e) => e.user_id === where.user_id && e.reference_event_id === where.reference_event_id) ?? null;
        },
    };

    return {
        EconomyWallet, EconomyEntitlement, EconomyLoadout, EconomyLedgerEntry,
        _inspect: { entitlements, loadouts },
    };
};

// 커밋된 테이블과 트랜잭션 안에서만 보이는 스테이징을 나눠 둡니다. 커밋에 도달하지
// 못하면 스테이징은 통째로 버려지므로 "롤백되어 남지 않았다"를 관찰할 수 있습니다.
const setupFakeDb = (t, { statsCreateFails = false } = {}) => {
    const original = {
        transaction: db.sequelize.transaction,
        User:        db.User,
        UserStats:   db.UserStats,
        EconomyWallet:      db.sequelize.models.EconomyWallet,
        EconomyEntitlement: db.sequelize.models.EconomyEntitlement,
        EconomyLoadout:     db.sequelize.models.EconomyLoadout,
        EconomyLedgerEntry: db.EconomyLedgerEntry,
    };

    const committed = { users: [], user_stats: [] };
    const seenTransactions = [];
    let staged = null;

    db.sequelize.transaction = async (work) => {
        const tx = { id: "tx-1", LOCK: { UPDATE: "UPDATE" } };
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

    const economyFakes = createEconomyFakes();
    db.sequelize.models.EconomyWallet = economyFakes.EconomyWallet;
    db.sequelize.models.EconomyEntitlement = economyFakes.EconomyEntitlement;
    db.sequelize.models.EconomyLoadout = economyFakes.EconomyLoadout;
    db.EconomyLedgerEntry = economyFakes.EconomyLedgerEntry;

    t.after(() => {
        db.sequelize.transaction = original.transaction;
        db.User                  = original.User;
        db.UserStats             = original.UserStats;
        db.sequelize.models.EconomyWallet      = original.EconomyWallet;
        db.sequelize.models.EconomyEntitlement = original.EconomyEntitlement;
        db.sequelize.models.EconomyLoadout     = original.EconomyLoadout;
        db.EconomyLedgerEntry                  = original.EconomyLedgerEntry;
    });

    return { committed, seenTransactions, economyInspect: economyFakes._inspect };
};

// F-02: 닉네임 2~8자(한글/영문/숫자), 비밀번호 8~64자 + passwordConfirm 일치, 생년월일
// 유효성 검사가 auth.service.js의 signup() 앞단에 추가되었다 — 이 스위트는 트랜잭션
// 롤백/커밋 경로를 검증하는 것이 목적이므로, 검증 자체는 항상 통과하는 값을 쓴다.
const SIGNUP_INPUT = {
    email: "a@b.com",
    password: "pw12345678",
    passwordConfirm: "pw12345678",
    nickname: "테스트닉",
    birthDate: "2000-01-01",
};

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
    const { committed, seenTransactions, economyInspect } = setupFakeDb(t);

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

    // F-08 CODEX-2(AC-03): 지연 지급(wallet/equip 조회 시점)이 아니라 가입 자체가 기본
    // 프로필 16종 + 평민 테두리 1종을 이미 끝낸 상태로 커밋되어야 한다.
    const granted = economyInspect.entitlements.filter((e) => e.user_id === "uuid-1");
    assert.equal(granted.length, 17, "가입 트랜잭션 안에서 기본 프로필 16종 + 평민 테두리 1종이 모두 지급되어야 한다");
    const loadout = economyInspect.loadouts.get("uuid-1");
    assert.equal(loadout.selected_profile_photo_id, "player-profile-금빛가면", "가입 직후 기본 선택은 금빛가면이어야 한다");
    assert.equal(loadout.selected_profile_border_id, "profile-border-평민");
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
