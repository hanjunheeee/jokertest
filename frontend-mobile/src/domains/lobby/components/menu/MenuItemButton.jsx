// 로비 메뉴 버튼 하나 (그림 글자, 고객센터는 디스코드 그림 붙은 링크)
// MenuNav가 씀
import { LOBBY_ASSETS } from "@/shared/constants/lobbyAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 고객센터 주소가 없을 때 보일 안내 (데스크톱 LobbyMenuNav와 같은 문구)
const SUPPORT_LINK_UNSET_HINT = "고객센터 연결이 아직 설정되지 않았습니다."

// 누르는 칸 44px 이상, 크기 움직임은 데스크톱 interactive-scale 그대로 (hover 없는 폰은 눌림만), 빨강 필터는 hover 대신 누를 때
const BTN_CLASS =
    "interactive-scale group flex min-h-10 w-full items-center justify-center gap-1.5 leading-none disabled:cursor-default land:w-auto"

// 빨강 필터는 데스크톱 .lobby-menu-btn__img처럼 메뉴 글자·디스코드 그림 둘 다에 씀
const RED_FILTER_CLASS =
    "transition-[filter] duration-200 ease-[ease] group-hover:[filter:url(#lobby-menu-red)] group-active:[filter:url(#lobby-menu-red)]"

const IMG_CLASS =
    `block h-[clamp(2.35rem,5.3svh,3rem)] w-auto max-w-[64vw] select-none object-contain object-center ${RED_FILTER_CLASS} land:h-9 land:max-w-[38vw] md:h-[clamp(2.45rem,5svh,3.35rem)]`

const DISCORD_IMG_CLASS =
    `block aspect-square h-[clamp(2rem,4.6svh,2.55rem)] w-auto shrink-0 select-none object-cover ${RED_FILTER_CLASS} land:h-8 md:h-[clamp(2.05rem,4.4svh,2.95rem)]`

// 고객센터: 주소 있으면 새 창 링크, 없으면 잠긴 버튼 + 안내 / 나머지: 누르면 이동 처리
export default function MenuItemButton({ item, isActive, isSupport, supportUrl, onSelect }) {
    const content = (
        <>
            <PublicAsset src={item.src} alt={isSupport ? "" : item.label} className={IMG_CLASS} />
            {isSupport ? <PublicAsset src={LOBBY_ASSETS.discordLogo} alt="" className={DISCORD_IMG_CLASS} /> : null}
        </>
    )

    if (isSupport) {
        return supportUrl ? (
            <a href={supportUrl} target="_blank" rel="noopener noreferrer" aria-label={item.label} className={BTN_CLASS}>
                {content}
            </a>
        ) : (
            <button type="button" disabled aria-label={item.label} title={SUPPORT_LINK_UNSET_HINT} className={BTN_CLASS}>
                {content}
            </button>
        )
    }

    return (
        <button
            type="button"
            onClick={() => onSelect(item.id)}
            aria-current={isActive ? "page" : undefined}
            className={BTN_CLASS}
        >
            {content}
        </button>
    )
}
