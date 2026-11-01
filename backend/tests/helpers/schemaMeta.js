process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test';

const db = require('../../models');

const modelNames = () => Object.keys(db).filter((key) => key !== 'sequelize' && key !== 'Sequelize').sort();

const attributesOf = (Model) => (typeof Model.getAttributes === 'function' ? Model.getAttributes() : Model.rawAttributes);

const typeNameOf = (attribute) => {
    const type = attribute && attribute.type;
    if (!type) return 'UNDEFINED';

    const key = type.key || String(type);
    if (key !== 'STRING') return key;

    const length = type._length != null ? type._length : (type.options && type.options.length);
    return length != null ? `STRING(${length})` : 'STRING';
};

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

const belongsToOf = (Model, targetName) => Object.values(Model.associations || {})
    .find((association) => association.associationType === 'BelongsTo'
        && association.target
        && association.target.name === targetName);

module.exports = { db, modelNames, attributesOf, typeNameOf, referenceOf, belongsToOf };
