import { useMemo, useState } from "react"
import {
  DUMMY_VOTE_COUNTS,
  isVoteStatusLeader,
  resolveVoteStatusLeaderVoteCount,
} from "../../constants/vote/ingameVotePreviewData.js"
import {
  INGAME_VOTE_FOOTER_CLASS,
  INGAME_VOTE_GRID_CLASS,
  INGAME_VOTE_SCROLL_WRAP_CLASS,
} from "../../constants/vote/ingameVoteLayout.js"
import { useInGamePlayerSessionContext } from "../InGamePlayerSessionContext.js"
import InGameVoteStatusRow from "./InGameVoteStatusRow.jsx"
import InGameVoteSubmitButton from "./InGameVoteSubmitButton.jsx"

export default function InGameVoteStatusContent() {
  const { players } = useInGamePlayerSessionContext()
  const [selectedPlayerId, setSelectedPlayerId] = useState(null)

  const voteCounts = useMemo(
    () => players.map((_, index) => DUMMY_VOTE_COUNTS[index] ?? 0),
    [players],
  )

  const leaderVoteCount = useMemo(
    () => resolveVoteStatusLeaderVoteCount(voteCounts),
    [voteCounts],
  )

  const toggleSelect = (playerId) => {
    setSelectedPlayerId((current) => (current === playerId ? null : playerId))
  }

  const handleSubmit = () => {
    if (!selectedPlayerId) return
    // TODO: submitDayVote 등 서버 연동
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className={INGAME_VOTE_SCROLL_WRAP_CLASS}>
        <ul className={INGAME_VOTE_GRID_CLASS} aria-label="투표 현황 목록">
          {players.map((player, index) => {
            const voteCount = voteCounts[index] ?? 0

            return (
              <InGameVoteStatusRow
                key={player.id}
                playerId={player.id}
                name={player.nickname}
                portraitSrc={player.portraitSrc}
                voteCount={voteCount}
                isLeader={isVoteStatusLeader(voteCount, leaderVoteCount)}
                selected={selectedPlayerId === player.id}
                onToggleSelect={() => toggleSelect(player.id)}
              />
            )
          })}
        </ul>
      </div>

      <div className={INGAME_VOTE_FOOTER_CLASS}>
        <InGameVoteSubmitButton
          disabled={!selectedPlayerId}
          onClick={handleSubmit}
        />
      </div>
    </div>
  )
}
