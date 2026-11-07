import { defineConfig } from 'wxt';
export default defineConfig({
  srcDir: 'src',
  extensionApi: 'chrome',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    permissions: ['storage', 'tabs', 'webNavigation', 'downloads', 'declarativeNetRequest', 'contextMenus', 'notifications', 'alarms', 'scripting'],
    host_permissions: ['<all_urls>'],
  },
});
