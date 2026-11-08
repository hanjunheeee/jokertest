// 친구 시트 탭 목록·그림 경로·className 모음 (시트 틀·탭·줄 버튼·목록 칸)
// 친구 시트 컴포넌트들(components/friends)이 씀, 데스크톱 friendListStyle은 안 부르고 폰 크기 값을 여기 둠
import { publicAsset } from "@/shared/utils/publicAsset.js"
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"

// 탭 순서·글자는 데스크톱 FriendListViewTabs 그대로 (목록 탭 버튼은 없고 뒤로 버튼으로 돌아감)
export const SHEET_TABS = [
  { id: "request", label: "친구 추가" },
  { id: "accept", label: "요청 수락" },
  { id: "invite", label: "게임 초대" },
  { id: "block", label: "차단 목록" },
]

// 시트 닫기 버튼 그림 (상점 팝업과 같은 그림)
export const CLOSE_BUTTON_SRC = "/button/팝업 닫기 버튼.png".normalize("NFD")

// 닫기: 프레임 모서리에 걸침 (안쪽보다 바깥·위로 반쯤 빼기)
export const CLOSE_BTN_CLASS =
  "absolute z-20 right-[-1.3rem] top-[-1.85rem] flex size-[3.15rem] cursor-pointer items-center justify-center border-0 bg-transparent p-0 leading-none outline-none active:scale-95"
export const CLOSE_ICON_CLASS = "pointer-events-none block size-11 select-none object-contain"

// 패널 프레임을 border-image로 깔아 폰 높이로 늘려도 모서리 장식이 늘어나지 않게 함
export const SHEET_FRAME_STYLE = {
  borderStyle: "solid",
  borderWidth: "30px 18px 26px",
  borderImage: `url("${publicAsset(FRIEND_LIST_ASSETS.panelFrame)}") 44 28 40 28 fill / 30px 18px 26px stretch`,
}

// 시트 틀: 알림 팝업(PANEL_CLASS)과 같은 중앙 모달 크기
export const SHEET_CLASS =
  "pointer-events-auto relative m-2 flex h-[min(calc(100%-1rem),82svh)] max-h-[42rem] w-full max-w-[min(92vw,20.5rem)] flex-col overflow-visible [container-type:inline-size] land:max-h-[38rem] land:max-w-[22rem] md:max-h-[46rem] md:max-w-[26rem]"

export const SHEET_ROOT_CLASS =
  "pointer-events-none fixed inset-0 z-50 flex items-center justify-center overflow-visible safe-pt safe-pb safe-px"

// 줄 버튼 (데스크톱 RECOMMENDED_ACTION_BTN 모양, 누르는 칸만 44px)
export const ACTION_BTN_CLASS =
  "grid size-11 shrink-0 cursor-pointer place-items-center border-0 bg-transparent p-0 transition-opacity active:opacity-90"

export const ACTION_IMG_CLASS = "block w-9 h-auto select-none"

// 탭 안 스크롤 목록 (안쪽 스크롤 하나만 둠)
export const SCROLL_CLASS = "min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5"

// 탭 아래 뒤로 버튼 줄 (데스크톱 compact 뒤로 버튼 자리)
export const BACK_ROW_CLASS = "mt-2 flex shrink-0"
