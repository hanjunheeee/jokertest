// 판 결과(winResult)를 결과 화면 값으로: 승패·이긴 진영·참가자 줄·MVP
// hooks/useGameResultData가 씀, 시험도 씀
import { INGAME_PLAYER_ALIVE_FRAME_VARIANTS } from "../../ingame/constants/board/ingamePlayerAssets.js"
import { INGAME_PLAYER_STATUS } from "../../shared/constants/ingamePlayerStatus.js"
import { getPlayerRecordListProfileAssets } from "../../ingame/constants/controls/playerRecordList/ingamePlayerRecordListData.js"
import { pickInGameJobPortrait } from "../../ingame/utils/pickInGameJobPortrait.js"
import { pickJobPortrait } from "../../../../shared/utils/pickJobPortrait.js"
import { GAME_RESULT_JOB_LABELS } from "../constants/gameResultLabels.js"

// 배열·null 아닌 객체
function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

// 공개된 참가자 카드 상태 (alive가 false일 때만 죽음)
function resolveRevealCardStatus(reveal) {
  if (!isPlainObject(reveal) || reveal.alive !== false) {
    return INGAME_PLAYER_STATUS.ALIVE
  }

  return INGAME_PLAYER_STATUS.DEAD
}

// 결과 화면 값 만들기
export function buildGameResultViewModel(winResult, selfUuid, selfTeam = null) {
  const reveals = Array.isArray(winResult?.reveals) ? winResult.reveals : []
  // 이긴 진영은 시민·광대만 인정
  const winningTeam =
    winResult?.winner === "CITIZEN" || winResult?.winner === "JOKER" ? winResult.winner : null

  // 참가자 줄: 이름·직업 글자·그림 경로 (그림은 자리 순서로 고름)
  const players = reveals.map((reveal, index) => ({
    id: isPlainObject(reveal) ? reveal.uuid : null,
    name: isPlainObject(reveal) ? reveal.nickname : "",
    job: (isPlainObject(reveal) && GAME_RESULT_JOB_LABELS[reveal.role]) || "",
    ...getPlayerRecordListProfileAssets(index),
    portraitSrc: pickInGameJobPortrait(index),
    frameSrc: pickJobPortrait(index, INGAME_PLAYER_ALIVE_FRAME_VARIANTS),
    cardStatus: resolveRevealCardStatus(reveal),
  }))

  // 내 진영: 공개 목록에 내가 있으면 그 진영, 없으면 넘겨받은 진영
  const selfReveal =
    typeof selfUuid === "string" && selfUuid.length > 0
      ? reveals.find((reveal) => isPlainObject(reveal) && reveal.uuid === selfUuid)
      : undefined
  const resolvedSelfTeam = selfReveal !== undefined ? selfReveal.team : selfTeam
  // 내 진영이 이긴 진영이면 승리, 그 밖엔 패배
  const outcome = winningTeam !== null && resolvedSelfTeam === winningTeam ? "win" : "lose"

  // MVP는 참가자 줄에서 uuid로 찾음 (없으면 null)
  const mvpUuid = isPlainObject(winResult?.mvp) ? winResult.mvp.uuid : null
  const mvp =
    typeof mvpUuid === "string" && mvpUuid.length > 0
      ? (players.find((player) => player.id === mvpUuid) ?? null)
      : null

  const resolvedSelfUuid =
    typeof selfUuid === "string" && selfUuid.length > 0 ? selfUuid : null

  return { outcome, winningTeam, players, mvp, selfUuid: resolvedSelfUuid }
}
