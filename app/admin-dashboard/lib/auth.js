// /lib/auth.js
import { createContext, useContext, useEffect, useState } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "firebase/auth";

// --- CONFIG FIREBASE ---
// Mets ici ta propre config !
const firebaseConfig = {
  apiKey: "APIKEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  appId: "APPID",
};
// -----------------------

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const adminEmails = ["ton@email.com", "admin@vigiapp.com"]; // Liste des admins autorisés

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  const isAdmin = user && adminEmails.includes(user.email);
  const login = async () => { await signInWithPopup(auth, new GoogleAuthProvider()); };
  const logout = async () => { await signOut(auth); };
  return (
    <AuthContext.Provider value={{ user, isAdmin, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() { return useContext(AuthContext); }       
