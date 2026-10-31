process.env.JWT_SECRET = "profile-nickname-snapshot-test-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test";

const test   = require("node:test");
const assert = require("node:assert/strict");

const db                  = require("../../models");
const profileController   = require("../../controller/profile.controller");
const gameResultRepository = require("../../repositories/gameResult.repositories");

const CURRENT_NICKNAME_SNAPSHOT = "경기당시닉네임";

const stubDb = (t) => {
    const original = { User: db.User, GameResultPlayer: db.GameResultPlayer };

    let currentNickname = "변경전닉";
    const snapshotRow = {
        user_id: "uuid-1", game_id: "game-snap-1",
        nickname_snapshot: CURRENT_NICKNAME_SNAPSHOT,
    };

    db.User = {
        findOne: async ({ where }) => {
            if (where.nickname) return null;
            return { nickname: currentNickname, profile_image_url: null, UserStat: null };
        },
        update: async (values) => {
            if (Object.prototype.hasOwnProperty.call(values, "nickname")) currentNickname = values.nickname;
            return [1];
        },
    };

    db.GameResultPlayer = {
        findOne: async () => ({ ...snapshotRow }),
        findAll: async () => [],
    };

    t.after(() => {
        db.User             = original.User;
        db.GameResultPlayer = original.GameResultPlayer;
    });

    return { getCurrentNickname: () => currentNickname, snapshotRow };
};

const call = (fn, req) => new Promise((resolve, reject) => {
    const res = {
        status(code) { this.code = code; return this; },
        json(payload) { resolve({ status: this.code, body: payload }); return this; },
    };
    fn(req, res, reject);
});

test("AC-03: 닉네임 변경은 현재 표시를 즉시 새 값으로 바꾸고, 이미 저장된 경기 스냅샷은 그대로 둔다", async (t) => {
    const { getCurrentNickname, snapshotRow } = stubDb(t);

    const before = await call(profileController.getMyProfile, { user: { uuid: "uuid-1" } });
    assert.equal(before.body.data.nickname, "변경전닉");

    const changeRes = await call(profileController.updateNickname, {
        user: { uuid: "uuid-1" },
        body: { nickname: "변경후닉" },
    });
    assert.equal(changeRes.status, 200);
    assert.equal(getCurrentNickname(), "변경후닉", "닉네임 변경이 저장 값에 즉시 반영되어야 합니다");

    const after = await call(profileController.getMyProfile, { user: { uuid: "uuid-1" } });
    assert.equal(after.body.data.nickname, "변경후닉", "변경 직후 조회는 즉시 새 닉네임을 보여줘야 합니다");

    assert.equal(snapshotRow.nickname_snapshot, CURRENT_NICKNAME_SNAPSHOT, "닉네임 변경이 과거 경기 스냅샷을 건드리면 안 됩니다");
    const historicalRow = await db.GameResultPlayer.findOne();
    assert.equal(historicalRow.nickname_snapshot, CURRENT_NICKNAME_SNAPSHOT, "과거 경기 화면은 현재 닉네임이 아니라 스냅샷을 보여줘야 합니다");
});

test("AC-03: 닉네임 변경 이후에도 과거 경기 조회 경로(findGameResultById)는 users.nickname이 아니라 저장된 스냅샷을 그대로 돌려준다", async (t) => {
    const { getCurrentNickname } = stubDb(t);

    const originalGameResult = db.GameResult;
    const toPlayerRow = () => ({
        user_id: "uuid-1", nickname_snapshot: CURRENT_NICKNAME_SNAPSHOT,
        role: "CITIZEN", team: "CITIZEN", won: true, is_alive: false, death_reason: "EXECUTED",
    });
    const toGameRow = () => ({
        id: "game-snap-1", room_id: null, winner: "CITIZEN", win_reason: null,
        started_at: new Date(0), ended_at: new Date(1000), day_index: 1,
        player_count: 1, settings: null, completed: true,
        GameResultPlayers: [{ get: ({ plain }) => (plain ? toPlayerRow() : null) }],
    });
    db.GameResult = { findOne: async () => ({ get: ({ plain }) => (plain ? toGameRow() : null) }) };
    t.after(() => { db.GameResult = originalGameResult; });

    const changeRes = await call(profileController.updateNickname, {
        user: { uuid: "uuid-1" },
        body: { nickname: "변경후닉2" },
    });
    assert.equal(changeRes.status, 200);
    assert.equal(getCurrentNickname(), "변경후닉2", "닉네임 변경 자체는 정상적으로 반영되어야 합니다");

    const historicalGame = await gameResultRepository.findGameResultById("game-snap-1");
    assert.equal(
        historicalGame.players[0].nickname_snapshot,
        CURRENT_NICKNAME_SNAPSHOT,
        "닉네임 변경 이후에도 실제 경기 조회 함수는 현재 users.nickname이 아니라 저장된 스냅샷을 돌려줘야 합니다",
    );
    assert.notEqual(
        historicalGame.players[0].nickname_snapshot,
        getCurrentNickname(),
        "과거 경기 스냅샷과 현재 닉네임은 서로 다른 값으로 구분되어야 합니다",
    );
});
