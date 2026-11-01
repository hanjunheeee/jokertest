// 위 줄 배경음 조절 (음소거 그림 버튼 + 그림 막대, 데스크톱 오른쪽 아래 소리 조절과 같은 그림)
// top/LibraryTopBar.jsx가 씀, 값·동작은 데스크톱 useAudioControl
import { useAudioControl } from "@/shared/hooks/useAudioControl.js"
import { getGlobalBgmRef } from "@/shared/hooks/useBgmRuntime.js"
import SoundGroup from "@m/shared/ui/sound/SoundGroup.jsx"

// 서고 위 줄 크기 한 벌 (공용 look 파일엔 안 넣고 여기 둠), 막대는 쓸어 넘기기와 안 섞이게 책 밖에 있음
const LOOK = {
  group: "flex shrink-0 items-center",
  button: "relative z-10 flex size-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 active:scale-95 disabled:cursor-not-allowed",
  icon: "block w-10 select-none",
  title: false,
  track: "relative -ml-2 h-11 w-[clamp(4.5rem,20vw,6.5rem)]",
  bar: "absolute inset-x-0 top-1/2 block h-auto w-full -translate-y-1/2 select-none",
  input: "absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0",
  knot: "pointer-events-none absolute top-1/2 z-10 w-3.5 -translate-x-1/2 -translate-y-1/2",
}

// 전역 배경음 하나를 조절 (데스크톱 PageSoundControlArea와 같은 대상)
export default function LibrarySound() {
  const control = useAudioControl(getGlobalBgmRef())
  return <SoundGroup control={control} look={LOOK} />
}
