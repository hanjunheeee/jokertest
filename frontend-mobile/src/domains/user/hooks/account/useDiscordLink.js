// Discord 계정 연결 훅 (주소의 결과 표시 → 문구, 문구 닫기, 연결 확인 창 열고 닫기·연결 시작)
// DiscordSection이 씀, 문구 표는 데스크톱 resolveDiscordLinkMessage 그대로

import { useState } from "react"
import { useSearchParams } from "react-router-dom"
import { resolveDiscordLinkMessage, startDiscordLink } from "@/domains/user/hooks/useDiscordAccountLink.js"
import { API_BASE_URL } from "@/shared/env.js"

// 백엔드가 연결 뒤 모바일 /account로 돌려보내게 하는 표시 (서명된 시도 표에 들어감)
const LINK_START_URL = `${API_BASE_URL}/auth/discord/link?client=mobile`

// 데스크톱 DiscordAccountLink의 동작을 화면과 떼어 둔 것
export function useDiscordLink() {
    const [searchParams, setSearchParams] = useSearchParams()
    // 연결 확인 창 열림 (기본 confirm 창 대신 양피지 창, MO-029)
    const [confirmOpen, setConfirmOpen] = useState(false)

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

    // 주소에 오류 코드 붙임 → 위 결과 문구로 보임
    const showLinkError = (code) => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev)
            next.delete("socialLinkSuccess")
            next.set("socialLinkError", code)
            return next
        }, { replace: true })
    }

    // 연결하기: 바로 안 가고 확인 창부터
    const startLink = (event) => {
        event.preventDefault()
        setConfirmOpen(true)
    }

    // 확인 창 연결: 서버 연결 주소로 이동 (소리는 버튼 data-sfx-kind가 냄)
    const confirmLink = () => {
        setConfirmOpen(false)
        // 세션 확인 안 되면 로그아웃 대신 주소에 코드 붙여 안내 문구 띄움
        void startDiscordLink(LINK_START_URL, { onSessionLost: showLinkError })
    }

    // 확인 창 취소·덮개·Esc: 닫기만 (소리는 버튼·Esc 처리가 냄)
    const cancelLink = () => {
        setConfirmOpen(false)
    }

    return { message, clearMessage, startLink, confirmOpen, confirmLink, cancelLink }
}
