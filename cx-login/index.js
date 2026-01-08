const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// ===============================
// 1. RECIBIR SESSIONKEY DEL FRONTEND
// ===============================
app.post("/cx-session", async (req, res) => {
  try {
    const { sessionKey } = req.body;

    if (!sessionKey) {
      return res.status(400).json({ error: "sessionKey is required" });
    }

    // Guardar sessionKey en memoria global
    global.cxSessionKey = sessionKey;

    console.log("SessionKey recibido:", sessionKey);

    return res.json({
      ok: true,
      message: "SessionKey almacenado correctamente"
    });

  } catch (err) {
    console.error("Error en /cx-session:", err);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ===============================
// 2. EJEMPLO: USAR SESSIONKEY PARA LLAMAR A CX
// ===============================
app.get("/test-cx", async (req, res) => {
  try {
    const sessionKey = global.cxSessionKey;

    if (!sessionKey) {
      return res.status(400).json({ error: "No hay sessionKey almacenado" });
    }

    const response = await axios.get(
      "https://au.itwocx.com/api/24.08/Api/Projects",
      {
        headers: {
          "X-SessionKey": sessionKey,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36"
        }
      }
    );

    return res.json(response.data);

  } catch (err) {
    console.error("Error en /test-cx:", err.response?.data || err.message);
    return res.status(500).json({ error: "Error llamando a CX" });
  }
});

// ===============================
// 3. INICIAR SERVIDOR
// ===============================
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
