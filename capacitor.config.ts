import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'health.bevel.community',
  appName: 'Bevel',
  webDir: 'dist',
  backgroundColor: '#F7F6F2',
  ios: {
    contentInset: 'never',
    preferredContentMode: 'mobile',
    scheme: 'Bevel',
  },
  android: {
    backgroundColor: '#F7F6F2',
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
