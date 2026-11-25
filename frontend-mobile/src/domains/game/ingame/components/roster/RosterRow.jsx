// 플레이어 목록 한 줄: 초상·닉네임·상태, 행동 가능하면 카드 메뉴와 같은 버튼
import { useContext } from "react"
import { InGameActionContext } from "@/domains/game/ingame/context/InGameActionContext.jsx"
import { INGAME_PLAYER_STATUS } from "@/domains/game/shared/constants/ingamePlayerStatus.js"
import { THEME_TEXT_RENDER_CLASS } from "@/shared/constants/ingamePlayerTheme.js"
import { useInGamePlayerSessionContext } from "@/domains/game/ingame/components/InGamePlayerSessionContext.js"
import { resolvePlayerRecordListProfileAssets } from "@/domains/game/ingame/constants/controls/playerRecordList/ingamePlayerRecordListData.js"
import { isInGameSelfPlayer } from "@/domains/game/ingame/utils/isInGameSelfPlayer.js"
import MenuButton from "@m/domains/game/ingame/components/board/MenuButton.jsx"
import { INGAME_CARD_MENU_ITEM_KINDS as KINDS } from "@/domains/game/ingame/constants/board/playerCardMenu.js"
import Portrait from "@m/domains/game/ingame/components/sheets/parts/Portrait.jsx"

const ROW_CLASS =
    "list-none border-b border-[#3a2818]/60 py-2.5 last:border-b-0"

const HIGHLIGHT_CLASS = "rounded-sm bg-[#f3dcb0]/15 ring-1 ring-[#b08a4a]/50"

const CANCEL_TONE_KINDS = new Set([KINDS.DAY_VOTE_CANCEL, KINDS.NIGHT_ACTION_CANCEL, KINDS.TRIBUNAL_GUILTY])

const STATUS_LABEL = {
    [INGAME_PLAYER_STATUS.DEAD]: "사망",
    [INGAME_PLAYER_STATUS.DISCONNECTED]: "연결 끊김",
}

export default function RosterRow({ player, index, items, localPlayerId, rosterSelect }) {
    const actionCtx = useContext(InGameActionContext)
    const { getThemeStylesByPlayerId } = useInGamePlayerSessionContext()
    const profile = resolvePlayerRecordListProfileAssets(player, index)
    const themeStyles = getThemeStylesByPlayerId(player.id)
    const isSelf = isInGameSelfPlayer(player.id, localPlayerId)
    const visibleItems = items.filter((item) => item.visible !== false)
    const highlight =
        player.id === actionCtx?.selectedDayVoteTargetId
        || player.id === actionCtx?.selectedNightTargetId
    const statusLabel = STATUS_LABEL[player.status] ?? null
    const disabledHints = [...new Set(
        visibleItems.filter((item) => !item.enabled && item.disabledReason).map((item) => item.disabledReason),
    )]

    return (
        <li className={`${ROW_CLASS} ${highlight ? HIGHLIGHT_CLASS : ""}`.trim()} data-roster-player={player.id}>
            <div className="flex min-w-0 items-center gap-2">
                <Portrait photoSrc={profile.profilePhotoSrc} frameSrc={profile.profileBorderSrc} className="h-11 w-11 shrink-0" />
                <div className="min-w-0 flex-1">
                    <p
                        className={`truncate font-display text-[1rem] font-medium leading-tight text-white antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.85)] ${themeStyles ? THEME_TEXT_RENDER_CLASS : ""}`}
                        style={themeStyles ? { color: themeStyles.color } : undefined}
                    >
                        {player.nickname}
                        {isSelf ? " (나)" : ""}
                    </p>
                    {statusLabel ? (
                        <p className="mt-0.5 text-[0.72rem] font-semibold text-[#c8a878]">{statusLabel}</p>
                    ) : null}
                </div>
                {visibleItems.length > 0 ? (
                    <div
                        className="ml-1 flex shrink-0 flex-col items-end justify-center gap-1"
                        role="group"
                        aria-label={`${player.nickname} 행동`}
                    >
                        {visibleItems.map((item) => (
                            <MenuButton
                                key={item.kind}
                                kind={item.kind}
                                size="compact"
                                showDisabledReason={false}
                                label={item.label}
                                tone={CANCEL_TONE_KINDS.has(item.kind) ? "cancel" : "confirm"}
                                disabled={!item.enabled}
                                disabledReason={item.disabledReason}
                                onClick={() => {
                                    if (!item.enabled) return
                                    rosterSelect?.(player.id, item.kind)
                                }}
                            />
                        ))}
                    </div>
                ) : null}
            </div>
            {disabledHints.length > 0 ? (
                <p className="mt-1 text-right text-[0.8rem] font-bold leading-snug text-[#5b3a2a]">{disabledHints[0]}</p>
            ) : null}
        </li>
    )
}