/**
 * 직업 초상 슬롯 계약 회귀 시험.
 *
 * 소비처(전적목록 PlayerRecordListRow, 인게임 미리보기 등)는 슬롯 index만 넘기고
 * 초상 경로는 pickJobPortrait의 index % length 매핑으로 정해진다. 그래서 배열에
 * 슬롯을 더하거나 빼면 같은 index가 다른 직업을 가리키게 되어 화면이 조용히 바뀐다.
 * 아래 기대값은 배열 길이에서 유도하지 않고 승인된 10칸 슬롯 목록(원격 신버전 UI와 동일)에 고정해 둔다 —
 * 길이로 기대값을 만들면 슬롯이 늘거나 줄어든 회귀가 그대로 통과한다.
 *
 * 경로 문자열은 macOS 체크아웃을 위해 NFD로 적혀 있어 비교 전에 NFC로 맞춘다.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import {
  JOB_CLOSEUP_PORTRAITS,
  JOB_STANDING_PORTRAITS,
} from "../../constants/playerPortraitAssets.js"
import { pickJobPortrait } from "../pickJobPortrait.js"
// 소비 경로를 mock 없이 그대로 통과시켜 보기 위해 인게임 픽커를 직접 가져온다.
import { pickInGameJobPortrait } from "../../../domains/game/ingame/utils/pickInGameJobPortrait.js"

/** 승인된 슬롯 순서 — 슬롯 수(10)와 순서가 계약이다. */
const APPROVED_JOB_SLOTS = [
  "귀족1",
  "귀족2",
  "귀족3",
  "광대1",
  "광대2",
  "경비원1",
  "경비원2",
  "경비원3",
  "주치의",
  "마녀사냥꾼",
]

const SLOT_COUNT = APPROVED_JOB_SLOTS.length

/** 경로에서 파일명만 떼어 NFC로 되돌린다. */
function fileNameOf(path) {
  return path.normalize("NFC").split("/").pop()
}

test("standing 초상은 승인된 10칸 슬롯을 순서대로 담는다", () => {
  assert.equal(JOB_STANDING_PORTRAITS.length, SLOT_COUNT)
  assert.deepEqual(
    JOB_STANDING_PORTRAITS.map(fileNameOf),
    APPROVED_JOB_SLOTS.map((job) => `${job}.png`.normalize("NFC")),
  )
})

test("closeup 초상은 승인된 10칸 슬롯을 순서대로 담는다", () => {
  assert.equal(JOB_CLOSEUP_PORTRAITS.length, SLOT_COUNT)
  assert.deepEqual(
    JOB_CLOSEUP_PORTRAITS.map(fileNameOf),
    APPROVED_JOB_SLOTS.map((job) => `${job}_클로즈업.png`.normalize("NFC")),
  )
})

test("pickJobPortrait는 슬롯 index를 승인된 직업 초상에 그대로 대응시킨다", () => {
  APPROVED_JOB_SLOTS.forEach((job, index) => {
    assert.equal(
      fileNameOf(pickJobPortrait(index)),
      `${job}_클로즈업.png`.normalize("NFC"),
      `슬롯 ${index}는 ${job}이어야 합니다`,
    )
  })
})

test("index가 슬롯 수를 넘으면 10칸 주기로 처음 슬롯부터 다시 돈다", () => {
  // 슬롯 수가 바뀌면 index 10이 귀족1로 돌아오지 않아 여기서 걸린다.
  assert.equal(fileNameOf(pickJobPortrait(SLOT_COUNT)), "귀족1_클로즈업.png".normalize("NFC"))

  for (let index = 0; index < SLOT_COUNT * 3; index += 1) {
    const job = APPROVED_JOB_SLOTS[index % SLOT_COUNT]
    assert.equal(
      fileNameOf(pickJobPortrait(index)),
      `${job}_클로즈업.png`.normalize("NFC"),
      `슬롯 ${index}는 ${job}이어야 합니다`,
    )
  }
})

test("portraits 인자를 직접 주면 그 배열 기준으로 순환한다", () => {
  const portraits = ["a", "b", "c"]
  assert.equal(pickJobPortrait(0, portraits), "a")
  assert.equal(pickJobPortrait(4, portraits), "b")
  assert.equal(pickJobPortrait(0, []), undefined)
})

test("소비 경로 pickInGameJobPortrait도 같은 슬롯 매핑을 돌려준다", () => {
  // PlayerRecordListRow는 portraitSrc가 없을 때 pickInGameJobPortrait(index)를 그대로
  // PlayerPortraitFrame에 넘긴다. ingamePlayerRecordListData·buildInGamePreviewPlayers도 같다.
  for (let index = 0; index < SLOT_COUNT * 2; index += 1) {
    const job = APPROVED_JOB_SLOTS[index % SLOT_COUNT]
    assert.equal(
      fileNameOf(pickInGameJobPortrait(index)),
      `${job}_클로즈업.png`.normalize("NFC"),
      `전적목록 ${index}번 줄은 ${job} 초상을 보여줘야 합니다`,
    )
    assert.equal(pickInGameJobPortrait(index), pickJobPortrait(index))
  }
})
