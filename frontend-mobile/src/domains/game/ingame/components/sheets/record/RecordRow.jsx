// 전적 목록 한 줄: 프로필 그림·이름·판 수와 승률
// RecordSheet가 씀, 전적 글·이름 색은 데스크톱 PlayerRecordListRow와 같은 규칙
import { formatPlayerRecordStats } from "@/domains/game/ingame/constants/controls/playerRecordList/ingamePlayerRecordListData.js"
import { useInGamePlayerSessionContext } from "@/domains/game/ingame/components/InGamePlayerSessionContext.js"
import { THEME_TEXT_RENDER_CLASS } from "@/shared/constants/ingamePlayerTheme.js"
import Portrait from "../parts/Portrait.jsx"

// 이름 색은 플레이어 세션 문맥에서 받음 (id 없으면 기본색)
export default function RecordRow({ playerId = null, name, totalGames, winRate, profilePhotoSrc, profileBorderSrc }) {
  const { getThemeStylesByPlayerId } = useInGamePlayerSessionContext()
  const themeStyles = playerId ? getThemeStylesByPlayerId(playerId) : null

  // 전적 글은 formatPlayerRecordStats가 만듦 (숫자 없으면 조회 실패)
  return (
    <li className="flex min-h-[4rem] min-w-0 items-center gap-3 border-b border-[#3a2818]/70 py-2 last:border-b-0">
      <Portrait photoSrc={profilePhotoSrc} frameSrc={profileBorderSrc} className="h-[3.25rem] w-[3.25rem]" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p
          className={`min-w-0 truncate font-display app-text-scaled [--app-text-size:1.05rem] font-medium leading-tight text-white antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.85)] ${themeStyles ? THEME_TEXT_RENDER_CLASS : ""}`}
          style={themeStyles ? { color: themeStyles.color } : undefined}
        >
          {name}
        </p>
        <p
          className="min-w-0 truncate font-subheading app-text-scaled [--app-text-size:0.88rem] font-bold leading-none tabular-nums text-white/55"
          data-testid={playerId ? `player-record-stats-${playerId}` : undefined}
        >
          {formatPlayerRecordStats({ totalGames, winRate })}
        </p>
      </div>
    </li>
  )
}
