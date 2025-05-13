import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

// Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCpbLpufYDfJwQDWgLdM13o4V6yX1RgMp0",
  authDomain: "eatgood-feelgood.firebaseapp.com",
  projectId: "eatgood-feelgood",
  storageBucket: "eatgood-feelgood.firebasestorage.app",
  messagingSenderId: "236012841519",
  appId: "1:236012841519:web:8d71ff1e9d75106e8274da"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const storage = getStorage(app);
const db = getFirestore(app);

export { auth, storage, db };

// Function to save user data to Firestore
export async function saveUserData(userId, userData) {
  try {
    const userRef = doc(db, "users", userId);
    const userSnapshot = await getDoc(userRef);

    if (userSnapshot.exists()) {
      console.warn("User already exists. No new account will be created.");
      return;
    }

    await setDoc(userRef, userData, { merge: true });
    console.log("User data saved successfully.");
  } catch (error) {
    if (error.code === "auth/email-already-in-use") {
      // Suppress this specific error
      console.warn("Email already in use. Suppressing this error.");
    } else {
      console.error("Error saving user data:", error);
      throw error;
    }
  }
}
// Function to handle login errors
export async function handleLoginError(err) {
  if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
    document.getElementById('login-error').textContent = "Incorrect email or password. Please try again.";
  } else if (err.code === 'auth/user-disabled') {
    try {
      const userRef = doc(db, "users", err.customData.email);
      const userSnapshot = await getDoc(userRef);

      if (userSnapshot.exists()) {
        document.getElementById('login-error').textContent = "Your account has been disabled. Please contact support.";
      } else {
        document.getElementById('login-error').textContent = "Account not found in the database.";
      }
    } catch (dbError) {
      console.error("Error fetching user data from the database:", dbError);
      document.getElementById('login-error').textContent = "An error occurred. Please try again later.";
    }
  } else {
    document.getElementById('login-error').textContent = err.message;
  }
}
