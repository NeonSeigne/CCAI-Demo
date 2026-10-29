import { useCallback } from 'react';
import { usePlanner } from '../../contexts/PlannerContext';
import { useToast } from '../Toast';

/**
 * Accept a proposal from any page (D9): the change applies where you are,
 * then "Plan updated" with Undo.
 */
export default function useAcceptProposal() {
  const planner = usePlanner();
  const toast = useToast();
  return useCallback((proposal) => {
    if (!planner || !proposal) return Promise.resolve(null);
    return planner.accept(proposal).then((data) => {
      if (data?.plan) {
        toast.show({
          message: 'Plan updated',
          actions: [{ label: 'Undo', onClick: () => planner.undo().catch(() => {}) }],
        });
      }
      return data;
    });
  }, [planner, toast]);
}
