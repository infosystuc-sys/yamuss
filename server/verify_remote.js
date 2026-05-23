import { DBAdapter } from './db/adapter.js';
import dotenv from 'dotenv';
import path from 'path';

// Fix para pkg/esbuild
const currentDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
// Intentar cargar desde la raíz del proyecto (un nivel arriba de /server)
dotenv.config({ path: path.join(currentDir, '../.env') });

async function verify() {
    const adapter = new DBAdapter();
    try {
        console.log("--- INICIANDO VERIFICACIÓN REMOTA ---");
        await adapter.connect();

        // 1. Verificar CPA04
        console.log("1. Verificando acceso a tabla CPA04...");
        const cpa04Res = await adapter.query("SELECT COUNT(*) as count FROM CPA04");
        console.log(`✅ CPA04 Accesible. Total registros: ${cpa04Res.recordset[0].count}`);

        // 2. Verificar/Crear Admin
        console.log("2. Verificando usuario admin...");
        // Asegurar que la tabla existe (init.js debería haberlo hecho, pero verificamos)
        const userTableRes = await adapter.query("SELECT * FROM sys.tables WHERE name = 'APP_USUARIOS'");

        if (userTableRes.recordset.length > 0) {
            const adminRes = await adapter.request()
                .input('login', 'VarChar', 'admin')
                .query("SELECT * FROM APP_USUARIOS WHERE login = @login");

            if (adminRes.recordset.length === 0) {
                console.log("⚠️ Usuario admin no encontrado. Creándolo...");
                await adapter.query("INSERT INTO APP_USUARIOS (login, password_hash, rol) VALUES ('admin', 'admin123', 'admin')");
                console.log("✅ Usuario admin creado.");
            } else {
                console.log("✅ Usuario admin existe.");
                // Opcional: Resetear password si se desea forzar
                // await adapter.query("UPDATE APP_USUARIOS SET password_hash = 'admin123' WHERE login = 'admin'");
            }
        } else {
            console.error("❌ Tabla APP_USUARIOS no encontrada. El init.js no corrió correctamente?");
        }

        console.log("--- VERIFICACIÓN COMPLETADA ---");
        process.exit(0);

    } catch (e) {
        console.error("❌ ERROR CRÍTICO:", e);
        process.exit(1);
    }
}

verify();
