// 파일 역할: bgmAssets.js - 화면과 로직에서 재사용하는 상수입니다.
//
// 2026-09-22 운영자 결정(AUDIO-01 완화): 라이선스 문제가 없는 음악은 허용한다. 배경음은 아래 한 곡뿐이고,
// 출처·저작권 상태를 여기 기록한다 — 기록 없는 음원은 등록하지 않는다(미확인 소리 무음 원칙 유지).
// 예전 /bgm/LoginMusic.wav는 출처를 보증할 수 없어 재생 경로에서 뺐다(파일은 보존, 참조 없음).
export const MUSIC_PLAYBACK_ENABLED = true

// 공통 배경음악 public 에셋 경로입니다.
export const BGM_ASSETS = {
  loginMusic: "/bgm/death_waltz.ogg",
}

// 등록된 음원의 출처와 라이선스 — 운영자 승인(2026-09-22)으로 받았다.
export const BGM_LICENSES = Object.freeze({
  "/bgm/death_waltz.ogg": Object.freeze({
    title: "Death Waltz",
    author: "northivanastan (Ivan Stanton)",
    source: "https://opengameart.org/content/death-waltz",
    license: "CC0 1.0 (저작권 포기 — 출처 표기 의무 없음)",
    fetchedAt: "2026-09-22",
  }),
})
