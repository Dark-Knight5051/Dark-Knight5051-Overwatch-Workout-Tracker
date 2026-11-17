// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyC2vpLV0APVoKhyqbdvHoibbJh7Hrih4Hw",
  authDomain: "overwatch-workout-tracker.firebaseapp.com",
  projectId: "overwatch-workout-tracker",
  storageBucket: "overwatch-workout-tracker.firebasestorage.app",
  messagingSenderId: "110700660854",
  appId: "1:110700660854:web:ea095156090a0bf3f33757",
  measurementId: "G-4HK22C6LZL"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);