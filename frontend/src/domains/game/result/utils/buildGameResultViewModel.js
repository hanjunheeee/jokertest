import { INGAME_PLAYER_ALIVE_FRAME_VARIANTS } from "../../ingame/constants/board/ingamePlayerAssets.js"
import { INGAME_PLAYER_STATUS } from "../../shared/constants/ingamePlayerStatus.js"
import { getPlayerRecordListProfileAssets } from "../../ingame/constants/controls/playerRecordList/ingamePlayerRecordListData.js"
import { pickInGameJobPortrait } from "../../ingame/utils/pickInGameJobPortrait.js"
import { pickJobPortrait } from "../../../../shared/utils/pickJobPortrait.js"
import { GAME_RESULT_JOB_LABELS } from "../constants/gameResultLabels.js"

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function resolveRevealCardStatus(reveal) {
  if (!isPlainObject(reveal) || reveal.alive !== false) {
    return INGAME_PLAYER_STATUS.ALIVE
  }

  return INGAME_PLAYER_STATUS.DEAD
}

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
