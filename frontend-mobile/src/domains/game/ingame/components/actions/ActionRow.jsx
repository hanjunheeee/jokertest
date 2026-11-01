// 인게임 행동 줄 (모바일): 데스크톱 구석 패널(투표 현황·기권·건너뛰기) + 단계 행동 줄(준비·집계·판정·밤 종료)
// InGamePage가 씀, props 없이 데스크톱 행동 컨텍스트(InGameActionContext)로 값 읽음
import { useActionRow } from "../../hooks/actions/useActionRow.js"
import ImageButton from "./ImageButton.jsx"
import PhaseButton from "./PhaseButton.jsx"
import VoteStatusPanel from "./VoteStatusPanel.jsx"

// 대상 고르기는 카드 메뉴(보드), 재판 유죄·무죄는 재판 연출이 맡음 (데스크톱과 같음)
export default function ActionRow() {
  const row = useActionRow()
  // 조작 Provider 밖이면 안 그림 (데스크톱 구석 패널과 같음)
  if (!row.ctx) return null

  return (
    <div className="flex w-full flex-wrap items-center gap-x-2 px-2 py-1 [container-type:inline-size]" data-ingame-action-row="">
      <div className="flex min-w-0 items-center gap-[clamp(0.35rem,1.1vw,0.65rem)]" aria-label="투표·행동">
        {row.cornerActions.map((entry) => (
          <ImageButton key={entry.kind} {...entry} />
        ))}
      </div>
      {row.phaseActions.length > 0 ? (
        <div className="ml-auto flex flex-wrap justify-end gap-2" aria-label="단계 행동">
          {row.phaseActions.map((entry) => (
            <PhaseButton key={entry.action} {...entry} />
          ))}
        </div>
      ) : null}
      <VoteStatusPanel open={row.voteStatusOpen} onClose={row.closeVoteStatus} nameOf={row.nameOf} />
    </div>
  )
}
