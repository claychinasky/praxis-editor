<template>
  <RouterView />
  <Notifications />
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue';
import { RouterView } from 'vue-router';
import Notifications from '@/components/utils/Notifications.vue';
import github from '@/services/github';

onMounted(() => {
  // Listen for oauth-token events
  window.ipc.receive('oauth-token', (data) => {
    console.log('Received oauth-token event:', data);
    github.handleOAuthResponse(data);
  });
});

onUnmounted(() => {
  // Clean up listeners
  window.ipc.removeAllListeners('oauth-token');
});
</script>