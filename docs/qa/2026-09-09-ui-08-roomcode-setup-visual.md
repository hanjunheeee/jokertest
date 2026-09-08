# UI-08 방 목록·방 코드·게임 설정 화면 이식 — 시각 확인 기록

- 상태: **미검증** (파이프라인 실행 환경에서 브라우저를 띄우지 못함). 360×800·390×844 방 코드 입력 화면은 UI-16에서 확인한다.
- 코드 검증 결과 (사람 검토, 2026-09-09 07:25):
  - 대상 9개 파일 중 원격과 남은 차이는 로컬 로직 보존분뿐: 방 코드 입력 속성(QA2), 코드 입장 흐름·roomId 전달(L1), 방 코드 복사 안전 처리(QA1), 주석 2줄.
  - 보호 파일(useRoomCodeInput·useRoomInvitePage·useMatchingRoom·roomCode.js·roleComposition·buildCreateRoomPayload·gameSetupOptions)과 lockfile 변경 없음.
  - 방 코드 표시 로직을 `resolveRoomListRowCode.js`로 분리해 테스트 추가. 기존 지정 테스트 5개 수정 없이 통과.
  - frontend 테스트 949개·build·backend game-core 481개 통과 (파이프라인 기계 검사).
