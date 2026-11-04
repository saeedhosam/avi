const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const { test, before, after, beforeEach } = require("node:test");
const fs = require("node:fs");

const PROJECT_ID = "demo-no-project";
let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8085
    }
  });
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  if (testEnv) await testEnv.clearFirestore();
});

test("unauthenticated user cannot read user profile", async () => {
  const unauthed = testEnv.unauthenticatedContext().firestore();
  await assertFails(unauthed.collection("users").doc("user_1").get());
});

test("authenticated user can create and read their own profile", async () => {
  const authed = testEnv.authenticatedContext("user_1").firestore();
  const profileRef = authed.collection("users").doc("user_1");
  await assertSucceeds(profileRef.set({
    userId: "user_1",
    displayName: "Capt. Alex",
    email: "alex@skytrack.aero",
    createdAt: new Date(),
    updatedAt: new Date()
  }));
  await assertSucceeds(profileRef.get());
});

test("user cannot read another user's profile", async () => {
  const user1 = testEnv.authenticatedContext("user_1").firestore();
  await user1.collection("users").doc("user_1").set({
    userId: "user_1",
    displayName: "Capt. Alex",
    email: "alex@skytrack.aero",
    createdAt: new Date(),
    updatedAt: new Date()
  });

  const user2 = testEnv.authenticatedContext("user_2").firestore();
  await assertFails(user2.collection("users").doc("user_1").get());
});

test("user can add and read tracked flights under their profile", async () => {
  const authed = testEnv.authenticatedContext("user_1").firestore();
  const flightRef = authed.collection("users").doc("user_1").collection("trackedFlights").doc("AA100");
  await assertSucceeds(flightRef.set({
    userId: "user_1",
    flightNumber: "AA 100",
    airline: "American Airlines",
    originCode: "JFK",
    destCode: "LHR",
    status: "DEPARTED",
    customNotes: "Seat 12A",
    isFavorite: true,
    createdAt: new Date(),
    updatedAt: new Date()
  }));
  await assertSucceeds(flightRef.get());
});

test("cross-user cannot read tracked flights of another user", async () => {
  const user1 = testEnv.authenticatedContext("user_1").firestore();
  await user1.collection("users").doc("user_1").collection("trackedFlights").doc("AA100").set({
    userId: "user_1",
    flightNumber: "AA 100",
    airline: "American Airlines",
    originCode: "JFK",
    destCode: "LHR",
    status: "DEPARTED",
    createdAt: new Date(),
    updatedAt: new Date()
  });

  const user2 = testEnv.authenticatedContext("user_2").firestore();
  await assertFails(user2.collection("users").doc("user_1").collection("trackedFlights").doc("AA100").get());
});
