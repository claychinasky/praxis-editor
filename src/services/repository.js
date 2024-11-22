import { ref } from 'vue';

// Store last selected repository details
const lastRepo = ref({
  owner: localStorage.getItem('lastRepoOwner') || null,
  repo: localStorage.getItem('lastRepoName') || null,
  branch: localStorage.getItem('lastRepoBranch') || null
});

// Save repository details to localStorage
const saveLastRepo = (owner, repo, branch) => {
  localStorage.setItem('lastRepoOwner', owner);
  localStorage.setItem('lastRepoName', repo);
  localStorage.setItem('lastRepoBranch', branch);
  lastRepo.value = { owner, repo, branch };
};

// Clear stored repository details
const clearLastRepo = () => {
  localStorage.removeItem('lastRepoOwner');
  localStorage.removeItem('lastRepoName');
  localStorage.removeItem('lastRepoBranch');
  lastRepo.value = { owner: null, repo: null, branch: null };
};

export default {
  lastRepo,
  saveLastRepo,
  clearLastRepo
};