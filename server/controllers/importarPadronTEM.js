
import fs from 'fs';
import readline from 'readline';

/**
 * Parsea una línea del CSV TEM: "CUIT;APELLIDO Y NOMBRE"
 * - Omite la cabecera
 * - Si el NOMBRE comienza con el CUIT de 11 dígitos, lo elimina
 * - Trunca NOMBRE a 50 caracteres
 */
function parseTEMLine(line, lineIndex) {
    const raw = line.trim();
    if (!raw) return null;

    // Omitir línea de cabecera
    if (lineIndex === 0 && /^CUIT/i.test(raw)) return null;

    const sepIdx = raw.indexOf(';');
    if (sepIdx === -1) return null;

    const cuitRaw = raw.substring(0, sepIdx).trim();
    const nombreRaw = raw.substring(sepIdx + 1).trim();

    // CUIT: primeros 11 dígitos del campo
    const cuitDigits = cuitRaw.replace(/\D/g, '');
    if (cuitDigits.length < 11) return null;
    const cuit = cuitDigits.substring(0, 11);

    // NOMBRE: si empieza con el CUIT de 11 dígitos, quitarlo
    let nombre = nombreRaw;
    if (nombre.startsWith(cuit)) {
        nombre = nombre.substring(11).trim();
    }

    nombre = nombre.trim().substring(0, 50);
    if (!nombre) return null;

    return { CUIT: cuit, NOMBRE: nombre };
}

export const importarPadronTEM = async (req, res, adapter) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No se subió ningún archivo.' });
    }

    const periodo = (req.body?.periodo || '').trim();
    if (!periodo || !/^\d{2}\/\d{4}$/.test(periodo)) {
        return res.status(400).json({ error: 'El período es obligatorio y debe tener formato MM/YYYY (ej: 05/2026).' });
    }

    const filePath = req.file.path;
    let db = null;

    console.log(`Iniciando importación de padrón TEM desde: ${filePath} — Período: ${periodo}`);

    try {
        db = await adapter.connect();

        // 1. Truncar tabla
        console.log('Truncando tabla PADRON_TEM...');
        if (adapter.type === 'sqlite') {
            await db.query('DELETE FROM PADRON_TEM');
        } else {
            await db.query('TRUNCATE TABLE PADRON_TEM');
        }

        // 2. Streaming read
        const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

        const BATCH_SIZE = 500;
        let batch = [];
        let rowsCount = 0;
        let lineIndex = 0;
        const seenCuits = new Set(); // deduplicar CUITs repetidos en el mismo archivo

        const insertBatch = async (rows) => {
            if (rows.length === 0) return;
            const values = rows.map(r => {
                const nombre = r.NOMBRE.replace(/'/g, "''");
                return `('${r.CUIT}', '${nombre}', '${periodo}')`;
            }).join(',');
            const query = `INSERT INTO PADRON_TEM (CUIT, NOMBRE, PERIODO) VALUES ${values}`;
            await db.query(query);
        };

        for await (const line of rl) {
            const parsed = parseTEMLine(line, lineIndex);
            lineIndex++;

            if (parsed && !seenCuits.has(parsed.CUIT)) {
                seenCuits.add(parsed.CUIT);
                batch.push(parsed);
                rowsCount++;
            }

            if (batch.length >= BATCH_SIZE) {
                await insertBatch(batch);
                batch = [];
            }
        }

        if (batch.length > 0) {
            await insertBatch(batch);
        }

        console.log(`Importación TEM finalizada. Filas procesadas: ${rowsCount}`);

        try {
            fs.unlinkSync(filePath);
        } catch (err) {
            console.warn('No se pudo borrar el archivo temporal:', err.message);
        }

        res.json({
            success: true,
            message: `Padrón TEM importado correctamente. Período: ${periodo}.`,
            rowsProcessed: rowsCount,
            periodo,
        });

    } catch (e) {
        console.error('Error crítico importando padrón TEM:', e);
        res.status(500).json({ error: e.message });
    }
};
