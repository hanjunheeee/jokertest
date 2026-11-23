// 세로 카톡형: 플레이어 목록·직업 행동(밤) — PC 플레이어 카드 탭 메뉴와 같은 항목
// TalkLayout이 씀, getItems는 useCardSheet가 만듦
import { useContext, useMemo } from "react"
import { InGameActionContext } from "@/domains/game/ingame/context/InGameActionContext.jsx"
import { INGAME_DAY_PHASES } from "@/domains/game/ingame/utils/dayPhase.js"
import { useInGamePlayerSessionContext } from "@/domains/game/ingame/components/InGamePlayerSessionContext.js"
import Sheet from "@m/domains/game/ingame/components/sheets/frame/Sheet.jsx"
import RosterRow from "./RosterRow.jsx"

const NIGHT_ROSTER_TITLE = "직업행동"

function rosterSubtitle(ctx) {
    const phase = ctx?.gameState?.phase
    if (ctx?.isNightTurnActor) {
        return "대상을 고르세요."
    }
    if (phase === "DAY" && ctx?.dayPhase === INGAME_DAY_PHASES.VOTE) {
        return "투표할 플레이어를 고르세요."
    }
    if (phase === "TRIBUNAL") {
        return "재판 행동 대상입니다."
    }
    return "현재 참가자 목록입니다."
}

function rosterTitle(ctx) {
    if (ctx?.isNightTurnActor) return NIGHT_ROSTER_TITLE
    return "플레이어 목록"
}

export default function PlayerRosterSheet({ open, onClose, getItems, rosterSelect }) {
    const { players, localPlayerId } = useInGamePlayerSessionContext()
    const ctx = useContext(InGameActionContext)
    const title = useMemo(() => rosterTitle(ctx), [ctx])
    const subtitle = useMemo(() => rosterSubtitle(ctx), [ctx])

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title={title}
            subtitle={subtitle}
            ariaLabel="플레이어 목록"
            closeLabel="플레이어 목록 닫기"
            testId="player-roster-sheet"
            layer="base"
        >
            <ul aria-label="참가자 목록" className="flex flex-col">
                {players.map((player, index) => (
                    <RosterRow
                        key={player.id}
                        player={player}
                        index={index}
                        items={getItems(player.id)}
                        localPlayerId={localPlayerId}
                        rosterSelect={rosterSelect}
                    />
                ))}
            </ul>
        </Sheet>
    )
}