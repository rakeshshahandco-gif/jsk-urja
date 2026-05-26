import { AsyncLocalStorage } from 'async_hooks';

export const companyScopeAls = new AsyncLocalStorage();

export function getCompanyScopeStore() {
    return companyScopeAls.getStore();
}