// 재판 연출 문지기: 폰 가로·태블릿은 전면 연출 + 표 거절 알림, 세로 카톡형은 TalkLayout 시트로 분리
// OverlayLayer가 씀
import { useContext } from "react"
import { InGameChatSessionContext } from "@/domains/game/ingame/components/chat/InGameChatSessionContext.js"
import { useWideChat } from "@m/domains/game/ingame/hooks/chat/useWideChat.js"
import { useTribunalPresentation } from "@m/domains/game/ingame/hooks/overlays/useTribunalPresentation.js"
import TribunalOverlay from "./TribunalOverlay.jsx"

const ERROR_WRAP_CLASS =
    "pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top,0px)+0.5rem)] z-[68] flex justify-center px-3"
const ERROR_TEXT_CLASS =
    "rounded-md border border-white/25 bg-black/85 px-3 py-1.5 text-center font-subheading text-[0.85rem] font-bold leading-snug text-white"

// 넓은 배치에서만 전면 재판 창과 표 거절 배너 표시
export default function TribunalGate() {
    const wide = useWideChat()
    const chatProps = useContext(InGameChatSessionContext)
    const model = useTribunalPresentation()

    if (!wide || !model.active || !model.defendant) return null

    return (
        <>
            <TribunalOverlay
                defendant={model.defendant}
                showVoteButtons={model.showVoteButtons}
                noticeText={model.noticeText}
                voteButtonsEnabled={model.voteButtonsEnabled}
                voteSubmitting={model.voteSubmitting}
                onVoteGuilty={model.onVoteGuilty}
                onVoteNotGuilty={model.onVoteNotGuilty}
                chatProps={chatProps}
            />
            {model.voteErrorText ? (
                <div className={ERROR_WRAP_CLASS}>
                    <p role="alert" className={ERROR_TEXT_CLASS} data-ingame-tribunal-vote-error="">
                        {model.voteErrorText}
                    </p>
                </div>
            ) : null}
        </>
    )
}
