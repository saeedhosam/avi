"use client";

import type { Flight, FlightAlert, UserAccount } from "./types";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

export const firebaseEnabled = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
);

export const firebaseProjectId = firebaseConfig.projectId;

let appCheckInitialized = false;

async function getFirebase() {
  if (!firebaseEnabled) return null;
  const [{ initializeApp, getApps, getApp }, authMod, firestoreMod] =
    await Promise.all([
      import("firebase/app"),
      import("firebase/auth"),
      import("firebase/firestore"),
    ]);
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

  // App Check is optional and only installed when a reCAPTCHA site key exists.
  const appCheckSiteKey = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY;
  if (typeof window !== "undefined" && appCheckSiteKey && !appCheckInitialized) {
    try {
      const appCheckMod = await import("firebase/app-check");
      appCheckMod.initializeAppCheck(app, {
        provider: new appCheckMod.ReCaptchaV3Provider(appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
      appCheckInitialized = true;
    } catch {
      // App Check failures must never block the app.
    }
  }

  const auth = authMod.getAuth(app);
  const databaseId = process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID;
  const db = databaseId
    ? firestoreMod.getFirestore(app, databaseId)
    : firestoreMod.getFirestore(app);
  return { app, auth, db, authMod, firestoreMod };
}

export async function observeFirebaseAuth(
  callback: (account: UserAccount | null, uid: string | null) => void,
) {
  if (!firebaseEnabled) return () => {};
  const fb = await getFirebase();
  if (!fb) return () => {};
  const { auth, authMod } = fb;
  return authMod.onAuthStateChanged(auth, (user) => {
    if (!user) {
      callback(null, null);
      return;
    }
    const name =
      user.displayName ??
      `Capt. ${user.email?.split("@")[0] ?? "Aviator"}`;
    const initial = (name.trim()[0] ?? "A").toUpperCase();
    callback(
      {
        name,
        email: user.email ?? "pilot@aviation.aero",
        avatarInitial: initial,
        photoUrl: user.photoURL,
        isSignedIn: true,
        isOfflineMode: false,
        lastSyncTime: "Cloud Sync Active (Firestore)",
        uid: user.uid,
        provider: "Google",
      },
      user.uid,
    );
  });
}

export async function signInWithGoogleFirebase() {
  const fb = await getFirebase();
  if (!fb) throw new Error("Firebase is not configured.");
  const provider = new fb.authMod.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await fb.authMod.signInWithPopup(fb.auth, provider);
  return result.user;
}

export async function signOutFirebase() {
  const fb = await getFirebase();
  if (!fb) return;
  await fb.authMod.signOut(fb.auth);
}

export async function saveUserProfile(account: UserAccount, uid: string) {
  const fb = await getFirebase();
  if (!fb) return;
  const { db, firestoreMod } = fb;
  try {
    await firestoreMod.setDoc(
      firestoreMod.doc(db, "users", uid),
      {
        userId: uid,
        displayName: account.name.slice(0, 100) || "Aviation Navigator",
        email: account.email.slice(0, 150),
        photoUrl: account.photoUrl ?? "",
        homeAirport: "JFK",
        themePreference: "SYSTEM",
        updatedAt: firestoreMod.serverTimestamp(),
        createdAt: firestoreMod.serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    console.warn("Firestore profile sync failed", error);
  }
}

export async function saveTrackedFlightCloud(
  uid: string,
  flight: Flight,
) {
  const fb = await getFirebase();
  if (!fb) return;
  const { db, firestoreMod } = fb;
  try {
    await firestoreMod.setDoc(
      firestoreMod.doc(db, "users", uid, "trackedFlights", flight.id),
      {
        userId: uid,
        flightNumber: flight.flightNumber,
        airline: flight.airline.slice(0, 100),
        airlineCode: flight.airlineCode,
        originCode: flight.origin.code,
        originCity: flight.origin.city,
        destCode: flight.destination.code,
        destCity: flight.destination.city,
        status: flight.status,
        customNotes: flight.customNotes.slice(0, 500),
        isFavorite: flight.isFavorite,
        createdAt: firestoreMod.serverTimestamp(),
        updatedAt: firestoreMod.serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    console.warn("Firestore tracked flight sync failed", error);
  }
}

export async function deleteTrackedFlightCloud(uid: string, flightId: string) {
  const fb = await getFirebase();
  if (!fb) return;
  const { db, firestoreMod } = fb;
  try {
    await firestoreMod.deleteDoc(
      firestoreMod.doc(db, "users", uid, "trackedFlights", flightId),
    );
  } catch (error) {
    console.warn("Firestore tracked flight delete failed", error);
  }
}

export async function saveAlertCloud(uid: string, alert: FlightAlert) {
  const fb = await getFirebase();
  if (!fb) return;
  const { db, firestoreMod } = fb;
  try {
    await firestoreMod.setDoc(
      firestoreMod.doc(db, "users", uid, "alerts", alert.id),
      {
        userId: uid,
        flightNumber: alert.flightNumber,
        alertType: alert.type,
        title: alert.title.slice(0, 200),
        message: alert.message.slice(0, 1000),
        isRead: alert.isRead,
        createdAt: firestoreMod.serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    console.warn("Firestore alert sync failed", error);
  }
}

export async function markAlertReadCloud(uid: string, alertId: string) {
  const fb = await getFirebase();
  if (!fb) return;
  const { db, firestoreMod } = fb;
  try {
    await firestoreMod.updateDoc(
      firestoreMod.doc(db, "users", uid, "alerts", alertId),
      { isRead: true },
    );
  } catch (error) {
    console.warn("Firestore alert update failed", error);
  }
}

export async function fetchCloudWatchlist(uid: string) {
  const fb = await getFirebase();
  if (!fb) return [];
  const { db, firestoreMod } = fb;
  try {
    const snapshot = await firestoreMod.getDocs(
      firestoreMod.collection(db, "users", uid, "trackedFlights"),
    );
    return snapshot.docs.map((doc) => doc.data() as Record<string, unknown>);
  } catch (error) {
    console.warn("Firestore watchlist fetch failed", error);
    return [];
  }
}

export async function requestFcmToken() {
  if (!firebaseEnabled) return null;
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey || typeof window === "undefined") return null;
  try {
    const fb = await getFirebase();
    if (!fb) return null;
    const messagingMod = await import("firebase/messaging");
    const supported = await messagingMod.isSupported();
    if (!supported) return null;
    const messaging = messagingMod.getMessaging(fb.app);
    const registration = await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js",
    );
    return await messagingMod.getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });
  } catch {
    return null;
  }
}
