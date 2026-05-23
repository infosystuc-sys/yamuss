import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';
import fs from 'fs';

async function testPdf() {
    const token = jwt.sign(
        { id: 1, username: 'admin', role: 'SUPERVISOR', database: 'CENTRAL' },
        process.env.JWT_SECRET || 'finance_portal_secret_2024',
        { expiresIn: '8h' }
    );

    try {
        const res = await fetch('http://localhost:3002/api/orders/0000000012741/review', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await res.json();
        console.log("Data keys:", Object.keys(data));
        console.log("Error (if any):", data.error);
        if (data.pdfBase64) {
            fs.writeFileSync('test_comprobante.pdf', Buffer.from(data.pdfBase64, 'base64'));
            console.log("Written test_comprobante.pdf");
        }
    } catch (e) {
        console.error("Fetch threw error:", e);
    }
}

testPdf();
