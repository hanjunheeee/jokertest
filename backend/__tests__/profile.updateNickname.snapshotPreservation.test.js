process.env.JWT_SECRET = "profile-nickname-snapshot-test-secret";
// models/index.js는 require 시점에 DATABASE_URL을 파싱합니다(연결은 하지 않습니다).
// npm test는 --env-file=.env.test로 이 값을 주지만, 파일 하나만 직접 실행할 때도
// 동작하도록 없을 때만 더미 값을 채웁니다.
process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test";

const test   = require("node:test");
const assert = require("node:assert/strict");

const db                = require("../models");
const profileController = require("../controller/profile.controller");

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
