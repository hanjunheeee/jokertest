// 로비 메뉴 버튼 하나 (그림 글자)
// MenuNav가 씀
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 누르는 칸 44px 이상, 크기 움직임은 데스크톱 interactive-scale 그대로 (hover 없는 폰은 눌림만), 빨강 필터는 hover 대신 누를 때
const BTN_CLASS =
    "interactive-scale group flex min-h-11 w-full items-center justify-center gap-1.5 leading-none disabled:cursor-default land:w-auto"

// 빨강 필터는 데스크톱 .lobby-menu-btn__img처럼 메뉴 글자에 씀
const RED_FILTER_CLASS =
    "transition-[filter] duration-200 ease-[ease] group-hover:[filter:url(#lobby-menu-red)] group-active:[filter:url(#lobby-menu-red)]"

const IMG_CLASS =
    `block h-[clamp(2.35rem,5.3svh,3rem)] w-auto max-w-[64vw] select-none object-contain object-center ${RED_FILTER_CLASS} land:h-9 land:max-w-[38vw] md:h-[clamp(2.45rem,5svh,3.35rem)]`

// 누르면 이동 처리 (고객센터도 같은 버튼, 문의 창은 MenuNav가 엶)
export default function MenuItemButton({ item, isActive, onSelect }) {
    return (
        <button
            type="button"
            onClick={() => onSelect(item.id)}
            aria-current={isActive ? "page" : undefined}
            className={BTN_CLASS}
        >
            <PublicAsset src={item.src} alt={item.label} className={IMG_CLASS} />
        </button>
    )
}
