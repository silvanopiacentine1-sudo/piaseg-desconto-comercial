# Desconto Comercial - Conta Corrente (Piaseg)

Painel aberto (sem senha) para os franqueados consultarem o saldo de desconto comercial em cada seguradora,
e área admin (senha única + nome do operador) onde a equipe lança créditos, reservas e utilizações.

- `backend/` — FastAPI, dados em JSON no disco persistente do Render (`DATA_DIR=/data`), backup automático a cada deploy e de hora em hora com movimentação.
- `frontend/` — Next.js (App Router) + Tailwind, deploy no Vercel.

Regras de saldo: Saldo = créditos − utilizações − reservas baixadas; Reserva = reservas em aberto; Saldo à utilizar = Saldo − Reserva.
Lançamentos nunca são apagados: correções são feitas por estorno (com motivo e operador).
