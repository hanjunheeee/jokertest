import { pickInGameJobPortrait } from "@/domains/game/ingame/utils/pickInGameJobPortrait.js"

/** @typedef {"win" | "lose"} GameResultOutcome */

export const GAME_RESULT_OUTCOMES = ["win", "lose"]

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

const players = PREVIEW_PLAYERS_BASE.map((player, index) => ({
  ...player,
  portraitSrc: pickInGameJobPortrait(index),
}))

/** 개발용 기본 outcome — URL `?outcome=win|lose`로 전환 */
export const GAME_RESULT_PREVIEW = {
  outcome: "lose",
  players,
  mvpPlayerId: "p3",
}

export function getGameResultMvpPlayer(players, mvpPlayerId) {
  return players.find((player) => player.id === mvpPlayerId) ?? players[0]
}