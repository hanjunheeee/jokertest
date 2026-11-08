// 창이 열린 동안 휴대폰 뒤로 가기를 "창 닫기"로 바꾸기 (닫을 수 없는 동안은 그 자리에 머묾)
// InterstitialAd가 씀, 열 때 같은 주소 칸을 하나 더 쌓고 닫히면 그 칸을 되돌림 (라우터는 모르게 backGate로)
import { useEffect, useRef } from "react"
import { setBackGate } from "@m/shared/ads/backGate.js"

// 내가 쌓은 칸 표시 (라우터 값은 그대로 복사해 둬서 라우터 위치가 안 어긋나게)
const GUARD = "mmcAdGuard"

const isGuard = () => Boolean(window.history.state?.[GUARD])
const pushGuard = () => window.history.pushState({ ...window.history.state, [GUARD]: true }, "")

// 개발 때 effect가 정리 → 다시 걸림을 반복해도 칸이 늘지 않게 되돌리기는 한 박자 늦춤
let backTimer = null

// 내 칸을 한 칸 되돌리기 (그때 오는 popstate 한 번은 라우터에 안 넘김)
const popGuardSilently = () => {
    setBackGate(() => setBackGate(null))
    window.history.back()
}

export function useBackClose(open, canClose, onClose) {
    const latest = useRef({ canClose, onClose })

    useEffect(() => {
        latest.current = { canClose, onClose }
    }, [canClose, onClose])

    useEffect(() => {
        if (!open) return undefined
        window.clearTimeout(backTimer)
        if (!isGuard()) pushGuard()

        setBackGate(() => {
            if (latest.current.canClose) latest.current.onClose?.()
            else pushGuard()
        })
        return () => {
            setBackGate(null)
            // 버튼·Esc로 닫혀 내 칸이 아직 맨 위면 한 칸 되돌림 (다른 화면으로 넘어갔으면 그대로)
            backTimer = window.setTimeout(() => {
                if (isGuard()) popGuardSilently()
            }, 0)
        }
    }, [open])
}
