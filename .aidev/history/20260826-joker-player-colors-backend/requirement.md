\# 참가자 색상 배정 (backend)



\## 배경

플레이어 카드 테두리·채팅 닉네임 색을 현재 프론트가 정하고 있어 창마다 같은 참가자가

다른 색으로 보일 수 있다. 색의 canonical 원천을 backend로 옮긴다. 이번 작업은 backend만

다룬다. frontend는 수정하지 않는다.



\## 요구사항

1\. 게임 시작 시(역할 배정과 같은 시점) 참가자마다 colorIndex(0..9)를 겹치지 않게 배정한다.

&#x20;  participants 셔플과 동일하게 randomFn 주입 가능한 순수 계산으로 만든다.

&#x20;  실제 색상값(hex)은 backend가 모른다 — 인덱스만 배정하고 팔레트는 프론트 소관.

2\. colorIndex를 다음 payload의 참가자 정보에 포함한다:

&#x20;  game\_started, 세션 스냅샷(재접속), ENDED winResult.reveals.

&#x20;  role/team 같은 비밀 정보 규칙에는 해당하지 않는다(색은 전원 공개 정보).

3\. DEBUG\_FIXED\_ROLES와 무관하게 동작한다(색은 항상 셔플 배정).



\## 수정 금지

\- frontend/\*\*, e2e/\*\*

\- 역할 배정·판정 로직



\## 검증

\- 배정 단위 테스트: 5인/10인에서 중복 없음, randomFn 결정성, 참가자 수 > 팔레트 수 방어(순환 배정)

\- payload 테스트: game\_started·스냅샷·reveals에 colorIndex 포함, 기존 비밀 검사기 통과

\- 기존 backend 전체 테스트 PASS

