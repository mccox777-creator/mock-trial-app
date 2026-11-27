import { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { radius, space, useTheme } from '../lib/theme';

const KEY = 'mocktrial.privacyNotice.v1';

/** Student privacy notice shown across the top of the website until the visitor acknowledges it. */
export function PrivacyBanner() {
  const c = useTheme();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    AsyncStorage.getItem(KEY).then((v) => setShow(v !== 'ok')).catch(() => setShow(true));
  }, []);
  if (!show) return null;
  const ok = () => {
    setShow(false);
    AsyncStorage.setItem(KEY, 'ok').catch(() => {});
  };
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: c.surfaceAlt, borderBottomWidth: 1, borderBottomColor: c.line, paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.sm }}>
      <Text style={{ color: c.ink, fontWeight: '700' }}>Student privacy (FERPA)</Text>
      <Text style={{ color: c.ink, lineHeight: 20 }}>
        Student information here is shared by participating schools only to run competitions. It is never sold, never used for advertising,
        and shown only to the people our privacy notice describes. Schools and students can ask to see, correct or remove it.
      </Text>
      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
        <Pressable onPress={ok} accessibilityRole="button" style={{ backgroundColor: c.accent, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8 }}>
          <Text style={{ color: c.accentInk, fontWeight: '700' }}>OK</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/privacy')} accessibilityRole="link" style={{ borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8 }}>
          <Text style={{ color: c.accent, fontWeight: '700' }}>Read the privacy notice</Text>
        </Pressable>
      </View>
    </View>
  );
}
