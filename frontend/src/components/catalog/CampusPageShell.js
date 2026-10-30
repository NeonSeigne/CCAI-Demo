import React from 'react';
import '../../styles/CampusHome.css';

/** A campus page's main region; the app shell supplies the rail (C2). */
export default function CampusPageShell({ className = '', children }) {
  return (
    <div className={`campus-home ${className}`.trim()}>
      <main className="cc-page-main" id="main-content">
        {children}
      </main>
    </div>
  );
}
