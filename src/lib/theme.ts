import { useColorScheme } from 'react-native';

// Courtroom palette: slate neutrals with a navy bias, plus the two exhibit-sticker
// colors trial lawyers already read at a glance (plaintiff yellow, defense blue).
const light = {
  bg: '#F2F4F7',
  surface: '#FFFFFF',
  surfaceAlt: '#E9EDF3',
  ink: '#152033',
  muted: '#5A6679',
  line: '#D7DDE6',
  accent: '#1D4E89',
  accentInk: '#FFFFFF',
  plaintiff: '#F3CB4F',
  plaintiffInk: '#3A2C00',
  defense: '#8DBBE8',
  defenseInk: '#0B2742',
  good: '#1E7B4F',
  warn: '#A65D00',
  bad: '#B3261E',
};

const dark: typeof light = {
  bg: '#0E131A',
  surface: '#171E28',
  surfaceAlt: '#212A36',
  ink: '#E6EBF2',
  muted: '#9AA6B6',
  line: '#2B3543',
  accent: '#86B4F0',
  accentInk: '#0B1A2E',
  plaintiff: '#D9B23C',
  plaintiffInk: '#221A00',
  defense: '#6A9FD4',
  defenseInk: '#04182B',
  good: '#5CC08C',
  warn: '#E0A24A',
  bad: '#EF7A70',
};

export type Palette = typeof light;

export function useTheme(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 6, md: 10, lg: 14 };
