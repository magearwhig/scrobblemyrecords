import { KeyRound, ShieldCheck } from 'lucide-react';
import React, { useState } from 'react';

import {
  clearApiToken,
  getApiToken,
  setApiToken,
} from '../../services/apiToken';
import { Button } from '../ui/Button';

/**
 * Entry point for the API token, needed only when the backend is bound to a
 * non-loopback address (the Raspberry Pi / LAN setup in the README).
 *
 * On the ordinary localhost setup the backend requires no token and this
 * section is simply left blank.
 */
const SettingsApiTokenSection: React.FC = () => {
  const [token, setToken] = useState(() => getApiToken() ?? '');
  const [saved, setSaved] = useState(false);

  const stored = getApiToken();

  const handleSave = () => {
    setApiToken(token);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 3000);
  };

  const handleClear = () => {
    clearApiToken();
    setToken('');
    setSaved(false);
  };

  return (
    <div className='card'>
      <h3>
        <KeyRound size={20} aria-hidden='true' /> API Token
      </h3>

      <p className='form-hint'>
        Only needed when this UI talks to a backend running on another machine
        (for example a Raspberry Pi on your network). A backend bound to
        localhost requires no token, and you can leave this empty.
      </p>

      <div className='form-group'>
        <label className='form-label' htmlFor='api-token-input'>
          Token
        </label>
        <input
          id='api-token-input'
          type='password'
          className='form-input'
          value={token}
          onChange={e => setToken(e.target.value)}
          placeholder='Paste the value of API_TOKEN from the server'
          autoComplete='off'
          spellCheck={false}
        />
        <small className='form-helper-text'>
          Kept for this browser session only, so you will re-enter it after
          restarting your browser. It is sent as an Authorization header on
          every request and travels in plaintext over HTTP — use TLS or a
          reverse proxy outside a trusted network.
        </small>
      </div>

      <div className='settings-actions-row'>
        <Button onClick={handleSave} disabled={!token.trim()}>
          Save token
        </Button>
        {stored && (
          <Button variant='secondary' onClick={handleClear}>
            Clear
          </Button>
        )}
      </div>

      {saved && (
        <p className='form-hint'>
          <ShieldCheck size={16} aria-hidden='true' /> Token saved for this
          session.
        </p>
      )}
    </div>
  );
};

export default SettingsApiTokenSection;
