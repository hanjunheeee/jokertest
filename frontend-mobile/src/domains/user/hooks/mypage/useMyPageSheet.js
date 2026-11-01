// 마이페이지 위 시트(프로필 수정·스킨&카드 착용) 열림 상태를 주소 ?sheet=로 들고 있는 훅
// MyPage·MyPageActions가 씀, 시트 화면은 다른 담당이 { open, onClose }로 받아 붙임

import { useCallback } from "react"
import { useSearchParams } from "react-router-dom"

// 주소에 들어가는 시트 이름 (다른 담당 시트와 맞출 약속 값)
export const MY_PAGE_SHEETS = {
    profileEdit: "profile-edit",
    skinCardWear: "skin-card-wear",
}

// 열기는 방문 기록을 남겨 폰 뒤로 가기로 닫히게 함, 닫기는 기록 안 남김
export function useMyPageSheet() {
    const [searchParams, setSearchParams] = useSearchParams()
    const sheet = searchParams.get("sheet")

    const openSheet = useCallback((name) => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev)
            next.set("sheet", name)
            return next
        })
    }, [setSearchParams])

    const closeSheet = useCallback(() => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev)
            next.delete("sheet")
            return next
        }, { replace: true })
    }, [setSearchParams])

    // 시트 컴포넌트에 바로 넘길 { open, onClose }
    const sheetProps = useCallback(
        (name) => ({ open: sheet === name, onClose: closeSheet }),
        [sheet, closeSheet],
    )

    return { sheet, openSheet, closeSheet, sheetProps }
}
