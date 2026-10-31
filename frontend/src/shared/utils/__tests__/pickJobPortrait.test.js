import assert from "node:assert/strict"
import { test } from "node:test"

import {
  JOB_CLOSEUP_PORTRAITS,
  JOB_STANDING_PORTRAITS,
} from "../../constants/playerPortraitAssets.js"
import { pickJobPortrait } from "../pickJobPortrait.js"
import { pickInGameJobPortrait } from "../../../domains/game/ingame/utils/pickInGameJobPortrait.js"

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
