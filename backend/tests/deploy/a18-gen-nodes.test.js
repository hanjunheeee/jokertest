'use strict';

// 배포 Node 파일 만들기 시험 — NODE_COUNT 비면 코어 수, docker Node 3개면 n1은 base backend·n2·n3 서비스 글 + 레지스트리 이미지 필수 표시
// 목록 A18-B-217~218 (docs/게임_의도_2026-11-15/시험목록/A18-설정-배포-광고.md), 돌리기: node --test tests/deploy/a18-gen-nodes.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// 파일 쓰기는 main에만 있음 → 순수 함수만 불러 씀 (저장소 nginx·compose 파일 안 건드림)
const { resolveNodeCount, planNodes, renderComposeNodes } = require('../../../deploy/scripts/gen-nodes');

test('A18-B-217 NODE_COUNT 비어 있음, 코어 6개 → 6', () => {
    assert.equal(resolveNodeCount('', 6), 6);
});

test('A18-B-218 NODE_COUNT=3(docker) → n1·n2·n3, n1은 backend, compose 글에 backend-n2·n3 + SERVER_ID, --registry면 이미지 필수 표시', () => {
    const count = resolveNodeCount('3', 6);
    assert.equal(count, 3);
    const nodes = planNodes({ count, target: 'docker' });
    assert.deepEqual(nodes.map((n) => n.id), ['n1', 'n2', 'n3']);
    assert.equal(nodes[0].host, 'backend');

    const plain = renderComposeNodes(nodes, { registry: false });
    for (const text of ['backend-n2:', 'backend-n3:', 'SERVER_ID=n2', 'SERVER_ID=n3']) assert.ok(plain.includes(text), `${text} 없음`);
    // n1은 base backend 그대로라 따로 서비스 안 만듦
    assert.equal(/^\s+backend-n1:/m.test(plain), false);
    assert.equal(plain.includes('SERVER_ID=n1'), false);

    const withRegistry = renderComposeNodes(nodes, { registry: true });
    const imageLines = withRegistry.split('\n').filter((line) => line.trim().startsWith('image:'));
    assert.equal(imageLines.length, 2, '추가 Node마다 이미지 줄');
    for (const line of imageLines) {
        assert.match(line, /\$\{IMAGE_REGISTRY:\?/);
        assert.match(line, /\$\{IMAGE_TAG:\?/);
    }
});
