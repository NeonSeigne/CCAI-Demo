import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

/**
 * Legacy /plan/semester route — redirects into chat with the semester skill open.
 */
const SemesterPlannerPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const planId = searchParams.get('planId');
    navigate('/chat', {
      replace: true,
      state: {
        openSemesterPlanner: true,
        ...(planId ? { planId } : {}),
      },
    });
  }, [navigate, searchParams]);

  return (
    <div className="auth-boot-screen" role="status" aria-live="polite">
      Opening semester planner…
    </div>
  );
};

export default SemesterPlannerPage;
