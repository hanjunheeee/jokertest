# UI-10 인게임 플레이어 보드·카드·명판 이식 — 시각 확인 기록

- 상태: **미검증** (브라우저 환경 없음). UI-16에서 수행한다.
- 코드 검증 결과 (사람 검토, 2026-09-09 09:05):
  - 대상 9개 파일 중 8개 원격과 동일(공백 제외). `ingamePlayerAssets.js`만 경로 정규화를 NFD→NFC로 바꿈. `publicAsset`이 요청 직전에 NFC로 맞추므로 런타임 경로는 동일하며, 에셋 존재 검사 테스트가 통과함.
  - 색상 경로: 서버 배정 인덱스 → `buildPlayerSessionSourceFromGameState`/`mergeSourcePlayerWithPreview`가 `themeIndex`·`theme`를 만들고, 이식된 `InGamePlayerBoard`가 `player.theme`를 읽음. 로컬 유틸과 테스트는 수정 없음.
  - frontend 테스트 1009개·build·backend game-core 481개 통과. lockfile 변경 없음.
