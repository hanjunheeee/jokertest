import { pickInGameJobPortrait } from "../../ingame/utils/pickInGameJobPortrait.js"

/**
 * 결과 페이지 시안의 직업 표시명 — 이 저장소에서 role→한글 라벨을 결정하는 유일한 지점이다.
 *
 * 인게임 역할 공개(ingameRoleRevealData.js)는 "시민/의사/경비대"라는 다른 어휘를 쓰므로 그
 * 상수를 재사용하지 않는다 — 결과 페이지 시안의 어휘가 이 화면의 계약이다.
 */
const GAME_RESULT_JOB_LABELS = {
  JOKER: "광대",
  CITIZEN: "귀족",
  DOCTOR: "주치의",
  GUARD: "경비원",
  // 임시 — WITCH_HUNTER 전용 에셋·표시명이 정해지면 이 한 줄만 바꾸면 된다.
  WITCH_HUNTER: "귀족",
}

/**
 * null·배열이 아닌 순수 객체인지 판정한다.
 * @param {unknown} value 검사할 값
 */
function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

/**
 * store의 winResult와 본인 uuid를 결과 페이지(GameResultShell)가 소비하는 view model로 바꾼다.
 *
 * 총함수(total)다 — winResult가 비어 있거나 형태가 어긋나도 throw하지 않고 빈 결과를 돌려준다.
 * "결과가 없으니 로비로 돌려보낸다"는 판단은 호출부(useGameResultData/GameResultPage)의 몫이고,
 * 이 순수 함수는 판단하지 않는다.
 *
 * @param {unknown} winResult normalizeWinResult가 정규화한 { winner, reveals, mvp }
 * @param {string|null} selfUuid 본인 참가자 uuid(모르면 null)
 * @flow reveals를 받은 순서 그대로 players로 옮기고(id=uuid, name=nickname, job=한글 라벨,
 *   portraitSrc=슬롯 index 순환), 그 안에서 selfUuid를 찾아 본인 team이 winner와 같으면 "win",
 *   본인이 없거나 팀이 다르면 "lose"로 정한다. mvp는 uuid가 players에 있을 때만 그 player
 *   객체를 그대로 쓰고(job/portraitSrc가 이미 채워져 있다), 없거나 매칭되지 않으면 null이다.
 */
export function buildGameResultViewModel(winResult, selfUuid) {
  const reveals = Array.isArray(winResult?.reveals) ? winResult.reveals : []

  const players = reveals.map((reveal, index) => ({
    id: isPlainObject(reveal) ? reveal.uuid : null,
    name: isPlainObject(reveal) ? reveal.nickname : "",
    // 알 수 없는 role은 빈 문자열로 둔다 — 임의의 다른 직업명으로 채워 잘못된 정보를 보여주지 않는다.
    job: (isPlainObject(reveal) && GAME_RESULT_JOB_LABELS[reveal.role]) || "",
    portraitSrc: pickInGameJobPortrait(index),
  }))

  const selfReveal =
    typeof selfUuid === "string" && selfUuid.length > 0
      ? reveals.find((reveal) => isPlainObject(reveal) && reveal.uuid === selfUuid)
      : undefined
  const outcome = selfReveal !== undefined && selfReveal.team === winResult?.winner ? "win" : "lose"

  const mvpUuid = isPlainObject(winResult?.mvp) ? winResult.mvp.uuid : null
  const mvp =
    typeof mvpUuid === "string" && mvpUuid.length > 0
      ? (players.find((player) => player.id === mvpUuid) ?? null)
      : null

  return { outcome, players, mvp }
}
