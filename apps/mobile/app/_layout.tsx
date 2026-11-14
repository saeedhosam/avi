import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../src/lib/auth";
import { configureNotificationHandler } from "../src/lib/push";
import { COLORS } from "../src/lib/theme";

configureNotificationHandler();

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
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
          <Stack.Screen name="auth" options={{ title: "Account" }} />
          <Stack.Screen name="flights" options={{ title: "Flights" }} />
          <Stack.Screen name="flight/[id]" options={{ title: "Flight Detail" }} />
          <Stack.Screen name="explore/[iata]" options={{ title: "Route Explorer" }} />
          <Stack.Screen name="terminal/[iata]" options={{ title: "Terminal Map" }} />
          <Stack.Screen name="cabin/[type]/[seat]" options={{ title: "Cabin Twin" }} />
          <Stack.Screen name="scan" options={{ title: "Boarding Pass" }} />
          <Stack.Screen name="bag" options={{ title: "Carry-On Sizer" }} />
          <Stack.Screen name="hud" options={{ title: "In-Flight HUD" }} />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
