import test from "node:test"
import assert from "node:assert/strict"
import { PODIUM_RANKING_DUMMY } from "../content/podiumRankingDummy.js"
import { PODIUM_ASSETS } from "../constants/podiumAssets.js"
import {
  getPodiumTablePageCount,
  getPodiumTopThree,
  splitPodiumTablePage,
} from "../utils/podiumRankingUtils.js"

test("PODIUM_RANKING_DUMMY는 1~30위 순위 배열이며 각 항목이 필요한 필드와 타입을 갖춘다", () => {
  assert.ok(Array.isArray(PODIUM_RANKING_DUMMY))
  assert.equal(PODIUM_RANKING_DUMMY.length, 30)

  PODIUM_RANKING_DUMMY.forEach((entry, index) => {
    assert.equal(entry.rank, index + 1)
    assert.equal(typeof entry.profileSrc, "string")
    assert.ok(entry.profileSrc.length > 0)
    assert.equal(typeof entry.profileBorderSrc, "string")
    assert.ok(entry.profileBorderSrc.length > 0)
    assert.equal(typeof entry.nickname, "string")
    assert.ok(entry.nickname.length > 0)
    assert.equal(typeof entry.playCount, "number")
    assert.equal(typeof entry.winRate, "string")
    assert.match(entry.winRate, /^\d+%$/)
  })
})

test("getPodiumTopThree는 1~3위만 순서대로 반환한다", () => {
  const topThree = getPodiumTopThree(PODIUM_RANKING_DUMMY)

  assert.equal(topThree.length, 3)
  assert.deepEqual(
    topThree.map((entry) => entry.rank),
    [1, 2, 3],
  )
})

test("getPodiumTablePageCount는 4위 이하 인원을 10명 단위 페이지로 계산한다", () => {
  assert.equal(getPodiumTablePageCount(30), 3)
  assert.equal(getPodiumTablePageCount(3), 1)
  assert.equal(getPodiumTablePageCount(13), 1)
  assert.equal(getPodiumTablePageCount(14), 2)
})

test("splitPodiumTablePage는 4위부터 좌 5명·우 5명으로 나눈다", () => {
  const { tableLeft, tableRight, pageStartRank, pageEndRank } = splitPodiumTablePage(
    PODIUM_RANKING_DUMMY,
    0,
  )

  assert.equal(pageStartRank, 4)
  assert.equal(pageEndRank, 13)
  assert.equal(tableLeft.length, 5)
  assert.equal(tableRight.length, 5)
  assert.deepEqual(
    tableLeft.map((entry) => entry.rank),
    [4, 5, 6, 7, 8],
  )
  assert.deepEqual(
    tableRight.map((entry) => entry.rank),
    [9, 10, 11, 12, 13],
  )
})

test("PODIUM_ASSETS는 1~3위 프레임 경로를 포함한 문자열 상수로만 이루어진다", () => {
  assert.equal(typeof PODIUM_ASSETS.background, "string")
  assert.equal(typeof PODIUM_ASSETS.headerPlate, "string")
  assert.equal(typeof PODIUM_ASSETS.rankingTableFrame, "string")
  assert.equal(typeof PODIUM_ASSETS.pageArrow, "string")

  for (const rank of [1, 2, 3]) {
    assert.equal(typeof PODIUM_ASSETS.rankFrames[rank], "string")
    assert.ok(PODIUM_ASSETS.rankFrames[rank].length > 0)
  }
})
