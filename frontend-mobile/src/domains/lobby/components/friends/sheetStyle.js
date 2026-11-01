// 친구 시트 탭 목록·그림 경로·className 모음 (시트 틀·줄·글자·안내 문구)
// 친구 시트 컴포넌트들(components/friends)이 씀
import { publicAsset } from "@/shared/utils/publicAsset.js"
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"

// 탭 순서·짧은 글자 (폭 360에 다섯 개가 들어가게 짧게, 읽기 이름은 데스크톱 탭 이름)
export const SHEET_TABS = [
  { id: "list", label: "친구", ariaLabel: "친구 목록" },
  { id: "request", label: "추가", ariaLabel: "친구 추가" },
  { id: "accept", label: "요청", ariaLabel: "요청 수락" },
  { id: "invite", label: "초대", ariaLabel: "게임 초대" },
  { id: "block", label: "차단", ariaLabel: "차단 목록" },
]

// 시트 닫기 버튼 그림 (상점 팝업과 같은 그림)
export const CLOSE_BUTTON_SRC = "/button/팝업 닫기 버튼.png".normalize("NFD")

// 패널 프레임을 border-image로 깔아 모서리 장식이 늘어나지 않게 함
export const SHEET_FRAME_STYLE = {
  borderStyle: "solid",
  borderWidth: "30px 18px 26px",
  borderImage: `url("${publicAsset(FRIEND_LIST_ASSETS.panelFrame)}") 44 28 40 28 fill / 30px 18px 26px stretch`,
}

// 시트 틀: 폰 세로는 화면 전체, 가로·태블릿은 오른쪽 패널
export const SHEET_CLASS =
  "relative ml-auto flex h-full w-full flex-col md:max-w-[26rem] land:max-w-[28rem]"

// 줄 공통 (비단 프레임 바탕 위에 내용)
export const ROW_CLASS = "relative mt-2 flex min-h-16 w-full list-none items-center gap-1.5 py-1.5 pl-2 pr-2.5"

export const ROW_FRAME_CLASS = "pointer-events-none absolute inset-0 h-full w-full select-none object-fill"

export const ROW_TARGET_CLASS = "ring-2 ring-[#e8c56a]/80 rounded-sm"

export const NAME_CLASS =
  "truncate font-subheading app-text-scaled [--app-text-size:15px] leading-tight text-white"

export const DETAIL_ERROR_CLASS = "app-text-scaled [--app-text-size:12px] leading-snug text-red-300/90"

export const DETAIL_MUTED_CLASS = "app-text-scaled [--app-text-size:12px] leading-snug text-white/55"

// 탭 안 스크롤 목록 (안쪽 스크롤 하나만 둠)
export const LIST_CLASS = "min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4"

// 비었음·불러오는 중·오류 안내 한 줄
export const NOTICE_CLASS = "mt-6 px-2 text-center app-text-scaled [--app-text-size:15px] leading-relaxed"

// 탭 위 버튼 줄 (전부 수락·새로고침)
export const TOOLBAR_CLASS = "flex shrink-0 items-center justify-end gap-2 pt-2"

// 글자 버튼 (메뉴·다시 시도·친구 추가로 가기)
export const TEXT_BUTTON_CLASS =
  "min-h-11 rounded-md border border-white/25 bg-black/55 px-4 font-subheading app-text-scaled [--app-text-size:15px] font-bold text-[#ebe2cc] active:bg-black/75 disabled:opacity-50"
