import { DarkTheme, DefaultTheme, type Theme } from '@react-navigation/native';

export const THEME = {
  light: {
    // Premium Neutral Light Theme
    background: 'hsl(0 0% 100%)',
    foreground: 'hsl(222 47% 11%)',
    card: 'hsl(0 0% 100%)',
    cardForeground: 'hsl(222 47% 11%)',
    popover: 'hsl(0 0% 100%)',
    popoverForeground: 'hsl(222 47% 11%)',
    // Refined Blue Primary
    primary: 'hsl(221 83% 53%)',
    primaryForeground: 'hsl(0 0% 100%)',
    // Subtle Gray Secondary
    secondary: 'hsl(220 14% 96%)',
    secondaryForeground: 'hsl(222 47% 11%)',
    muted: 'hsl(220 14% 96%)',
    mutedForeground: 'hsl(220 9% 46%)',
    // Slate Accent
    accent: 'hsl(220 14% 96%)',
    accentForeground: 'hsl(222 47% 11%)',
    destructive: 'hsl(0 84% 60%)',
    border: 'hsl(220 13% 91%)',
    input: 'hsl(220 13% 91%)',
    ring: 'hsl(221 83% 53%)',
    radius: '0.5rem',
    // Chart Colors
    chart1: 'hsl(221 83% 53%)',
    chart2: 'hsl(142 71% 45%)',
    chart3: 'hsl(38 92% 50%)',
    chart4: 'hsl(262 83% 58%)',
    chart5: 'hsl(0 84% 60%)',
  },
  dark: {
    // Premium Dark Theme - Slate
    background: 'hsl(222 47% 5%)',
    foreground: 'hsl(210 40% 98%)',
    card: 'hsl(222 47% 8%)',
    cardForeground: 'hsl(210 40% 98%)',
    popover: 'hsl(222 47% 10%)',
    popoverForeground: 'hsl(210 40% 98%)',
    // Brighter Blue Primary for dark mode
    primary: 'hsl(217 91% 60%)',
    primaryForeground: 'hsl(222 47% 5%)',
    // Dark Slate Secondary
    secondary: 'hsl(217 33% 17%)',
    secondaryForeground: 'hsl(210 40% 98%)',
    muted: 'hsl(217 33% 17%)',
    mutedForeground: 'hsl(215 20% 65%)',
    // Slate Accent
    accent: 'hsl(217 33% 17%)',
    accentForeground: 'hsl(210 40% 98%)',
    destructive: 'hsl(0 72% 51%)',
    border: 'hsl(217 33% 17%)',
    input: 'hsl(217 33% 17%)',
    ring: 'hsl(217 91% 60%)',
    radius: '0.5rem',
    // Chart Colors - vibrant for dark
    chart1: 'hsl(217 91% 60%)',
    chart2: 'hsl(142 71% 50%)',
    chart3: 'hsl(38 92% 55%)',
    chart4: 'hsl(262 83% 65%)',
    chart5: 'hsl(0 84% 65%)',
  },
};

export const NAV_THEME: Record<'light' | 'dark', Theme> = {
  light: {
    ...DefaultTheme,
    colors: {
      background: THEME.light.background,
      border: THEME.light.border,
      card: THEME.light.card,
      notification: THEME.light.destructive,
      primary: THEME.light.primary,
      text: THEME.light.foreground,
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      background: THEME.dark.background,
      border: THEME.dark.border,
      card: THEME.dark.card,
      notification: THEME.dark.destructive,
      primary: THEME.dark.primary,
      text: THEME.dark.foreground,
    },
  },
};
