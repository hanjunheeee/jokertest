// 인게임 행동 줄 (모바일): 안내 한 줄 + 투표 현황·준비·기권/투표취소·집계·재판 투표/판정·건너뛰기/취소·밤 종료
// InGamePage가 씀, props 없이 데스크톱 행동 컨텍스트(InGameActionContext)로 값 읽음
import { useActionRow } from "../../hooks/actions/useActionRow.js"
import ActionButton from "./ActionButton.jsx"
import ActionMessage from "./ActionMessage.jsx"
import VoteStatusSheet from "./VoteStatusSheet.jsx"

// 대상 고르기는 카드 메뉴(보드)가 맡고, 여기선 단계 버튼과 상태만 보여 줌
export default function ActionRow() {
  const row = useActionRow()
  // 조작 Provider 밖이면 안 그림 (데스크톱 구석 패널과 같음)
  if (!row.ctx) return null

  return (
    <div className="flex w-full flex-col gap-1 px-2 py-1" aria-label="투표·행동" data-ingame-action-row="">
      <ActionMessage message={row.message} />
      <div className="flex w-full items-center gap-1.5">
        {row.actions.map((entry) => (
          <ActionButton
            key={entry.action}
            action={entry.action}
            label={entry.label}
            enabled={entry.enabled}
            onClick={entry.onClick}
            tone={entry.tone}
          />
        ))}
      </div>
      <VoteStatusSheet open={row.voteStatusOpen} onClose={row.closeVoteStatus} nameOf={row.nameOf} />
    </div>
  )
}
