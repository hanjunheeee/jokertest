// 재판 연출 미리 보기 화면: 가짜 피고·채팅으로 재판 연출만 띄워 봄 (서버 안 씀)
// 개발 모드 경로 /dev/tribunal-presentation에서만 열림 (app/routes/index.jsx)
import { useCallback, useMemo, useState } from "react"
import { InGamePlayerSessionProvider } from "../components/InGamePlayerSessionProvider.jsx"
import InGameBackground from "../components/InGameBackground.jsx"
import InGameTribunalPresentationOverlay from "../components/tribunalPresentation/InGameTribunalPresentationOverlay.jsx"
import {
  buildPreviewChatMsgs,
  buildPreviewDefendant,
} from "../constants/tribunalPresentation/tribunalPresentationPreviewFixture.js"

// 다시 보기 버튼 모양
const REPLAY_BTN_CLASS =
  "absolute bottom-[clamp(0.85rem,3vh,1.25rem)] left-1/2 z-[60] -translate-x-1/2 cursor-pointer rounded border border-[#6b4321] bg-[#e2c78f] px-5 py-2 font-subheading text-sm font-bold text-[#3a1a0c] shadow-[0_4px_14px_rgba(0,0,0,0.45)] transition hover:bg-[#f0dcae]"

// 채팅은 이 화면 상태로만 흉내, 투표 버튼은 눌러도 아무 일 없음
export default function TribunalPresentationPreviewPage() {
  const [replayKey, setReplayKey] = useState(0)
  const [draft, setDraft] = useState("")
  const [previewMessages, setPreviewMessages] = useState(() =>
    buildPreviewChatMsgs(),
  )
  // 다시 보기마다 피고 새로 만듦
  const defendant = useMemo(() => buildPreviewDefendant(), [replayKey])

  // 보내기는 화면 목록 뒤에 붙이기만 함 (빈 글은 무시)
  const chatProps = useMemo(
    () => ({
      draft,
      messages: previewMessages,
      onDraftChange: setDraft,
      onSend: () => {
        const text = draft.trim()
        if (!text) return
        setPreviewMessages((current) => [
          ...current,
          {
            id: `tribunal-preview-local-${Date.now()}`,
            playerId: "player-slot-1",
            senderName: "플레이어 1",
            text,
            sentAt: Date.now(),
          },
        ])
        setDraft("")
      },
      status: null,
      error: null,
      truncateDraftOnInput: false,
    }),
    [draft, previewMessages],
  )

  // 다시 보기: 입력·채팅 처음으로, key를 바꿔 연출을 처음부터
  const replay = useCallback(() => {
    setDraft("")
    setPreviewMessages(buildPreviewChatMsgs())
    setReplayKey((current) => current + 1)
  }, [])

  // 배경 위에 흐린 판 자리·재판 연출·다시 보기 버튼
  // 채팅 줄이 명단 색을 읽어서 명단 컨텍스트로 감쌈
  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <InGameBackground />
      <div className="pointer-events-none absolute inset-0 opacity-35" aria-hidden="true">
        <div className="absolute inset-x-[8%] top-[12%] h-[12%] rounded bg-white/10" />
        <div className="absolute inset-x-[10%] bottom-[18%] h-[22%] rounded bg-white/8" />
      </div>

      <InGamePlayerSessionProvider>
        <InGameTribunalPresentationOverlay
          key={replayKey}
          open
          defendant={defendant}
          showVoteButtons
          voteButtonsEnabled
          onVoteGuilty={() => {}}
          onVoteNotGuilty={() => {}}
          chatProps={chatProps}
        />
      </InGamePlayerSessionProvider>

      <button type="button" className={REPLAY_BTN_CLASS} onClick={replay}>
        다시 보기
      </button>
    </div>
  )
}
