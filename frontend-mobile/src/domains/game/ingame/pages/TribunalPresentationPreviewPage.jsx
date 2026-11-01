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

// 다시 보기 버튼: 데스크톱 모양 (아래 가운데는 폰에서 채팅 입력칸 자리라 오른쪽 위로)
const REPLAY_BTN_CLASS =
    "fixed right-3 top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-[60] min-h-11 cursor-pointer rounded border border-[#6b4321] bg-[#e2c78f] px-5 py-2 font-subheading text-sm font-bold text-[#3a1a0c] shadow-[0_4px_14px_rgba(0,0,0,0.45)] transition active:bg-[#f0dcae]"

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

    // 채팅 줄이 명단 색을 읽어서 명단 컨텍스트로 감쌈, 연출·다시 보기 버튼은 body로 꺼냄 (판정 버튼은 데스크톱처럼 없음)
    return (
        <div className="relative h-full w-full overflow-hidden bg-black">
            <PublicAsset src={INGAME_ASSETS.bg} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />
            <InGamePlayerSessionProvider>
                {createPortal(
                    <>
                        <TribunalOverlay
                            key={replayKey}
                            defendant={defendant}
                            showVoteButtons
                            voteButtonsEnabled
                            onVoteGuilty={() => {}}
                            onVoteNotGuilty={() => {}}
                            chatProps={chatProps}
                        />
                        <button type="button" className={REPLAY_BTN_CLASS} onClick={replay}>
                            다시 보기
                        </button>
                    </>,
                    document.body,
                )}
            </InGamePlayerSessionProvider>
        </div>
    )
}
