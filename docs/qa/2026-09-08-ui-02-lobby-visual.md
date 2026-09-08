# UI-02 로비 화면 이식 — 시각 확인 기록

- 상태: **미검증** (파이프라인 실행 환경에서 브라우저·서버·DB를 띄우지 못함)
- 대상: 로비 배경, 메뉴(게임플레이·상점·기억의 서고→/library·명예의 전당→/podium·설정·로그아웃·고객센터), 프로필 영역, 디스코드 버튼, 친구 목록 즐겨찾기 별·필터
- 코드 검증 결과 (사람 검토, 2026-09-08 22:15):
  - 원격 `origin/feature/ui-Phase1complete` 대비 로비 도메인 30개 파일 중 22개 동일, 6개는 import 경로·로컬 계약 유지 차이만, 2개(`useLobbyIntro.js`, `useFriendSearch.js`)는 요구사항대로 로컬 로직 유지 + shared `useVideoIntro` 통합·표시 플래그 추가.
  - `lobbyAssets.js`가 참조하는 메뉴·배경·버튼 에셋 13개 모두 `frontend/public`에 존재.
  - frontend 테스트 858개·build·backend game-core 481개 통과 (파이프라인 기계 검사).
- 시각 확인은 UI-16(전체 흐름 실제 브라우저 회귀 검증)에서 수행한다.
