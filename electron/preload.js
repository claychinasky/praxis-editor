const { contextBridge, ipcRenderer } = require('electron');

// Log all environment variables at startup
console.log('Preload script starting, process.env:', {
  GITHUB_REPO: process.env.GITHUB_REPO,
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET: '[REDACTED]'
});

// Create env object first so we can log it
const env = {
  GITHUB_REPO: process.env.GITHUB_REPO || '',
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || '',
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET || ''
};

console.log('Exposing env to window:', {
  ...env,
  GITHUB_CLIENT_SECRET: '[REDACTED]'
});

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'ipc', {
    send: (channel, data) => {
      try {
        let validChannels = ['open-oauth-window'];
        if (validChannels.includes(channel)) {
          console.log('Sending on channel:', channel, 'data:', data);
          ipcRenderer.send(channel, data);
        } else {
          console.warn('Invalid channel send requested:', channel);
        }
      } catch (error) {
        console.error('Error in send:', error);
      }
    },
    receive: (channel, func) => {
      try {
        let validChannels = ['oauth-response', 'app-error'];
        if (validChannels.includes(channel)) {
          console.log('Setting up receiver for channel:', channel);
          // Deliberately strip event as it includes `sender` 
          ipcRenderer.on(channel, (event, ...args) => {
            console.log('Received message on channel:', channel, 'args:', ...args);
            func(...args);
          });
        } else {
          console.warn('Invalid channel subscription requested:', channel);
        }
      } catch (error) {
        console.error('Error in receive:', error);
      }
    },
    removeAllListeners: (channel) => {
      try {
        let validChannels = ['oauth-response', 'app-error'];
        if (validChannels.includes(channel)) {
          console.log('Removing listeners for channel:', channel);
          ipcRenderer.removeAllListeners(channel);
        } else {
          console.warn('Invalid channel unsubscribe requested:', channel);
        }
      } catch (error) {
        console.error('Error in removeAllListeners:', error);
      }
    }
  }
);

// Expose environment variables to the renderer process
contextBridge.exposeInMainWorld('env', env);
