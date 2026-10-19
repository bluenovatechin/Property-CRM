import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { Owner, Property } from './types';

export function useProperties(enabled = true) {
  return useQuery({ queryKey: ['properties'], queryFn: () => api.get<Property[]>('/properties'), enabled, staleTime: 60_000 });
}

export function useOwners(enabled = true) {
  return useQuery({ queryKey: ['owners'], queryFn: () => api.get<Owner[]>('/owners'), enabled, staleTime: 60_000 });
}

export function useAssignees(enabled = true) {
  return useQuery({
    queryKey: ['assignees'],
    queryFn: () => api.get<{ id: string; name: string; role: string }[]>('/users/assignees'),
    enabled,
    staleTime: 5 * 60_000,
  });
}
