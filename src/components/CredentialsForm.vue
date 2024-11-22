<template>
  <div class="h-screen flex justify-center items-center bg-dneutral-200 p-4 lg:p-8">
    <div class="max-w-[500px] w-full bg-white dark:bg-neutral-800 rounded-lg shadow-lg p-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-xl font-semibold text-neutral-900 dark:text-white">GitHub Credentials</h2>
      </div>
      
      <form @submit.prevent="handleSubmit" class="space-y-4">
        <div class="form-group">
          <label for="clientId" class="block mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-200">GitHub Client ID</label>
          <input 
            id="clientId"
            v-model="form.clientId"
            type="text"
            required
            class="w-full px-3 py-2 bg-white dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-white"
            placeholder="Enter GitHub Client ID"
          >
        </div>
        
        <div class="form-group">
          <label for="clientSecret" class="block mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-200">GitHub Client Secret</label>
          <input 
            id="clientSecret"
            v-model="form.clientSecret"
            type="password"
            required
            class="w-full px-3 py-2 bg-white dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-white"
            placeholder="Enter GitHub Client Secret"
          >
        </div>
        
        <div class="form-group">
          <label for="repo" class="block mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-200">GitHub Repository</label>
          <input 
            id="repo"
            v-model="form.repo"
            type="text"
            required
            class="w-full px-3 py-2 bg-white dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-white"
            placeholder="e.g., username/repository"
          >
          <p class="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Format: owner/repo</p>
        </div>
        
        <div class="flex gap-3 mt-6">
          <button 
            type="button" 
            @click="handleCancel" 
            class="flex-1 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-200 bg-white dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded-md hover:bg-neutral-50 dark:hover:bg-neutral-600 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            Cancel
          </button>
          <button 
            type="submit" 
            class="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            Save Credentials
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useCredentialsStore } from '@/stores/credentials';
import notifications from '@/services/notifications';

const router = useRouter();
const credentialsStore = useCredentialsStore();

const form = ref({
  clientId: '',
  clientSecret: '',
  repo: ''
});

onMounted(async () => {
  await credentialsStore.loadCredentials();
  form.value.clientId = credentialsStore.clientId;
  form.value.clientSecret = credentialsStore.clientSecret;
  form.value.repo = credentialsStore.repo;
});

const handleSubmit = async () => {
  try {
    await credentialsStore.setCredentials(
      form.value.clientId,
      form.value.clientSecret,
      form.value.repo
    );
    notifications.notify('Credentials saved successfully', 'success');
    
    // After saving credentials, try to parse the repo format
    const [owner, repo] = form.value.repo.split('/').map(part => part.trim());
    if (owner && repo) {
      // First go to login page to authenticate
      router.push({ 
        name: 'login',
        query: { 
          redirect: `/repo/${owner}/${repo}` 
        }
      });
    } else {
      // If repo format is invalid, go to login
      router.push({ name: 'login' });
    }
  } catch (error) {
    notifications.notify('Failed to save credentials', 'error');
    console.error('Error saving credentials:', error);
  }
};

const handleCancel = () => {
  router.back();
};
</script>
