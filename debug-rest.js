// debug-rest.js
// V3: CON MANEJO DE COOKIES Y BÚSQUEDA DE PROYECTOS 🍪

const EMAIL = "dietrich.truchsess@easternbusway.nz";
// 👇 PON TU PASSWORD AQUÍ 👇
const PASSWORD = "DaTr7628582";
const PERMIT_ID = "PF#8768";

const baseUrl = 'https://auweb06.au.itwocx.com/cxR';

const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Content-Type": "application/json",
    "Accept": "application/json",
    "X-Requested-With": "XMLHttpRequest",
    "Origin": "https://auweb06.au.itwocx.com"
};

async function run() {
    if (PASSWORD.includes("AQUI")) { console.error("⛔ ¡FALTA PASSWORD!"); return; }
    console.log("🚀 Iniciando diagnóstico CON COOKIES...");

    // --- 1. LOGIN ---
    let token = "";
    let cookies = ""; // Aquí guardaremos la "etiqueta" de sesión

    try {
        // A. ENCRIPTAR
        const resEnc = await fetch(`${baseUrl}/Api/Login/EncryptPassword`, {
            method: 'POST', headers, body: JSON.stringify({ "Password": PASSWORD })
        });

        // Guardar cookies iniciales (si las hay)
        const rawCookies1 = resEnc.headers.getSetCookie ? resEnc.headers.getSetCookie() : [];

        const encPass = (await resEnc.text()).replace(/^"|"$/g, '');

        // B. LOGIN
        const resLogin = await fetch(`${baseUrl}/Api/Login/ByEmail`, {
            method: 'POST',
            headers: { ...headers, "Cookie": rawCookies1.join('; ') }, // Enviamos cookies previas
            body: JSON.stringify({ "Email": EMAIL, "EncryptedPassword": encPass })
        });

        // ¡ATRAPAR LA COOKIE MAESTRA! 🍪
        const loginCookies = resLogin.headers.getSetCookie ? resLogin.headers.getSetCookie() : [];
        // Combinamos todas las cookies
        const allCookies = [...rawCookies1, ...loginCookies];
        cookies = allCookies.map(c => c.split(';')[0]).join('; ');

        const data = await resLogin.json();

        if (data.IsSuccess) {
            token = data.Key || data.Id;
            console.log(`✅ Login OK.`);
            console.log(`🔑 Token: ${token.substring(0, 10)}...`);
            console.log(`🍪 Cookies capturadas: ${cookies.substring(0, 20)}...`);
        } else {
            console.error("❌ Login Fallido:", data.ErrorMessages);
            return;
        }
    } catch (e) {
        console.error("❌ Error Fatal Login:", e.message); return;
    }

    // --- 2. PREGUNTAR: ¿QUÉ PROYECTOS TENGO? ---
    // Este endpoint suele devolver la lista real de proyectos accesibles
    console.log("\n🕵️‍♂️ Consultando lista de proyectos del usuario...");

    const authHeaders = {
        ...headers,
        "UserToken": token,
        "Cookie": cookies // <--- LA CLAVE DEL ÉXITO
    };

    try {
        // Intentamos obtener la configuración del usuario para ver los nombres REALES de los proyectos
        const urlProjects = `${baseUrl}/Api/Config/UserProjects`;
        const resProj = await fetch(urlProjects, { method: 'GET', headers: authHeaders });

        if (resProj.ok) {
            const projects = await resProj.json();
            console.log("📂 LISTA DE PROYECTOS ENCONTRADOS:");
            console.log(JSON.stringify(projects, null, 2));
            console.log("-------------------------------------");
            console.log("✅ USA EL CAMPO 'Code' O 'Name' QUE SALGA ARRIBA EN TU CÓDIGO.");
        } else {
            console.log(`⚠️ No pude listar proyectos (Error ${resProj.status}). Probando descarga directa...`);
        }
    } catch (e) { console.log("⚠️ Error listando proyectos:", e.message); }

    // --- 3. PRUEBA DE DESCARGA DIRECTA (CON COOKIE) ---
    console.log(`\n🔫 Probando descarga directa en 'EB' usando Cookies...`);
    try {
        const safeRef = encodeURIComponent(PERMIT_ID);
        const url = `${baseUrl}/Api/EB/Document/GetByReference?reference=${safeRef}`;

        const res = await fetch(url, { method: 'GET', headers: authHeaders });

        if (res.ok) {
            const doc = await res.json();
            console.log(`🎉 ¡BINGO! PROYECTO 'EB' FUNCIONÓ CON COOKIES.`);
            console.log(`📄 Título: ${doc.Title}`);
        } else {
            console.log(`❌ Falló 'EB' incluso con Cookies (${res.status}).`);
            const err = await res.text();
            console.log(`   Mensaje: ${err.substring(0, 100)}`);
        }
    } catch (e) { console.log(`Error: ${e.message}`); }
}

run();