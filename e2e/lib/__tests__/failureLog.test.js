import assert from "node:assert/strict"
import test from "node:test"
import { createFailureLog, formatFailureSummary } from "../failureLog.js"

test("createFailureLog는 던지지 않고 모으기만 한다", () => {
  const log = createFailureLog()
  assert.equal(log.hasFailures(), false)
  assert.equal(log.summary(), "")

  log.record({ step: "NIGHT 2", seatLabel: "S4(WITCH_HUNTER)", message: "대상이 잠겨 있습니다" })
  assert.equal(log.hasFailures(), true)
  assert.equal(log.entries().length, 1)
})

test("record는 Error와 문자열을 모두 받아 메시지만 남긴다", () => {
  const log = createFailureLog()
  log.record({ step: "s", seatLabel: "S1", message: new Error("에러 객체") })
  log.record({ step: "s", seatLabel: "S2", message: "문자열" })

  assert.deepEqual(
    log.entries().map((entry) => entry.message),
    ["에러 객체", "문자열"],
  )
})

test("메시지가 비어 있어도 항목이 조용히 사라지지 않는다", () => {
  const log = createFailureLog()
  log.record({ step: "s", seatLabel: "S1", message: "   " })
  log.record({})

  const entries = log.entries()
  assert.equal(entries.length, 2)
  assert.equal(entries[0].message, "(메시지 없음)")
  assert.equal(entries[1].step, "(단계 없음)")
  assert.equal(entries[1].seatLabel, "(좌석 없음)")
})

test("entries()는 복사본이라 호출부가 수집기 내부를 오염시킬 수 없다", () => {
  const log = createFailureLog()
  log.record({ step: "s", seatLabel: "S1", message: "원본" })

  const first = log.entries()
  first.push({ step: "가짜", seatLabel: "S9", message: "끼워넣기" })
  first[0].message = "덮어쓰기"

  assert.equal(log.entries().length, 1)
  assert.equal(log.entries()[0].message, "원본")
})

test("요약은 건수와 단계·좌석·메시지를 한 줄씩 담는다", () => {
  const log = createFailureLog()
  log.record({ step: "NIGHT 1 진입 직후", seatLabel: "S4(WITCH_HUNTER)", message: "안내가 떴습니다" })
  log.record({ step: "NIGHT 2 결과", seatLabel: "S5(CITIZEN)", message: "사망 표시가 없습니다" })

  const lines = log.summary().split("\n")
  assert.equal(lines.length, 3)
  assert.match(lines[0], /2건/)
  assert.equal(lines[1], "  - [NIGHT 1 진입 직후] S4(WITCH_HUNTER): 안내가 떴습니다")
  assert.equal(lines[2], "  - [NIGHT 2 결과] S5(CITIZEN): 사망 표시가 없습니다")
})

test("formatFailureSummary는 빈 목록에서 빈 문자열이다", () => {
  assert.equal(formatFailureSummary([]), "")
  assert.equal(formatFailureSummary(null), "")
  assert.equal(formatFailureSummary(undefined), "")
})
