\# WITCH\_HUNTER 시신 제출이 INVALID\_TARGET으로 거부됨 — 밤 교착 (backend)



\## 배경 (재현·로그로 확인된 실버그)

새 규칙(사망자만 조사)이 merge된 최신 코드에서, 실제 플레이 재현 시 WITCH\_HUNTER의

사망자 지목 제출이 서버에서 거부된다. 로그:

\[밤 행동 제출] WITCH\_HUNTER, targetId=<사망자 uuid> → { ok: false, code: 'INVALID\_TARGET' }

결과: WH 제출이 nightActions에 저장되지 않고 areAllEligibleNightActionsSubmitted가

영원히 false → 밤 판정 미트리거 → 게임 전체 교착(제 2일 밤, 5인 중 1명 사망 상황에서 재현).

submitNightAction의 WITCH\_HUNTER 분기(target.alive면 거부)는 존재하나, 그 분기에

도달하기 전 어딘가에서 사망 대상이 먼저 거부되는 것으로 보인다 — 대상 후보 검증,

targetId 유효성 검사, 또는 소켓 계층(backend/socket/gameSession.js)의 사전 검증 등

제출 경로 전체를 진단해 실제 거부 지점을 찾아 고친다.



\## 요구사항

1\. WITCH\_HUNTER의 사망자 지목이 제출 경로 전체(소켓 수신 → game-core 검증 → 저장)를

&#x20;  통과해 nightActions에 저장되게 한다. 생존자 지목은 여전히 INVALID\_TARGET.

2\. 다른 역할(JOKER/DOCTOR/GUARD)의 "생존자만" 검증은 불변.

3\. plan에 실제 거부 지점(파일:함수)을 명시한다.



\## 수정 금지

\- frontend/\*\*, e2e/\*\*



\## 검증 (통합 경로 필수 — 단위 분기만으로는 이 버그를 놓쳤다)

\- 5인 세션에서 1명 사망시킨 뒤, WH가 그 시신을 지목해 소켓 계층 진입점부터 제출 →

&#x20; ok:true, nightActions 저장, 마지막 제출로서 밤 판정(prepareNightResolution)까지

&#x20; 트리거되는 통합 테스트

\- WH 생존자 지목 → INVALID\_TARGET 유지

\- 기존 backend 전체 테스트 PASS

