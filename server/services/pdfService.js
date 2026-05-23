/**
 * pdfService.js
 * Genera el comprobante PDF de una Orden de Pago.
 *
 * Hoja 1 — Orden de Pago (A4 retrato)
 * Hoja 2 — Certificados de Retención (A4 retrato, page-break)
 */
import puppeteer from 'puppeteer';
import fs from 'fs';

export async function generateComprobantePDF(data) {
  const {
    company, provider, op,
    invoices = [],
    retentionsIB = [], retentionsTEM = [],
    account = { code: '', description: '' },
    treasuryMovements = [],
  } = data;

  const fmt = (n) => (n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (d) => {
    if (!d) return '-';
    try { return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
    catch { return String(d); }
  };

  const totalRetIB  = retentionsIB.reduce((s, r) => s + (r.amount ?? 0), 0);
  const totalRetTEM = retentionsTEM.reduce((s, r) => s + (r.amount ?? 0), 0);
  const totalRet    = totalRetIB + totalRetTEM;
  const netAmount   = (op.grossAmount ?? 0) - totalRet;

  const accountDisplay = account?.code
    ? `${account.code}${account.description ? ' — ' + account.description : ''}`
    : '—';

  // Cálculo de alícuota aplicada
  const alicuota = (ret) => {
    if (ret.appliedRate) return `${ret.appliedRate}%`;
    if (ret.baseAmount && ret.amount) return `${((ret.amount / ret.baseAmount) * 100).toFixed(2)}%`;
    return '-';
  };

  /* ── FILAS ── */
  const rowsInvoices = invoices.length
    ? invoices.map(i => `
        <tr>
          <td>${i.invoiceType ?? ''}</td>
          <td>${i.invoiceNumber ?? ''}</td>
          <td>${fmtDate(i.invoiceVto)}</td>
          <td class="num">$ ${fmt(i.amountPaid)}</td>
        </tr>`).join('')
    : '<tr><td colspan="4" class="empty">Sin facturas imputadas</td></tr>';

  const rowsTreasury = treasuryMovements.length
    ? treasuryMovements.map(t => `
        <tr>
          <td class="mono">${t.cuenta ?? ''}</td>
          <td>${t.descripcion ?? ''}${t.leyenda ? ' — ' + t.leyenda : ''}</td>
          <td class="num">$ ${fmt(t.monto)}</td>
        </tr>`).join('')
    : '<tr><td colspan="3" class="empty">Sin movimientos de tesorería</td></tr>';

  /* Muestra label "Ret. IIBB (X% s/ $ base)" para cada retención */
  const retLinesIB = retentionsIB.map(r =>
    `<tr><td>Ret. IIBB (${alicuota(r)} s/ $ ${fmt(r.baseAmount)})</td><td class="num">− $ ${fmt(r.amount)}</td></tr>`
  ).join('');
  const retLinesTEM = retentionsTEM.map(r =>
    `<tr><td>Ret. TEM (${alicuota(r)} s/ $ ${fmt(r.baseAmount)})</td><td class="num">− $ ${fmt(r.amount)}</td></tr>`
  ).join('');

  /* ── BLOQUE CERTIFICADO (una tabla por retención) ── */
  const certBlock = (title, retentions) => {
    if (!retentions.length) return '';
    return retentions.map(r => `
      <div class="cert-section">
        <div class="cert-section-title">${title}</div>
        <table class="cert-table">
          <tr><td class="cert-label">Certificado N°</td><td class="cert-value">${r.certificado ?? '-'}</td></tr>
          <tr><td class="cert-label">Alícuota aplicada</td><td class="cert-value">${alicuota(r)}</td></tr>
          <tr><td class="cert-label">Base de cálculo</td><td class="cert-value">$ ${fmt(r.baseAmount)}</td></tr>
          <tr><td class="cert-label">Importe retenido</td><td class="cert-value bold">$ ${fmt(r.amount)}</td></tr>
        </table>
        <div class="cert-firma">Firma y sello contador</div>
      </div>`).join('');
  };

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9pt; color: #222; background: #fff; }

  /* ── PÁGINAS ── */
  .page { width:190mm; margin: 0 auto; padding: 12mm 0 8mm; }
  .page-break { page-break-before: always; }

  /* ── ENCABEZADO ── */
  .doc-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px; padding-bottom:10px; border-bottom:2px solid #222; }
  .company-name { font-size:15pt; font-weight:700; font-family: Georgia, serif; margin-bottom:3px; }
  .company-meta { font-size:7.5pt; color:#555; line-height:1.6; }
  .op-block { text-align:right; }
  .op-label { font-size:7pt; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#666; }
  .op-number { font-size:13pt; font-weight:700; margin:2px 0; }
  .op-date { font-size:8pt; color:#555; }

  /* ── SECCIONES ── */
  .section { margin-bottom:8px; }
  .section-label { font-size:7pt; font-weight:700; text-transform:uppercase; letter-spacing:.12em; color:#888; margin-bottom:4px; border-bottom:1px solid #e0e0e0; padding-bottom:2px; }
  .provider-name { font-size:11pt; font-weight:700; margin-bottom:2px; }
  .provider-meta { font-size:8pt; color:#555; line-height:1.6; }

  /* ── TABLAS ── */
  table { width:100%; border-collapse:collapse; font-size:8pt; }
  thead tr { background:#f5f5f5; }
  thead th { padding:5px 8px; text-align:left; font-weight:700; font-size:7.5pt; text-transform:uppercase; letter-spacing:.06em; color:#444; border-bottom:1.5px solid #ccc; }
  tbody td { padding:5px 8px; border-bottom:1px solid #eee; color:#333; }
  td.num, th.num { text-align:right; }
  td.mono { font-family: monospace; }
  td.empty { text-align:center; color:#aaa; font-style:italic; padding:10px; }

  /* ── TOTALES ── */
  .totals-table { margin-top:4px; border-top:1px solid #ccc; }
  .totals-table td { padding:4px 8px; border:none; }
  .totals-table tr.net-row td { font-weight:700; font-size:11pt; border-top:1.5px solid #222; padding-top:6px; }

  /* ── FIRMAS ── */
  .signatures { display:grid; grid-template-columns:repeat(5,1fr); gap:8px; margin-top:12px; }
  .sig-box { border:1px solid #ccc; height:48px; display:flex; align-items:flex-end; justify-content:center; padding-bottom:4px; border-radius:2px; }
  .sig-label { font-size:6.5pt; font-weight:700; text-transform:uppercase; color:#777; text-align:center; }

  /* ── PIE ── */
  .doc-footer { margin-top:10px; padding-top:6px; border-top:1px solid #ddd; text-align:center; font-size:6.5pt; color:#aaa; }

  /* ── CERTIFICADOS (hoja 2) ── */
  .cert-header { margin-bottom:10px; padding-bottom:8px; border-bottom:2px solid #222; }
  .cert-company { font-size:11pt; font-weight:700; font-family: Georgia, serif; }
  .cert-company-meta { font-size:7.5pt; color:#555; }
  .cert-title { font-size:12pt; font-weight:700; font-family: Georgia, serif; margin:10px 0 2px; }
  .cert-subtitle { font-size:8pt; color:#666; margin-bottom:6px; }
  .cert-prov { font-size:8.5pt; margin-bottom:10px; }
  .cert-prov strong { font-weight:700; }
  .cert-section { margin-bottom:14px; }
  .cert-section-title { font-weight:700; font-size:8.5pt; text-transform:uppercase; letter-spacing:.08em; background:#f5f5f5; padding:5px 8px; border:1px solid #ddd; border-bottom:none; }
  .cert-table { border:1px solid #ddd; }
  .cert-table td { padding:5px 10px; border-bottom:1px solid #eee; font-size:8.5pt; }
  .cert-table .cert-label { color:#555; width:55%; }
  .cert-table .cert-value { text-align:right; font-weight:500; }
  .cert-table .cert-value.bold { font-weight:700; font-size:9.5pt; }
  .cert-firma { border:1px solid #ddd; border-top:none; text-align:center; padding:16px 8px 5px; font-size:7.5pt; color:#aaa; }
</style>
</head>
<body>

<!-- ═══════════════════════════════════════
     HOJA 1 — ORDEN DE PAGO
═══════════════════════════════════════ -->
<div class="page">

  <div class="doc-header">
    <div>
      <div class="company-name">${company.name ?? ''}</div>
      <div class="company-meta">
        ${company.address ?? ''}<br>
        CUIT: ${company.cuit ?? ''} · ${company.email ?? company.phone ?? ''}
      </div>
    </div>
    <div class="op-block">
      <div class="op-label">Orden de Pago</div>
      <div class="op-number">N° ${op.number ?? ''}</div>
      <div class="op-date">Fecha: ${fmtDate(op.date)}</div>
    </div>
  </div>

  <!-- Proveedor -->
  <div class="section">
    <div class="section-label">Proveedor</div>
    <div class="provider-name">${provider.name ?? ''}</div>
    <div class="provider-meta">
      ${provider.email ? provider.email + ' · ' : ''}CUIT: ${provider.cuit ?? '-'}${provider.cbu ? ' · CBU: ' + provider.cbu : ''}
    </div>
  </div>

  <!-- Facturas imputadas -->
  <div class="section">
    <div class="section-label">Facturas Imputadas</div>
    <table>
      <thead><tr>
        <th>Tipo</th><th>N° Comprobante</th><th>Vencimiento</th><th class="num">Importe</th>
      </tr></thead>
      <tbody>${rowsInvoices}</tbody>
    </table>
  </div>

  <!-- Cuenta -->
  <div class="section">
    <div class="section-label">Cuenta</div>
    <div style="font-size:8.5pt; padding:4px 0; color:#444;">${accountDisplay}</div>
  </div>

  <!-- Movimiento de tesorería -->
  <div class="section">
    <div class="section-label">Movimiento de Tesorería</div>
    <table>
      <thead><tr>
        <th>Cta.</th><th>Descripción</th><th class="num">Monto</th>
      </tr></thead>
      <tbody>${rowsTreasury}</tbody>
    </table>
  </div>

  <!-- Totales -->
  <div class="section">
    <table class="totals-table">
      <tbody>
        <tr><td>Importe bruto</td><td class="num">$ ${fmt(op.grossAmount)}</td></tr>
        ${retLinesIB}
        ${retLinesTEM}
        <tr class="net-row"><td>Neto pagado</td><td class="num">$ ${fmt(netAmount)}</td></tr>
      </tbody>
    </table>
  </div>

  <!-- Firmas -->
  <div class="signatures">
    <div class="sig-box"><div class="sig-label">Confeccionó</div></div>
    <div class="sig-box"><div class="sig-label">Controló</div></div>
    <div class="sig-box"><div class="sig-label">Autorizó</div></div>
    <div class="sig-box"><div class="sig-label">Pagó</div></div>
    <div class="sig-box"><div class="sig-label">Archivó</div></div>
  </div>

  <div class="doc-footer">
    Finance Portal · Documento de control de tesorería · OP ${op.number ?? ''} · ${fmtDate(op.date)}
  </div>

</div>

<!-- ═══════════════════════════════════════
     HOJA 2 — CERTIFICADOS DE RETENCIÓN
═══════════════════════════════════════ -->
<div class="page page-break">

  <div class="cert-header">
    <div class="cert-company">${company.name ?? ''}</div>
    <div class="cert-company-meta">CUIT: ${company.cuit ?? ''} · ${company.email ?? company.phone ?? ''}</div>
  </div>

  <div class="cert-title">Certificados de retención</div>
  <div class="cert-subtitle">OP N° ${op.number ?? ''} · Fecha: ${fmtDate(op.date)}</div>

  <div class="cert-prov">
    <strong>Proveedor:</strong> ${provider.name ?? ''} · <strong>CUIT:</strong> ${provider.cuit ?? '-'}
    ${provider.email ? '<br>' + provider.email : ''}
    ${provider.cbu ? ' · CBU: ' + provider.cbu : ''}
  </div>

  ${certBlock('Ingresos Brutos (IIBB)', retentionsIB)}
  ${certBlock('TEM — Tasa de Educación Municipal', retentionsTEM)}

  <div class="doc-footer">
    Finance Portal · Documento de control de tesorería · OP ${op.number ?? ''} · ${fmtDate(op.date)}
  </div>

</div>

</body>
</html>`;

  const getBrowserPath = () => {
    const paths = [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ];
    return paths.find(p => fs.existsSync(p));
  };

  const executablePath = getBrowserPath();
  const launchOptions = { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] };
  if (executablePath) {
    launchOptions.executablePath = executablePath;
    console.log('✅ PDF browser:', executablePath);
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
