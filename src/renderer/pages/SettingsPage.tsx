import React from 'react';

const SettingsPage: React.FC = () => {
  return (
    <div>
      <div className="card">
        <h2>Settings</h2>
        <p>Application preferences and configuration options.</p>
        <div className="loading">
          <div className="spinner"></div>
          Settings panel coming soon...
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;