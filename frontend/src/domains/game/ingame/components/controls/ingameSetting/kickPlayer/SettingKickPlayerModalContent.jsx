/**
 * 플레이어 추방 모달 — 본문 (안내 + 스크롤 목록)
 */
import { useMemo, useRef, useState } from "react"
import { useAuthStore } from "@/domains/auth/store/auth.store.js"
import { getPlayerRecordListFallbackProfileAssets } from "@/domains/game/ingame/constants/controls/playerRecordList/ingamePlayerRecordListData.js"
import { INGAME_KICK_PLAYER_MODAL_COPY } from "@/domains/game/ingame/constants/controls/ingameSetting/kickPlayer/ingameKickPlayerData.js"
import {
  INGAME_KICK_PLAYER_MODAL_NOTICE_CLASS,
  INGAME_KICK_PLAYER_MODAL_SCROLL_CLASS,
  INGAME_KICK_PLAYER_MODAL_SCROLL_WRAP_CLASS,
  INGAME_KICK_PLAYER_MODAL_SUBTITLE_CLASS,
} from "@/domains/game/ingame/constants/controls/ingameSetting/kickPlayer/ingameKickPlayerLayout.js"
import { useInGamePlayerSessionContext } from "@/domains/game/ingame/components/InGamePlayerSessionContext.js"
import SettingKickPlayerRow from "./SettingKickPlayerRow.jsx"
import Scrollbar from "@/shared/ui/Scrollbar.jsx"

export default function SettingKickPlayerModalContent() {
  const scrollRef = useRef(null)
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const { players } = useInGamePlayerSessionContext()
  const [pendingKickIds, setPendingKickIds] = useState(() => new Set())

  const kickTargets = useMemo(
    () => players.filter((player) => player.id !== authUuid),
    [players, authUuid],
  )

  const handleKickToggle = (playerId) => {
    setPendingKickIds((prev) => {
      const next = new Set(prev)
      if (next.has(playerId)) {
        next.delete(playerId)
      } else {
        next.add(playerId)
      }
      return next
    })
  }

  return (
    <>
      <p className={INGAME_KICK_PLAYER_MODAL_SUBTITLE_CLASS}>
        {INGAME_KICK_PLAYER_MODAL_COPY.subtitle}
      </p>
      <p className={INGAME_KICK_PLAYER_MODAL_NOTICE_CLASS}>{INGAME_KICK_PLAYER_MODAL_COPY.notice}</p>

      <div className={INGAME_KICK_PLAYER_MODAL_SCROLL_WRAP_CLASS}>
        <ul
          ref={scrollRef}
          className={INGAME_KICK_PLAYER_MODAL_SCROLL_CLASS}
          aria-label={INGAME_KICK_PLAYER_MODAL_COPY.listAriaLabel}
        >
          {kickTargets.map((player, index) => {
            const { profilePhotoSrc, profileBorderSrc } =
              getPlayerRecordListFallbackProfileAssets(index)

            return (
              <SettingKickPlayerRow
                key={player.id}
                playerId={player.id}
                name={player.nickname}
                profilePhotoSrc={profilePhotoSrc}
                profileBorderSrc={profileBorderSrc}
                isPending={pendingKickIds.has(player.id)}
                onKick={() => handleKickToggle(player.id)}
              />
            )
          })}
        </ul>

        <Scrollbar scrollRef={scrollRef} />
      </div>
    </>
  )
}
