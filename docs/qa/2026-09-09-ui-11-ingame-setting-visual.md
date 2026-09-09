# UI-11 인게임 상단 컨트롤·사이드 패널·인게임 설정·기록 패널 이식 — 시각 확인 기록

- 상태: **미검증** (브라우저 환경 없음). UI-16에서 수행한다.
- 코드 검증 결과 (사람 검토, 2026-09-09 10:10):
  - 원격 controls 컴포넌트·상수 30개 모두 존재(20개 동일). 차이는 import 치환과 다음 적응뿐: 설정 탭·볼륨 상태를 `useInGameSettingPanel` 훅으로 올리고 설정 화면(UI-05)과 `settingsStore`를 공유, 사운드 항목 상수를 settings 도메인에서 재export, 기록 패널은 로컬 데이터 소스 유지.
  - 원격이 삭제한 `PlayerRecordListHeader.jsx`·`ingamePlayerRecordListAssets.js` 삭제 완료.
  - 방장 판단: 게임 시작 시 `matchingStore.hostUuid`를 `ingameStore.hostUuid`로 넘기고 `clearGame`에서 지움. 이전 세션·방장 없음에서 false를 검증하는 테스트 포함. 강퇴는 서버 이벤트 없이 UI만.
  - frontend 테스트 1027개·build·backend game-core 481개 통과. lockfile 변경 없음.
