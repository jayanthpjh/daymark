import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { DaymarkState } from '@/lib/types';

export class ApiError extends Error { errors?: unknown; status: number; constructor(message: string, status: number, errors?: unknown) { super(message); this.status = status; this.errors = errors; } }

export async function api<T = any>(path: string, body?: unknown, method?: string): Promise<T> {
  const res = await fetch(path, { cache: 'no-store', method: method || (body === undefined ? 'GET' : 'POST'), headers: body === undefined ? undefined : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  let data: any = {};
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data.errors);
  return data as T;
}

export const stateKey = ['state'] as const;
// Polls /api/state. Screens keep local form state, so a refetch never clobbers a draft.
// True while the live event stream is connected: polling then only backs it up.
export const liveStream = { connected: false };
export const useDaymarkState = () => useQuery<DaymarkState>({ queryKey: stateKey, queryFn: () => api('/api/state'), refetchInterval: () => (liveStream.connected ? 20000 : 4000), staleTime: 2000 });

export function useApiMutation<V = any, R = any>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: stateKey }) });
}
