// 상점 위 줄 (뒤로 가기·제목·보유 재화·배경음 + 분류 탭 자리)
// pages/StorePage가 씀, 세로면 탭이 아래 줄, 가로(land)면 한 줄에 같이
import BackButton from "@m/shared/ui/button/BackButton.jsx"
import MuteToggle from "@m/shared/ui/sound/MuteToggle.jsx"
import CurrencyBalance from "./CurrencyBalance.jsx"

// 위 줄 그림 버튼 (누르는 칸 44px, 데스크톱 오른쪽 아래 소리 조절 대신 아이콘만)
const ICON_BTN_CLASS = "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0"
const NO_OUTLINE = { outline: "none" }

// 탭은 같은 DOM 하나를 order로 자리만 바꿈 (두 벌 그리면 버튼이 겹쳐 잡힘)
export default function StoreTopBar({ onBack, balanceGold, balanceDiamond, economyStatus, onRetryEconomy, tabs }) {
    return (
        <div className="flex shrink-0 flex-wrap items-center gap-x-1.5 gap-y-1 px-2 pt-1 land:flex-nowrap land:pt-0.5">
            <div className="order-1 flex min-w-0 flex-1 items-center gap-1 land:flex-none">
                <BackButton
                    onClick={onBack}
                    className={`${ICON_BTN_CLASS} active:scale-95`}
                    iconClassName="block h-11 w-11 select-none object-contain"
                    style={NO_OUTLINE}
                />
                <h1 className="truncate font-display app-text-scaled [--app-text-size:1.35rem] text-[#f5f0e6] [text-shadow:0_2px_6px_rgba(0,0,0,0.8)]">
                    상점
                </h1>
            </div>

            <div className="order-2 flex shrink-0 items-center gap-0.5 land:order-3">
                <CurrencyBalance
                    balanceGold={balanceGold}
                    balanceDiamond={balanceDiamond}
                    status={economyStatus}
                    onRetry={onRetryEconomy}
                />
                <MuteToggle className={`${ICON_BTN_CLASS} disabled:opacity-50`} iconClassName="block h-10 w-10 select-none object-contain" style={NO_OUTLINE} />
            </div>

            <div className="order-3 w-full min-w-0 land:order-2 land:w-auto land:flex-1">{tabs}</div>
        </div>
    )
}
