import { useColorScheme } from "react-native";

/**
 * WhatsApp-inspired palette (light + dark), in one place so every screen
 * stays consistent. Screens read it through useTheme().
 */
const light = {
  brand: "#00A884",
  brandDark: "#008069",
  header: "#008069",
  headerText: "#FFFFFF",
  bg: "#FFFFFF",
  chatBg: "#EFEAE2",
  surface: "#F0F2F5",
  card: "#FFFFFF",
  text: "#111B21",
  textMuted: "#667781",
  border: "#E9EDEF",
  bubbleOut: "#D9FDD3",
  bubbleIn: "#FFFFFF",
  danger: "#EA0038",
  inputBg: "#FFFFFF",
  tick: "#53BDEB",
};

const dark: typeof light = {
  brand: "#00A884",
  brandDark: "#00A884",
  header: "#1F2C34",
  headerText: "#E9EDEF",
  bg: "#111B21",
  chatBg: "#0B141A",
  surface: "#202C33",
  card: "#1F2C34",
  text: "#E9EDEF",
  textMuted: "#8696A0",
  border: "#2A3942",
  bubbleOut: "#005C4B",
  bubbleIn: "#202C33",
  danger: "#F15C6D",
  inputBg: "#2A3942",
  tick: "#53BDEB",
};

export type Theme = typeof light;

export const fonts = {
  regular: "Cairo_400Regular",
  medium: "Cairo_600SemiBold",
  bold: "Cairo_700Bold",
};

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}
