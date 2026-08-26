\# 마녀사냥꾼 리디자인 — 사망자 대상 UI (frontend)



\## 배경

backend가 WITCH\_HUNTER를 "죽은 사람을 지목해 직업을 알아내는" 역할로 바꿨다(직전 slice):

대상은 사망자만 유효, 사망자가 없는 밤에는 턴 자체가 오지 않는다. 프론트를 이에 맞춘다.

이번 작업은 frontend만 다룬다. backend는 수정하지 않는다.



\## 요구사항 (모두 WITCH\_HUNTER 턴에만 적용 — 다른 역할의 대상 UI는 불변)

1\. 밤 행동 대상 목록: WITCH\_HUNTER 턴에는 사망자만 선택 가능하게 한다.

&#x20;  다른 역할 턴의 "생존자만" 규칙은 그대로 둔다.

2\. NIGHT\_ACTION\_MIN\_DAY\_INDEX의 WITCH\_HUNTER: 1 항목을 backend 규칙 변경에 맞춰 정리한다

&#x20;  — 프론트의 day0 차단 사본은 제거하되, 턴 표시·안내는 canonical night turn

&#x20;  (night\_turn\_changed / 파생 로직) 기준을 그대로 따르므로 사망자가 없는 밤에는

&#x20;  backend가 턴을 만들지 않아 자연히 뜨지 않는다.

3\. 역할 공개·설명 문구 갱신(ingameRoleRevealData.js 등):

&#x20;  "죽은 사람을 지목해 그 직업을 알아냅니다"로 교체한다.

4\. 조사 결과 개인 오버레이 문구는 기존 형식("OO 님의 역할은 X입니다")을 그대로 재사용한다.



\## 수정 금지

\- backend/\*\*, e2e/\*\*

\- JOKER/DOCTOR/GUARD의 대상 UI·문구



\## 검증

\- 대상 목록 단위/DOM 테스트: WITCH\_HUNTER 턴 → 사망자만 선택 가능, 타 역할 턴 불변

\- 문구 상수 테스트 갱신

\- 기존 frontend 전체 테스트 PASS, build PASS

