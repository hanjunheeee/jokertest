// 화면 상태 시험: 점검 큰 안내·띠 문구 — 예약·점검 중(끝 시각 있음/없음)·점검으로 판 끝남·대기방 닫힘, 띠 글
// 목록 A18-F-022~028 (docs/게임_의도_2026-11-15/시험목록/A18-설정-배포-광고.md), 돌리기: node --experimental-test-module-mocks --test tests/a18-maintenance/notice-copy.test.js
import test from "node:test"
import assert from "node:assert/strict"

const { bigNoticeCopy, bandCopy } = await import("../../src/domains/maintenance/utils/noticeCopy.js")
const { formatRemaining } = await import("../../src/domains/maintenance/utils/maintenanceText.js")

test("A18-F-022 예약 → \"점검 예정이에요\"·\"시각이 되면 진행 중 판이 강제로 끝나요.\"·\"확인했어요\"", () => {
  const copy = bigNoticeCopy({ mode: "big", state: "scheduled" })
  assert.equal(copy.title, "점검 예정이에요")
  assert.equal(copy.detail, "시각이 되면 진행 중 판이 강제로 끝나요.")
  assert.equal(copy.button, "확인했어요")
})

test("A18-F-023 점검 중·끝 시각 있음 → \"지금 점검 중이에요\"·\"…쯤 끝날 예정이에요.\"", () => {
  const copy = bigNoticeCopy({ mode: "big", state: "active", endsAtText: "11월 10일 오후 5:00" })
  assert.equal(copy.title, "지금 점검 중이에요")
  assert.equal(copy.detail, "11월 10일 오후 5:00쯤 끝날 예정이에요.")
})

test("A18-F-024 점검 중·끝 시각 없음 → \"끝나면 다시 들어와 주세요.\"", () => {
  const copy = bigNoticeCopy({ mode: "big", state: "active", endsAtText: null })
  assert.equal(copy.title, "지금 점검 중이에요")
  assert.equal(copy.detail, "끝나면 다시 들어와 주세요.")
})

test("A18-F-025 강제 판 → \"점검으로 판이 끝났어요\"·\"승패 없이 끝났어요. 보상과 벌점도 없어요.\"·\"로비로 가기\"", () => {
  const copy = bigNoticeCopy({ mode: "forced", forcedKind: "game" })
  assert.equal(copy.title, "점검으로 판이 끝났어요")
  assert.equal(copy.detail, "승패 없이 끝났어요. 보상과 벌점도 없어요.")
  assert.equal(copy.button, "로비로 가기")
})

test("A18-F-026 강제 방 → \"점검으로 대기방이 닫혔어요\"", () => {
  const copy = bigNoticeCopy({ mode: "forced", forcedKind: "room" })
  assert.equal(copy.title, "점검으로 대기방이 닫혔어요")
})

test("A18-F-027 띠: 예약·남은 4분 5초 → \"점검까지 4분 05초\"", () => {
  assert.equal(bandCopy({ state: "scheduled", remainingText: formatRemaining(245_000) }), "점검까지 4분 05초")
})

test("A18-F-028 띠: 점검 중 → \"지금 점검 중이에요\"", () => {
  assert.equal(bandCopy({ state: "active", remainingText: "0초" }), "지금 점검 중이에요")
})
