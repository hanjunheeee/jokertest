// 추방 창 모양: 투표 창 틀 그림 깔기·제목·닫기 자리·안내 글·줄
// kick/ 아래 KickSheet·KickRow가 씀, 그림·글자색은 데스크톱 추방 창(투표 창 틀) 그대로
import { INGAME_KICK_PLAYER_MODAL_ASSETS as FRAME_ASSETS } from "@/domains/game/ingame/constants/controls/kickPlayer/ingameKickPlayerAssets.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"

// 틀 그림 크기와 위(날개·제목 판)·아래 장식 높이 (그림 px)
const FRAME_W = 734
const FRAME_TOP = 104
const FRAME_BOTTOM = 30

// 창 폭 (폰은 화면 폭에 맞추고 큰 화면은 데스크톱 창 최대 폭)
const WIDTH = "min(calc(100vw - 1.5rem), 42rem)"

// 그림 px → 창 폭 비율 길이
const scaled = (px) => `calc(${WIDTH} * ${px} / ${FRAME_W})`

// 위·아래만 잘라 border-image로 깔고 옆은 0: 폭은 가로로, 키는 가운데만 세로로 늘어나 날개·제목 판 비율이 그대로임
export const KICK_FRAME_STYLE = {
  width: WIDTH,
  borderStyle: "solid",
  borderWidth: `${scaled(FRAME_TOP)} 0 ${scaled(FRAME_BOTTOM)}`,
  borderImage: `url("${publicAsset(FRAME_ASSETS.panelFrame)}") ${FRAME_TOP} 0 ${FRAME_BOTTOM} fill / ${scaled(FRAME_TOP)} 0 ${scaled(FRAME_BOTTOM)} stretch`,
}

// 제목은 위 테두리 안 판 자리 (판 가운데가 그림 y 56쯤)
export const KICK_TITLE_STYLE = {
  top: scaled(-FRAME_TOP + 22),
  height: scaled(68),
}

// 닫기는 위 테두리 오른쪽 끝 (데스크톱 자리)
export const KICK_CLOSE_STYLE = { top: scaled(-30) }

// 안내 글 두 줄 (데스크톱 MODAL_SUBTITLE_CLASS·MODAL_NOTICE_CLASS 색)
export const SUBTITLE_CLASS =
  "mt-1 mb-1 shrink-0 text-center font-subheading app-text-scaled [--app-text-size:0.92rem] font-bold leading-snug text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

export const NOTICE_CLASS =
  "mb-2.5 shrink-0 text-center font-subheading app-text-scaled [--app-text-size:0.8rem] font-bold leading-snug text-white/75 [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

// 대상 한 줄 판 (데스크톱 ROW_INNER_CLASS)
export const ROW_CLASS =
  "flex min-h-[3.5rem] min-w-0 list-none items-center gap-2.5 rounded-sm border border-[#3a2818]/70 bg-[#120a06]/45 px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
