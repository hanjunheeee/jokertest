import { INGAME_PLAYER_ALIVE_FRAME_VARIANTS } from "../../ingame/constants/board/ingamePlayerAssets.js"
import { INGAME_PLAYER_STATUS } from "../../ingame/constants/board/status/ingamePlayerStatus.js"
import { getPlayerRecordListProfileAssets } from "../../ingame/constants/controls/playerRecordList/ingamePlayerRecordListData.js"
import { pickInGameJobPortrait } from "../../ingame/utils/pickInGameJobPortrait.js"
import { pickJobPortrait } from "../../../../shared/utils/pickJobPortrait.js"
import { GAME_RESULT_JOB_LABELS } from "../constants/gameResultLabels.js"

/**
 * null·배열이 아닌 순수 객체인지 판정한다.
 * @param {unknown} value 검사할 값
 */
function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

/** @param {unknown} reveal */
function resolveRevealCardStatus(reveal) {
  if (!isPlainObject(reveal) || reveal.alive !== false) {
    return INGAME_PLAYER_STATUS.ALIVE
  }

  return INGAME_PLAYER_STATUS.DEAD
}

/**
 * store의 winResult와 본인 uuid를 결과 페이지(GameResultShell)가 소비하는 view model로 바꾼다.
 *
 * 총함수(total)다 — winResult가 비어 있거나 형태가 어긋나도 throw하지 않고 빈 결과를 돌려준다.
 * "결과가 없으니 로비로 돌려보낸다"는 판단은 호출부(useGameResultData/GameResultPage)의 몫이고,
 * 이 순수 함수는 판단하지 않는다.
 *
 * selfTeam은 reveals에 본인이 없을 때 승패를 판정하기 위한 fallback이다 — reveals에 본인이
 * 있으면 그 team이 우선한다. 참가자 명단은 winResult.reveals만으로 만들며, 서버가 주지 않은
 * 다른 참가자의 역할은 추론하지 않는다.
 *
 * @param {unknown} winResult 서버가 내려준 { winner } (원격 계약에서는 reveals·mvp도 포함)
 * @param {string|null} selfUuid 본인 참가자 uuid(모르면 null)
 * @param {"CITIZEN"|"JOKER"|null} [selfTeam] 본인 진영(reveals에 본인이 없을 때만 쓰인다)
 */
export function buildGameResultViewModel(winResult, selfUuid, selfTeam = null) {
  const reveals = Array.isArray(winResult?.reveals) ? winResult.reveals : []
  const winningTeam =
    winResult?.winner === "CITIZEN" || winResult?.winner === "JOKER" ? winResult.winner : null

  const players = reveals.map((reveal, index) => ({
    id: isPlainObject(reveal) ? reveal.uuid : null,
    name: isPlainObject(reveal) ? reveal.nickname : "",
    job: (isPlainObject(reveal) && GAME_RESULT_JOB_LABELS[reveal.role]) || "",
    ...getPlayerRecordListProfileAssets(index),
    portraitSrc: pickInGameJobPortrait(index),
    frameSrc: pickJobPortrait(index, INGAME_PLAYER_ALIVE_FRAME_VARIANTS),
    cardStatus: resolveRevealCardStatus(reveal),
  }))

  const selfReveal =
    typeof selfUuid === "string" && selfUuid.length > 0
      ? reveals.find((reveal) => isPlainObject(reveal) && reveal.uuid === selfUuid)
      : undefined
  const resolvedSelfTeam = selfReveal !== undefined ? selfReveal.team : selfTeam
  const outcome = winningTeam !== null && resolvedSelfTeam === winningTeam ? "win" : "lose"

  const mvpUuid = isPlainObject(winResult?.mvp) ? winResult.mvp.uuid : null
  const mvp =
    typeof mvpUuid === "string" && mvpUuid.length > 0
      ? (players.find((player) => player.id === mvpUuid) ?? null)
      : null

  const resolvedSelfUuid =
    typeof selfUuid === "string" && selfUuid.length > 0 ? selfUuid : null

  return { outcome, winningTeam, players, mvp, selfUuid: resolvedSelfUuid }
}
