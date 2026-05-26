import mongoose from 'mongoose';
import { getCompanyScopeStore } from '../utils/companyScopeContext.js';

const QUERY_HOOKS = [
    'find',
    'findOne',
    'countDocuments',
    'findOneAndUpdate',
    'findOneAndDelete',
    'updateOne',
    'updateMany',
    'replaceOne',
    'deleteOne',
    'deleteMany',
];

/**
 * Multi-tenant scope: adds companyId + automatic query filtering when
 * companyScopeAls has companyId (set by resolveCompanyScope middleware).
 * Opt out with schema option { disableTenant: true } (User, Company, shared masters).
 */
export function tenantSchemaPlugin(schema) {
    if (schema.options.disableTenant) return;

    if (!schema.path('companyId')) {
        schema.add({
            companyId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company',
                index: true,
            },
        });
    }

    schema.pre('save', function (next) {
        const id = getCompanyScopeStore()?.companyId;
        if (id) this.companyId = id;
        next();
    });

    schema.pre(QUERY_HOOKS, function (next) {
        const id = getCompanyScopeStore()?.companyId;
        if (id) this.where({ companyId: id });
        next();
    });

    schema.pre('aggregate', function (next) {
        const id = getCompanyScopeStore()?.companyId;
        if (id) this.pipeline().unshift({ $match: { companyId: id } });
        next();
    });

    schema.pre('insertMany', function (next, docs) {
        const id = getCompanyScopeStore()?.companyId;
        if (!id) return next();
        const list = Array.isArray(docs) ? docs : docs != null ? [docs] : [];
        for (const d of list) {
            if (d && typeof d === 'object') d.companyId = id;
        }
        next();
    });
}