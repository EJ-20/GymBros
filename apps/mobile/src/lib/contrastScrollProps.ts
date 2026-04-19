import { Platform } from 'react-native';

export type ScrollIndicatorStyle = 'black' | 'white';

/**
 * Theme-aware scroll indicators: iOS uses `indicatorStyle`; Android uses a persistent scrollbar
 * so the thumb stays easier to see than the default fade.
 */
export function contrastScrollProps(
  indicatorStyle: ScrollIndicatorStyle,
  axis: 'vertical' | 'horizontal' | 'both' = 'both'
) {
  return {
    indicatorStyle,
    persistentScrollbar: Platform.OS === 'android',
    showsVerticalScrollIndicator: axis !== 'horizontal',
    showsHorizontalScrollIndicator: axis !== 'vertical',
  };
}
