import { dispatchScope, getScope, useScope } from './scopeStore';

/**
 * Client selection shared by every module (and the top-bar chip), mirrored in the URL as ?client=.
 * Kept as the stable entry point the views already import; the state itself (client + outlet + period)
 * lives in scopeStore.ts and the rules in core/scope.ts. Changing the client also clears the outlet,
 * because an outlet belongs to exactly one client.
 */
export const getClientScope = () => getScope().clientId;

export function setClientScope(id: string): void {
  dispatchScope({ type: 'client', clientId: id });
}

export function useClientScope(): [string, (id: string) => void] {
  const { clientId } = useScope();
  return [clientId, setClientScope];
}
