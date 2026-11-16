// 설정 줄 모양 (줄·제목·설명·오류 글 띠)
// rows/ 줄 컴포넌트 셋·역할 구성 칸(PC·모바일)이 씀
export const SETUP_ROW_CLASS =
  "flex shrink-0 items-start justify-between gap-[clamp(0.45rem,1.1vw,0.75rem)] overflow-visible border-b border-[#8b7355]/35 py-[clamp(0.15rem,0.32vh,0.26rem)] last:border-b-0"

export const SETUP_TITLE_CLASS =
  "font-subheading app-text-scaled [--app-text-size:clamp(1.22rem,1.75vw,1.42rem)] font-bold leading-tight text-[#1a1008]"

// 설명 글: 방 만들기 종이가 어두운 편이라 흐린 갈색 대신 검정
export const SETUP_DESC_CLASS =
  "mt-0 font-subheading app-text-scaled [--app-text-size:clamp(1.02rem,1.38vw,1.16rem)] leading-snug text-black"

// 역할 구성 오류 글 뒤 밝은 띠 (카드 이름판 밝은 띠와 같은 크림색) — 아래쪽 종이가 어두워 검정 글도 대비 4.46이라 색만으로 못 맞춤
export const SETUP_ERROR_BAND_CLASS = "self-center rounded px-[0.4em] bg-[#f5ecd9]/88"
