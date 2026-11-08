// known 1-10: 낮 투표 판정 실패 문구 3개가 깨지지 않은 한글인지
import test from "node:test"
import assert from "node:assert/strict"
import {
  FAILED_MSG,
  NO_ACK_MSG,
  OFFLINE_MSG,
} from "../../../../../../src/domains/game/ingame/constants/actions/dayVoteResolve.js"

test("1-10: 판정 실패·연결 없음·응답 없음 문구가 바로 읽히는 한글이다", () => {
  assert.equal(FAILED_MSG, "판정하지 못했습니다.")
  assert.equal(OFFLINE_MSG, "서버 연결을 확인할 수 없습니다. 잠시 후 다시 시도해주세요.")
  assert.equal(NO_ACK_MSG, "요청이 응답하지 않습니다. 다시 시도해주세요.")
  for (const message of [FAILED_MSG, OFFLINE_MSG, NO_ACK_MSG]) {
    assert.doesNotMatch(message, /\?/, "깨진 글자(?)가 남아 있다")
  }
})
