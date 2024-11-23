<template>
  <div class="h-screen flex justify-center items-center bg-dneutral-200 p-4 lg:p-8">
    <div class="max-w-[360px] text-center">
      <h1 class="font-semibold text-xl lg:text-2xl mb-2">Sign in</h1>
      <p class="text-neutral-400 dark:text-neutral-500 mb-6">Sign in with your GitHub account to access your repositories. Data is saved in your browser only.</p>
      <div class="flex flex-col gap-y-4">
        <a @click="login" class="btn-primary justify-center w-full !gap-x-3 cursor-pointer">
          <Icon name="Github" class="h-6 w-6 stroke-2 shrink-0"/>
          <div>Sign in with GitHub</div>
        </a>
        <button v-if="offerPat" class="btn-secondary justify-center w-full" @click="patModal.openModal()">
          Sign in with a Fine-Grained PAT
        </button>
        <button class="btn-secondary justify-center w-full !gap-x-3" @click="credentialsModal.openModal()">
          <Icon name="Settings" class="h-5 w-5 stroke-2 shrink-0"/>
          <div>Manage GitHub Credentials</div>
        </button>
        <button class="btn-secondary justify-center w-full !gap-x-3" @click="tutorialModal.openModal()">
          <Icon name="HelpCircle" class="h-5 w-5 stroke-2 shrink-0"/>
          <div>How to Set Guide</div>
        </button>
      </div>
    </div>
  </div>
  
  <!-- Fine-grained PAT modal -->
  <Modal v-if="offerPat" ref="patModal">
    <template #header>Login with a GitHub fine-gradined PAT</template>
    <template #content>
      <p class="text-sm mb-2 -mt-1 text-neutral-400 dark:text-neutral-500">
        Enter a valid <a class="underline hover:no-underline" href="https://github.com/settings/tokens?type=beta" target="_blank">Fine-grained GitHub Personal Access Token (PAT)</a> with read and write access for the "Contents" endpoints of "Repository permissions".
      </p>
      <input type="text" v-model="patToken" class="w-full"/>
      <div v-if="patToken && !patToken.startsWith('github_pat_')" class="mt-2 text-sm text-red-500 dark:text-red-400 flex gap-x-1 items-center">
        <Icon name="Ban" class="h-3 w-3 stroke-[2.5]"/>
        <span>Invalid format for a GitHub fine-grained PAT.</span>
      </div>
      <footer class="flex justify-end text-sm gap-x-2 mt-4">
        <button class="btn-secondary" @click="patModal.closeModal()">Cancel</button>
        <button class="btn-primary" :disabled="!patToken.startsWith('github_pat_')" @click="loginWithPat()">Save</button>
      </footer>
    </template>
  </Modal>
  
  <!-- Credentials modal -->
  <Modal ref="credentialsModal">
    <template #header>GitHub App Credentials</template>
    <template #content>
      <p class="text-sm mb-4 -mt-1 text-neutral-400 dark:text-neutral-500">
        Configure your GitHub OAuth App credentials. You can create a new OAuth App in your 
        <a class="underline hover:no-underline" href="https://github.com/settings/developers" target="_blank">GitHub Developer Settings</a>.
        <br/><br/>
        <strong>Important:</strong> In your GitHub OAuth App settings, set these redirect URIs:
        <br/>
        • Development: <code class="bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded">http://localhost:8788/auth/callback</code>
        <br/>
        • Production: <code class="bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded">app://./auth/callback</code>
      </p>
      
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Client ID</label>
          <input 
            type="text" 
            v-model="credentials.clientId" 
            placeholder="Enter GitHub Client ID"
            class="w-full px-3 py-2 bg-white dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-white"
          />
        </div>
        
        <div>
          <label class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Client Secret</label>
          <input 
            type="password" 
            v-model="credentials.clientSecret" 
            placeholder="Enter GitHub Client Secret"
            class="w-full px-3 py-2 bg-white dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-white"
          />
        </div>
        
        <div>
          <label class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Repository</label>
          <input 
            type="text" 
            v-model="credentials.repo" 
            placeholder="owner/repository"
            class="w-full px-3 py-2 bg-white dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-white"
          />
          <p class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Format: username/repository</p>
        </div>
      </div>

      <footer class="flex justify-end text-sm gap-x-2 mt-6">
        <button class="btn-secondary" @click="credentialsModal.closeModal()">Cancel</button>
        <button class="btn-primary" @click="saveCredentials">Save Credentials</button>
      </footer>
    </template>
  </Modal>
  
  <!-- Tutorial modal -->
  <TutorialModal ref="tutorialModal" />
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import github from '@/services/github';
import Icon from '@/components/utils/Icon.vue';
import Modal from '@/components/utils/Modal.vue';
import TutorialModal from '@/components/TutorialModal.vue';
import notifications from '@/services/notifications';
import githubCredentials from '@/services/githubCredentials';

const router = useRouter();
const isDev = import.meta.env.DEV;
const baseUrl = isDev ? 'http://localhost:8788' : 'app://./';

// Add explicit redirect URIs
const redirectUri = 'http://localhost:8788/auth/callback';

const credentials = ref({
  clientId: '',
  clientSecret: '',
  repo: ''
});

// Load saved credentials if they exist
onMounted(() => {
  const saved = githubCredentials.getCredentials();
  if (saved) {
    credentials.value = { ...saved };
  }
});

const loginUrl = computed(() => {
  const creds = githubCredentials.getCredentials();
  if (!creds?.clientId) {
    notifications.notify('Please configure GitHub credentials first', 'error');
    credentialsModal.value.openModal();
    return null;
  }

  // Always use GitHub's authorize endpoint with explicit redirect URI
  const url = `https://github.com/login/oauth/authorize?` +
    `client_id=${encodeURIComponent(creds.clientId)}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `scope=repo&` +
    `response_type=code`;
  
  console.log('Generated OAuth URL:', url);
  console.log('Using redirect URI:', redirectUri);
  console.log('Client ID:', creds.clientId);
  return url;
});

const offerPat = ref(import.meta.env?.VITE_GITHUB_PAT_LOGIN === 'true');
const patModal = ref(null);
const credentialsModal = ref(null);
const tutorialModal = ref(null);
const patToken = ref('');

const handleOAuthResponse = (response) => {
  console.log('Received OAuth response');
  if (response.access_token) {
    github.handleOAuthResponse(response);
  } else {
    console.error('No access token in response');
    notifications.notify('Authentication failed. Please try again.', 'error');
  }
};

const login = () => {
  try {
    const creds = githubCredentials.getCredentials();
    if (!creds) {
      notifications.notify('Please configure GitHub credentials first', 'error');
      credentialsModal.value.openModal();
      return;
    }
    
    if (!loginUrl.value) {
      return;
    }

    console.log('Starting OAuth flow');
    console.log('Redirect URI:', redirectUri);
    console.log('OAuth URL:', loginUrl.value);
    
    if (!window.ipc) {
      console.error('IPC not available');
      notifications.notify('Authentication service not available. Please restart the application.', 'error');
      return;
    }

    // Pass credentials and redirect URI with the OAuth request
    window.ipc.send('open-oauth-window', {
      url: loginUrl.value,
      credentials: {
        clientId: creds.clientId,
        clientSecret: creds.clientSecret,
        redirectUri: redirectUri
      }
    });
  } catch (error) {
    console.error('Error during login:', error);
    notifications.notify('Failed to start authentication. Please try again.', 'error');
  }
};

const saveCredentials = () => {
  try {
    if (!credentials.value.clientId || !credentials.value.clientSecret || !credentials.value.repo) {
      notifications.notify('Please fill in all credential fields', 'error');
      return;
    }

    if (!credentials.value.repo.includes('/')) {
      notifications.notify('Repository must be in format owner/repo', 'error');
      return;
    }

    githubCredentials.setCredentials(
      credentials.value.clientId,
      credentials.value.clientSecret,
      credentials.value.repo
    );

    notifications.notify('GitHub credentials saved successfully', 'success');
    credentialsModal.value.closeModal();
  } catch (error) {
    console.error('Error saving credentials:', error);
    notifications.notify('Failed to save credentials: ' + error.message, 'error');
  }
};

const loginWithPat = () => {
  if (patToken.value) {
    try {
      github.setToken(patToken.value);
      router.push('/');
    } catch (error) {
      console.error('Error setting PAT:', error);
      notifications.notify('Failed to set personal access token. Please try again.', 'error');
    }
  }
};

onMounted(() => {
  try {
    console.log('Setting up OAuth response listener');
    if (!window.ipc) {
      console.error('IPC not available');
      return;
    }

    window.ipc.on('oauth-response', (response) => {
      console.log('Received OAuth response in LoginView:', response);
      handleOAuthResponse(response);
    });
  } catch (error) {
    console.error('Error setting up OAuth response listener:', error);
  }
});

onUnmounted(() => {
  try {
    console.log('Removing OAuth response listener');
    window.ipc?.removeAllListeners?.('oauth-response');
  } catch (error) {
    console.error('Error cleaning up OAuth listener:', error);
  }
});
</script>