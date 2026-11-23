// 화면 틀 하단 줄 오른쪽 «뒤로» 등록 (fixed 대신 shell 레이아웃과 같이 움직임)
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

const ShellBackContext = createContext(null)

export function ShellBackProvider({ children }) {
    const [back, setBack] = useState(null)

    const value = useMemo(() => ({ back, setBack }), [back])

    return <ShellBackContext.Provider value={value}>{children}</ShellBackContext.Provider>
}

export function useShellBackContext() {
    return useContext(ShellBackContext)
}

/** 마운트 동안 shell 하단 줄에 뒤로 버튼 표시. enabled·onClick 없으면 등록 안 함. */
export function useShellBackButton({ onClick, label = "뒤로 가기", enabled = true } = {}) {
    const ctx = useContext(ShellBackContext)
    const setBack = ctx?.setBack

    useEffect(() => {
        if (!setBack) return undefined
        if (!enabled || typeof onClick !== "function") {
            setBack(null)
            return undefined
        }
        setBack({ onClick, label })
        return () => setBack(null)
    }, [enabled, onClick, label, setBack])
}
