<template>
  <button @click="aboutModal.openModal(); isSidebarActive = false;" class="btn-icon-secondary ml-auto group relative">
    <Icon name="Upload" class="h-4 w-4 stroke-2"/>
    <div class="tooltip-top-right">Update Version</div>
  </button>
  <!-- Version update modal -->
  <Modal ref="aboutModal">
    <template #header>Update Version</template>
    <template #content>
      <p class="text-neutral-500 mb-4">Are you sure you want to increment the version number?</p>
      <div class="flex justify-end gap-2">
        <button @click="aboutModal.closeModal()" class="btn">Cancel</button>
        <button @click="handleUpdateVersion" class="btn-primary">Update Version</button>
      </div>
    </template>
  </Modal>
</template>

<script setup>
import { ref, inject } from 'vue';
import Modal from '@/components/utils/Modal.vue';
import Icon from '@/components/utils/Icon.vue';
import github from '@/services/github';
import notifications from '@/services/notifications';

const aboutModal = ref(null);
const repoStore = inject('repoStore');

const handleUpdateVersion = async () => {
  try {
    // Get the current version
    const versionFile = await github.getFile(repoStore.owner, repoStore.repo, repoStore.branch, 'version.txt');
    if (!versionFile || !versionFile.content) {
      notifications.notify('Failed to read version file - file not found or empty', 'error');
      aboutModal.value.closeModal();
      return;
    }

    let currentVersion;
    try {
      const decodedContent = atob(versionFile.content.trim());
      currentVersion = parseInt(decodedContent);
      if (isNaN(currentVersion)) {
        throw new Error('Invalid version number');
      }
    } catch (parseError) {
      notifications.notify('Failed to parse version number - invalid format', 'error');
      console.error('Version parse error:', parseError);
      aboutModal.value.closeModal();
      return;
    }

    const newVersion = currentVersion + 1;
    
    // Update the version file - encode content in base64
    const result = await github.saveFile(
      repoStore.owner,
      repoStore.repo,
      repoStore.branch,
      'version.txt',
      btoa(newVersion.toString()),
      versionFile.sha
    );

    if (result) {
      notifications.notify(`Successfully updated version from ${currentVersion} to ${newVersion}`, 'success');
    } else {
      notifications.notify('Failed to update version - check repository permissions', 'error');
    }
    
    aboutModal.value.closeModal();
  } catch (error) {
    console.error('Error updating version:', error);
    const errorMessage = error.response?.status === 403 
      ? 'Permission denied - check repository access'
      : 'Error updating version';
    notifications.notify(errorMessage, 'error');
    aboutModal.value.closeModal();
  }
};

defineExpose({ openModal: () => aboutModal.value.openModal() });
</script>