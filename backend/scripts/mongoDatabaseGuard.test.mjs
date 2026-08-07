/**
 * Unit tests for mongoDatabaseGuard (no network, no secrets).
 * Run: node backend/scripts/mongoDatabaseGuard.test.mjs
 */
import assert from 'node:assert/strict';
import {
    assertSafeMongoDatabase,
    assertSafeMongoUrl,
    extractDatabaseNameFromUrl,
    STAGING_SAFETY_BLOCK,
    DEV_SAFETY_BLOCK,
    PROD_DB_OVERRIDE_VALUE,
} from '../src/utils/mongoDatabaseGuard.js';

function throws(fn, messageIncludes) {
    let caught;
    try {
        fn();
    } catch (e) {
        caught = e;
    }
    assert.ok(caught, 'expected throw');
    assert.match(String(caught.message), new RegExp(messageIncludes.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

assert.equal(extractDatabaseNameFromUrl('mongodb+srv://u:p@host.example/jskurja-staging?x=1'), 'jskurja-staging');
assert.equal(extractDatabaseNameFromUrl('mongodb://127.0.0.1:27017/jskurja-dev'), 'jskurja-dev');
assert.equal(extractDatabaseNameFromUrl('mongodb+srv://u:p@host.example/jskurja-prod'), 'jskurja-prod');

assert.doesNotThrow(() =>
    assertSafeMongoDatabase({ appEnv: 'staging', databaseName: 'jskurja-staging' })
);
assert.doesNotThrow(() =>
    assertSafeMongoDatabase({ appEnv: 'production', nodeEnv: 'production', databaseName: 'jskurja-prod' })
);
assert.doesNotThrow(() =>
    assertSafeMongoDatabase({ appEnv: 'development', databaseName: 'jskurja-dev' })
);

throws(
    () => assertSafeMongoDatabase({ appEnv: 'staging', databaseName: 'jskurja-prod' }),
    STAGING_SAFETY_BLOCK
);
throws(
    () => assertSafeMongoUrl('mongodb+srv://u:p@x/jskurja-prod', { appEnv: 'staging' }),
    STAGING_SAFETY_BLOCK
);
throws(
    () => assertSafeMongoDatabase({ appEnv: 'development', nodeEnv: 'development', databaseName: 'jskurja-prod' }),
    DEV_SAFETY_BLOCK
);
throws(
    () => assertSafeMongoDatabase({ nodeEnv: 'development', databaseName: 'jskurja-prod' }),
    DEV_SAFETY_BLOCK
);

assert.doesNotThrow(() =>
    assertSafeMongoDatabase({
        appEnv: 'development',
        nodeEnv: 'development',
        databaseName: 'jskurja-prod',
        allowProdOverride: PROD_DB_OVERRIDE_VALUE,
    })
);

console.log('mongoDatabaseGuard.test.mjs: ALL PASSED');
