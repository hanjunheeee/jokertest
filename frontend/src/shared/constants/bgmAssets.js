// 배경음 파일 경로·켬 스위치·출처 기록
// 전역 배경음 층·배경음 훅이 씀 (출처 기록은 시험만 봄)
// false면 배경음을 전부 끄고 소리 조절도 잠금
export const MUSIC_PLAYBACK_ENABLED = true

export const BGM_ASSETS = {
  loginMusic: "/bgm/death_waltz.ogg",
}

// 배경음 출처·허가 기록 (CC0라 표기 의무는 없음, 기록용)
export const BGM_LICENSES = Object.freeze({
  "/bgm/death_waltz.ogg": Object.freeze({
    title: "Death Waltz",
    author: "northivanastan (Ivan Stanton)",
    source: "https://opengameart.org/content/death-waltz",
    license: "CC0 1.0 (저작권 포기 — 출처 표기 의무 없음)",
    fetchedAt: "2026-09-22",
  }),
})
