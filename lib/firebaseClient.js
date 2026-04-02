import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "СЮДА_API_KEY",
  authDomain: "СЮДА_AUTH_DOMAIN",
  projectId: "solar-dfae0",
  storageBucket: "solar-dfae0.appspot.com",
  messagingSenderId: "СЮДА_SENDER_ID",
  appId: "СЮДА_APP_ID",
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
