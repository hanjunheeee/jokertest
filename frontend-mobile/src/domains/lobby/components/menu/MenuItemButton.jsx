// 로비 메뉴 버튼 하나 (그림 글자, 고객센터는 디스코드 그림 붙은 링크)
// MenuNav가 씀
import { LOBBY_ASSETS } from "@/shared/constants/lobbyAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 고객센터 주소가 없을 때 보일 안내 (데스크톱 LobbyMenuNav와 같은 문구)
const SUPPORT_LINK_UNSET_HINT = "고객센터 연결이 아직 설정되지 않았습니다."

// 누르는 칸 44px 이상, 누를 때 데스크톱 hover와 같은 빨강 필터
const BTN_CLASS =
    "group flex min-h-11 cursor-pointer items-center justify-center gap-1.5 border-0 bg-transparent p-0 leading-none transition-transform duration-200 ease-out active:scale-[0.97] disabled:cursor-default"

const IMG_CLASS =
    "block h-[clamp(2.75rem,6.2svh,3.4rem)] w-auto max-w-[72vw] select-none object-contain transition-[filter] duration-200 group-hover:[filter:url(#lobby-menu-red)] group-active:[filter:url(#lobby-menu-red)] land:h-10 land:max-w-[40vw] md:h-16"

const DISCORD_IMG_CLASS =
    "block aspect-square h-[clamp(2.4rem,5.4svh,3rem)] w-auto shrink-0 select-none rounded-sm object-cover land:h-9 md:h-14"

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
