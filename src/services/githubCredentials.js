/**
 * Service to manage GitHub credentials
 */

const STORAGE_KEY = 'github_credentials';

export const getCredentials = () => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  
  try {
    return JSON.parse(stored);
  } catch (error) {
    console.error('Failed to parse stored credentials:', error);
    return null;
  }
};

export const setCredentials = (clientId, clientSecret, repo) => {
  const credentials = {
    clientId,
    clientSecret,
    repo
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
};

export const clearCredentials = () => {
  localStorage.removeItem(STORAGE_KEY);
};

export const hasCredentials = () => {
  return !!localStorage.getItem(STORAGE_KEY);
};

export default {
  getCredentials,
  setCredentials,
  clearCredentials,
  hasCredentials
};
