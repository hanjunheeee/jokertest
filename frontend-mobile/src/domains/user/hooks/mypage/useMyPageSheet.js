// 마이페이지 위 시트(프로필 수정·스킨&카드 착용) 열림 상태를 주소 ?sheet=로 들고 있는 훅
// MyPage·MyPageActions가 씀, 시트 화면은 다른 담당이 { open, onClose }로 받아 붙임

import { useCallback, useEffect, useRef } from "react"
import { useLocation, useNavigate, useSearchParams } from "react-router-dom"

// 주소에 들어가는 시트 이름 (다른 담당 시트와 맞출 약속 값)
export const MY_PAGE_SHEETS = {
    profileEdit: "profile-edit",
    skinCardWear: "skin-card-wear",
}

// 열기는 방문 기록을 남겨 폰 뒤로 가기로 닫히게 함
// 닫기: 여기서 열어 남긴 기록이면 한 칸 뒤로(기록이 쌓이지 않게), 주소로 바로 들어왔으면 기록 안 남기고 바꿈
export function useMyPageSheet() {
    const [searchParams, setSearchParams] = useSearchParams()
    const sheet = searchParams.get("sheet")
    const location = useLocation()
    const navigate = useNavigate()
    const pushedByOpen = location.state?.myPageSheetPushed === true
    // 뒤로 가기가 끝나기 전 닫기를 또 누르면 두 칸 뒤로 가 마이페이지를 벗어남 → 시트가 바뀔 때까지 한 번만
    const backPendingRef = useRef(false)
    useEffect(() => {
        backPendingRef.current = false
    }, [sheet])

    const openSheet = useCallback((name) => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev)
            next.set("sheet", name)
            return next
        }, { state: { myPageSheetPushed: true } })
    }, [setSearchParams])

    const closeSheet = useCallback(() => {
        if (pushedByOpen) {
            if (backPendingRef.current) return
            backPendingRef.current = true
            navigate(-1)
            return
        }
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev)
            next.delete("sheet")
            return next
        }, { replace: true })
    }, [pushedByOpen, navigate, setSearchParams])

    // 시트 컴포넌트에 바로 넘길 { open, onClose }
    const sheetProps = useCallback(
        (name) => ({ open: sheet === name, onClose: closeSheet }),
        [sheet, closeSheet],
    )

    return { sheet, openSheet, closeSheet, sheetProps }
}
