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
import notifications from '@/services/notifications';

const router = useRouter();

const form = ref({
  clientId: '',
  clientSecret: '',
  repo: ''
});

onMounted(() => {
  // Load saved credentials if they exist
  const savedCredentials = localStorage.getItem('github_credentials');
  if (savedCredentials) {
    const parsed = JSON.parse(savedCredentials);
    form.value = {
      clientId: parsed.clientId || '',
      clientSecret: parsed.clientSecret || '',
      repo: parsed.repo || ''
    };
  }
});

const handleSubmit = async () => {
  try {
    // Validate form
    if (!form.value.clientId || !form.value.clientSecret || !form.value.repo) {
      notifications.notify('Please fill in all fields', 'error');
      return;
    }

    // Validate repo format
    if (!form.value.repo.includes('/')) {
      notifications.notify('Repository must be in format owner/repo', 'error');
      return;
    }

    // Store credentials in localStorage
    localStorage.setItem('github_credentials', JSON.stringify({
      clientId: form.value.clientId,
      clientSecret: form.value.clientSecret,
      repo: form.value.repo
    }));

    // Notify success
    notifications.notify('GitHub credentials saved successfully', 'success');
    
    // Redirect to login
    router.push({ name: 'login' });
  } catch (error) {
    notifications.notify('Failed to save credentials: ' + error.message, 'error');
  }
};

const handleCancel = () => {
  router.back();
};
</script>
