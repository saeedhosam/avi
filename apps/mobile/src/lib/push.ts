import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { supabase } from "./supabase";
import { COLORS } from "./theme";

export interface PushRegistration {
  token: string;
  platform: "android" | "ios";
}

export type NotificationPermissionStatus =
  | "granted"
  | "denied"
  | "undetermined";

export type PushState =
  | "idle"
  | "registering"
  | "registered"
  | "signed-out"
  | "permission-denied"
  | "unsupported-device"
  | "missing-project-id"
  | "save-failed"
  | "error";

export interface PushStatus {
  state: PushState;
  message: string;
  permission: NotificationPermissionStatus;
  token?: string;
  platform?: "ios" | "android";
  savedToSupabase?: boolean;
}

export interface PushEnvironment {
  isDevice: boolean;
  platform: "ios" | "android" | "other";
  permission: NotificationPermissionStatus;
  projectId: string | null;
}

export const SIGNED_OUT_PUSH_STATUS: PushStatus = {
  state: "signed-out",
  message: "Sign in to register this device for flight alerts.",
  permission: "undetermined",
};

/**
 * Foreground presentation. Without this handler Expo suppresses alerts while
 * the app is open, so flight alerts would only appear on the lock screen.
 */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** EAS project ID from the embedded config or app.json `extra.eas.projectId`. */
export function getEasProjectId(): string | null {
  const easConfig = (Constants as { easConfig?: { projectId?: string } | null })
    .easConfig;
  const extra = Constants.expoConfig?.extra as
    | { eas?: { projectId?: string } }
    | undefined;
  return easConfig?.projectId?.trim() || extra?.eas?.projectId?.trim() || null;
}

export async function getNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return "granted";
    return existing.status === Notifications.PermissionStatus.DENIED
      ? "denied"
      : "undetermined";
  } catch {
    return "undetermined";
  }
}

export async function getPushEnvironment(): Promise<PushEnvironment> {
  const permission = await getNotificationPermissionStatus();
  return {
    isDevice: Device.isDevice === true,
    platform:
      Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "other",
    permission,
    projectId: getEasProjectId(),
  };
}

/**
 * Registers the device with Expo Push. The token is returned even when Supabase
 * is unavailable; the caller decides when to associate it with a signed-in user.
 *
 * Prefer `registerAndSavePush` in the app so permission, EAS configuration, and
 * token persistence failures surface with an explicit reason.
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
      lightColor: COLORS.radar,
    });
  }

  const projectId = getEasProjectId();
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

/**
 * One call for the signed-in flow: checks the environment, asks for permission
 * only when requested, obtains the Expo token, and stores it against the user.
 * Every failure produces a status the UI can explain without inventing a token.
 */
export async function registerAndSavePush(
  userId: string,
  options: { requestPermission: boolean } = { requestPermission: true },
): Promise<PushStatus> {
  const environment = await getPushEnvironment();
  if (!environment.isDevice) {
    return {
      state: "unsupported-device",
      message: "Push tokens are only issued on a physical iOS or Android device.",
      permission: environment.permission,
    };
  }
  if (environment.platform === "other") {
    return {
      state: "unsupported-device",
      message: "Push registration is unavailable on this platform.",
      permission: environment.permission,
    };
  }
  if (!environment.projectId) {
    return {
      state: "missing-project-id",
      message:
        "No EAS project ID is configured. Add expo.extra.eas.projectId before a build can issue an Expo push token.",
      permission: environment.permission,
    };
  }
  if (!options.requestPermission && environment.permission !== "granted") {
    return {
      state: "permission-denied",
      message:
        environment.permission === "denied"
          ? "Notification permission is denied. Enable it in system settings, then retry."
          : "Notification permission has not been granted yet. Open Account and allow alerts.",
      permission: environment.permission,
    };
  }

  try {
    const registration = await registerForPushNotifications();
    if (!registration) {
      const permission = await getNotificationPermissionStatus();
      return {
        state: "permission-denied",
        message:
          permission === "granted"
            ? "Expo did not issue a push token. Check the EAS project configuration and try again."
            : "Notification permission was not granted, so no push token was issued.",
        permission,
      };
    }

    const saved = await saveDeviceToken(userId, registration);
    const grantedPermission = await getNotificationPermissionStatus();
    if (!saved) {
      return {
        state: "save-failed",
        message:
          "The Expo push token was issued but could not be stored in Supabase, so server flight alerts cannot reach this device yet.",
        permission: grantedPermission,
        token: registration.token,
        platform: registration.platform,
        savedToSupabase: false,
      };
    }

    return {
      state: "registered",
      message: "Push alerts are registered for this device.",
      permission: grantedPermission,
      token: registration.token,
      platform: registration.platform,
      savedToSupabase: true,
    };
  } catch (cause) {
    return {
      state: "error",
      message:
        cause instanceof Error
          ? `Push registration failed: ${cause.message}`
          : "Push registration failed. No token was issued.",
      permission: environment.permission,
    };
  }
}
