import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { supabase } from "./supabase";

export interface PushRegistration {
  token: string;
  platform: "android" | "ios";
}

/**
 * Registers the device with Expo Push. The token is returned even when Supabase
 * is unavailable; the caller decides when to associate it with a signed-in user.
 */
export async function registerForPushNotifications(): Promise<PushRegistration | null> {
  if (Device.isDevice !== true) return null;
  if (Platform.OS !== "android" && Platform.OS !== "ios") return null;

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== "granted") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("flight-alerts", {
      name: "Flight alerts",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#22d3ee",
    });
  }

  const easConfig = (Constants as { easConfig?: { projectId?: string } }).easConfig;
  const extra = Constants.expoConfig?.extra as
    | { eas?: { projectId?: string } }
    | undefined;
  const projectId = easConfig?.projectId ?? extra?.eas?.projectId;
  if (!projectId) return null;

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return {
    token: token.data,
    platform: Platform.OS,
  };
}

/** Associates a token with the signed-in Supabase user. */
export async function saveDeviceToken(
  userId: string,
  registration: PushRegistration,
): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from("device_tokens").upsert(
    {
      user_id: userId,
      platform: registration.platform,
      token: registration.token,
      last_seen: new Date().toISOString(),
    },
    { onConflict: "platform,token" },
  );
  return !error;
}
