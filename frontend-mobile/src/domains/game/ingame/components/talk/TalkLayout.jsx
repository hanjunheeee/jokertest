// 카톡형 화면 (폰 세로 전용): 위 줄(버튼 + 단계 줄) → 펼친 진행 바 → 초상 띠 → 채팅방 → 행동 줄, 입력칸은 화면 바닥 자리
// InGamePage가 폰 세로(useWideChat 거짓)일 때만 씀, 폰 가로·태블릿은 지금 배치 그대로
import { useState } from "react"
import ShellBottom from "@m/shared/ui/ShellBottom.jsx"
import { useInGameChatSessionContext } from "@/domains/game/ingame/components/chat/InGameChatSessionContext.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import ActionRow from "@m/domains/game/ingame/components/actions/ActionRow.jsx"
import Composer from "@m/domains/game/ingame/components/chat/Composer.jsx"
import TopBar from "@m/domains/game/ingame/components/shell/TopBar.jsx"
import Timebar from "@m/domains/game/ingame/components/timebar/Timebar.jsx"
import PhaseLine from "./PhaseLine.jsx"
import PortraitStrip from "./PortraitStrip.jsx"
import TalkList from "./TalkList.jsx"

// 재판 연출이 떠 있는지 (ChatPanel과 같은 조건, 연출이 자기 채팅을 띄움)
function selectTribunalPresentationOpen(s) {
    const state = s.state
    return state?.phase === "TRIBUNAL"
        && Boolean(state?.tribunal?.defendantUuid)
        && state.tribunal.resolved !== true
}

const SLOT_CLASS = "relative min-w-0 shrink-0"

// page: useInGamePage 값, compactTyping: 낮은 화면에서 입력 중이면 띠·진행 바 접어 채팅방 자리 냄
export default function TalkLayout({ page, compactTyping, locked }) {
    const session = useInGameChatSessionContext()
    const tribunalOpen = useInGameStore(selectTribunalPresentationOpen)
    const [timebarOpen, setTimebarOpen] = useState(false)
    const [boardOpen, setBoardOpen] = useState(false)
    const { sidePanel } = page

    return (
        <div
            className={`relative flex h-full min-h-0 w-full flex-col ${locked ? "pointer-events-none" : ""}`.trim()}
            inert={locked || undefined}
            data-talk-layout=""
        >
            {/* 재판 연출이 위 줄·진행 바 높이를 재서 자리 잡음 → data-slot 이름 그대로 */}
            <div className={`${SLOT_CLASS} flex items-center gap-1 pr-2`} data-slot="top">
                <TopBar
                    onExit={page.requestExit}
                    onRecords={sidePanel.openRecords}
                    onSettings={sidePanel.openSettings}
                    onRoleReveal={page.reopenRoleReveal}
                    roleRevealAvailable={page.roleRevealAvailable && Boolean(page.reopenRoleReveal)}
                />
                <PhaseLine expanded={timebarOpen} onToggle={() => setTimebarOpen((open) => !open)} />
            </div>
            <div className={`${SLOT_CLASS} px-2 ${timebarOpen && !compactTyping ? "" : "hidden"}`} data-slot="timebar">
                {timebarOpen ? <Timebar /> : null}
            </div>
            <div className={`${SLOT_CLASS} ${compactTyping ? "hidden" : ""}`} data-slot="board">
                <PortraitStrip expanded={boardOpen} onToggle={() => setBoardOpen((open) => !open)} />
            </div>
            {/* 재판 중엔 숨기기만 함 → 그동안 생긴 처형 알림·이모티콘 기록이 안 날아감 (빼 버리면 다시 그릴 때 처음부터) */}
            <div className={`relative min-h-0 min-w-0 flex-1 flex-col px-1.5 pt-1 ${tribunalOpen ? "invisible flex" : "flex"}`} data-slot="chat">
                <TalkList />
            </div>
            <div className={`${SLOT_CLASS} px-1.5 pb-1`} data-slot="actions">
                <ActionRow />
            </div>
            {tribunalOpen ? null : (
                <ShellBottom>
                    <Composer draft={session.draft} onDraftChange={session.onDraftChange} onSend={session.onSend} />
                </ShellBottom>
            )}
        </div>
    )
}
