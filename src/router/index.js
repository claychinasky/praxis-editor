import { createRouter, createMemoryHistory } from 'vue-router'
import github from '@/services/github';
import repository from '@/services/repository';
import Content from '@/components/Content.vue'
import Editor from '@/components/file/Editor.vue'
import Media from '@/components/Media.vue'
import LoginView from '@/views/LoginView.vue'
import RepoView from '@/views/RepoView.vue'
import HomeView from '@/views/HomeView.vue'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
      beforeEnter: (to, from) => {
        // Check if we have a last selected repository
        const { lastRepo } = repository;
        if (lastRepo.value.owner && lastRepo.value.repo && lastRepo.value.branch) {
          return {
            name: 'repo',
            params: {
              owner: lastRepo.value.owner,
              repo: lastRepo.value.repo,
              branch: lastRepo.value.branch
            }
          };
        }
      }
    },
    {
      path: '/auth/login',
      name: 'login',
      component: LoginView
    },
    {
      path: '/auth/callback',
      name: 'auth-callback',
      component: LoginView
    },
    {
      name: 'repo-no-branch',
      path: '/:owner/:repo',
      component: RepoView,
      props: true
    },
    {
      name: 'repo',
      path: '/:owner/:repo/:branch',
      component: RepoView,
      props: true,
      children: [
        {
          name: 'content-root',
          path: 'content',
          component: Content,
          props: true
        },
        {
          name: 'content',
          path: 'content/:name',
          component: Content,
          props: true,
          children: [
            {
              name: 'edit',
              path: 'edit/:path',
              component: Editor,
              props: true
            },
            {
              name: 'new',
              path: 'new/:path?',
              component: Editor,
              props: route => ({
                ...route.params,
                isNew: true
              })
            }
          ]
        },
        {
          name: 'media',
          path: 'media/:path?',
          component: Media,
          props: true
        },
        {
          name: 'settings',
          path: 'settings',
          component: Editor,
          props: route => ({
            ...route.params,
            path: '.pages.yml',
            title: 'Settings',
            description: 'Settings are saved in a `.pages.yml` file at the root of your repository. [Read the documentation](https://pagescms.org/docs/configuration).',
            format: 'code',
          })
        },
        {
          path: '',
          name: 'repo-default',
          redirect: { name: 'content-root' }
        }
      ]
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: { name: 'home'}
    }
  ]
})

// Navigation guards
router.beforeEach(async (to, from) => {
  // Skip auth check for login and callback routes
  if (to.path.startsWith('/auth/')) {
    return true;
  }

  // Check if user is authenticated
  const isAuthenticated = await github.isAuthenticated();
  if (!isAuthenticated && to.name !== 'login') {
    return { name: 'login' };
  }
  return true;
});

export default router
