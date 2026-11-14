import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { COLORS } from "../src/lib/theme";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.cockpit },
          headerTintColor: COLORS.white,
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: COLORS.cockpit },
        }}
      >
        <Stack.Screen name="index" options={{ title: "AeroQuest" }} />
        <Stack.Screen name="explore/[iata]" options={{ title: "Route Explorer" }} />
        <Stack.Screen name="terminal/[iata]" options={{ title: "Terminal Map" }} />
        <Stack.Screen name="cabin/[type]/[seat]" options={{ title: "Cabin Twin" }} />
        <Stack.Screen name="scan" options={{ title: "Boarding Pass" }} />
        <Stack.Screen name="bag" options={{ title: "Carry-On Sizer" }} />
        <Stack.Screen name="hud" options={{ title: "In-Flight HUD" }} />
      </Stack>
    </SafeAreaProvider>
  );
}
