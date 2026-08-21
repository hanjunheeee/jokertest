\# ENDED 시 전원 역할 공개 (backend)



\## 배경

게임 종료(ENDED) 시 buildTerminalFields(session)가 { phase, winResult, players }를 만들어

밤 판정·재판 판정 두 경로에서 broadcast한다. 현재 players는 { uuid, alive }만 담고,

winResult는 { winner }만 담는다. 게임이 끝났으므로 전원 역할을 공개해도 비밀 누설이 아니다.

이번 작업은 backend만 다룬다. frontend는 수정하지 않는다.



\## 요구사항

1\. buildTerminalFields의 반환에 다음을 추가한다:

&#x20;  - winResult.reveals: 모든 참가자의 \[{ uuid, nickname, role, team, alive }] 배열.

&#x20;    team은 ROLE\_TEAMS\[role]. 순서는 session.players 삽입 순서 그대로.

&#x20;  - winResult.mvp: null (MVP 기획 미확정 — 슬롯만 예약한다)

&#x20;  기존 키(phase, winResult.winner, players\[{uuid, alive}])는 그대로 유지한다.

2\. reveals는 phase === 'ENDED'일 때만 만들어진다. buildTerminalFields가 ENDED가 아닌 세션에

&#x20;  대해 호출되면 reveals를 포함하지 않는다(방어).

3\. 스냅샷 하이드레이션(재접속) 경로의 ENDED 세션 필드 조립에도 동일한 reveals를 포함한다.

&#x20;  (1704줄 부근 주석 "다른 참가자의 role/team은 포함하지 않는다"에 ENDED 예외를 명시한다.)

4\. 개인 socket/repository/Map/Set 객체는 어떤 값에도 담지 않는다(기존 원칙).



\## 수정 금지

\- frontend/\*\* 전체

\- evaluateWinCondition, finalizeGameSession의 판정 로직

\- 밤 행동 판정·재판 판정의 기존 흐름(broadcast 순서·ACK 계약)



\## 검증

\- buildTerminalFields 단위 테스트: ENDED 세션 → reveals에 전원 role/team/alive 정확, mvp === null

\- ENDED가 아닌 세션 → reveals 없음

\- 스냅샷 경로: ENDED 세션 하이드레이션 payload에 reveals 포함, 진행 중 세션에는 없음

\- 기존 backend 전체 테스트 PASS (backend에서 npm install/ci 절대 금지 — 기존 node\_modules 사용)

