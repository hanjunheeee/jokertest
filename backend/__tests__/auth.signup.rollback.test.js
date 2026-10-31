const test   = require("node:test");
const assert = require("node:assert/strict");

process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test";

const db             = require("../models");
const userRepository = require("../repositories/user.repositories");
const authService    = require("../service/auth.service");
const { prepareSignupProof } = require("../tests/helpers/signupProof");

const createEconomyFakes = () => {
    const committedWallets = new Map();
    const committedEntitlements = [];
    const committedLoadouts = new Map();
    const committedLedgerEntries = [];
    let nextLedgerId = 1;
    let staged = null;

    const beginStage = () => {
        staged = { wallets: new Map(), entitlements: [], loadouts: new Map(), ledgerEntries: [] };
    };
    const commitStage = () => {
        if (!staged) return;
        for (const [key, value] of staged.wallets) committedWallets.set(key, value);
        committedEntitlements.push(...staged.entitlements);
        for (const [key, value] of staged.loadouts) committedLoadouts.set(key, value);
        committedLedgerEntries.push(...staged.ledgerEntries);
        staged = null;
    };
    const discardStage = () => { staged = null; };

    const EconomyWallet = {
        async create({ user_id, balance_gold, balance_diamond }) {
            assert.ok(staged, "EconomyWallet.create가 트랜잭션 스테이징 밖에서 호출되었습니다");
            const record = {
                user_id, balance_gold, balance_diamond,
                async update(patch) { Object.assign(record, patch); },
            };
            staged.wallets.set(user_id, record);
            return record;
        },
        async findOne({ where }) {
            return (staged && staged.wallets.get(where.user_id)) ?? committedWallets.get(where.user_id) ?? null;
        },
    };

    const EconomyEntitlement = {
        async create({ user_id, item_id, item_type, source }) {
            assert.ok(staged, "EconomyEntitlement.create가 트랜잭션 스테이징 밖에서 호출되었습니다");
            const record = { user_id, item_id, item_type, source };
            staged.entitlements.push(record);
            return record;
        },
        async findOne({ where }) {
            const pool = [...(staged ? staged.entitlements : []), ...committedEntitlements];
            return pool.find((e) => e.user_id === where.user_id && e.item_id === where.item_id) ?? null;
        },
    };

    const EconomyLoadout = {
        async findOrCreate({ where, defaults }) {
            assert.ok(staged, "EconomyLoadout.findOrCreate가 트랜잭션 스테이징 밖에서 호출되었습니다");
            let stored = staged.loadouts.get(where.user_id) ?? committedLoadouts.get(where.user_id);
            if (stored) return [stored, false];
            stored = {
                user_id: where.user_id,
                selected_profile_photo_id: null,
                selected_profile_border_id: null,
                selected_card_frame_id: null,
                ...defaults,
            };
            staged.loadouts.set(where.user_id, stored);
            return [stored, true];
        },
        async findOne({ where }) {
            return (staged && staged.loadouts.get(where.user_id)) ?? committedLoadouts.get(where.user_id) ?? null;
        },
        async update(patch, { where }) {
            const stored = (staged && staged.loadouts.get(where.user_id)) ?? committedLoadouts.get(where.user_id);
            if (!stored) return [0];
            const matches = Object.entries(where).every(([key, expected]) => stored[key] === expected);
            if (!matches) return [0];
            Object.assign(stored, patch);
            if (staged && !staged.loadouts.has(where.user_id)) staged.loadouts.set(where.user_id, stored);
            return [1];
        },
    };

    const EconomyLedgerEntry = {
        async create(fields) {
            assert.ok(staged, "EconomyLedgerEntry.create가 트랜잭션 스테이징 밖에서 호출되었습니다");
            const record = { id: nextLedgerId++, ...fields };
            staged.ledgerEntries.push(record);
            return record;
        },
        async findOne({ where }) {
            if (!where.reference_event_id) return null;
            const pool = [...(staged ? staged.ledgerEntries : []), ...committedLedgerEntries];
            return pool.find((e) => e.user_id === where.user_id && e.reference_event_id === where.reference_event_id) ?? null;
        },
    };

    return {
        EconomyWallet, EconomyEntitlement, EconomyLoadout, EconomyLedgerEntry,
        beginStage, commitStage, discardStage,
        _inspect: {
            entitlements: committedEntitlements, loadouts: committedLoadouts,
            wallets: committedWallets, ledgerEntries: committedLedgerEntries,
        },
    };
};

const createSignupEmailVerificationFake = () => {
    const committedRows = new Map(); // `${email}::${purpose}` -> row
    let stagedRows = null;
    let nextId = 1;
    let lastUpdateTransaction;

    const keyOf = (email, purpose) => `${email}::${purpose}`;

    const beginStage = () => { stagedRows = new Map(); };
    const commitStage = () => {
        if (!stagedRows) return;
        for (const [key, row] of stagedRows) committedRows.set(key, row);
        stagedRows = null;
    };
    const discardStage = () => { stagedRows = null; };

    const readRow = (email, purpose) => {
        const key = keyOf(email, purpose);
        if (stagedRows && stagedRows.has(key)) return { ...stagedRows.get(key) };
        const committed = committedRows.get(key);
        return committed ? { ...committed } : null;
    };

    const findById = (id) => {
        if (stagedRows) {
            const staged = [...stagedRows.values()].find((row) => row.id === id);
            if (staged) return { row: staged, map: stagedRows };
        }
        const committed = [...committedRows.values()].find((row) => row.id === id);
        return committed ? { row: committed, map: committedRows } : null;
    };

    const SignupEmailVerification = {
        async findOne({ where }) {
            return readRow(where.email, where.purpose);
        },
        async create(data) {
            const key = keyOf(data.email, data.purpose);
            if (committedRows.has(key) || (stagedRows && stagedRows.has(key))) {
                const error = new Error("signup_email_verifications 유일 제약 위반(email, purpose)");
                error.name = "SequelizeUniqueConstraintError";
                throw error;
            }
            const row = {
                id: nextId++, generation: 0, attempts: 0,
                code_hash: null, code_expires_at: null, code_consumed_at: null, sent_at: null,
                proof_hash: null, proof_expires_at: null, proof_consumed_at: null,
                ...data,
            };
            (stagedRows ?? committedRows).set(key, row);
            return { ...row };
        },
        async update(patch, { where, transaction }) {
            lastUpdateTransaction = transaction;
            const found = findById(where.id);
            if (!found) return [0];
            const updated = { ...found.row, ...patch };
            const key = keyOf(updated.email, updated.purpose);
            (stagedRows ?? committedRows).set(key, updated);
            return [1];
        },
    };

    return {
        SignupEmailVerification,
        beginStage, commitStage, discardStage,
        getLastUpdateTransaction: () => lastUpdateTransaction,
    };
};

const setupFakeDb = (t, { statsCreateFails = false } = {}) => {
    const original = {
        transaction: db.sequelize.transaction,
        User:        db.User,
        UserStats:   db.UserStats,
        EconomyWallet:      db.sequelize.models.EconomyWallet,
        EconomyEntitlement: db.sequelize.models.EconomyEntitlement,
        EconomyLoadout:     db.sequelize.models.EconomyLoadout,
        EconomyLedgerEntry: db.EconomyLedgerEntry,
        SignupEmailVerification: db.SignupEmailVerification,
    };

    const committed = { users: [], user_stats: [] };
    const seenTransactions = [];
    let staged = null;

    const signupVerificationFake = createSignupEmailVerificationFake();
    db.SignupEmailVerification = signupVerificationFake.SignupEmailVerification;

    const economyFakes = createEconomyFakes();
    db.sequelize.models.EconomyWallet = economyFakes.EconomyWallet;
    db.sequelize.models.EconomyEntitlement = economyFakes.EconomyEntitlement;
    db.sequelize.models.EconomyLoadout = economyFakes.EconomyLoadout;
    db.EconomyLedgerEntry = economyFakes.EconomyLedgerEntry;

    db.sequelize.transaction = async (optionsOrWork, maybeWork) => {
        const work = typeof optionsOrWork === "function" ? optionsOrWork : maybeWork;
        const tx = { id: "tx-1", LOCK: { UPDATE: "UPDATE" } };
        staged = { users: [], user_stats: [] };
        signupVerificationFake.beginStage();
        economyFakes.beginStage();

        try {
            const result = await work(tx);
            committed.users.push(...staged.users);
            committed.user_stats.push(...staged.user_stats);
            signupVerificationFake.commitStage();
            economyFakes.commitStage();
            return result;
        } catch (error) {
            signupVerificationFake.discardStage();
            economyFakes.discardStage();
            throw error;
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
        db.sequelize.models.EconomyWallet      = original.EconomyWallet;
        db.sequelize.models.EconomyEntitlement = original.EconomyEntitlement;
        db.sequelize.models.EconomyLoadout     = original.EconomyLoadout;
        db.EconomyLedgerEntry                  = original.EconomyLedgerEntry;
        db.SignupEmailVerification              = original.SignupEmailVerification;
    });

    return {
        committed, seenTransactions, economyInspect: economyFakes._inspect,
        signupVerificationFake,
    };
};

const SIGNUP_INPUT = {
    email: "a@b.com",
    password: "pw12345678",
    passwordConfirm: "pw12345678",
    nickname: "테스트닉",
    birthDate: "2000-01-01",
};

test("user_stats 생성이 실패하면 user도 함께 롤백되어 두 테이블 모두 비어 있다", async (t) => {
    const { committed, signupVerificationFake } = setupFakeDb(t, { statsCreateFails: true });
    const { signupProof } = await prepareSignupProof(SIGNUP_INPUT.email);

    await assert.rejects(
        authService.signup({ ...SIGNUP_INPUT, signupProof }),
        /user_stats insert 실패/,
        "원래 에러가 삼켜지면 컨트롤러가 실패를 성공으로 응답합니다"
    );

    assert.deepEqual(committed.users, [], "user 행이 반쪽으로 남았습니다");
    assert.deepEqual(committed.user_stats, [], "user_stats 행이 남았습니다");

    const row = await db.SignupEmailVerification.findOne({ where: { email: SIGNUP_INPUT.email, purpose: "SIGNUP" } });
    assert.ok(row, "인증 행 자체는 남아 있어야 합니다(요청·확인은 별도 트랜잭션으로 이미 커밋됨)");
    assert.equal(row.proof_consumed_at, null, "실패한 가입 트랜잭션이 증명 소비를 커밋하면 안 됩니다");
});

test("정상 가입이면 user와 user_stats가 같은 트랜잭션으로 함께 커밋된다", async (t) => {
    const { committed, seenTransactions, economyInspect, signupVerificationFake } = setupFakeDb(t);
    const { signupProof } = await prepareSignupProof(SIGNUP_INPUT.email);

    const user = await authService.signup({ ...SIGNUP_INPUT, signupProof });

    assert.equal(user.uuid, "uuid-1");
    assert.equal(committed.users.length, 1);
    assert.deepEqual(committed.user_stats, [{ user_id: "uuid-1" }]);

    assert.equal(seenTransactions.length, 2, "두 INSERT가 모두 트랜잭션을 받아야 합니다");
    assert.equal(
        seenTransactions[0],
        seenTransactions[1],
        "서로 다른 트랜잭션이면 한쪽만 커밋되어 롤백 보장이 사라집니다"
    );
    assert.equal(
        signupVerificationFake.getLastUpdateTransaction(),
        seenTransactions[0],
        "증명 소비가 계정 생성과 다른 트랜잭션에서 실행되었습니다",
    );

    const granted = economyInspect.entitlements.filter((e) => e.user_id === "uuid-1");
    assert.equal(granted.length, 25, "가입 트랜잭션 안에서 25종(프로필 16 + 테두리 1 + 기본 이모티콘 8)이 모두 지급되어야 한다");
    const loadout = economyInspect.loadouts.get("uuid-1");
    assert.equal(loadout.selected_profile_photo_id, "player-profile-금빛가면", "가입 직후 기본 선택은 금빛가면이어야 한다");
    assert.equal(loadout.selected_profile_border_id, "profile-border-평민");
});

test("경제 지급이 중간에 실패하면 그 이전에 성공한 지갑·소유권·원장·장착도 계정·통계와 함께 롤백된다", async (t) => {
    const { committed, economyInspect } = setupFakeDb(t);
    const { signupProof } = await prepareSignupProof(SIGNUP_INPUT.email);

    const entitlementModel = db.sequelize.models.EconomyEntitlement;
    const originalCreate = entitlementModel.create;
    let createCount = 0;
    entitlementModel.create = async (...args) => {
        createCount += 1;
        if (createCount === 16) throw new Error("시뮬레이션된 지급 실패");
        return originalCreate.apply(entitlementModel, args);
    };
    t.after(() => { entitlementModel.create = originalCreate; });

    await assert.rejects(
        authService.signup({ ...SIGNUP_INPUT, signupProof }),
        /시뮬레이션된 지급 실패/,
    );

    assert.deepEqual(committed.users, [], "지급 실패는 계정 생성도 롤백해야 합니다");
    assert.deepEqual(committed.user_stats, [], "지급 실패는 통계 생성도 롤백해야 합니다");
    assert.equal(economyInspect.wallets.size, 0, "지급 실패 이전에 만든 지갑도 커밋되면 안 됩니다");
    assert.equal(economyInspect.entitlements.length, 0, "실패 이전에 성공한 15개 소유권도 커밋되면 안 됩니다");
    assert.equal(economyInspect.ledgerEntries.length, 0, "실패 이전에 성공한 원장도 커밋되면 안 됩니다");
    assert.equal(economyInspect.loadouts.size, 0, "기본 장착도 커밋되면 안 됩니다");

    const row = await db.SignupEmailVerification.findOne({ where: { email: SIGNUP_INPUT.email, purpose: "SIGNUP" } });
    assert.ok(row);
    assert.equal(row.proof_consumed_at, null, "지급 실패도 증명 소비를 커밋하면 안 됩니다");
});

test("가입 증명 없이 호출하면 SIGNUP_PROOF_REQUIRED로 거부되고 트랜잭션도 열리지 않는다", async (t) => {
    const { committed } = setupFakeDb(t);

    await assert.rejects(authService.signup(SIGNUP_INPUT), (error) => {
        assert.equal(error.status, 401);
        assert.equal(error.code, "SIGNUP_PROOF_REQUIRED");
        return true;
    });

    assert.deepEqual(committed.users, []);
});

test("이메일·닉네임 중복 검사는 증명 소비 이후 같은 트랜잭션 안에서 409로 끝난다", async (t) => {
    const { committed } = setupFakeDb(t);
    const { signupProof } = await prepareSignupProof(SIGNUP_INPUT.email);
    db.User.findOne = async ({ where }) => (where.email ? { uuid: "other" } : null);

    await assert.rejects(authService.signup({ ...SIGNUP_INPUT, signupProof }), (error) => {
        assert.equal(error.status, 409);
        return true;
    });

    assert.deepEqual(committed.users, []);
});

test("소비된 가입 증명을 재사용하면 SIGNUP_PROOF_INVALID로 거부된다", async (t) => {
    const { committed } = setupFakeDb(t);
    const { signupProof } = await prepareSignupProof(SIGNUP_INPUT.email);

    await authService.signup({ ...SIGNUP_INPUT, signupProof });
    assert.equal(committed.users.length, 1);

    await assert.rejects(
        authService.signup({ ...SIGNUP_INPUT, nickname: "테스트닉2", signupProof }),
        (error) => {
            assert.equal(error.status, 401);
            assert.equal(error.code, "SIGNUP_PROOF_INVALID");
            return true;
        },
    );
    assert.equal(committed.users.length, 1, "재사용 시도가 두 번째 계정을 만들면 안 됩니다");
});

test("createUser의 options 인자는 선택적이라 기존 호출부가 그대로 동작한다", async (t) => {
    setupFakeDb(t);
    db.User.create      = async (data, options) => ({ ...data, options });
    db.UserStats.create = async (data, options) => ({ ...data, options });

    const user  = await userRepository.createUser({ email: "x@y.com" });
    const stats = await userRepository.createUserStats("uuid-1");

    assert.deepEqual(user.options, {});
    assert.deepEqual(stats.options, {});
});
