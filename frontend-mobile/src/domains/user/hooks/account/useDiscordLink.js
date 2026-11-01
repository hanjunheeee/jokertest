// Discord 계정 연결 훅 (주소의 결과 표시 → 문구, 문구 닫기, 연결 시작)
// DiscordSection이 씀, 문구 표는 데스크톱 resolveDiscordLinkMessage 그대로

import { useSearchParams } from "react-router-dom"
import { resolveDiscordLinkMessage } from "@/domains/user/hooks/useDiscordAccountLink.js"
import { API_BASE_URL } from "@/shared/env.js"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"

// 백엔드가 연결 뒤 모바일 /account로 돌려보내게 하는 표시 (서명된 시도 표에 들어감)
const LINK_START_URL = `${API_BASE_URL}/auth/discord/link?client=mobile`

// 데스크톱 DiscordAccountLink의 동작을 화면과 떼어 둔 것
export function useDiscordLink() {
    const [searchParams, setSearchParams] = useSearchParams()

    const message = resolveDiscordLinkMessage({
        socialLinkSuccess: searchParams.get("socialLinkSuccess"),
        socialLinkError: searchParams.get("socialLinkError"),
    })

    // 결과 문구 닫기: 주소에서 두 표시를 지움 (방문 기록은 안 남김)
    const clearMessage = () => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev)
            next.delete("socialLinkSuccess")
            next.delete("socialLinkError")
            return next
        }, { replace: true })
    }

    // 연결하기: 한 번 더 묻고, 그렇다면 서버 연결 주소로 이동
    const startLink = (event) => {
        event.preventDefault()
        const confirmed = window.confirm("Discord 계정을 이 계정에 연결하시겠습니까?")
        dispatchUiSfx(confirmed ? "ui-confirm" : "ui-cancel")
        if (!confirmed) return
        window.location.href = LINK_START_URL
    }

    return { message, clearMessage, startLink }
}
