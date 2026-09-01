import test from "node:test"
import assert from "node:assert/strict"

import { buildGameResultViewModel } from "../buildGameResultViewModel.js"
import { INGAME_PLAYER_ALIVE_FRAME_VARIANTS } from "../../../ingame/constants/board/ingamePlayerAssets.js"
import { INGAME_PLAYER_STATUS } from "../../../ingame/constants/board/status/ingamePlayerStatus.js"
import { getPlayerRecordListProfileAssets } from "../../../ingame/constants/controls/playerRecordList/ingamePlayerRecordListData.js"
import { pickInGameJobPortrait } from "../../../ingame/utils/pickInGameJobPortrait.js"
import { pickJobPortrait } from "../../../../../shared/utils/pickJobPortrait.js"

// backend buildEndedRoleReveals가 싣는 순서·필드 그대로의 5인 명단(광대 1 + 시민 진영 4).
function baseReveals() {
  return [
    { uuid: "u-joker", nickname: "밀런", role: "JOKER", team: "JOKER", alive: true },
    { uuid: "u-citizen", nickname: "한준희", role: "CITIZEN", team: "CITIZEN", alive: false },
    { uuid: "u-doctor", nickname: "스미스", role: "DOCTOR", team: "CITIZEN", alive: true },
    { uuid: "u-guard", nickname: "토마스", role: "GUARD", team: "CITIZEN", alive: true },
    { uuid: "u-hunter", nickname: "엠마", role: "WITCH_HUNTER", team: "CITIZEN", alive: false },
  ]
}

function winResultOf(winner, overrides = {}) {
  return { winner, reveals: baseReveals(), mvp: null, ...overrides }
}

const SELF_UUIDS = ["u-joker", "u-citizen", "u-doctor", "u-guard", "u-hunter"]

// --- outcome: 승리 진영 × 본인 역할 5종 ---

test("JOKER 승리: 본인이 광대면 win, 나머지 네 역할은 모두 lose다", () => {
  const winResult = winResultOf("JOKER")
  const outcomes = SELF_UUIDS.map((uuid) => buildGameResultViewModel(winResult, uuid).outcome)
  assert.deepEqual(outcomes, ["win", "lose", "lose", "lose", "lose"])
})

test("CITIZEN 승리: 시민 진영 네 역할은 win, 광대만 lose다", () => {
  const winResult = winResultOf("CITIZEN")
  const outcomes = SELF_UUIDS.map((uuid) => buildGameResultViewModel(winResult, uuid).outcome)
  assert.deepEqual(outcomes, ["lose", "win", "win", "win", "win"])
})

// --- players: 순서·식별자·직업 라벨·초상 ---

test("players는 reveals 순서 그대로이고 id=uuid, name=nickname을 그대로 옮긴다", () => {
  const { players } = buildGameResultViewModel(winResultOf("CITIZEN"), "u-doctor")

  assert.equal(players.length, 5)
  assert.deepEqual(
    players.map((p) => p.id),
    ["u-joker", "u-citizen", "u-doctor", "u-guard", "u-hunter"],
  )
  assert.deepEqual(
    players.map((p) => p.name),
    ["밀런", "한준희", "스미스", "토마스", "엠마"],
  )
})

test("job은 결과 페이지 시안의 한글 표시명 5종으로 매핑된다(WITCH_HUNTER는 임시로 '귀족')", () => {
  const { players } = buildGameResultViewModel(winResultOf("CITIZEN"), "u-doctor")

  assert.deepEqual(
    players.map((p) => p.job),
    ["광대", "귀족", "주치의", "경비원", "귀족"],
  )
})

test("알 수 없는 role은 빈 문자열이 된다(임의의 다른 직업명으로 채우지 않는다)", () => {
  const winResult = winResultOf("CITIZEN", {
    reveals: [{ uuid: "u-x", nickname: "X", role: "UNKNOWN_ROLE", team: "CITIZEN", alive: true }],
  })

  assert.equal(buildGameResultViewModel(winResult, "u-x").players[0].job, "")
})

test("winningTeam은 winResult.winner(CITIZEN/JOKER)를 그대로 옮긴다", () => {
  assert.equal(buildGameResultViewModel(winResultOf("JOKER"), "u-joker").winningTeam, "JOKER")
  assert.equal(buildGameResultViewModel(winResultOf("CITIZEN"), "u-doctor").winningTeam, "CITIZEN")
})

test("frameSrc·cardStatus는 슬롯 index 프레임 순환과 reveal.alive를 반영한다", () => {
  const { players } = buildGameResultViewModel(winResultOf("CITIZEN"), "u-doctor")

  assert.deepEqual(
    players.map((p) => p.frameSrc),
    players.map((_, index) => pickJobPortrait(index, INGAME_PLAYER_ALIVE_FRAME_VARIANTS)),
  )
  assert.deepEqual(
    players.map((p) => p.cardStatus),
    [INGAME_PLAYER_STATUS.ALIVE, INGAME_PLAYER_STATUS.DEAD, INGAME_PLAYER_STATUS.ALIVE, INGAME_PLAYER_STATUS.ALIVE, INGAME_PLAYER_STATUS.DEAD],
  )
})

test("portraitSrc는 MVP 카드용 pickInGameJobPortrait(슬롯 index 순환) 관례를 그대로 따른다", () => {
  const { players } = buildGameResultViewModel(winResultOf("JOKER"), "u-joker")

  assert.deepEqual(
    players.map((p) => p.portraitSrc),
    players.map((_, index) => pickInGameJobPortrait(index)),
  )
})

test("profilePhotoSrc·profileBorderSrc는 전적목록과 같은 shopItem 프로필 순환을 따른다", () => {
  const { players } = buildGameResultViewModel(winResultOf("JOKER"), "u-joker")

  assert.deepEqual(
    players.map((p) => ({
      profilePhotoSrc: p.profilePhotoSrc,
      profileBorderSrc: p.profileBorderSrc,
    })),
    players.map((_, index) => getPlayerRecordListProfileAssets(index)),
  )
})

test("rosterPlayers는 본인 uuid에 해당하는 플레이어 한 명만 담는다", () => {
  const result = buildGameResultViewModel(winResultOf("CITIZEN"), "u-doctor")

  assert.equal(result.rosterPlayers.length, 1)
  assert.equal(result.rosterPlayers[0], result.players[2])
  assert.equal(result.rosterPlayers[0].job, "주치의")
})

test("selfUuid가 없거나 명단에 없으면 rosterPlayers는 빈 배열이다", () => {
  assert.deepEqual(buildGameResultViewModel(winResultOf("CITIZEN"), null).rosterPlayers, [])
  assert.deepEqual(
    buildGameResultViewModel(winResultOf("CITIZEN"), "u-not-in-roster").rosterPlayers,
    [],
  )
})

// --- reveals 누락·본인 미포함 ---

test("reveals가 없으면 players는 빈 배열이고 outcome·winningTeam은 lose/null이다", () => {
  const result = buildGameResultViewModel({ winner: "CITIZEN", reveals: [], mvp: null }, "u-doctor")

  assert.deepEqual(result, {
    outcome: "lose",
    winningTeam: "CITIZEN",
    players: [],
    rosterPlayers: [],
    mvp: null,
  })
})

test("reveals 필드 자체가 없어도 throw 없이 빈 결과를 돌려준다(총함수)", () => {
  assert.deepEqual(buildGameResultViewModel({ winner: "JOKER" }, "u-joker"), {
    outcome: "lose",
    winningTeam: "JOKER",
    players: [],
    rosterPlayers: [],
    mvp: null,
  })
})

test("winResult가 null/undefined여도 throw 없이 빈 결과를 돌려준다", () => {
  assert.deepEqual(buildGameResultViewModel(null, "u-joker"), {
    outcome: "lose",
    winningTeam: null,
    players: [],
    rosterPlayers: [],
    mvp: null,
  })
  assert.deepEqual(buildGameResultViewModel(undefined, null), {
    outcome: "lose",
    winningTeam: null,
    players: [],
    rosterPlayers: [],
    mvp: null,
  })
})

test("본인이 reveals에 없으면 lose다(명단 자체는 그대로 그린다)", () => {
  const result = buildGameResultViewModel(winResultOf("CITIZEN"), "u-not-in-roster")

  assert.equal(result.outcome, "lose")
  assert.equal(result.players.length, 5)
})

test("selfUuid가 null이면 lose다", () => {
  assert.equal(buildGameResultViewModel(winResultOf("CITIZEN"), null).outcome, "lose")
})

// --- mvp ---

test("mvp가 null이면 null을 그대로 돌려준다(패널이 빈 슬롯으로 렌더된다)", () => {
  assert.equal(buildGameResultViewModel(winResultOf("JOKER"), "u-joker").mvp, null)
})

test("mvp.uuid가 명단에 있으면 job/portraitSrc가 채워진 그 player 객체를 그대로 쓴다", () => {
  const winResult = winResultOf("CITIZEN", { mvp: { uuid: "u-doctor" } })
  const result = buildGameResultViewModel(winResult, "u-doctor")

  assert.notEqual(result.mvp, null)
  assert.equal(result.mvp, result.players[2])
  assert.equal(result.mvp.name, "스미스")
  assert.equal(result.mvp.job, "주치의")
})

test("mvp.uuid가 명단에 없으면 null이다", () => {
  const winResult = winResultOf("CITIZEN", { mvp: { uuid: "u-ghost" } })

  assert.equal(buildGameResultViewModel(winResult, "u-doctor").mvp, null)
})
