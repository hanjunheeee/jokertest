process.env.JWT_SECRET = "profile-nickname-snapshot-test-secret";
// models/index.js는 require 시점에 DATABASE_URL을 파싱합니다(연결은 하지 않습니다).
// npm test는 --env-file=.env.test로 이 값을 주지만, 파일 하나만 직접 실행할 때도
// 동작하도록 없을 때만 더미 값을 채웁니다.
process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test";

const test   = require("node:test");
const assert = require("node:assert/strict");

const db                  = require("../models");
const profileController   = require("../controller/profile.controller");
const gameResultRepository = require("../repositories/gameResult.repositories");

// F-04 AC-03: 닉네임 변경은 users.nickname만 갱신해야 하고, 이미 저장된 경기의
// game_result_players.nickname_snapshot(X0064 — 경기 종료 시점 스냅샷, F-01)은 절대
// 건드리면 안 된다. GameResultPlayer 모델에는 조회 스텁만 두고 쓰기 메서드(update/
// bulkCreate/destroy)는 아예 정의하지 않는다 — updateNickname 경로가 실수로라도 그
// 테이블에 쓰려 하면 TypeError로 이 테스트가 즉시 실패한다. "코드를 읽어 보니 경로가 없어
// 보인다"가 아니라 "쓰려는 시도가 있으면 반드시 터진다"로 증명한다.

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
            // findByNickname(중복 사전 조회): 새 닉네임은 아직 아무도 쓰지 않는다.
            if (where.nickname) return null;
            // getMyProfile: 현재 사용자 표시용 조회.
            return { nickname: currentNickname, profile_image_url: null, UserStat: null };
        },
        update: async (values) => {
            if (Object.prototype.hasOwnProperty.call(values, "nickname")) currentNickname = values.nickname;
            return [1];
        },
    };

    db.GameResultPlayer = {
        findOne: async () => ({ ...snapshotRow }),
        // F-10: getMyProfile이 이제 roleStatistics(getHighestWinRateRole)도 함께 조회한다.
        // 이 스위트의 관심사(닉네임 스냅샷 보존)와는 무관하므로 빈 전적으로 응답한다 —
        // 쓰기 메서드(update/bulkCreate/destroy)는 여전히 정의하지 않는다.
        findAll: async () => [],
    };

    t.after(() => {
        db.User             = original.User;
        db.GameResultPlayer = original.GameResultPlayer;
    });

    return { getCurrentNickname: () => currentNickname, snapshotRow };
};

// 컨트롤러를 fake req/res로 직접 태워 실제 응답 본문을 읽는다(기존 gameResultPersistence.test.js의
// readProfile과 같은 관례).
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

    // 변경 응답 직후 다시 조회하면(프론트의 patchProfile/storeLogin이 재요청 없이 바로 반영하는
    // 것과 같은 시점) 이미 새 닉네임이 보여야 한다 — "즉시 갱신"의 근거는 서버가 응답을
    // 돌려주는 시점에 이미 쓰기가 끝나 있다는 것이다.
    const after = await call(profileController.getMyProfile, { user: { uuid: "uuid-1" } });
    assert.equal(after.body.data.nickname, "변경후닉", "변경 직후 조회는 즉시 새 닉네임을 보여줘야 합니다");

    // users.nickname과 game_result_players.nickname_snapshot은 물리적으로 분리된 값이라
    // 닉네임 변경이 과거 경기 스냅샷을 건드릴 수 없다 — GameResultPlayer에 쓰기 메서드가
    // 없는데도(위) 여기까지 통과했다는 사실 자체가 그 증거다.
    assert.equal(snapshotRow.nickname_snapshot, CURRENT_NICKNAME_SNAPSHOT, "닉네임 변경이 과거 경기 스냅샷을 건드리면 안 됩니다");
    const historicalRow = await db.GameResultPlayer.findOne();
    assert.equal(historicalRow.nickname_snapshot, CURRENT_NICKNAME_SNAPSHOT, "과거 경기 화면은 현재 닉네임이 아니라 스냅샷을 보여줘야 합니다");
});

// 재검토 지적: 위 테스트는 db.GameResultPlayer.findOne을 직접 불러 "쓰기 메서드가 없어서
// 안전하다"만 증명했을 뿐, 실제로 과거 경기 화면이 쓰는 조회 함수(X0064
// gameResult.repositories.findGameResultById — 경기 상세 API가 그대로 호출하는 함수)가
// nickname_snapshot을 내보내는 실행 경로까지는 태우지 않았다. 여기서는 그 실제 저장소
// 함수를 스텁이 아니라 그대로 호출해, 닉네임 변경 이후에도 과거 경기 조회 응답이 users.nickname이
// 아니라 저장된 스냅샷을 돌려주는지 확인한다.
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

    // 실제 API가 경기 상세를 조회할 때 태우는 바로 그 저장소 함수를 그대로 호출한다(스텁
    // 대체가 아니라 실행) — 닉네임 변경과 무관하게 과거 경기 참가자의 nickname_snapshot이
    // 그대로 보여야 한다.
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
