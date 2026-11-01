// 결과 화면 미리보기 가짜 판 (?outcome= 으로 열 때)
// useGameResultPreview·GameResultPage(승패 값 목록)가 씀
import { INGAME_PLAYER_STATUS } from "@/domains/game/shared/constants/ingamePlayerStatus.js"
import { getPlayerRecordListProfileAssets } from "@/domains/game/ingame/constants/controls/playerRecordList/ingamePlayerRecordListData.js"
import { pickInGameJobPortrait } from "@/domains/game/ingame/utils/pickInGameJobPortrait.js"
import { pickInGamePlayerFrame } from "@/domains/game/ingame/utils/pickInGamePlayerFrame.js"

// 미리보기로 열 수 있는 승패 값
export const GAME_RESULT_OUTCOMES = ["win", "lose"]

// 가짜 참가자
const PREVIEW_PLAYERS_BASE = [
  { id: "p1", name: "한준희1234", job: "귀족" },
  { id: "p2", name: "스미스", job: "주치의" },
  { id: "p3", name: "밀런", job: "광대" },
  { id: "p4", name: "토마스", job: "경비원" },
  { id: "p5", name: "알렉스", job: "귀족" },
  { id: "p6", name: "리사", job: "주치의" },
  { id: "p7", name: "데이비드", job: "광대" },
  { id: "p8", name: "엠마", job: "경비원" },
  { id: "p9", name: "올리버", job: "귀족" },
]

// 그림 경로 붙이기 (4명마다 죽음 표시)
const players = PREVIEW_PLAYERS_BASE.map((player, index) => ({
  ...player,
  ...getPlayerRecordListProfileAssets(index),
  portraitSrc: pickInGameJobPortrait(index),
  frameSrc: pickInGamePlayerFrame(index),
  cardStatus: index % 4 === 0 ? INGAME_PLAYER_STATUS.DEAD : INGAME_PLAYER_STATUS.ALIVE,
}))

// 가짜 판 결과
export const GAME_RESULT_PREVIEW = {
  outcome: "lose",
  winningTeam: "JOKER",
  players,
  selfPlayerId: "p1",
  mvpPlayerId: "p3",
}

// MVP 찾기 (없으면 첫 사람)
export function getMvpPlayer(players, mvpPlayerId) {
  return players.find((player) => player.id === mvpPlayerId) ?? players[0]
}
