// 진행 바 단계 노드 하나: 단계 그림 + 지금 단계면 위 화살표·빛남
// 진행 바 단계 길(TimebarTrack)이 씀
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { INGAME_TIMEBAR_ASSETS } from "@/domains/game/ingame/constants/timebar/ingameTimebarAssets.js"
import {
  NODE_ACTIVE_CLASS,
  NODE_SIZE_CLASS,
} from "@/domains/game/ingame/constants/timebar/ingameTimebarLayout.js"

// 화살표 크기는 접힘·펼침에 따라 부모가 정해 넘김
export default function TimebarNode({ id, src, active, arrowSizeClass }) {
  return (
    <div className="relative flex shrink-0 items-center justify-center" data-timebar-node={id} data-active={active ? "" : undefined}>
      {active ? (
        <PublicAsset
          src={INGAME_TIMEBAR_ASSETS.indicatorArrow}
          alt=""
          aria-hidden="true"
          className={arrowSizeClass}
        />
      ) : null}
      <PublicAsset
        src={src}
        alt=""
        aria-hidden="true"
        className={`${NODE_SIZE_CLASS}${active ? ` ${NODE_ACTIVE_CLASS}` : ""}`}
      />
    </div>
  )
}
