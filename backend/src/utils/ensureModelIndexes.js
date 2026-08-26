/**
 * Lazily create indexes (and thus the collection) on first real feature use.
 * Used for optional models with schema autoCreate/autoIndex = false.
 * Does not change query semantics — only defers Atlas collection creation.
 */
const ready = new WeakSet();

export async function ensureModelIndexes(Model) {
    if (!Model || ready.has(Model)) return;
    await Model.createIndexes();
    ready.add(Model);
}
