export interface RoleFamily { id: string; label: string; terms: string[] }
export const ROLE_FAMILIES: readonly RoleFamily[];
export function roleFamiliesForTitle(title: string): string[];
export function familyLabelsForTitle(title: string): string[];
export function suggestRoleFamilies(titles: string | string[]): string[];
export function collectionRoleTerms(roleSearch: string, roleFamilies?: string[], options?: { limit?: number; rotation?: number }): string[];
export function matchesRoleTargets(title: string, roleSearch: string, roleFamilies?: string[]): boolean;
