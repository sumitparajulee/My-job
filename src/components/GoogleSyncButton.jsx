// src/components/GoogleSyncButton.jsx
// Deploy path: part of your normal frontend build (Vite). No separate deployment.
// Drop this wherever your "Google sync" / "Gmail" cards currently live.

import { useState } from "react";
import { getAuth } from "firebase/auth";
import { connectGoogleAccount } from "../lib/googleAuth";

export default function GoogleSyncButton({ onConnected }) {
  const [status, setStatus] = useState("idle"); // idle | connecting | connected | error
  const [errorMsg, setErrorMsg] = useState("");

  const handleConnect = async () => {
    setStatus("connecting");
    setErrorMsg("");
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) {
        throw new Error("You must be signed in before connecting Google.");
      }
      const idToken = await user.getIdToken();
      await connectGoogleAccount(idToken);
      setStatus("connected");
      if (onConnected) onConnected();
    } catch (err) {
      setStatus("error");
      setErrorMsg(err.message || "Failed to connect Google account.");
    }
  };

  return (
    <div>
      <button onClick={handleConnect} disabled={status === "connecting"}>
        {status === "connected" ? "Google Connected ✓" : "Connect Google"}
      </button>
      {status === "error" && (
        <p style={{ color: "crimson", fontSize: "0.85rem" }}>{errorMsg}</p>
      )}
    </div>
  );
}
