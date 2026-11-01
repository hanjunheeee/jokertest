// 카드 시트 머리: 작은 카드·이름·상태·계정 전적 (판수 | 승률)
// CardSheet가 씀 (전적 글은 데스크톱 전적 목록과 같은 함수)
import { formatPlayerRecordStats } from "@/domains/game/ingame/constants/controls/playerRecordList/ingamePlayerRecordListData.js"
import { INGAME_PLAYER_STATUS } from "@/domains/game/shared/constants/ingamePlayerStatus.js"
import PlayerCard from "./PlayerCard.jsx"

const STATUS_LABELS = {
    [INGAME_PLAYER_STATUS.ALIVE]: "생존",
    [INGAME_PLAYER_STATUS.DEAD]: "사망",
    [INGAME_PLAYER_STATUS.DISCONNECTED]: "연결 끊김",
}

// 플레이어 없으면 안 그림
export default function PlayerSummary({ player, isSelf }) {
    if (!player) return null
    const record = formatPlayerRecordStats({ totalGames: player.accountTotalGames, winRate: player.accountWinRate })

    return (
        <div className="flex items-center gap-3">
            <PlayerCard
                portraitSrc={player.portraitSrc}
                frameSrc={player.frameSrc}
                status={player.status}
                theme={player.theme}
                isSelf={isSelf}
                withE2e={false}
                className="w-16 shrink-0"
            />
            <dl className="grid min-w-0 flex-1 grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-[#3d1810]">
                <dt className="font-bold">상태</dt>
                <dd className="truncate">{STATUS_LABELS[player.status] ?? "-"}{isSelf ? " · 나" : ""}</dd>
                <dt className="font-bold">전적</dt>
                <dd className="truncate" data-card-sheet-record>{record}</dd>
            </dl>
        </div>
    )
}
