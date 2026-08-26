\# 참가자 색상 적용 (frontend)



\## 배경

backend가 game\_started·스냅샷·winResult.reveals의 참가자 정보에 colorIndex(0..9)를 포함한다

(직전 slice). 프론트가 자체적으로 정하던 카드 테두리·채팅 닉네임 색을 이 값 기반으로

바꾼다. 이번 작업은 frontend만 다룬다. backend는 수정하지 않는다.



\## 요구사항

1\. 팔레트 상수(10색)를 한 곳에 정의한다. 어두운 배경 위에서 서로 구분되는 색으로,

&#x20;  기존 프론트에 플레이어 색 팔레트가 이미 있으면 그것을 이 상수로 승격해 재사용한다.

2\. store가 참가자 colorIndex를 보존한다(game\_started·스냅샷 파서 갱신, 재접속 유지).

3\. 인게임 플레이어 카드 테두리 색과 채팅 메시지 닉네임 색을 colorIndex 팔레트로 그린다.

&#x20;  colorIndex가 없는 참가자(구세션 등)는 기존 기본색으로 fallback한다.

4\. 기존 프론트의 색 결정 로직(랜덤/해시 등)이 있으면 제거하고 이 경로로 일원화한다.



\## 수정 금지

\- backend/\*\*, e2e/\*\*

\- 카드·채팅의 색 이외 스타일



\## 검증

\- colorIndex → 색 매핑 단위 테스트(범위 밖 인덱스 순환), store 보존 테스트

\- 카드·채팅 DOM 테스트: colorIndex 반영, 부재 시 fallback

\- 기존 frontend 전체 테스트 PASS, build PASS

