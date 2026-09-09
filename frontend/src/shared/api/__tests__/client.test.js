import test, { mock } from "node:test";
import assert from "node:assert/strict";

// F-03: apiClient의 401 갱신 재시도(A-07)와 refreshAccessToken()의 in-flight 공유(동시
// 요청이 갱신 자격을 불필요하게 여러 번 회전시키지 않는다)를 실제 코드로 검증한다.
// client.js는 "@/..." 대신 상대 경로로 env.js를 가져오도록 바뀌었다(F-03 R-IMPL #6) — 이
// mock.module이 그 상대 경로와 같은 대상을 가리켜야 가로챌 수 있다.
mock.module("../../env.js", {
  namedExports: { API_BASE_URL: "http://test-api.local" },
});

const fetchCalls = [];
let fetchImpl;
globalThis.fetch = async (...args) => {
  fetchCalls.push(args);
  return fetchImpl(...args);
};

const jsonResponse = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
});

const { apiClient, refreshAccessToken } = await import("../client.js");

test("refreshAccessToken: 동시에 여러 번 불러도 진행 중인 요청 하나만 실제로 fetch한다(A-07)", async () => {
  fetchCalls.length = 0;
  let resolveFetch;
  fetchImpl = () => new Promise((resolve) => { resolveFetch = resolve; });

  const first = refreshAccessToken();
  const second = refreshAccessToken();
  const third = refreshAccessToken();

  assert.equal(fetchCalls.length, 1, "동시 호출은 fetch를 한 번만 실행해야 합니다");

  resolveFetch(jsonResponse(200, { success: true }));
  const [r1, r2, r3] = await Promise.all([first, second, third]);
  assert.deepEqual([r1, r2, r3], [true, true, true], "모든 호출이 같은 성공 결과를 공유해야 합니다");
});

test("refreshAccessToken: 완료 후 새로 부르면 다시 fetch한다(다음 만료에 대응)", async () => {
  fetchCalls.length = 0;
  fetchImpl = async () => jsonResponse(200, { success: true });
  await refreshAccessToken();

  fetchImpl = async () => jsonResponse(200, { success: true });
  await refreshAccessToken();

  assert.equal(fetchCalls.length, 2);
});

test("refreshAccessToken: 네트워크 오류는 실패(false)로 정규화되고 in-flight를 정리한다", async () => {
  fetchImpl = async () => { throw new Error("network down"); };
  const result = await refreshAccessToken();
  assert.equal(result, false);

  fetchCalls.length = 0;
  fetchImpl = async () => jsonResponse(200, { success: true });
  await refreshAccessToken();
  assert.equal(fetchCalls.length, 1, "실패 이후에도 다음 호출은 새 fetch를 시도해야 합니다");
});

test("apiClient: ACCESS_TOKEN_EXPIRED 401은 갱신 성공 시 원 요청을 정확히 한 번 재시도한다", async () => {
  fetchCalls.length = 0;
  let call = 0;
  fetchImpl = async (url) => {
    call += 1;
    if (url === "http://test-api.local/auth/refresh") {
      return jsonResponse(200, { success: true });
    }
    if (call === 1) {
      return jsonResponse(401, { success: false, code: "ACCESS_TOKEN_EXPIRED", message: "만료" });
    }
    return jsonResponse(200, { success: true, data: { ok: true } });
  };

  const result = await apiClient("/user/me/profile");

  assert.deepEqual(result, { ok: true });
  const profileCalls = fetchCalls.filter(([url]) => url === "http://test-api.local/user/me/profile");
  assert.equal(profileCalls.length, 2, "원 요청은 갱신 이후 정확히 한 번만 재시도되어야 합니다(무한 재시도 방지)");
});

test("apiClient: 갱신이 실패하면 재시도하지 않고 401 처리(handleApiResponse)로 흘려보낸다", async () => {
  fetchCalls.length = 0;
  fetchImpl = async (url) => {
    // refreshAccessToken()은 response.ok(HTTP 상태)만 본다 — 200 body의 success:false가
    // 아니라 실제 비-2xx 상태여야 "갱신 실패"를 재현한다.
    if (url === "http://test-api.local/auth/refresh") return jsonResponse(401, { success: false });
    return jsonResponse(401, { success: false, code: "ACCESS_TOKEN_EXPIRED", message: "만료" });
  };

  await assert.rejects(apiClient("/user/me/profile"));
  const profileCalls = fetchCalls.filter(([url]) => url === "http://test-api.local/user/me/profile");
  assert.equal(profileCalls.length, 1, "갱신 실패 후에는 재시도하면 안 됩니다");
});

test("apiClient: code가 없는(예: 로그아웃·정지·재사용 감지) 401은 갱신을 시도하지 않는다", async () => {
  fetchCalls.length = 0;
  fetchImpl = async () => jsonResponse(401, { success: false, message: "세션이 폐기되었습니다." });

  await assert.rejects(apiClient("/user/me/profile"));
  const refreshCallsMade = fetchCalls.filter(([url]) => url === "http://test-api.local/auth/refresh");
  assert.equal(refreshCallsMade.length, 0, "만료가 아닌 401까지 갱신을 시도하면 반복 실패만 늘어납니다");
});
