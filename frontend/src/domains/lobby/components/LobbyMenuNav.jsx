import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { LOBBY_MENU_BUTTONS } from "../constants/lobbyAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"

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
  const [activeMenu, setActiveMenu] = useState("gameplay")

  const handleMenuClick = (itemId) => {
    setActiveMenu(itemId)
    if (itemId === "gameplay") navigate("/gameMode")
    if (itemId === "settings") navigate("/setting")
    if (itemId === "store") navigate("/store")
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
