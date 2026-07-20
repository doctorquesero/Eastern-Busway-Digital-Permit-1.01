import React, { useState } from "react";
import { API_BASE_URL } from "../../services/api";

const ConnectCX: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleConnect = async () => {
    setMessage("Conectando con CX...");

    try {
      // 1. Login directo a CX desde el navegador
      const loginResponse = await fetch("/cxR/cx.asmx/Login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({ email, password })
      });

      const loginData = await loginResponse.json();

      if (!loginData.sessionKey) {
        setMessage("Error al iniciar sesión en CX");
        return;
      }

      const sessionKey = loginData.sessionKey;
      setMessage("SessionKey recibido: " + sessionKey);

      // 2. Enviar sessionKey a tu backend
      await fetch(`${API_BASE_URL}/cx-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ sessionKey })
      });

      setMessage(prev => prev + "\nSessionKey enviado al backend correctamente.");
    } catch (err) {
      setMessage("Error conectando con CX");
    }
  };

  return (
    <div style={{ padding: "1.5rem" }}>
      <h2>Conectar con CX</h2>

      <div style={{ marginBottom: "1rem" }}>
        <label>Email de CX:</label>
        <br />
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={{ width: "300px" }}
        />
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label>Contraseña de CX:</label>
        <br />
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={{ width: "300px" }}
        />
      </div>

      <button onClick={handleConnect}>Conectar</button>

      <pre style={{ marginTop: "1rem", whiteSpace: "pre-wrap" }}>{message}</pre>
    </div>
  );
};

export default ConnectCX;
