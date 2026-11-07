import { defineConfig } from 'wxt';

// See docs/plan.md §6 for why each permission is needed.
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => ({
    name: 'Sentinel',
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
      'scripting', // protect tabs that were already open when Sentinel was installed
    ],
    host_permissions: ['<all_urls>'],
    // Toolbar button for the badge; the popup entrypoint adds default_popup.
    action: { default_title: 'Sentinel' },
    ...(browser === 'firefox'
      ? { browser_specific_settings: {
          gecko: {
            id: 'sentinel@indyinit26',
            strict_min_version: '140.0',
            // Nothing leaves the device (plan.md §6).
            data_collection_permissions: { required: ['none'] },
          },
        } }
      : {}),
  }),
});
