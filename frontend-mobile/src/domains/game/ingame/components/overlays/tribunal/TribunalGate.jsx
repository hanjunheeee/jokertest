// 재판 연출 문지기: 폰 가로·태블릿은 전면 연출, 세로 카톡형은 TalkLayout 시트로 분리, 표 거절 까닭 글도 띄움
// OverlayLayer가 씀, 값은 useTribunalPresentation (판정은 서버가 5초 뒤 함)
import { useContext } from "react"
import { InGameChatSessionContext } from "@/domains/game/ingame/components/chat/InGameChatSessionContext.js"
import { NOTICE_CLASS } from "@/domains/game/ingame/constants/tribunalPresentation/ingameTribunalPresentationLayout.js"
import { useWideChat } from "@m/domains/game/ingame/hooks/chat/useWideChat.js"
import { useTribunalPresentation } from "@m/domains/game/ingame/hooks/overlays/useTribunalPresentation.js"
import TribunalOverlay from "./TribunalOverlay.jsx"

// 거절 까닭 글 자리: 연출 창(z-67) 위 맨 위 가운데(노치 피함), 단추는 그대로 눌리게 클릭은 통과
const VOTE_ERROR_WRAP_CLASS = "pointer-events-none fixed inset-x-0 top-0 z-[68] flex justify-center px-4 safe-pt"
const VOTE_ERROR_TEXT_CLASS = `${NOTICE_CLASS} mt-3 max-w-full rounded-md bg-black/70 px-4 py-2`

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
                <div className={VOTE_ERROR_WRAP_CLASS}>
                    <p role="alert" className={VOTE_ERROR_TEXT_CLASS} data-ingame-tribunal-vote-error="">
                        {model.voteErrorText}
                    </p>
                </div>
            ) : null}
        </>
    )
}
