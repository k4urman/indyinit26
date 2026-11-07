import { defineConfig } from 'wxt';

// See docs/plan.md §6 for why each permission is needed.
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => ({
    name: 'ScamShield',
    description: 'Free, private, real-time protection from scam websites.',
    permissions: [
      'storage',
      'unlimitedStorage',
      'webNavigation',
      'tabs',
      'downloads',
      'contextMenus',
      'notifications',
      'alarms',
    ],
    host_permissions: ['<all_urls>'],
    // Toolbar button for the badge; the popup entrypoint adds default_popup.
    action: { default_title: 'ScamShield' },
    ...(browser === 'firefox'
      ? { browser_specific_settings: { gecko: { id: 'scamshield@indyinit26', strict_min_version: '128.0' } } }
      : {}),
  }),
});
