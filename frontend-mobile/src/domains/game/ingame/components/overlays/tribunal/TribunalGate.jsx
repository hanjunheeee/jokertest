// 재판 연출 문지기: 폰 가로·태블릿은 전면 연출, 세로 카톡형은 TalkLayout 시트로 분리
// OverlayLayer가 씀
import { useContext } from "react"
import { InGameChatSessionContext } from "@/domains/game/ingame/components/chat/InGameChatSessionContext.js"
import { useWideChat } from "@m/domains/game/ingame/hooks/chat/useWideChat.js"
import { useTribunalPresentation } from "@m/domains/game/ingame/hooks/overlays/useTribunalPresentation.js"
import TribunalOverlay from "./TribunalOverlay.jsx"

export default function TribunalGate() {
    const wide = useWideChat()
    const chatProps = useContext(InGameChatSessionContext)
    const model = useTribunalPresentation()

    if (!wide || !model.active || !model.defendant) return null

    return (
        <TribunalOverlay
            defendant={model.defendant}
            showVoteButtons={model.showVoteButtons}
            noticeText={model.noticeText}
            voteButtonsEnabled={model.voteButtonsEnabled}
            voteSubmitting={model.voteSubmitting}
            onVoteGuilty={model.onVoteGuilty}
            onVoteNotGuilty={model.onVoteNotGuilty}
            chatProps={chatProps}
            devResolveLabel={model.devResolveLabel}
            devResolveEnabled={model.devResolveEnabled}
            onDevResolve={model.onDevResolve}
        />
    )
}
