\# 마녀사냥꾼 리디자인 — 죽은 사람의 직업 조사 (backend)



\## 배경

현재 WITCH\_HUNTER는 생존자를 지목해 역할을 확인한다(GUARD 상위호환). 기획 의도는

"죽은 사람을 지목해 그 직업을 알아내는" 역할이다. 이번 작업은 backend만 다룬다.

frontend는 수정하지 않는다.



\## 요구사항 (모두 WITCH\_HUNTER에만 적용 — 다른 역할의 규칙은 불변)

1\. 대상 반전: WITCH\_HUNTER의 밤 행동 대상은 사망자만 유효하다.

&#x20;  생존자를 지목하면 INVALID\_TARGET으로 거부한다. submitNightAction의 기존

&#x20;  "대상 생존" 검증을 WITCH\_HUNTER에 한해 "대상 사망" 검증으로 바꾼다.

2\. eligibility 변경: nightActionMinDayIndex 기반 day0 제한을 제거하고,

&#x20;  "그 밤 시작 시점에 사망자가 1명 이상 존재"를 WITCH\_HUNTER의 eligibility 조건으로

&#x20;  한다. 사망자가 없는 밤에는 NIGHT 턴 진행(computeCurrentNightTurnRole)이

&#x20;  WITCH\_HUNTER를 zero-actor처럼 건너뛰고, night\_turn\_changed에도 나타나지 않는다.

3\. 결과 계산(computeWitchHunterConfirmationResult)의 반환 형태({targetId, role})는

&#x20;  유지한다 — 대상이 사망자라는 점만 달라진다.

4\. 반복 조사는 막지 않는다(같은 시신을 다른 밤에 다시 지목 가능).

5\. SELF\_TARGET 규칙은 그대로 둔다(본인은 살아있으므로 1번 검증에서 자연 거부된다).



\## 수정 금지

\- frontend/\*\*, e2e/\*\*

\- JOKER/DOCTOR/GUARD의 대상·eligibility 규칙

\- night resolution의 사망 판정 로직



\## 검증

\- 사망자 지목 → 제출 성공, 결과에 해당 시신의 role

\- 생존자 지목 → INVALID\_TARGET, nightActions 무변경

\- 사망자 0명인 밤 → WITCH\_HUNTER가 턴 진행에서 건너뛰어짐(첫 밤 포함)

\- 사망자 발생 후 밤 → WITCH\_HUNTER 턴 정상 등장

\- day0라도 사망자가 있으면(이론상) 조사 가능 — minDayIndex 제한이 제거되었음을 확인

\- 기존 backend 전체 테스트 PASS (WITCH\_HUNTER 기존 기대를 새 규칙으로 갱신)

