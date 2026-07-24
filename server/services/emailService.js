/**
 * emailService.js
 * Envío de comprobante PDF de OP por email (Gmail SMTP).
 *
 * REGLA DE SEGURIDAD:
 *   Si process.env.TEST_EMAIL_RECIPIENT está definido, el correo se manda
 *   a esa dirección (modo prueba). Si no, se usa el email del proveedor.
 */
import nodemailer from 'nodemailer';

/**
 * @param {Object} params
 * @param {string}   params.providerEmail  — Email real del proveedor (CPA01.E_MAIL)
 * @param {string}   params.providerName   — Razón social del proveedor
 * @param {string}   params.opNumber       — Número de OP (para el nombre del adjunto)
 * @param {Buffer}   params.pdfBuffer      — PDF generado en memoria
 * @returns {Promise<{sent: boolean, recipient: string|null, reason?: string}>}
 */
export async function sendComprobante({ providerEmail, providerName, opNumber, pdfBuffer, from, smtpUser, smtpPass }) {

    // Determinar destinatario (regla de seguridad para pruebas)
    const testRecipient = process.env.TEST_EMAIL_RECIPIENT?.trim();
    const recipient = testRecipient || providerEmail?.trim();

    if (!recipient) {
        console.warn(`⚠️  [emailService] Proveedor "${providerName}" sin email. No se envió el comprobante de OP ${opNumber}.`);
        return { sent: false, recipient: null, reason: 'sin-email' };
    }

    if (testRecipient) {
        console.log(`🔒 [emailService] TEST MODE activo — enviando a ${testRecipient} en lugar de ${providerEmail || '(vacío)'}`);
    }

    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // STARTTLS
        auth: {
            user: smtpUser || process.env.SMTP_USER,
            pass: smtpPass || process.env.SMTP_PASS,
        },
    });

    const subject = `Comprobante Orden de Pago Nº ${opNumber}`;
    const fileName = `OP_${opNumber.replace(/[^a-zA-Z0-9]/g, '_')}_Comprobante.pdf`;

    try {
        await transporter.sendMail({
            from: from || process.env.SMTP_FROM || process.env.SMTP_USER,
            to: recipient,
            subject,
            html: `
                <p>Estimado/a proveedor/a${providerName ? ` <strong>${providerName}</strong>` : ''},</p>
                <p>Adjunto encontrará el comprobante correspondiente a la <strong>Orden de Pago Nº ${opNumber}</strong> generada por nuestro sistema de Tesorería.</p>
                <p>Por favor no responda a este correo. Ante cualquier consulta, comuníquese con el área de Tesorería.</p>
                <br>
                <p>Saludos cordiales.</p>
            `,
            attachments: [
                {
                    filename: fileName,
                    content: pdfBuffer,
                    contentType: 'application/pdf',
                },
            ],
        });

        console.log(`✅ [emailService] Comprobante OP ${opNumber} enviado a: ${recipient}`);
        return { sent: true, recipient };
    } catch (err) {
        console.error(`❌ [emailService] Error al enviar email:`, err.message);
        return { sent: false, recipient, reason: err.message };
    }
}
