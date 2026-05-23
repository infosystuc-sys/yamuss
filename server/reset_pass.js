import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

async function run() {
    try {
        console.log("Conectando a local.db...");
        const db = await open({
            filename: './local.db',
            driver: sqlite3.Database
        });

        console.log("Actualizando contraseña de admin...");
        // El sistema usa texto plano según init.js y index.js
        const result = await db.run("UPDATE APP_USUARIOS SET password_hash = 'admin123' WHERE login = 'admin'");

        console.log(`Filas actualizadas: ${result.changes}`);

        const user = await db.get("SELECT * FROM APP_USUARIOS WHERE login = 'admin'");
        console.log("Usuario verificado:", user);

    } catch (e) {
        console.error("Error updating password:", e);
    }
}

run();
