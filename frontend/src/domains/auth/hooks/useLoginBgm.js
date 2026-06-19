import { useEffect } from "react"

/**
 * 로그인 화면 BGM 자동재생 훅.
 *
 * 브라우저 자동재생 정책 때문에 페이지 로드 시 재생이 차단될 수 있습니다.
 * 로드 즉시 재생을 시도하고, 실패 시 첫 번째 사용자 클릭 때 재시도합니다.
 * { once: true } 로 리스너를 단 한 번만 실행합니다.
 *
 * @param {React.RefObject<HTMLAudioElement>} audioRef - 재생할 오디오 엘리먼트 ref
 */
export function useLoginBgm(audioRef) {
  useEffect(() => {
    const playBgm = () => {
      if (!audioRef.current) return
      audioRef.current.play().catch(() => {
        // 자동재생 정책에 막혔을 때 — 이후 클릭 이벤트가 재시도
        console.log(
          "유저 상호작용 전이라 자동 재생이 차단되었습니다. 버튼이나 클릭으로 켜야 합니다.",
        )
      })
    }

    playBgm() // 1차 시도: 정책이 허용하면 바로 재생
    window.addEventListener("click", playBgm, { once: true }) // 2차 시도: 첫 클릭 때 한 번만

    return () => window.removeEventListener("click", playBgm)
  }, [audioRef])
}
