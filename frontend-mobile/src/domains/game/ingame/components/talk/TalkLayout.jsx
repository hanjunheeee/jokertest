// 카톡형 화면 (폰 세로 전용): 위 줄 → 진행 바(명패+시간패널) → 채팅방 → 행동 줄, 입력칸은 화면 바닥 자리
// InGamePage가 폰 세로(useWideChat 거짓)일 때만 씀, 폰 가로·태블릿은 지금 배치 그대로
import { useCallback, useState } from "react"
import { useKeyboardInset } from "@m/domains/game/ingame/hooks/chat/useKeyboardInset.js"
import { useCardSheet } from "@m/domains/game/ingame/hooks/board/useCardSheet.js"
import { selectOverlayOpen, useOverlayBridge } from "@m/domains/game/ingame/hooks/overlays/overlayBridge.js"
import PlayerRosterSheet from "@m/domains/game/ingame/components/roster/PlayerRosterSheet.jsx"
import ShellBottom from "@m/shared/ui/ShellBottom.jsx"
import { useInGameChatSessionContext } from "@/domains/game/ingame/components/chat/InGameChatSessionContext.js"
import ActionRow from "@m/domains/game/ingame/components/actions/ActionRow.jsx"
import Composer from "@m/domains/game/ingame/components/chat/Composer.jsx"
import TopBar from "@m/domains/game/ingame/components/shell/TopBar.jsx"
import Timebar from "@m/domains/game/ingame/components/timebar/Timebar.jsx"
import TribunalSheet from "@m/domains/game/ingame/components/overlays/tribunal/TribunalSheet.jsx"
import TribunalTalkPresentation from "@m/domains/game/ingame/components/overlays/tribunal/TribunalTalkPresentation.jsx"
import { useTribunalPresentation } from "@m/domains/game/ingame/hooks/overlays/useTribunalPresentation.js"
import TalkList from "./TalkList.jsx"

const SLOT_CLASS = "relative min-w-0 shrink-0"

// 카톡형 내 시트(참가자 목록·최후의 변론)와 고발 연출 열림 상태 관리 (전면 연출 시 시트 닫음)
function useTalkSheets(tribunal, overlayOpen) {
    const [rosterOpen, setRosterOpen] = useState(false)
    const [tribunalDismissed, setTribunalDismissed] = useState(false)
    const [tribunalSheetOpen, setTribunalSheetOpen] = useState(false)
    const tribunalKey = `${tribunal.active}:${tribunal.defendant?.id ?? null}`
    const [seenTribunalKey, setSeenTribunalKey] = useState(tribunalKey)

    if (seenTribunalKey !== tribunalKey) {
        setSeenTribunalKey(tribunalKey)
        setTribunalDismissed(false)
        setTribunalSheetOpen(false)
    }

    const tribunalOverlayOpen = tribunal.active && !tribunalDismissed
    if ((overlayOpen || tribunalOverlayOpen) && rosterOpen) setRosterOpen(false)
    if (overlayOpen && tribunalSheetOpen) setTribunalSheetOpen(false)

    const dismissTribunalOverlay = useCallback(() => setTribunalDismissed(true), [])
    const openRoster = useCallback(() => setRosterOpen(true), [])
    const closeRoster = useCallback(() => setRosterOpen(false), [])
    const openTribunalSheet = useCallback(() => setTribunalSheetOpen(true), [])
    const closeTribunalSheet = useCallback(() => setTribunalSheetOpen(false), [])

    return {
        rosterOpen,
        openRoster,
        closeRoster,
        tribunalDismissed,
        tribunalOverlayOpen,
        dismissTribunalOverlay,
        tribunalSheetOpen,
        openTribunalSheet,
        closeTribunalSheet,
    }
}

// page: useInGamePage 값, compactTyping: 낮은 화면에서 입력 중이면 진행 바 접어 채팅방 자리 냄
export default function TalkLayout({ page, compactTyping, locked }) {
    const session = useInGameChatSessionContext()
    const tribunal = useTribunalPresentation()
    const overlayOpen = useOverlayBridge(selectOverlayOpen)
    const { sidePanel } = page
    const keyboardInset = useKeyboardInset()
    const cardSheet = useCardSheet()
    const sheets = useTalkSheets(tribunal, overlayOpen)
    const composerLocked = locked || sheets.tribunalOverlayOpen

    return (
        <div
            className={`relative z-10 flex h-full min-h-0 w-full flex-col ${locked ? "pointer-events-none" : ""}`.trim()}
            inert={locked || undefined}
            data-talk-layout=""
        >
            <div className={`${SLOT_CLASS} px-1.5`} data-slot="top">
                <TopBar
                    onRecords={sidePanel.openRecords}
                    onSettings={sidePanel.openSettings}
                    onRoleReveal={page.reopenRoleReveal}
                    roleRevealAvailable={page.roleRevealAvailable && Boolean(page.reopenRoleReveal)}
                />
            </div>
            <div className={`${SLOT_CLASS} px-0.5 ${compactTyping ? "hidden" : ""}`} data-slot="timebar">
                <Timebar />
            </div>
            <div
                className={`relative flex min-h-0 min-w-0 flex-1 flex-col overflow-visible px-0.5 pt-0.5 ${sheets.tribunalOverlayOpen ? "pointer-events-none" : ""}`.trim()}
                style={keyboardInset > 0 ? { paddingBottom: keyboardInset } : undefined}
                data-slot="chat"
                inert={sheets.tribunalOverlayOpen || undefined}
            >
                <TalkList
                    onPlayerRoster={sheets.openRoster}
                    onTribunalOpen={tribunal.active && sheets.tribunalDismissed ? sheets.openTribunalSheet : null}
                />
            </div>
            <div className={`${SLOT_CLASS} px-1.5 pb-1`} data-slot="actions">
                <ActionRow />
            </div>
            <PlayerRosterSheet
                open={sheets.rosterOpen}
                onClose={sheets.closeRoster}
                getItems={cardSheet.getItems}
                rosterSelect={cardSheet.rosterSelect}
            />
            <ShellBottom>
                <div className="relative z-10 px-0.5">
                    <Composer
                        variant="talk"
                        draft={session.draft}
                        onDraftChange={session.onDraftChange}
                        onSend={session.onSend}
                        locked={composerLocked}
                    />
                </div>
            </ShellBottom>
            <TribunalTalkPresentation
                open={sheets.tribunalOverlayOpen}
                onDismiss={sheets.dismissTribunalOverlay}
                defendant={tribunal.defendant}
            />
            <TribunalSheet
                open={sheets.tribunalSheetOpen && tribunal.active}
                onClose={sheets.closeTribunalSheet}
                defendant={tribunal.defendant}
                showVoteButtons={tribunal.showVoteButtons}
                noticeText={tribunal.noticeText}
                voteErrorText={tribunal.voteErrorText}
                voteButtonsEnabled={tribunal.voteButtonsEnabled}
                voteSubmitting={tribunal.voteSubmitting}
                onVoteGuilty={tribunal.onVoteGuilty}
                onVoteNotGuilty={tribunal.onVoteNotGuilty}
            />
        </div>
    )
}