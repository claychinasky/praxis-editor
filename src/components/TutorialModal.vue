<template>
  <Modal ref="modal" boxClass="max-w-3xl">
    <template #header>How to Set Up Guide</template>
    <template #content>
      <div class="flex flex-col">
        <!-- Image Carousel -->
        <div class="relative aspect-video bg-neutral-100 dark:bg-neutral-800 rounded-lg mb-4">
          <img 
            :src="`/praxis-tutorial/Page${currentSlide + 1}.png`" 
            :alt="`Tutorial Step ${currentSlide + 1}`"
            class="w-full h-full object-contain"
          >
          <!-- Navigation Arrows -->
          <button 
            v-if="currentSlide > 0"
            @click="prevSlide" 
            class="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-white/80 dark:bg-neutral-700/80 rounded-full shadow hover:bg-white dark:hover:bg-neutral-700"
          >
            <Icon name="ChevronLeft" class="h-6 w-6 stroke-2"/>
          </button>
          <button 
            v-if="currentSlide < totalSlides - 1"
            @click="nextSlide" 
            class="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white/80 dark:bg-neutral-700/80 rounded-full shadow hover:bg-white dark:hover:bg-neutral-700"
          >
            <Icon name="ChevronRight" class="h-6 w-6 stroke-2"/>
          </button>
        </div>

        <!-- Text Instructions -->
        <div class="bg-neutral-50 dark:bg-neutral-800 rounded-lg p-4 mb-4">
          <p class="text-sm text-neutral-700 dark:text-neutral-300">{{ instructions[currentSlide] }}</p>
        </div>

        <!-- Progress Indicators -->
        <div class="flex justify-center gap-2 mb-4">
          <button 
            v-for="index in totalSlides" 
            :key="index"
            @click="currentSlide = index - 1"
            class="w-2 h-2 rounded-full"
            :class="[
              currentSlide === index - 1 
                ? 'bg-primary-500' 
                : 'bg-neutral-300 dark:bg-neutral-600 hover:bg-neutral-400 dark:hover:bg-neutral-500'
            ]"
          />
        </div>

        <!-- Navigation Buttons -->
        <div class="flex justify-between">
          <button 
            class="btn-secondary"
            @click="modal.closeModal()"
          >
            Close
          </button>
          <div class="flex gap-x-2">
            <button 
              v-if="currentSlide > 0"
              class="btn-secondary"
              @click="prevSlide"
            >
              Previous
            </button>
            <button 
              v-if="currentSlide < totalSlides - 1"
              class="btn-primary"
              @click="nextSlide"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </template>
  </Modal>
</template>

<script setup>
import { ref } from 'vue';
import Modal from '@/components/utils/Modal.vue';
import Icon from '@/components/utils/Icon.vue';

const modal = ref(null);
const currentSlide = ref(0);
const totalSlides = 4; // Number of tutorial images

const instructions = [
  "Step 1: Create a new GitHub OAuth App in your GitHub Developer Settings. This will allow the CMS to securely connect to your GitHub account.",
  "Step 2: Configure your OAuth App by setting the appropriate redirect URIs. For development use http://localhost:8788/auth/callback, and for production use app://./auth/callback",
  "Step 3: Copy your Client ID and Client Secret from the GitHub OAuth App settings. These credentials will be used to authenticate your CMS application.",
  "Step 4: Enter your GitHub credentials in the CMS, including your Client ID, Client Secret, and the repository you want to manage (in the format owner/repository)."
];

const nextSlide = () => {
  if (currentSlide.value < totalSlides - 1) {
    currentSlide.value++;
  }
};

const prevSlide = () => {
  if (currentSlide.value > 0) {
    currentSlide.value--;
  }
};

const openModal = () => {
  currentSlide.value = 0;
  modal.value.openModal();
};

defineExpose({ openModal });
</script>
