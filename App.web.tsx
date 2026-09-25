/**
 * Web entry.
 *
 * Skia on the web is CanvasKit, an 8MB WebAssembly module that has to finish
 * loading before a single Canvas can mount -- so the game is imported lazily and
 * only rendered once it is ready.
 *
 * This exists so the UI can be looked at, and screenshotted, without an Android
 * or iOS toolchain. Haptics are no-ops here; everything else is the real app.
 */

import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { theme } from './src/render/theme';

export default function App() {
  return (
    <WithSkiaWeb
      opts={{ locateFile: (file: string) => `/${file}` }}
      getComponent={() => import('./src/Game')}
      fallback={
        <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.ema} />
          <Text style={{ color: theme.textDim, marginTop: 12, fontSize: 12 }}>loading chart engine…</Text>
        </View>
      }
    />
  );
}
