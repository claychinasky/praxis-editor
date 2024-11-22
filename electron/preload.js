const { contextBridge, ipcRenderer } = require('electron');

// Create env object
const env = {
  GITHUB_REPO: process.env.GITHUB_REPO || '',
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || '',
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET || ''
};

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'ipc', {
    on: (channel, func) => {
      if (channel === 'oauth-response') {
        ipcRenderer.on(channel, (_, ...args) => func(...args));
      }
    },
    send: (channel, data) => {
      if (['oauth-login', 'oauth-logout', 'open-oauth-window'].includes(channel)) {
        ipcRenderer.send(channel, data);
      }
    },
    invoke: (channel, data) => {
      if (['oauth-login', 'oauth-logout'].includes(channel)) {
        return ipcRenderer.invoke(channel, data);
      }
    },
    receive: (channel, func) => {
      try {
        let validChannels = ['oauth-response', 'app-error'];
        if (validChannels.includes(channel)) {
          // Deliberately strip event as it includes `sender` 
          ipcRenderer.on(channel, (event, ...args) => func(...args));
        }
      } catch (error) {
        ipcRenderer.send('app-error', {
          type: 'ipc-receive-error',
          error: error.message,
          channel
        });
      }
    },
    removeAllListeners: (channel) => {
      try {
        let validChannels = ['oauth-response', 'app-error'];
        if (validChannels.includes(channel)) {
          ipcRenderer.removeAllListeners(channel);
        }
      } catch (error) {
        ipcRenderer.send('app-error', {
          type: 'ipc-remove-listener-error',
          error: error.message,
          channel
        });
      }
    }
  }
);

// Expose environment variables to the renderer process
contextBridge.exposeInMainWorld('env', env);
