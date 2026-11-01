// 내 프로필 배너 (배너 틀·초상·닉네임, 누르면 마이페이지, 톱니는 계정 화면)
// 로비 TopBar가 씀
import { LOBBY_ASSETS } from "@/shared/constants/lobbyAssets.js"
import { MY_PAGE_ASSETS } from "@/domains/user/constants/myPageAssets.js"
import {
    BANNER_FRAME_IMG_CLASS,
    LOBBY_TEXT_PANEL_INSET,
    TEXT_SHADOW,
} from "@/domains/user/constants/myPageBannerStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import BannerPortrait from "@m/shared/ui/portrait/BannerPortrait.jsx"

// 배너 본체는 버튼 하나, 톱니는 그 위에 겹친 따로 버튼 (안쪽에 버튼 넣지 않기)
// 톱니 그림은 데스크톱 자리(위 14.5%·오른쪽 17%·폭 7.8cqi)의 가운데에 두고 누르는 칸만 44px로 키움
export default function ProfileBanner({ profile, onMyPage, onAccount }) {
    return (
        <div className="relative w-full leading-none [container-type:inline-size]">
            <button
                type="button"
                aria-label="마이페이지"
                onClick={onMyPage}
                className="relative block w-full cursor-pointer border-0 bg-transparent p-0 transition-transform duration-200 ease-out active:scale-[0.98]"
            >
                <PublicAsset src={MY_PAGE_ASSETS.myPageButtonFrame} alt="" className={BANNER_FRAME_IMG_CLASS} />
                <BannerPortrait />
                <span className="pointer-events-none absolute flex items-center" style={LOBBY_TEXT_PANEL_INSET}>
                    <span
                        className="relative left-[-4%] max-w-full truncate font-subheading app-text-scaled [--app-text-size:max(0.85rem,5cqi)] font-bold leading-tight text-[#ebe2cc]"
                        style={{ textShadow: TEXT_SHADOW }}
                    >
                        {profile.nickname}
                    </span>
                </span>
            </button>

            <button
                type="button"
                aria-label="계정 설정"
                onClick={onAccount}
                className="group absolute right-[20.9%] top-[31%] z-10 flex h-11 w-11 translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center border-0 bg-transparent p-0"
            >
                <PublicAsset
                    src={LOBBY_ASSETS.settingsGear}
                    alt=""
                    className="block aspect-square w-[7.8cqi] min-w-4 select-none object-contain transition-transform duration-200 group-active:scale-90"
                />
            </button>
        </div>
    )
}
