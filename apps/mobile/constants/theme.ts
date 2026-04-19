const tint = '#4ade80';
/** Text on tint-filled buttons (green background). */
const onTint = '#0f1419';
/** Alternate CTA label/icon on tint (e.g. white on green). */
const onTintLight = '#ffffff';

export const Colors = {
  light: {
    text: '#0f1419',
    textMuted: '#5c6b7a',
    background: '#f4f6f8',
    card: '#ffffff',
    border: '#e2e8f0',
    tint,
    onTint,
    onTintLight,
    tabIconDefault: '#94a3b8',
    tabIconSelected: tint,
    danger: '#ef4444',
    overlay: 'rgba(0,0,0,0.45)',
    /** iOS scroll indicator; dark on light backgrounds for contrast. */
    scrollIndicatorStyle: 'black' as const,
  },
  dark: {
    text: '#f1f5f9',
    textMuted: '#94a3b8',
    background: '#0f1419',
    card: '#1a2332',
    border: '#2d3a4d',
    tint,
    onTint,
    onTintLight,
    tabIconDefault: '#64748b',
    tabIconSelected: tint,
    danger: '#f87171',
    overlay: 'rgba(0,0,0,0.6)',
    /** iOS scroll indicator; light on dark backgrounds for contrast. */
    scrollIndicatorStyle: 'white' as const,
  },
};

export type ColorScheme = keyof typeof Colors;
