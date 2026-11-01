// 구석 패널 그림 버튼 하나: 투표 현황(수락 그림)·기권(취소 그림)·건너뛰기(미선택 그림) 위에 글자
// 행동 줄(ActionRow)이 씀, 그림·글자·꺼짐 모양은 데스크톱 구석 패널 상수 그대로
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { INGAME_VOTE_ASSETS } from "@/domains/game/ingame/constants/vote/ingameVoteAssets.js"
import { INGAME_CORNER_ACTION_ASSETS } from "@/domains/game/ingame/constants/actions/ingameCornerActionAssets.js"
import {
  CORNER_ACTION_BTN_IMG_CLASS,
  CORNER_ACTION_BTN_LABEL_CLASS,
} from "@/domains/game/ingame/constants/actions/ingameCornerActionLayout.js"

const KIND_SRC = {
  voteStatus: INGAME_VOTE_ASSETS.toggleButton,
  abstain: INGAME_CORNER_ACTION_ASSETS.abstain,
  skip: INGAME_CORNER_ACTION_ASSETS.skip,
}

// 누름 칸은 44px 이상, 그림은 제 비율 그대로 (데스크톱 9.25rem 폭을 줄 폭에 맞춰 줄임)
const BUTTON_CLASS =
  "group relative flex min-h-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 leading-none disabled:cursor-not-allowed disabled:opacity-45"

// 그림 칸을 글자 크기 기준 칸으로 둠 (데스크톱 글자 class가 cqi를 씀)
const FACE_CLASS = "relative block w-[clamp(6.5rem,32cqi,9.25rem)] [container-type:inline-size]"

// action 있으면 data-ingame-phase-action 표시 (데스크톱 기권·건너뛰기와 같음), 투표 현황은 여는 이름
export default function ImageButton({ action, kind, label, enabled, onClick }) {
  const phaseAttr = action ? { "data-ingame-phase-action": action } : {}
  return (
    <button
      type="button"
      aria-label={kind === "voteStatus" ? "투표 현황 열기" : label}
      disabled={!enabled}
      onClick={onClick}
      className={BUTTON_CLASS}
      style={{ outline: "none" }}
      {...phaseAttr}
    >
      <span className={FACE_CLASS}>
        <PublicAsset src={KIND_SRC[kind]} alt="" className={CORNER_ACTION_BTN_IMG_CLASS} />
        <span className={CORNER_ACTION_BTN_LABEL_CLASS}>{label}</span>
      </span>
    </button>
  )
}
