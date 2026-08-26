\# 밤 개인 조사 결과 오버레이가 뜨지 않음 — GUARD·WITCH\_HUNTER 공통 (진단 후 수정)



\## 배경 (직접 플레이로 재현)

최신 merge 상태(wh-submit-fix 포함)에서 5인 플레이 재현 시, 밤이 정상 판정되고 게임은

진행되지만 GUARD의 조사 결과와 WITCH\_HUNTER의 확인 결과 개인 오버레이가 밤 종료 후

어느 시점에도 뜨지 않는다. 둘 다 안 뜨므로 개인 결과 경로의 공통 지점 문제로 보인다.

backend game-core의 계산·privateResults 적재(1242 근처)와 nightActions 키(uuid)는 코드상

정상으로 확인했다. 의심 구간: (a) backend/socket 계층이 개인 결과를 각 대상에게 전송하는

부분, (b) frontend store 수신·보관, (c) 오버레이 표시 조건(killReveal 뒤·phaseEntrance 앞

순서 규칙 포함). 원인 지점을 특정해 고친다. backend·frontend 중 실제 원인이 있는 쪽만

수정하고, plan에 원인(파일:함수)을 명시한다.



\## 요구사항

1\. GUARD·WITCH\_HUNTER가 밤 행동 결과를 가진 밤이 끝나면, 각자에게 개인 결과 오버레이가

&#x20;  기존 규칙(사망 연출 뒤, phase 진입 연출 앞)대로 다시 뜨게 한다.

2\. WITCH\_HUNTER의 결과는 새 규칙(시신 조사, actionType CONFIRM) 기준으로 표시된다.



\## 수정 금지

\- e2e/\*\*

\- 밤 판정·사망 처리 로직(이번 수정 범위는 개인 결과 전달·표시 경로에 한정)



\## 검증 (통합 경로)

\- backend: 판정 후 개인 결과가 해당 uuid 소켓으로만 전송되는 테스트(비밀 격리 유지)

\- frontend: 수신 → store → 오버레이 표시 조건까지의 테스트

\- 기존 backend·frontend 전체 테스트 PASS

