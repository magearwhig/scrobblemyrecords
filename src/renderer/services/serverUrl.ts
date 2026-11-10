/**
 * The backend's address: the host this page was loaded from, on the backend
 * port. On this machine that is localhost; from another device on the network
 * (a phone opening http://<laptop-ip>:8080) it is the laptop, not the phone.
 */
export function defaultServerUrl(): string {
  const port = process.env.REACT_APP_BACKEND_PORT || '3001';
  if (typeof window === 'undefined') return `http://localhost:${port}`;
  const { protocol, hostname } = window.location;
  const scheme = protocol === 'https:' ? 'https:' : 'http:';
  const host = !hostname
    ? 'localhost'
    : hostname.includes(':')
      ? `[${hostname}]`
      : hostname;
  return `${scheme}//${host}:${port}`;
}
