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
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import github from '@/services/github';
import Icon from '@/components/utils/Icon.vue';
import Modal from '@/components/utils/Modal.vue';
import notifications from '@/services/notifications';

const router = useRouter();
const isDev = import.meta.env.DEV;
const baseUrl = isDev ? 'http://127.0.0.1:8788' : 'app://./';
const clientId = 'Ov23liVwAcpifaYkIuvL';

const loginUrl = computed(() => {
  if (isDev) {
    return `${baseUrl}/auth/login`;
  } else {
    // In production, go directly to GitHub
    return `https://github.com/login/oauth/authorize?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(`${baseUrl}auth/callback`)}&` +
      `scope=repo&` +
      `response_type=code`;
  }
});

const offerPat = ref(import.meta.env?.VITE_GITHUB_PAT_LOGIN === 'true');
const patModal = ref(null);
const patToken = ref('');

const handleOAuthResponse = (response) => {
  console.log('Received OAuth response');
  if (response.access_token) {
    github.setToken(response.access_token);
    router.push('/');
  } else {
    console.error('No access token in response');
    notifications.notify('Authentication failed. Please try again.', 'error');
  }
};

const login = () => {
  try {
    console.log('Opening OAuth window');
    if (!window.ipc) {
      console.error('IPC not available');
      notifications.notify('Authentication service not available. Please restart the application.', 'error');
      return;
    }
    window.ipc.send('open-oauth-window', loginUrl.value);
  } catch (error) {
    console.error('Error during login:', error);
    notifications.notify('Failed to start authentication. Please try again.', 'error');
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
      console.error('IPC not available on mount');
      notifications.notify('Authentication service not available. Please restart the application.', 'error');
      return;
    }
    window.ipc.receive('oauth-response', handleOAuthResponse);
  } catch (error) {
    console.error('Error setting up OAuth listener:', error);
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