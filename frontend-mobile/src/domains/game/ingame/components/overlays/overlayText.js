// 연출 창 글자 모양 모음 (양피지 위 큰 글·작은 글, 어두운 화면 위 글)
// 연출 창들이 같이 씀

// 양피지 위 결과 한 줄 (단계 입장·밤 결과·대기·최종 결과)
export const BIG_MSG_CLASS =
    "font-subheading text-[1.45rem] font-bold leading-snug tracking-wide text-[#3a1a0c] [word-break:keep-all] md:text-[1.9rem] land:text-[1.2rem]"

// 양피지 위 덧붙임 작은 글
export const META_CLASS = "text-[0.78rem] tracking-wide text-[#5b3a20]"

// 어두운 화면 위 큰 글 (추방 안내·결과 넘김)
export const DARK_MSG_CLASS =
    "px-6 text-center font-display text-[1.6rem] font-bold leading-snug tracking-wide text-[#f8ead2] [word-break:keep-all] [text-shadow:0_2px_12px_rgba(0,0,0,0.85)] md:text-[2.2rem] land:text-[1.35rem]"

// 어두운 화면 위 건너뛰기 버튼 (손가락 크기 44px)
export const SKIP_BTN_CLASS =
    "relative z-10 min-h-11 rounded border border-[#d8b982] bg-[#2b1c15] px-6 py-2 text-sm font-semibold tracking-wide text-[#f8ead2] active:bg-[#53321f]"

// 밤 연출 대기 문구 (데스크톱 InGameNightPresentationWait와 같은 글, 화면 파일이라 못 가져와서 둠)
export const NIGHT_WAIT_MSG = "진행을 기다리는 중입니다."
