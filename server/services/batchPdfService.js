/**
 * batchPdfService.js
 * Genera el PDF de respaldo de un lote de transferencias.
 * Estilos corporativos alineados con pdfService.js
 */
import puppeteer from 'puppeteer';
import fs from 'fs';

/**
 * @param {Object} data
 * @param {Object} data.company   — { name, cuit, address, iibb, phone }
 * @param {number} data.loteId    — ID del lote
 * @param {string} data.fileName  — Nombre del archivo TXT asociado
 * @param {Array}  data.items    — [{ nComp, proveedor, monto }]
 * @param {number} data.montoTotal
 * @returns {Promise<Buffer>}
 */
export async function generateLotePDF(data) {
  const { company, loteId, fileName, items = [], montoTotal = 0 } = data;

  const fmt = (n) => (n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = () => new Date().toLocaleDateString('es-AR');

  const rows = items.length
    ? items.map((it, i) => `
            <tr>
                <td>${i + 1}</td>
                <td>${String(it.nComp ?? '').trim()}</td>
                <td>${String(it.proveedor ?? '').trim()}</td>
                <td class="num">$ ${fmt(it.monto)}</td>
            </tr>`).join('')
    : '<tr><td colspan="4" class="empty">Sin órdenes en el lote</td></tr>';

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; font-size: 9pt; color: #334155; }
  .doc-header {
    display: flex; justify-content: space-between; align-items: center;
    background: #2563eb; color: white; padding: 12px 20px; width: 100%;
  }
  .doc-header .doc-title { font-size: 11pt; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; }
  .doc-header .doc-lote { font-size: 10pt; font-weight: 600; }
  .main { padding: 20px; }
  .box { border: 1px solid #e5e7eb; padding: 12px 16px; border-radius: 4px; margin-bottom: 12px; }
  .box-title { font-weight: bold; font-size: 7.5pt; text-transform: uppercase; color: #64748b; margin-bottom: 6px; }
  .box p { line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; font-size: 8pt; margin-top: 8px; }
  table thead th {
    background: #1e293b; color: white; padding: 10px 12px; text-align: left;
    font-size: 10px; font-weight: bold; text-transform: uppercase;
  }
  table tbody td { border-bottom: 1px solid #e5e7eb; padding: 10px 12px; }
  table tbody tr:nth-child(even) td { background: #f8fafc; }
  td.num, th.num { text-align: right; }
  td.empty { text-align: center; color: #94a3b8; padding: 16px; }
  .total-row { font-weight: bold; font-size: 10pt; border-top: 2px solid #1e293b; background: #f8fafc !important; }
  .doc-footer { padding: 8px 16px; text-align: center; font-size: 7pt; color: #94a3b8; border-top: 1px solid #e5e7eb; background: #f8fafc; }
</style>
</head>
<body>
  <div class="doc-header">
    <span class="doc-title">COMPROBANTE DE LOTE DE TRANSFERENCIA</span>
    <span class="doc-lote">Lote N° ${loteId}</span>
  </div>
  <div class="main">
    <div class="box">
      <div class="box-title">Emisor</div>
      <p><strong>${company?.name ?? 'Empresa'}</strong></p>
      <p>CUIT: ${company?.cuit ?? '-'}${company?.iibb ? ' · IIBB: ' + company.iibb : ''}</p>
      <p>Dom.: ${company?.address ?? '-'}</p>
    </div>
    <div class="box">
      <div class="box-title">Datos del Lote</div>
      <p><strong>Número de Lote:</strong> ${loteId}</p>
      <p><strong>Fecha:</strong> ${fmtDate()}</p>
      <p><strong>Archivo TXT asociado:</strong> ${fileName ?? '-'}</p>
    </div>
    <div class="box">
      <div class="box-title">Detalle de Órdenes de Pago</div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Comprobante</th>
            <th>Proveedor</th>
            <th class="num">Importe</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <table style="margin-top:12px;">
        <tbody>
          <tr class="total-row">
            <td>MONTO TOTAL</td>
            <td class="num">$ ${fmt(montoTotal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
  <div class="doc-footer">
    Generado automáticamente por Gestión de Pagos | Documento de respaldo de lote
  </div>
</body>
</html>`;

  // Preferimos el Chrome que descarga Puppeteer (más compatible con su protocolo).
  // Si no está disponible (ej. .exe empaquetado sin caché de Puppeteer), caemos a
  // Edge/Chrome del sistema.
  const getBrowserPath = () => {
    try {
      const bundled = puppeteer.executablePath();
      if (bundled && fs.existsSync(bundled)) return bundled;
    } catch { /* ignore */ }

    const paths = [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    ];
    return paths.find(p => fs.existsSync(p));
  };

  const executablePath = getBrowserPath();
  const launchOptions = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  };
  if (executablePath) {
    launchOptions.executablePath = executablePath;
    console.log('✅ Utilizando navegador local para Lote de PDF:', executablePath);
  }

  const browser = await puppeteer.launch(launchOptions);

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      landscape: false,
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
