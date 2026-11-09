// GET /user/me/account 처리 함수 시험, 이메일 계정·소셜 전용 계정·없는 계정 답 모양
// 빈칸 채우기(소셜) 중 1 — 화면이 부르기만 하고 처리 함수 시험이 없던 곳 (DB는 저장소 함수만 갈아끼움)
const test = require("node:test");
const assert = require("node:assert/strict");

const userRepository = require("../../repositories/user");
const { getMyAccount } = require("../../controllers/auth/member");

// 응답 흉내: 상태·머리글·본문만 모음
const fakeRes = () => {
    const res = { statusCode: null, body: null, headers: {} };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.body = body; return res; };
    res.set = (name, value) => { res.headers[name] = value; return res; };
    return res;
};

// findByUuid만 잠깐 바꿔 끼우고 시험 끝에 되돌림
const stubFindByUuid = (t, impl) => {
    const original = userRepository.findByUuid;
    userRepository.findByUuid = impl;
    t.after(() => { userRepository.findByUuid = original; });
};

// 처리 함수 한 번 부르기 → { res, nextError }
const callHandler = async (uuid) => {
    const res = fakeRes();
    let nextError = null;
    await getMyAccount({ user: { uuid } }, res, (error) => { nextError = error; });
    return { res, nextError };
};

test("이메일로 가입한 계정이면 → 200, 이메일과 hasLocalPassword 참, 캐시 금지", async (t) => {
    const asked = [];
    stubFindByUuid(t, async (uuid) => {
        asked.push(uuid);
        return { uuid, email: "mail@example.test", has_local_password: true };
    });
    const { res, nextError } = await callHandler("uuid-mail");
    assert.equal(nextError, null);
    assert.deepEqual(asked, ["uuid-mail"]);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { success: true, data: { email: "mail@example.test", hasLocalPassword: true } });
    assert.equal(res.headers["Cache-Control"], "no-store");
});

test("소셜로만 가입한 계정이면 → hasLocalPassword 거짓", async (t) => {
    stubFindByUuid(t, async (uuid) => ({ uuid, email: "social@example.test", has_local_password: false }));
    const { res } = await callHandler("uuid-social");
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.data, { email: "social@example.test", hasLocalPassword: false });
});

test("비번 칸 값이 없는 옛 계정이면(null) → 비번 있는 계정으로 봄", async (t) => {
    stubFindByUuid(t, async (uuid) => ({ uuid, email: "old@example.test", has_local_password: null }));
    const { res } = await callHandler("uuid-old");
    assert.equal(res.body.data.hasLocalPassword, true);
});

test("계정이 없으면 → 404, 이메일 안 실음", async (t) => {
    stubFindByUuid(t, async () => null);
    const { res, nextError } = await callHandler("uuid-gone");
    assert.equal(nextError, null);
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.data, undefined);
});

test("DB 오류면 → 답 안 하고 공통 오류 처리로 넘김", async (t) => {
    const boom = new Error("db down");
    stubFindByUuid(t, async () => { throw boom; });
    const { res, nextError } = await callHandler("uuid-err");
    assert.equal(nextError, boom);
    assert.equal(res.statusCode, null);
});
