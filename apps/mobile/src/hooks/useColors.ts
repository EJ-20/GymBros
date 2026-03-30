import { Colors } from '@/constants/theme';
import { useColorScheme } from 'react-native';

export function useColors() {
  const scheme = useColorScheme() ?? 'light';
  return Colors[scheme === 'dark' ? 'dark' : 'light'];
}
