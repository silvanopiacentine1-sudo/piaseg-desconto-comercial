// Gera o PDF do manual do franqueado a partir da página /como-funciona.
// Uso: subir backend (porta 8131) e frontend (next start -p 3131) e rodar:
//   node ferramentas/gerar_manual_pdf.js frontend/public/Manual-Desconto-Comercial-Piaseg.pdf
// Requer: npm i playwright (executablePath abaixo aponta para o Chromium já instalado nesta máquina).
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ executablePath: "/Users/silvanopiacentine/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell" });
  const p = await b.newPage();
  await p.goto("http://localhost:3131/como-funciona", { waitUntil: "networkidle" });
  await p.waitForSelector("text=Dúvidas frequentes");
  await p.evaluate(() => {
    document.querySelectorAll("details").forEach((d) => (d.open = true)); // FAQ aberto no PDF
    const st = document.createElement("style");
    st.textContent = `
      @page { size: A4; margin: 14mm 12mm 16mm; }
      html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #ffffff !important; }
      body > footer { display: none !important; }
      main { padding-top: 12px !important; padding-bottom: 0 !important; }
      main h2 { margin-top: 26px !important; }
      .shadow-sm { box-shadow: none !important; border: 1px solid #e5e7eb; }
      .mt-12 { margin-top: 24px !important; }
      details summary span { display: none !important; }
      li, details, .rounded-xl { break-inside: avoid; }
      h2 { break-after: avoid; }
      nav[aria-label="Índice"] a { text-decoration: none; }
    `;
    document.head.appendChild(st);
  });
  await p.emulateMedia({ media: "print" });
  await p.pdf({
    path: process.argv[2], format: "A4", printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#888;font-family:sans-serif">Piaseg Franchising · Manual do Desconto Comercial · página <span class="pageNumber"></span> de <span class="totalPages"></span></div>',
    margin: { top: "14mm", bottom: "16mm", left: "12mm", right: "12mm" },
  });
  await b.close();
})().catch(e => { console.error("FAIL", e.message); process.exit(1); });
