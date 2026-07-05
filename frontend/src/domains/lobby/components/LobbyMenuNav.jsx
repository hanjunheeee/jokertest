/**
 * 로비 메뉴 내비게이션.
 *
 * 게임 모드, 상점, 설정 등 주요 로비 액션으로 이동하는 메뉴를 담당합니다.
 */
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { LOBBY_MENU_BUTTONS } from "../constants/lobbyAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"
import { logoutApi } from "@/domains/auth/api/auth"
import { useAuthStore } from "@/domains/auth/store/authStore"

const LOBBY_MENU_ITEMS = [
  { id: "gameplay", label: "게임플레이", src: LOBBY_MENU_BUTTONS.gameplay },
  { id: "settings", label: "설정", src: LOBBY_MENU_BUTTONS.settings },
  { id: "store", label: "상점", src: LOBBY_MENU_BUTTONS.store },
  { id: "archive", label: "기억의 서고", src: LOBBY_MENU_BUTTONS.archive },
  { id: "exit", label: "종료", src: LOBBY_MENU_BUTTONS.exit },
]

const LOBBY_MENU_BTN_CLASS = "lobby-menu-btn block leading-none"
const LOBBY_MENU_IMG_CLASS =
  "lobby-menu-btn__img block h-[clamp(3.35rem,6.2vh,4.85rem)] w-auto max-w-[clamp(12.5rem,23vw,20rem)] object-contain object-center select-none"

export default function LobbyMenuNav() {
  const navigate = useNavigate()
  // useState(초기값)은 [현재값, 값을 바꾸는 함수]를 반환하는 훅으로, 컴포넌트가
  // 리렌더링 사이에 값을 기억하게 해줍니다. setActiveMenu를 호출하면 컴포넌트가
  // 다시 렌더링되어 화면에 최신 activeMenu가 반영됩니다.
  // activeMenu: 현재 선택(강조 표시)된 메뉴 항목의 id (기본값 "gameplay")
  const [activeMenu, setActiveMenu] = useState("gameplay")

  /** 메뉴 클릭 시 활성 메뉴 표시를 갱신하고 해당 경로로 이동(exit는 로그아웃 후 이동) */
  const handleMenuClick = async (itemId) => {
    setActiveMenu(itemId)
    if (itemId === "gameplay") navigate("/gameMode")
    if (itemId === "settings") navigate("/setting")
    if (itemId === "store") navigate("/store")
    if (itemId === "exit") {
      await logoutApi().catch(() => {})
      useAuthStore.getState().logout()
      navigate("/login")
    }
  }

  return (
    <>
      <svg aria-hidden="true" className="pointer-events-none absolute h-0 w-0 overflow-hidden">
        <defs>
          <filter id="lobby-menu-red" colorInterpolationFilters="sRGB">
            <feColorMatrix
              type="matrix"
              values="0.706 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
            />
          </filter>
        </defs>
      </svg>

      <nav
        className="mt-[clamp(1.25rem,3.5vh,2.5rem)] flex translate-x-[clamp(0.1rem,1.0vw,-0.1rem)] translate-y-[clamp(1.25rem,3.5vh,2.75rem)] flex-col items-center gap-[clamp(0.85rem,2.2vh,1.35rem)]"
        aria-label="로비 메뉴"
      >
        {LOBBY_MENU_ITEMS.map((item) => {
          const isActive = activeMenu === item.id

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleMenuClick(item.id)}
              aria-current={isActive ? "page" : undefined}
              className={`${LOBBY_MENU_BTN_CLASS} cursor-pointer border-0 bg-transparent p-0`}
            >
              <PublicAsset
                src={item.src}
                alt={item.label}
                className={LOBBY_MENU_IMG_CLASS}
              />
            </button>
          )
        })}
      </nav>
    </>
  )
}
