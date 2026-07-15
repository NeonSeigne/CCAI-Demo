import React from 'react';
import GpaChart from './GpaChart';
import PrereqTree from './PrereqTree';

/**
 * Registry mapping a structured visual spec (`visual.type`) to a vetted,
 * pre-built component. Unknown types render nothing, so the backend can add
 * new visual kinds without breaking older clients.
 */
const REGISTRY = {
  gpa_chart: GpaChart,
  prereq_tree: PrereqTree,
};

const VisualBlock = ({ visual, onSelectCourse }) => {
  if (!visual || !visual.type) return null;
  const Component = REGISTRY[visual.type];
  if (!Component) return null;
  return <Component visual={visual} onSelectCourse={onSelectCourse} />;
};

export default VisualBlock;
