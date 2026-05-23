
import fs from 'fs';
import readline from 'readline';

/**
 * Normaliza el string de porcentaje "1,5" -> 1.5
 */
function normalizePercentStr(p) {
    if (!p) return null;
    p = p.trim();
    if (p === "" || p === "-----") return null;
    p = p.replace(",", ".");
    const val = parseFloat(p);
    return isNaN(val) ? null : val;
}

/**
 * Parsea una línea del txt usando regex
 */
function parsePadronTxtLine(line) {
    // Regex adaptado de Python:
    // r'^(?P<cuit>\d{11})\s+(?P<exento>E\s+)?(?P<conv>CM|CL)\s+'
    // r'(?P<body>.+?)\s+(?P<porc>(?:\d+(?:[.,]\d+)?)|-----)\s*$'

    // JS Regex (Named groups support Node.js >= 10)
    const regex = /^(?<cuit>\d{11})\s+(?<exento>E\s+)?(?<conv>CM|CL)\s+(?<body>.+?)\s+(?<porc>(?:\d+(?:[.,]\d+)?)|-----)\s*$/;

    const match = line.match(regex);
    if (!match) return null;

    const g = match.groups;
    const body = g.body.trim();
    const tokens = body.split(/\s+/); // Split by whitespace

    // Lógica para descartar fechas (AAAAMMDD) al inicio del nombre
    // Python validaba tokens[0] y tokens[1] como \d{8}
    let denomTokens = tokens;
    const dateRegex = /^\d{8}$/;

    if (tokens.length >= 2 && dateRegex.test(tokens[0]) && dateRegex.test(tokens[1])) {
        denomTokens = tokens.slice(2);
    }

    const denominacion = denomTokens.join(" ").trim();
    const cuit = g.cuit; // Ya son digitos por el regex \d{11}
    const exento = g.exento ? "E" : null;
    const convenio = g.conv;
    const porcentaje = normalizePercentStr(g.porc);

    return {
        CUIT: cuit,
        EXENTO: exento,
        CONVENIO: convenio,
        DENOMINACION: denominacion,
        PORCENTAJE: porcentaje
    };
}

export const importarPadron = async (req, res, adapter) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No se subió ningún archivo.' });
    }

    // Periodo obligatorio en formato MM/YYYY
    const periodo = (req.body?.periodo || '').trim();
    if (!periodo || !/^\d{2}\/\d{4}$/.test(periodo)) {
        return res.status(400).json({ error: 'El período es obligatorio y debe tener formato MM/YYYY (ej: 05/2026).' });
    }

    const filePath = req.file.path;
    let db = null;

    console.log(`Iniciando importación de padrón desde: ${filePath} — Período: ${periodo}`);

    try {
        db = await adapter.connect();

        // 1. Truncar tabla
        console.log("Truncando tabla PADRON_RENTAS...");
        if (adapter.type === 'sqlite') {
            await db.query("DELETE FROM PADRON_RENTAS");
        } else {
            await db.query("TRUNCATE TABLE PADRON_RENTAS"); // MS SQL
        }

        // 2. Streaming Read
        const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        // Batch Config (SQL Server limit for VALUES is 1000 rows, so we use 500 to be safe)
        const BATCH_SIZE = 500;
        let batch = [];
        let rowsCount = 0;

        // Helper para insert
        const insertBatch = async (rows) => {
            if (rows.length === 0) return;

            const values = rows.map(r => {
                const den  = r.DENOMINACION.replace(/'/g, "''");
                const ex   = r.EXENTO ? `'${r.EXENTO}'` : 'NULL';
                const porc = r.PORCENTAJE !== null ? r.PORCENTAJE : 'NULL';
                return `('${r.CUIT}', ${ex}, '${r.CONVENIO}', '${den}', ${porc}, '${periodo}')`;
            }).join(',');

            const query = `INSERT INTO PADRON_RENTAS (CUIT, EXENTO, CONVENIO, DENOMINACION, PORCENTAJE, PERIODO) VALUES ${values}`;
            await db.query(query);
        };

        for await (const line of rl) {
            if (!line.trim()) continue;

            const parsed = parsePadronTxtLine(line);
            if (parsed) {
                batch.push(parsed);
                rowsCount++;
            }

            if (batch.length >= BATCH_SIZE) {
                await insertBatch(batch);
                batch = [];
            }
        }

        // Insert remanente
        if (batch.length > 0) {
            await insertBatch(batch);
        }

        console.log(`Importación finalizada. Filas procesadas: ${rowsCount}`);

        // Limpiar archivo
        try {
            fs.unlinkSync(filePath);
        } catch (err) {
            console.warn("No se pudo borrar el archivo temporal:", err.message);
        }

        res.json({
            success: true,
            message: `Padrón de Rentas importado correctamente. Período: ${periodo}.`,
            rowsProcessed: rowsCount,
            periodo,
        });

    } catch (e) {
        console.error("Error crítico importando padrón:", e);
        res.status(500).json({ error: e.message });
    }
};
