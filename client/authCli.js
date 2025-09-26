const API_KEY = "AIzaSyDTmdSitr7uLEcyWpIsx4b3ARGoxgSc96Q";

export async function signupCli(email, password) {
  const r = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=" + API_KEY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const body = await r.text();
  return { status: r.status, body };
}

export async function loginCli(email, password) {
  const r = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + API_KEY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const body = await r.text();
  return { status: r.status, body };
}
