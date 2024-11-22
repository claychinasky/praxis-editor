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
    send: (channel, data) => {
      try {
        let validChannels = ['open-oauth-window'];
        if (validChannels.includes(channel)) {
          ipcRenderer.send(channel, data);
        }
      } catch (error) {
        ipcRenderer.send('app-error', {
          type: 'ipc-send-error',
          error: error.message,
          channel
        });
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
