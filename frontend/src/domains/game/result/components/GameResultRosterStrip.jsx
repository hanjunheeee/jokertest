import {
  GAME_RESULT_ROSTER_STRIP_SCROLL_CLASS,
  GAME_RESULT_ROSTER_STRIP_WRAP_CLASS,
} from "../constants/gameResultLayout.js"
import GameResultRosterCard from "./GameResultRosterCard.jsx"

export default function GameResultRosterStrip({ players = [] }) {
  if (players.length === 0) return null

  const showJobLabel = players.length === 1

  return (
    <section
      className={GAME_RESULT_ROSTER_STRIP_WRAP_CLASS}
      aria-label="해당 판 참가 캐릭터"
    >
      <ul className={GAME_RESULT_ROSTER_STRIP_SCROLL_CLASS}>
        {players.map((player) => (
          <GameResultRosterCard
            key={player.id ?? player.name}
            showJobLabel={showJobLabel}
            {...player}
          />
        ))}
      </ul>
    </section>
  )
}
