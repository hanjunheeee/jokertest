// 스키마 검증 테스트가 공유하는 Sequelize 메타데이터 헬퍼입니다.
//
// config/config.json의 모든 환경이 mysql이라 테스트에서 실제 DB에 붙을 수 없습니다.
// 대신 models/index.js가 등록한 모델 정의(테이블명·컬럼 타입·NOT NULL·외래키 참조)를
// 읽습니다. sequelize.sync()가 CREATE TABLE을 만들 때 쓰는 값이 바로 이 정의라서,
// 여기서 확인한 내용이 실제로 만들어지는 테이블 모양과 같습니다.

// models/index.js는 require 시점에 DATABASE_URL을 파싱합니다(연결은 하지 않습니다).
// npm test는 --env-file=.env.test로 이 값을 주지만, 파일 하나만 직접 실행할 때도
// 동작하도록 없을 때만 더미 값을 채웁니다.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test';

const db = require('../../models');

/** db에 등록된 모델 이름들(sequelize/Sequelize 핸들 제외) */
const modelNames = () => Object.keys(db).filter((key) => key !== 'sequelize' && key !== 'Sequelize').sort();

/** 모델의 컬럼 정의 맵. getAttributes는 Sequelize 6의 rawAttributes 접근자입니다. */
const attributesOf = (Model) => (typeof Model.getAttributes === 'function' ? Model.getAttributes() : Model.rawAttributes);

/** 'STRING(20)' · 'UUID' · 'DATE'처럼 dialect와 무관한 타입 이름을 만듭니다. */
const typeNameOf = (attribute) => {
    const type = attribute && attribute.type;
    if (!type) return 'UNDEFINED';

    const key = type.key || String(type);
    if (key !== 'STRING') return key;

    const length = type._length != null ? type._length : (type.options && type.options.length);
    return length != null ? `STRING(${length})` : 'STRING';
};

/**
 * 컬럼의 외래키 참조를 { table, key }로 정규화합니다.
 * references.model은 문자열(테이블명)일 수도, 모델 객체일 수도 있어 둘 다 받습니다.
 */
const referenceOf = (attribute) => {
    const references = attribute && attribute.references;
    if (!references) return null;

    const model = references.model;
    let table = model;
    if (model && typeof model !== 'string') {
        table = model.tableName || (typeof model.getTableName === 'function' ? model.getTableName() : model);
    }

    return { table: typeof table === 'string' ? table : String(table), key: references.key };
};

/** 대상 모델(targetName)을 가리키는 belongsTo 관계를 찾습니다. 없으면 undefined. */
const belongsToOf = (Model, targetName) => Object.values(Model.associations || {})
    .find((association) => association.associationType === 'BelongsTo'
        && association.target
        && association.target.name === targetName);

module.exports = { db, modelNames, attributesOf, typeNameOf, referenceOf, belongsToOf };
