const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// Base del API de CX
const CX_API_BASE = 'https://au.itwocx.com/api/24.08';

// User-Agent requerido por CX
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36';

// Endpoint para login a CX
app.post('/login-cx', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // 1. Encriptar contraseña
    const encryptRes = await axios.get(`${CX_API_BASE}/Login/EncryptPassword`, {
      params: { plainPassword: password },
      headers: {
        'User-Agent': USER_AGENT,
      },
    });

    const encryptedPassword = encryptRes.data;

    // 2. Login con email + contraseña encriptada
    const loginRes = await axios.post(
      `${CX_API_BASE}/Login/ByEmail`,
      {
        Email: email,
        EncryptedPassword: encryptedPassword,
      },
      {
        headers: {
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/json',
        },
      }
    );

    // 3. Devolver sessionKey al frontend
    res.json({ sessionKey: loginRes.data.Key });
  } catch (err) {
    console.error('CX Login Error:', err.response?.data || err.message);
    res.status(500).json({
      error: 'Login failed',
      details: err.response?.data || err.message,
    });
  }
});

// Puerto para Cloud Run / Docker
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
