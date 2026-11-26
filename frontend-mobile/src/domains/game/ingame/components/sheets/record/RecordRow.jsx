// 전적 목록 한 줄: 프로필 그림·이름·판 수와 승률, 오른쪽 끝 덧붙임(신고 버튼) 자리
// RecordSheet가 씀, 양피지 시트 위 대비 4.5 이상을 위해 이름에 테마 띠·전적 글에 짙은 갈색 적용
import { formatPlayerRecordStats } from "@/domains/game/ingame/constants/controls/playerRecordList/ingamePlayerRecordListData.js"
import { useInGamePlayerSessionContext } from "@/domains/game/ingame/components/InGamePlayerSessionContext.js"
import { CHAT_NAME_BAND_CLASS, resolveChatNameBand } from "@/domains/game/ingame/utils/chatNameBand.js"
import Portrait from "../parts/Portrait.jsx"

// 이름 색은 플레이어 세션 문맥에서 받아 띠로 감쌈 (id 없으면 짙은 갈색 기본색)
export default function RecordRow({ playerId = null, name, totalGames, winRate, profilePhotoSrc, profileBorderSrc, trailing = null }) {
  const { getThemeStylesByPlayerId } = useInGamePlayerSessionContext()
  const themeStyles = playerId ? getThemeStylesByPlayerId(playerId) : null
  const nameBand = resolveChatNameBand(themeStyles, true)

  return (
    <li className="flex min-h-[4rem] min-w-0 items-center gap-3 border-b border-[#3a2818]/70 py-2 last:border-b-0">
      <Portrait photoSrc={profilePhotoSrc} frameSrc={profileBorderSrc} className="h-[3.25rem] w-[3.25rem]" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="min-w-0 truncate font-display app-text-scaled [--app-text-size:1.05rem] font-semibold leading-tight text-[#2c1d11] antialiased">
          {nameBand ? (
            <span className={CHAT_NAME_BAND_CLASS} style={nameBand.style} data-record-name-band={nameBand.kind}>
              {name}
            </span>
          ) : name}
        </p>
        <p
          className="min-w-0 truncate font-subheading app-text-scaled [--app-text-size:0.88rem] font-bold leading-none tabular-nums text-[#2c1d11]"
          data-testid={playerId ? `player-record-stats-${playerId}` : undefined}
        >
          {formatPlayerRecordStats({ totalGames, winRate })}
        </p>
      </div>
      {trailing}
    </li>
  )
}
