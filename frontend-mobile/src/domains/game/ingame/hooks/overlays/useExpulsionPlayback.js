// 재판 추방 연출 단계 훅: 영상 재생 → 잠깐 멈춤 → 어두워짐 → 문구, 문구 뒤 저절로 끝 알림
// 추방 연출 창(ExpulsionOverlay)이 씀, 단계·시간은 데스크톱 InGameTribunalExpulsionOverlay와 같음
import { useCallback, useEffect, useRef, useState } from "react"
import {
    FADE_MS,
    HOLD_MS,
    MSG_AUTO_MS,
} from "@/domains/game/ingame/constants/ingameTribunalExpulsionPresentation.js"

// 단계·어둡기·영상 ref와 영상 끝·오류·끝내기 손잡이
export function useExpulsionPlayback({ active, presentationId, onComplete }) {
    const videoRef = useRef(null)
    const [phase, setPhase] = useState("playing")
    const [fadeOpacity, setFadeOpacity] = useState(0)

    // 열리면 처음부터 재생, 자동 재생 막히면 바로 멈춤 단계로 (새 연출은 부르는 쪽이 key로 새로 그림)
    useEffect(() => {
        if (!active) return
        const video = videoRef.current
        if (!video) return
        video.currentTime = 0
        const playPromise = video.play()
        if (playPromise && typeof playPromise.catch === "function") {
            playPromise.catch(() => setPhase("hold"))
        }
    }, [active, presentationId])

    // 열려 있을 때만 끝 알림, 지금 연출 id를 같이 넘김
    const finish = useCallback(() => {
        if (!active) return
        onComplete?.(presentationId)
    }, [active, onComplete, presentationId])

    // 멈춤은 잠깐 보여 준 뒤 어두워짐으로
    useEffect(() => {
        if (phase !== "hold") return undefined
        const timer = window.setTimeout(() => setPhase("fade"), HOLD_MS)
        return () => window.clearTimeout(timer)
    }, [phase])

    // 다음 프레임에 어둡게 시작, 다 어두워지면 문구로
    useEffect(() => {
        if (phase !== "fade") return undefined
        const frame = requestAnimationFrame(() => setFadeOpacity(1))
        const timer = window.setTimeout(() => setPhase("message"), FADE_MS)
        return () => {
            cancelAnimationFrame(frame)
            window.clearTimeout(timer)
        }
    }, [phase])

    // 문구는 정한 시간 지나면 저절로 끝
    useEffect(() => {
        if (phase !== "message") return undefined
        const timer = window.setTimeout(finish, MSG_AUTO_MS)
        return () => window.clearTimeout(timer)
    }, [phase, finish])

    // 영상 끝나면 마지막 장면에 멈춰 두고 멈춤 단계로, 영상 못 열면 바로 문구로
    const handleEnded = () => {
        videoRef.current?.pause()
        setPhase("hold")
    }
    const handleError = () => setPhase("message")

    return { videoRef, phase, fadeOpacity, finish, handleEnded, handleError }
}
