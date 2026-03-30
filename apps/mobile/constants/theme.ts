const tint = '#4ade80';

export const Colors = {
  light: {
    text: '#0f1419',
    textMuted: '#5c6b7a',
    background: '#f4f6f8',
    card: '#ffffff',
    border: '#e2e8f0',
    tint,
    tabIconDefault: '#94a3b8',
    tabIconSelected: tint,
    danger: '#ef4444',
  },
  dark: {
    text: '#f1f5f9',
    textMuted: '#94a3b8',
    background: '#0f1419',
    card: '#1a2332',
    border: '#2d3a4d',
    tint,
    tabIconDefault: '#64748b',
    tabIconSelected: tint,
    danger: '#f87171',
  },
};

export type ColorScheme = keyof typeof Colors;
