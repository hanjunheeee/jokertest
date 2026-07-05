import { useEffect } from "react"

/**
 * 로그인 화면 BGM 자동재생 훅.
 *
 * 브라우저 자동재생 정책 때문에 페이지 로드 시 재생이 차단될 수 있습니다.
 * 로드 즉시 재생을 시도하고, 실패 시 첫 번째 사용자 클릭 때 재시도합니다.
 * { once: true } 로 리스너를 단 한 번만 실행합니다.
 *
 * "use"로 시작하는 이 함수는 커스텀 훅입니다 — useEffect 같은 기본 훅을
 * 조합해서 "BGM 자동재생 + 클릭 시 재시도"라는 동작 하나로 캡슐화한 것으로,
 * AuthScene 같은 컴포넌트에서 한 줄만 호출하면 됩니다. 화면에 그릴 값을
 * 반환하지는 않고(return 없음), 부수효과(재생 시도)만 수행합니다.
 *
 * @param {React.RefObject<HTMLAudioElement>} audioRef - 재생할 오디오 엘리먼트 ref
 */
export function useLoginBgm(audioRef) {
  // useEffect(콜백, 의존성배열)은 "렌더링 이후에 실행할 부수효과"를 등록하는 훅입니다.
  // 의존성 배열의 값이 바뀔 때만 콜백이 다시 실행됩니다.
  // 여기서는 [audioRef] — ref 객체 자체는 리렌더링돼도 identity가 바뀌지 않으므로
  // 사실상 컴포넌트가 처음 마운트될 때 한 번만 실행되는 것과 같습니다.
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

    // useEffect 콜백에서 함수를 return하면 "클린업 함수"가 됩니다.
    // 컴포넌트가 사라지거나(언마운트) 이 effect가 재실행되기 직전에 호출되어,
    // 등록해둔 리스너를 해제하고 메모리 누수를 막습니다.
    return () => window.removeEventListener("click", playBgm)
  }, [audioRef])
}
