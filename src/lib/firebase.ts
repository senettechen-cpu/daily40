import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCFuhjaa06mmEDkm1dtJhEtybXORur4ZKY",
    authDomain: "my-awesome-app-f6928.firebaseapp.com",
    projectId: "my-awesome-app-f6928",
    storageBucket: "my-awesome-app-f6928.firebasestorage.app",
    messagingSenderId: "740171664485",
    appId: "1:740171664485:web:2570008de63f1d62564a8c"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
