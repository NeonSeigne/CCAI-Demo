import React from 'react';
import { Link, useInRouterContext } from 'react-router-dom';

/** A router Link inside a router, a plain anchor outside one (cards rendered alone). */
export default function ContextLink({ to, children, ...props }) {
  const inRouter = useInRouterContext();
  if (inRouter) return <Link to={to} {...props}>{children}</Link>;
  return <a href={to} {...props}>{children}</a>;
}
