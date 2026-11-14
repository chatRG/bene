import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'health.bene.community',
  appName: 'Bene',
  webDir: 'dist',
  backgroundColor: '#F7F6F2',
  ios: {
    contentInset: 'never',
    preferredContentMode: 'mobile',
    scheme: 'Bene',
  },
  android: {
    backgroundColor: '#F7F6F2',
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
