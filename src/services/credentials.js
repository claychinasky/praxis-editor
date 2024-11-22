// Credential storage keys
const CRED_KEY = 'github_credentials';

export function getCredentials() {
  try {
    const stored = window.localStorage.getItem(CRED_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch (err) {
    console.error('Error loading credentials:', err);
    return null;
  }
}

export function saveCredentials(credentials) {
  try {
    if (credentials && credentials.clientId && credentials.clientSecret) {
      window.localStorage.setItem(CRED_KEY, JSON.stringify(credentials));
      return true;
    }
    return false;
  } catch (err) {
    console.error('Error saving credentials:', err);
    return false;
  }
}

export function clearCredentials() {
  try {
    window.localStorage.removeItem(CRED_KEY);
    return true;
  } catch (err) {
    console.error('Error clearing credentials:', err);
    return false;
  }
}
