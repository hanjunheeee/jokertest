// 아이디(가입 메일) 찾기 상태 시험 (훅 useFindId: 입력 검사·찾기 요청·결과·다시 입력)
// 목록 A11b 화면 상태 A11-F-539~549
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const { renderHook, act, cleanup } = await import("@testing-library/react")
const { installFetch, HOLD, NETWORK_DOWN, flushUi, submitEvent } = await import("./a11Kit.mjs")
const { useFindId } = await import("../../src/domains/auth/hooks/recovery/useFindId.js")
const { FIND_ID_TEXT } = await import("../../src/domains/auth/constants/recoveryMessages.js")

const PATH = "/auth/find-id"
const NICK = "가면손님"
const BIRTH = "1999-04-17"

test.afterEach(() => cleanup())

// 훅을 그리고 두 칸을 넣은 뒤 찾기 누름
async function findWith(answer, { nickname = NICK, birthDate = BIRTH } = {}) {
  const net = installFetch({ [`POST ${PATH}`]: answer })
  const hook = renderHook(() => useFindId())
  act(() => hook.result.current.changeNickname(nickname))
  act(() => hook.result.current.setBirthDate(birthDate))
  act(() => hook.result.current.handleSubmit(submitEvent()))
  await flushUi()
  return { net, hook }
}

test("A11-F-539 닉네임 빈칸 → 안내 문구, 서버 안 부름", async () => {
  const { net, hook } = await findWith({ status: 200, body: { ok: true, maskedEmail: "ga***@example.com" } }, { nickname: "" })
  assert.notEqual(hook.result.current.formError, "")
  assert.equal(net.to("POST", PATH).length, 0)
})

test("A11-F-540 생년월일 모양 틀림 → 안내 문구, 서버 안 부름", async () => {
  const { net, hook } = await findWith({ status: 200, body: { ok: true, maskedEmail: "ga***@example.com" } }, { birthDate: "1999/04/17" })
  assert.notEqual(hook.result.current.formError, "")
  assert.equal(net.to("POST", PATH).length, 0)
})

test("A11-F-541 검사 통과 → 찾기 요청 1번", async () => {
  const { net } = await findWith(HOLD)
  assert.equal(net.to("POST", PATH).length, 1)
  assert.deepEqual(net.to("POST", PATH)[0].body, { nickname: NICK, birthDate: BIRTH })
})

test("A11-F-542 찾는 중에 다시 누름 → 요청 더 안 감", async () => {
  const { net, hook } = await findWith(HOLD)
  act(() => hook.result.current.handleSubmit(submitEvent()))
  act(() => hook.result.current.handleSubmit(submitEvent()))
  await flushUi()
  assert.equal(net.to("POST", PATH).length, 1)
})

test("A11-F-543 서버 ok:true → 찾음(found) + 가린 이메일, 입력 칸 비움", async () => {
  const { hook } = await findWith({ status: 200, body: { ok: true, maskedEmail: "ga***@example.com" } })
  assert.equal(hook.result.current.status, "found")
  assert.equal(hook.result.current.maskedEmail, "ga***@example.com")
  assert.equal(hook.result.current.nickname, "")
  assert.equal(hook.result.current.birthDate, "")
})

test("A11-F-544 서버 NOT_FOUND → 못 찾음(notFound)", async () => {
  const { hook } = await findWith({ status: 200, body: { ok: false, code: "NOT_FOUND" } })
  assert.equal(hook.result.current.status, "notFound")
})

test("A11-F-545 서버 429 → 잠시 막힘(rateLimited)", async () => {
  const { hook } = await findWith({ status: 429, body: { ok: false, code: "RATE_LIMITED" } })
  assert.equal(hook.result.current.status, "rateLimited")
})

test("A11-F-546 서버 400 → 입력 화면(idle) + 안내 문구", async () => {
  const { hook } = await findWith({ status: 400, body: { ok: false, code: "INVALID_INPUT" } })
  assert.equal(hook.result.current.status, "idle")
  assert.equal(hook.result.current.formError, FIND_ID_TEXT.badInput)
})

test("A11-F-547 망 끊김 → 실패(failed)", async () => {
  const { hook } = await findWith(NETWORK_DOWN)
  assert.equal(hook.result.current.status, "failed")
})

test("A11-F-548 '다시 입력' → 직전 입력(생년월일 포함) 그대로 남음", async () => {
  const { hook } = await findWith({ status: 200, body: { ok: false, code: "NOT_FOUND" } })
  assert.equal(hook.result.current.status, "notFound", "준비: 못 찾음")
  act(() => hook.result.current.backToIdle())
  assert.equal(hook.result.current.status, "idle")
  assert.equal(hook.result.current.nickname, NICK)
  assert.equal(hook.result.current.birthDate, BIRTH)
})

test("A11-F-549 화면을 나간 뒤 온 답 → 버림(상태 안 바뀜)", async () => {
  const { net, hook } = await findWith(HOLD)
  assert.equal(hook.result.current.status, "submitting", "준비: 찾는 중")
  hook.unmount()
  await net.release("POST", PATH, { status: 200, body: { ok: true, maskedEmail: "ga***@example.com" } })
  assert.equal(hook.result.current.status, "submitting")
  assert.equal(hook.result.current.maskedEmail, "")
})
