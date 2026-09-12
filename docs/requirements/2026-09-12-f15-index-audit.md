# F15 인덱싱·계획 전달 감사

2026-09-12. 읽기 전용 감사이며 재인덱싱하지 않았다.

## 확인 결과

1. Pluto 자체 .pluto/index.json은 rev7, 기준 커밋 f5682a1f0d4b7c7853d777d150a9c2067fd5286c, 생성 2026-09-12 09:21:08 KST. F15 착수09:21:13보다5초 앞서 생성됐다. 처음부터 전체 인덱싱이 안 된 상태는 아니다.
2. 당시 자체 인덱스에 myPageLayoutStyle(X0808), myPageBannerStyle(X0807), skinCardWearLayout(X0812), SkinCardWearPreview(K0280), InGamePlayerNameplate(K0036)가 존재한다. 뒤늦게 고친 소비처가 모두 미등록이었던 것은 아니다.
3. Codebase Memory MCP 본체 프로젝트 C-Users-minsa-jokertest는 현재 ready(5895노드/9675간선). 그러나 useBgmAutoplay/useLobbyMenuNav는 심볼명 검색과 파일 경로 검색 모두0건. Pluto 자체 인덱스에는 H0074/X0858, H0060/X0682로 존재한다. 두 인덱스의 커버리지 불일치는 확인됐다. MCP ready는 모든 현재 파일이 색인됐다는 보장이 아니다.
4. PLAN1/2 응답도 당시 useBgmAutoplay/useLobbyMenuNav 그래프 검색 실패를 기록한다. CLAUDE-PLAN1은 실제 파일을 확인한 뒤 useBgmAutoplay가 그래프 검색 실패와 달리 존재한다고 명시한다. 따라서 현재 상태만으로 과거를 추측한 것이 아니라 당시 기록에도 같은 문제가 있다.
5. 현재 MCP에 AZ 작업본 C-Users-minsa-jokertest-slices-AZ는 project not found or not indexed. 이는 별도 작업본 인덱스 부재를 뜻한다. 본체 기준으로 시작하는 최초 계획 자체가 무효라는 뜻은 아니지만, 작업본에서 새로 생긴 함수를 본체 그래프로 검색하는 방식은 최신 상태를 보장하지 못한다. 현재 조회만으로 언제부터 AZ 색인이 없었는지는 확정하지 않는다.
6. PLAN1/2 prompt에 위 마이페이지/미리보기 파일명은 전체 파일 목록으로 전달됐다. PLAN3/4 상세·최종 prompt에는 해당 파일명이 없고 IMPL1 prompt에도 myPageLayoutStyle/skinCardWearLayout이 없다. 전체 파일 목록에 있다는 것과 실제 본문·연결이 모델에게 전달됐다는 것은 다르다.
7. PLAN4는 unsure9개를 남겼고 notes에 '현재 계획을 구현 준비 완료로 판정하지 않는다'고 명시했다. CLAUDE-PLAN1은 선택한 부품의 존재·행동이 맞고 미확인을 정직하게 남겼다는 이유로 PASS했다. 동일한 미확정 notes가 IMPL1에 전달돼 구현이 시작됐다. 계획의 정직성·선택한 부품의 타당성은 확인했으나 실제 소비처 완전성과 구현 준비 여부는 해결되지 않은 채 진행됐다.

## 판단

인덱싱 문제 가능성을 배제할 수 없다는 수준을 넘어, MCP와 자체 인덱스 불일치의 구체적 사례2개가 확인됐다. 다만 cqi·카드미리보기 누락의 전부를 MCP 미색인으로 설명할 수는 없다. 그 파일은 자체 인덱스와 초기 입력에 존재했다. 확인된 경로는 (부분 그래프 검색 실패) + (후보/본문 선택 단계에서 소비처 누락) + (미확정 계획의 PASS 및 구현 진입)이다. 따라서 원인을 구현 모델만의 누락으로 단정한 기존 설명은 정정한다.

## 후속 보정 방향 (미실행)

- 계획 시작 전 자체 인덱스 기준 커밋과 MCP 대상 루트·색인 범위를 대조한다. 날짜/커밋 메타데이터가 없으면 최신이라고 추정하지 않는다.
- 실제 파일 목록에는 있는데 그래프가0건이면 부재로 단정하지 않고 파일 원문을 확인한다.
- 작업본 재시도는 현재 작업본을 검색하고 필요한 경우 별도 인덱스를 생성한다.
- 필수 소비처/검증 계약 unsure를 해소하거나 구체적 작업 지시로 전환했는지 계획 승인에서 확인한다.
- 과거 인덱스와 검색 실패 기록을 보존한 뒤 재인덱싱하고 같은 질의로 전후 결과를 비교해야 한다. 이번 감사에서는 기존 증거를 바꾸지 않았다.

근거: .pluto/index.json; .pluto/slices/AZ/runs/PLAN-1.json~PLAN-4.json, CLAUDE-PLAN-1.json, IMPL-1.json; 현재 codebase-memory-mcp index_status/search_graph 응답.
