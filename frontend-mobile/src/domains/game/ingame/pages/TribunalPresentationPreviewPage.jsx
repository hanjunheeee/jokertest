// 재판 연출 미리보기 화면: 가짜 피고·채팅으로 모바일 재판 연출만 띄워 봄 (서버 안 씀)
// app/routes/index.jsx가 개발 모드 /dev/tribunal-presentation에서만 씀
import { useCallback, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { InGamePlayerSessionProvider } from "@/domains/game/ingame/components/InGamePlayerSessionProvider.jsx"
import {
    buildPreviewChatMsgs,
    buildPreviewDefendant,
} from "@/domains/game/ingame/constants/tribunalPresentation/tribunalPresentationPreviewFixture.js"
import { INGAME_ASSETS } from "@/domains/game/ingame/constants/ingameAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"
import TribunalOverlay from "../components/overlays/tribunal/TribunalOverlay.jsx"

// 채팅은 이 화면 상태로만 흉내, 투표 버튼은 눌러도 아무 일 없음
export default function TribunalPresentationPreviewPage() {
    const [replayKey, setReplayKey] = useState(0)
    const [draft, setDraft] = useState("")
    const [messages, setMessages] = useState(() => buildPreviewChatMsgs())
    // 다시 보기마다 피고 새로 만듦 (replayKey로 다시 계산)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const defendant = useMemo(() => buildPreviewDefendant(), [replayKey])

    // 보내기는 목록 뒤에 붙이기만 함 (빈 글은 무시)
    const chatProps = useMemo(() => ({
        draft,
        messages,
        onDraftChange: setDraft,
        onSend: () => {
            const text = draft.trim()
            if (!text) return
            setMessages((current) => [
                ...current,
                { id: `tribunal-preview-local-${Date.now()}`, playerId: "player-slot-1", senderName: "플레이어 1", text, sentAt: Date.now() },
            ])
            setDraft("")
        },
        status: null,
        error: null,
    }), [draft, messages])

    // 다시 보기: 입력·채팅 처음으로, key를 바꿔 연출을 처음부터
    const replay = useCallback(() => {
        setDraft("")
        setMessages(buildPreviewChatMsgs())
        setReplayKey((k) => k + 1)
    }, [])

    // 채팅 줄이 명단 색을 읽어서 명단 컨텍스트로 감쌈, 연출은 body로 꺼냄 (다시 보기는 판정 버튼 자리에 둠)
    return (
        <div className="relative h-full w-full overflow-hidden bg-black">
            <PublicAsset src={INGAME_ASSETS.bg} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />
            <InGamePlayerSessionProvider>
                {createPortal(
                    <TribunalOverlay
                        key={replayKey}
                        defendant={defendant}
                        showVoteButtons
                        voteButtonsEnabled
                        onVoteGuilty={() => {}}
                        onVoteNotGuilty={() => {}}
                        chatProps={chatProps}
                        devResolveLabel="다시 보기"
                        devResolveEnabled
                        onDevResolve={replay}
                    />,
                    document.body,
                )}
            </InGamePlayerSessionProvider>
        </div>
    )
}
