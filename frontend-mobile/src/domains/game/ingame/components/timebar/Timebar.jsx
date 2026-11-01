// 인게임 진행 바 (모바일): 날짜·단계 노드 틀, 펼치면 단계 머리 + 타이머 게이지·MM:SS
// InGamePage가 씀, props 없이 데스크톱 스토어·timebar utils로 값 읽음 (단계 버튼은 ActionRow로 옮김)
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { INGAME_TIMEBAR_ASSETS } from "@/domains/game/ingame/constants/timebar/ingameTimebarAssets.js"
import { useTimebar } from "../../hooks/timebar/useTimebar.js"
import TimebarTrack from "./TimebarTrack.jsx"
import PhaseHeader from "./PhaseHeader.jsx"
import ExpandedTimer from "./ExpandedTimer.jsx"
import ExpandButton from "./ExpandButton.jsx"

// 데스크톱 상수가 칸 폭 기준 크기(cqi)를 쓰므로 inline-size 컨테이너로 감쌈
export default function Timebar() {
  const bar = useTimebar()
  const dayLabel = `제 ${bar.day}일`
  // 데스크톱과 같이 상태 글이 있을 때만 단계 머리·타이머를 그림
  const showTimer = bar.expanded && Boolean(bar.statusLabel)

  return (
    <div
      className={`mx-auto w-full max-w-[30rem] px-1 pt-3 [container-type:inline-size] land:max-w-[22rem] ${showTimer ? "pb-0.5" : ""}`}
      aria-label={`${dayLabel} 시간 흐름`}
      data-ingame-timebar=""
    >
      <div className="relative w-full leading-none">
        {showTimer ? <PhaseHeader label={bar.statusLabel} /> : null}
        {showTimer ? (
          <ExpandedTimer remainingRatio={bar.remainingRatio} remainingSec={bar.remainingSec} />
        ) : null}

        <PublicAsset
          src={bar.expanded ? INGAME_TIMEBAR_ASSETS.frameExpanded : INGAME_TIMEBAR_ASSETS.frame}
          alt=""
          aria-hidden="true"
          className="block h-auto w-full select-none"
        />

        <TimebarTrack dayLabel={dayLabel} activePhaseId={bar.activePhaseId} expanded={bar.expanded} />
        <ExpandButton expanded={bar.expanded} onToggle={bar.toggleExpanded} />
      </div>
    </div>
  )
}
