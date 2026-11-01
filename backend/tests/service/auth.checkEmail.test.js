const test   = require("node:test");
const assert = require("node:assert/strict");

const db          = require("../../models");
const authService = require("../../services/auth/account");

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
