// 우하단 고정 뒤로 (엄지 구역). 마이페이지·계정관리 등 동일 위치
// 하단 광고 줄이 있으면 --mobile-ad-h만큼 위로 (광고 바로 옆 버튼 피하기)
import BackButton from "@m/shared/ui/button/BackButton.jsx"

export const BOTTOM_BACK_WRAP_CLASS =
    "pointer-events-none fixed inset-x-0 z-40 bottom-[calc(0.75rem_+_var(--mobile-ad-h,0px))] flex justify-end px-3 pr-4 pb-1 land:bottom-[calc(1rem_+_var(--mobile-ad-h,0px))]"

export const BOTTOM_BACK_BTN_CLASS =
    "pointer-events-auto flex h-[3.75rem] w-[3.75rem] shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-2 transition-transform active:scale-90"

const ICON_CLASS = "block h-full w-full select-none object-contain"

export default function BottomBackFixed({ onClick, label = "뒤로 가기" }) {
    if (!onClick) return null

    return (
        <div className={BOTTOM_BACK_WRAP_CLASS}>
            <BackButton onClick={onClick} label={label} className={BOTTOM_BACK_BTN_CLASS} iconClassName={ICON_CLASS} />
        </div>
    )
}
