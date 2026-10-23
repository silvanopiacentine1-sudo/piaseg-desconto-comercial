# Fonte do manual do franqueado (PDF)

O manual NÃO fica mais online (pedido do Silvano em 2026-10-23): só o arquivo PDF,
distribuído por ele (cópia em ~/Desktop/Trabalho/Franchising/Manual-Desconto-Comercial-Piaseg.pdf).

Para regerar o PDF depois de mudar regras/nomes do sistema:
1. Copiar `page.tsx` para `frontend/app/como-funciona/page.tsx` (temporariamente, NÃO commitar lá).
2. `next build` e subir backend (porta 8131) + `next start -p 3131`.
3. `node ferramentas/gerar_manual_pdf.js ~/Desktop/Trabalho/Franchising/Manual-Desconto-Comercial-Piaseg.pdf`
4. Apagar `frontend/app/como-funciona/` de novo.
