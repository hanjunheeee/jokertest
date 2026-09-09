# UI-13 인게임 배경·타임바·페이지 조립 이식 — 시각 확인 기록

- 상태: **미검증** (브라우저 환경 없음). UI-16에서 수행한다.
- 코드 검증 결과 (사람 검토, 2026-09-09 11:40):
  - 원격 timebar 컴포넌트·상수·InGameBackground 4개 파일 모두 존재(3개 동일, `InGameTimebar.jsx`는 로컬 밤 턴 남은 시간 표시 8줄 추가).
  - `InGamePage`는 로컬 흐름 유지: snapshot `checking` 리다이렉트 보류(세션 가드 유틸로 분리), 서버 주도 밤 턴 역할·남은 시간, `InGameVoteStatusPanel`, 로컬 오버레이 스택. 원격 은닉 릴·개인 결과·사망 연출 배선은 들어오지 않음(소스 가드 테스트).
  - 타임바 문구는 `selectInGameTimebarStatusMessage`가 로컬 nightTurnRole·phase·dayIndex·남은 시간으로 생성. 역할 미제공 시 은닉 테스트 포함.
  - 추가 요구: `useInGameResultNavigation`(원격 그대로, store phase/winResult만 읽음)을 이식해 ENDED→/gameresult 이동 연결. hold는 UI-14에서 사망 연출 큐와 연결.
  - 보호 파일(오버레이 스택·밤 턴 셀렉터·snapshot 동기화·store)·lockfile 변경 없음. frontend 테스트 1105개·build·backend 481개 통과.
