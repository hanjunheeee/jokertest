import assert from "node:assert/strict"
import test from "node:test"
import { E2E_SEAT_COUNT, parseDotEnv, resolveE2eAccounts } from "../env.js"

/** 좌석 5개가 전부 채워진 정상 env 객체를 만든다. */
function buildFullEnv() {
  const env = {}
  for (let seat = 1; seat <= E2E_SEAT_COUNT; seat += 1) {
    env[`E2E_USER${seat}_EMAIL`] = `user${seat}@example.com`
    env[`E2E_USER${seat}_PASSWORD`] = `pw${seat}`
    env[`E2E_USER${seat}_NICKNAME`] = `테스터${seat}`
  }
  return env
}

test("parseDotEnv는 주석·빈 줄을 건너뛰고 KEY=VALUE만 읽는다", () => {
  const parsed = parseDotEnv(["# 주석", "", "A=1", "   ", "# B=2", "C=3"].join("\n"))
  assert.deepEqual(parsed, { A: "1", C: "3" })
})

test("parseDotEnv는 CRLF 줄바꿈에서도 값 끝에 캐리지리턴을 남기지 않는다", () => {
  const parsed = parseDotEnv("A=1\r\nB=2\r\n")
  assert.deepEqual(parsed, { A: "1", B: "2" })
})

test("parseDotEnv는 따옴표를 벗기고, 값 안의 =는 그대로 둔다", () => {
  const parsed = parseDotEnv(['A="quoted"', "B='single'", "C=pa=ss=word", 'D="he said \\"hi\\""'].join("\n"))
  assert.equal(parsed.A, "quoted")
  assert.equal(parsed.B, "single")
  assert.equal(parsed.C, "pa=ss=word")
  assert.equal(parsed.D, 'he said \\"hi\\"')
})

test("parseDotEnv는 = 없는 줄과 키가 빈 줄을 무시한다", () => {
  assert.deepEqual(parseDotEnv(["NOEQUALS", "=novalue", "OK=1"].join("\n")), { OK: "1" })
})

test("parseDotEnv는 문자열이 아닌 입력에서 빈 객체를 돌려준다", () => {
  assert.deepEqual(parseDotEnv(null), {})
  assert.deepEqual(parseDotEnv(undefined), {})
})

test("resolveE2eAccounts는 좌석 순서대로 계정 5개를 돌려준다", () => {
  const accounts = resolveE2eAccounts(buildFullEnv())
  assert.equal(accounts.length, E2E_SEAT_COUNT)
  assert.deepEqual(
    accounts.map((account) => account.seatIndex),
    [0, 1, 2, 3, 4],
  )
  assert.deepEqual(accounts[2], {
    seatIndex: 2,
    email: "user3@example.com",
    password: "pw3",
    nickname: "테스터3",
  })
})

test("resolveE2eAccounts는 빠진 키의 이름을 그대로 지목해 실패한다", () => {
  const env = buildFullEnv()
  delete env.E2E_USER3_PASSWORD
  assert.throws(
    () => resolveE2eAccounts(env),
    (error) => {
      assert.match(error.message, /E2E_USER3_PASSWORD/)
      assert.doesNotMatch(error.message, /E2E_USER1_/)
      return true
    },
  )
})

test("resolveE2eAccounts는 공백뿐인 값을 비어 있는 것으로 본다", () => {
  const env = buildFullEnv()
  env.E2E_USER5_NICKNAME = "   "
  assert.throws(() => resolveE2eAccounts(env), /E2E_USER5_NICKNAME/)
})

test("resolveE2eAccounts는 닉네임이 겹치면 실패한다(좌석을 닉네임으로 구분하기 때문)", () => {
  const env = buildFullEnv()
  env.E2E_USER4_NICKNAME = env.E2E_USER1_NICKNAME
  assert.throws(() => resolveE2eAccounts(env), /닉네임/)
})

test("resolveE2eAccounts는 env가 아예 없으면 다섯 좌석 전부를 빠진 것으로 알려준다", () => {
  assert.throws(
    () => resolveE2eAccounts(null),
    (error) => {
      for (let seat = 1; seat <= E2E_SEAT_COUNT; seat += 1) {
        assert.match(error.message, new RegExp(`E2E_USER${seat}_EMAIL`))
      }
      return true
    },
  )
})
