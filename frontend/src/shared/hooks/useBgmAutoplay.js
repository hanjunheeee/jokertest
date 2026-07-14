import { useEffect } from "react"

// 페이지에서 사용할 배경음악 자동 재생 훅입니다.
export function useBgmAutoplay(audioRef) {
    useEffect(() => {
        // 배경음악을 재생하는 함수입니다.
        const playBgm = () => {
            // 아직 audio 태그가 화면에 연결되지 않았다면 실행하지 않습니다.
            if(!audioRef.current) return

            // audio 태그의 play()를 호출해서 음악 재생을 시도합니다.
            audioRef.current.play().catch(() => {
                // 브라우저가 자동 재생을 막으면 여기로 들어옵니다.
                console.log("유저 상호작용 전이라 자동 재생이 차단되었습니다. 버튼이나 클릭으로 켜야 합니다.")
            })
        }

        // 페이지가 처음 뜰 때 바로 한 번 재생을 시도합니다.
        playBgm()

        // 첫 재생이 막혔을 수 있으니, 사용자가 화면을 처음 클릭했을 때 다시 한 번 재생합니다.
        // once: true라서 클릭 이벤트는 한 번 실행된 뒤 자동으로 제거됩니다.
        window.addEventListener("click", playBgm, {once: true})

        // 페이지를 벗어나면 남아 있는 클릭 이벤트를 정리합니다.
        return () => window.removeEventListener("click", playBgm)
    }, [audioRef])
}
