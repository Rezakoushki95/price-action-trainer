// Flat config, as Expo SDK 57 prescribes: https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const eslintPluginPrettierRecommended = require('eslint-plugin-prettier/recommended');

module.exports = defineConfig([
  expoConfig,
  eslintPluginPrettierRecommended,
  {
    ignores: ['dist-web/*', 'android/*', 'ios/*', '.expo/*', 'public/*', 'docs/*'],
  },
]);
