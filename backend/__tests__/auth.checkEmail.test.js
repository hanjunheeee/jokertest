const test   = require("node:test");
const assert = require("node:assert/strict");

// F-02 AC-05: 가입 입력 단계에서 이메일 중복을 미리 확인하는 checkEmailAvailability가
// findByEmail 결과를 available:boolean으로 정확히 뒤집어 돌려주는지 확인한다. 실제 최종
// 판정(가입 제출 단계)은 auth.service.js의 signup() + user.repositories.js의 유일 제약
// 변환이 맡으므로, 여기서는 db를 스텁해 이 함수 자체의 판정만 확인한다.
const db          = require("../models");
const authService = require("../service/auth.service");

const setupFakeUserFindOne = (t, impl) => {
    const original = db.User;
    db.User = { findOne: impl };
    t.after(() => { db.User = original; });
};

test("이미 가입된 이메일이면 available:false를 돌려준다", async (t) => {
    setupFakeUserFindOne(t, async ({ where }) => (where.email === "taken@example.com" ? { uuid: "existing" } : null));

    const result = await authService.checkEmailAvailability("taken@example.com");
    assert.deepEqual(result, { available: false });
});

test("가입되지 않은 이메일이면 available:true를 돌려준다", async (t) => {
    setupFakeUserFindOne(t, async () => null);

    const result = await authService.checkEmailAvailability("fresh@example.com");
    assert.deepEqual(result, { available: true });
});

test("앞뒤 공백은 트림한 뒤 조회한다", async (t) => {
    const seenWhere = [];
    setupFakeUserFindOne(t, async ({ where }) => { seenWhere.push(where); return null; });

    await authService.checkEmailAvailability("  spaced@example.com  ");
    assert.deepEqual(seenWhere, [{ email: "spaced@example.com" }]);
});

test("빈 이메일은 400으로 거부되고 DB를 조회하지 않는다", async (t) => {
    let called = false;
    setupFakeUserFindOne(t, async () => { called = true; return null; });

    await assert.rejects(authService.checkEmailAvailability(""), (error) => {
        assert.equal(error.status, 400);
        return true;
    });
    assert.equal(called, false);
});
