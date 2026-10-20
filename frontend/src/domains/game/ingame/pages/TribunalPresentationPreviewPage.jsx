/**
 * dev 전용 — 최후의 반론 연출 프리뷰 (/dev/tribunal-presentation)
 */
import { useCallback, useMemo, useState } from "react"
import { InGamePlayerSessionProvider } from "../components/InGamePlayerSessionProvider.jsx"
import InGameBackground from "../components/InGameBackground.jsx"
import InGameTribunalPresentationOverlay from "../components/tribunalPresentation/InGameTribunalPresentationOverlay.jsx"
import {
  buildTribunalPresentationPreviewChatMessages,
  buildTribunalPresentationPreviewDefendant,
} from "../constants/tribunalPresentation/tribunalPresentationPreviewFixture.js"

const PREVIEW_REPLAY_BTN_CLASS =
  "absolute bottom-[clamp(0.85rem,3vh,1.25rem)] left-1/2 z-[60] -translate-x-1/2 cursor-pointer rounded border border-[#6b4321] bg-[#e2c78f] px-5 py-2 font-subheading text-sm font-bold text-[#3a1a0c] shadow-[0_4px_14px_rgba(0,0,0,0.45)] transition hover:bg-[#f0dcae]"

export default function TribunalPresentationPreviewPage() {
  const [replayKey, setReplayKey] = useState(0)
  const [draft, setDraft] = useState("")
  const [previewMessages, setPreviewMessages] = useState(() =>
    buildTribunalPresentationPreviewChatMessages(),
  )
  const defendant = useMemo(() => buildTribunalPresentationPreviewDefendant(), [replayKey])

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

  const replay = useCallback(() => {
    setDraft("")
    setPreviewMessages(buildTribunalPresentationPreviewChatMessages())
    setReplayKey((current) => current + 1)
  }, [])

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

      <button type="button" className={PREVIEW_REPLAY_BTN_CLASS} onClick={replay}>
        다시 보기
      </button>
    </div>
  )
}
