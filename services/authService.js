import { signOut } from "firebase/auth";
import { auth } from "../firebase";

export async function logoutUser() {
  try {
    await signOut(auth);
    console.log("[LOGOUT] User signed out from Firebase.");
  } catch (err) {
    console.log("[LOGOUT ERROR]", err);
    throw err;
  }
}
