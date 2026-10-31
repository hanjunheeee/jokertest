'use strict';

const uniqueError = (message) => Object.assign(new Error(message), { name: 'SequelizeUniqueConstraintError' });

const matches = (row, where = {}) => Object.entries(where).every(([key, expected]) => row[key] === expected);

const createFakeTopupDb = () => {
    const productRows = new Map();
    const orderRows = new Map();
    const ledgerRows = [];
    const walletRows = new Map();
    const hooks = { ledgerCreate: null, orderUpdate: null, productFind: null };
    let nextLedgerId = 1;

    const track = (transaction, undo) => { if (transaction) transaction._undo.push(undo); };

    const EconomyCurrencyProduct = {
        async findAll({ where = {}, order } = {}) {
            if (hooks.productFind) hooks.productFind();
            const rows = [...productRows.values()].filter((row) => matches(row, where));
            if (Array.isArray(order) && order.length > 0) {
                rows.sort((a, b) => {
                    for (const [column, direction] of order) {
                        if (a[column] === b[column]) continue;
                        return (a[column] < b[column] ? -1 : 1) * (direction === 'DESC' ? -1 : 1);
                    }
                    return 0;
                });
            }
            return rows.map((row) => ({ ...row }));
        },
        async findOne({ where = {} } = {}) {
            if (hooks.productFind) hooks.productFind();
            const row = [...productRows.values()].find((candidate) => matches(candidate, where));
            return row ? { ...row } : null;
        },
    };

    const EconomyTopupOrder = {
        async create(values) {
            if (orderRows.has(values.order_id)) throw uniqueError('duplicate order_id');
            const row = {
                status: 'CREATED', bonus_amount: 0, payment_key: null, lease_token: null, lease_expires_at: null,
                approved_at: null, granted_at: null, failure_code: null, created_at: new Date(), ...values,
            };
            row.update = async (patch, options = {}) => {
                if (hooks.orderUpdate) hooks.orderUpdate(patch);
                if (patch.payment_key && [...orderRows.values()].some((other) => other !== row && other.payment_key === patch.payment_key)) {
                    throw uniqueError('duplicate payment_key');
                }
                const { update, ...before } = row;
                Object.assign(row, patch);
                track(options.transaction, () => Object.assign(row, before));
            };
            orderRows.set(row.order_id, row);
            return row;
        },
        async findOne({ where = {} } = {}) {
            return [...orderRows.values()].find((row) => matches(row, where)) ?? null;
        },
        async update(patch, { where }) {
            const targets = [...orderRows.values()].filter((row) => matches(row, where));
            for (const row of targets) Object.assign(row, patch);
            return [targets.length];
        },
    };

    const EconomyLedgerEntry = {
        async create(fields, options = {}) {
            if (hooks.ledgerCreate) hooks.ledgerCreate(fields);
            if (ledgerRows.some((row) => row.user_id === fields.user_id && row.reference_event_id === fields.reference_event_id)) {
                throw uniqueError('duplicate ledger reference');
            }
            const row = { id: nextLedgerId++, created_at: new Date(), ...fields };
            ledgerRows.push(row);
            track(options.transaction, () => { const index = ledgerRows.indexOf(row); if (index !== -1) ledgerRows.splice(index, 1); });
            return row;
        },
        async findOne({ where = {} } = {}) {
            return ledgerRows.find((row) => matches(row, where)) ?? null;
        },
    };

    const EconomyWallet = {
        async create({ user_id, balance_gold, balance_diamond }, options = {}) {
            if (walletRows.has(user_id)) throw uniqueError('duplicate wallet');
            const row = { user_id, balance_gold, balance_diamond };
            row.update = async (patch, updateOptions = {}) => {
                const { update, ...before } = row;
                Object.assign(row, patch);
                track(updateOptions.transaction, () => Object.assign(row, before));
            };
            walletRows.set(user_id, row);
            track(options.transaction, () => walletRows.delete(user_id));
            return row;
        },
        async findOne({ where = {} } = {}) {
            return [...walletRows.values()].find((row) => matches(row, where)) ?? null;
        },
    };

    const sequelize = {
        models: { EconomyWallet },
        async transaction(callback) {
            const transaction = { LOCK: { UPDATE: 'UPDATE' }, _undo: [] };
            try {
                return await callback(transaction);
            } catch (error) {
                while (transaction._undo.length > 0) transaction._undo.pop()();
                throw error;
            }
        },
    };

    return {
        sequelize,
        EconomyCurrencyProduct,
        EconomyTopupOrder,
        EconomyLedgerEntry,
        hooks,
        addProduct: (row) => { productRows.set(row.product_id, { ...row }); },
        updateProduct: (productId, patch) => { Object.assign(productRows.get(productId), patch); },
        deleteProduct: (productId) => { productRows.delete(productId); },
        orders: () => [...orderRows.values()],
        order: (orderId) => orderRows.get(orderId),
        ledger: () => ledgerRows,
        wallet: (userId) => walletRows.get(userId),
        diamond: (userId) => walletRows.get(userId)?.balance_diamond ?? 0,
    };
};

module.exports = { createFakeTopupDb };
