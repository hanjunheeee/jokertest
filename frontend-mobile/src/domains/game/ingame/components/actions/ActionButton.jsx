// 행동 줄 버튼 하나: 그림 버튼(수락·취소·미선택 그림 위 글자) 또는 어두운 글자 버튼, 높이 44px
// 행동 줄(ActionRow)이 씀
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { INGAME_VOTE_ASSETS } from "@/domains/game/ingame/constants/vote/ingameVoteAssets.js"
import { INGAME_CORNER_ACTION_ASSETS } from "@/domains/game/ingame/constants/actions/ingameCornerActionAssets.js"

// 데스크톱 구석 패널 그림 그대로 (투표 현황·준비 = 수락, 기권·취소 = 취소, 건너뛰기 = 미선택)
const TONE_SRC = {
  accept: INGAME_VOTE_ASSETS.toggleButton,
  cancel: INGAME_CORNER_ACTION_ASSETS.abstain,
  skip: INGAME_CORNER_ACTION_ASSETS.skip,
}

const BASE_CLASS =
  "group relative flex h-11 min-w-0 flex-1 basis-0 cursor-pointer items-center justify-center p-0 leading-none disabled:cursor-not-allowed disabled:opacity-45"

// 그림 버튼은 테두리·바탕 없음
const IMAGE_CLASS = "border-0 bg-transparent"

// 그림 없는 버튼은 데스크톱 단계 행동 줄 글자 버튼 색
const PLAIN_CLASS =
  "rounded border border-[#d8b982]/45 bg-[#2b1c15]/90 active:bg-[#53321f]"

const LABEL_CLASS =
  "pointer-events-none relative z-[1] truncate px-1.5 font-subheading app-text-scaled [--app-text-size:0.82rem] font-bold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

// action은 data-ingame-phase-action 값 (데스크톱 시험 표시와 같은 이름)
export default function ActionButton({ action, label, enabled, onClick, tone = "plain" }) {
  const src = TONE_SRC[tone] ?? null
  return (
    <button
      type="button"
      data-ingame-phase-action={action}
      aria-label={label}
      disabled={!enabled}
      onClick={onClick}
      className={`${BASE_CLASS} ${src ? IMAGE_CLASS : PLAIN_CLASS}`}
      style={{ outline: "none" }}
    >
      {src ? (
        <PublicAsset
          src={src}
          alt=""
          className="pointer-events-none absolute inset-0 block h-full w-full select-none object-fill transition-transform duration-150 group-active:scale-[0.96]"
        />
      ) : null}
      <span className={LABEL_CLASS}>{label}</span>
    </button>
  )
}
