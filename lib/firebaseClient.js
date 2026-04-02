import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyB8Lmkhj8rkgl4uCwa2SQ-Engzw0QCYJNQ",
  authDomain: "solar-dfae0.firebaseapp.com",
  projectId: "solar-dfae0",
  storageBucket: "solar-dfae0.firebasestorage.app",
  messagingSenderId: "187721373108",
  appId: "1:187721373108:web:8269a6ff68912fe7824ee1",
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
