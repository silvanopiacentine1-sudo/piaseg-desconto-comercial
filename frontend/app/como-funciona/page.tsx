import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Como funciona | Desconto Comercial Piaseg",
  description: "Manual de uso do painel de Desconto Comercial para os franqueados Piaseg",
};

const NAVY = "#072a3c";
const OURO = "#c2a360";

const SECOES = [
  ["objetivo", "Para que serve"],
  ["quadros", "Os quadros do painel"],
  ["passo-a-passo", "Passo a passo"],
  ["respostas", "As respostas do gestor"],
  ["prazos", "Prazos e regras"],
  ["especiais", "Descontos especiais"],
  ["cores", "O que significa cada cor"],
  ["duvidas", "Dúvidas frequentes"],
] as const;

function Titulo({ id, n, children }: { id: string; n: number; children: React.ReactNode }) {
  return (
    <h2 id={id} className="font-heading text-xl sm:text-2xl mt-12 mb-4 scroll-mt-6 flex items-baseline gap-3" style={{ color: NAVY }}>
      <span className="text-sm font-sans font-bold rounded-full w-8 h-8 inline-flex items-center justify-center shrink-0" style={{ background: NAVY, color: OURO }}>
        {n}
      </span>
      {children}
    </h2>
  );
}

function Quadro({ nome, cor, texto, destaque = false }: { nome: string; cor: string; texto: string; destaque?: boolean }) {
  return (
    <div
      className="rounded-xl p-4"
      style={
        destaque
          ? { background: NAVY, border: `2px solid ${OURO}`, color: "#fff" }
          : { background: "#fff", borderTop: `4px solid ${cor}`, boxShadow: "0 1px 3px rgba(0,0,0,.08)" }
      }
    >
      <p className="text-xs uppercase tracking-wider font-bold mb-1" style={{ color: destaque ? OURO : cor }}>
        {nome}
      </p>
      <p className="text-sm" style={{ color: destaque ? "#f6f6f6" : "#374151" }}>
        {texto}
      </p>
    </div>
  );
}

function Passo({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <li className="bg-white rounded-xl p-5 shadow-sm flex gap-4">
      <span className="text-lg font-bold rounded-full w-10 h-10 inline-flex items-center justify-center shrink-0" style={{ background: OURO, color: NAVY }}>
        {n}
      </span>
      <div className="min-w-0">
        <p className="font-semibold mb-1" style={{ color: NAVY }}>
          {titulo}
        </p>
        <div className="text-sm text-gray-700 leading-relaxed space-y-2">{children}</div>
      </div>
    </li>
  );
}

function Selo({ cor, fundo, children }: { cor: string; fundo: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 whitespace-nowrap" style={{ color: cor, background: fundo }}>
      <span className="w-2 h-2 rounded-full" style={{ background: cor }} aria-hidden />
      {children}
    </span>
  );
}

function Pergunta({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="bg-white rounded-xl shadow-sm px-5 py-4 group">
      <summary className="font-semibold cursor-pointer list-none flex justify-between gap-3" style={{ color: NAVY }}>
        {q}
        <span className="text-gray-400 group-open:rotate-45 transition-transform" aria-hidden>
          +
        </span>
      </summary>
      <div className="text-sm text-gray-700 leading-relaxed mt-3 space-y-2">{children}</div>
    </details>
  );
}

export default function ComoFunciona() {
  return (
    <>
      <header className="w-full" style={{ background: NAVY, borderBottom: `3px solid ${OURO}` }}>
        <div className="max-w-4xl mx-auto px-4 py-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/60 mb-1">Desconto Comercial · Manual do franqueado</p>
            <h1 className="font-heading text-2xl sm:text-3xl" style={{ color: OURO }}>
              Como funciona
            </h1>
            <p className="text-white/80 text-sm mt-1">Tudo o que você precisa saber para usar o desconto das seguradoras</p>
          </div>
          <Link href="/" className="rounded-lg px-4 py-2 font-semibold text-sm" style={{ background: OURO, color: NAVY }}>
            ← Voltar ao painel
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8">
        {/* Índice */}
        <nav aria-label="Índice" className="bg-white rounded-xl shadow-sm p-5">
          <p className="text-xs uppercase tracking-wider text-gray-500 mb-3">Neste manual</p>
          <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {SECOES.map(([id, nome], i) => (
              <li key={id}>
                <a href={`#${id}`} className="hover:underline" style={{ color: NAVY }}>
                  <span className="font-bold" style={{ color: OURO }}>
                    {i + 1}.
                  </span>{" "}
                  {nome}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* 1 */}
        <Titulo id="objetivo" n={1}>
          Para que serve
        </Titulo>
        <div className="text-gray-700 leading-relaxed space-y-3">
          <p>
            Todo mês as seguradoras parceiras liberam para a Piaseg uma <strong>verba de desconto comercial</strong>. Ela serve
            para você oferecer um preço mais competitivo e <strong>fechar negócios</strong> que, sem o desconto, poderiam ir
            para a concorrência.
          </p>
          <p>
            Este painel é a <strong>conta corrente</strong> dessa verba. Nele você vê, em tempo real, quanto cada seguradora
            tem disponível, pede a reserva do valor para a sua cotação, acompanha a resposta do gestor e informa quando a
            proposta foi transmitida.
          </p>
          <div className="rounded-xl p-4 text-sm" style={{ background: "#fbf3e0", border: "1px solid #e9d29a", color: "#5c4510" }}>
            <strong>Importante:</strong> a verba é um <strong>recurso de toda a rede</strong>. Use com bom senso e moderação,
            para que o benefício seja distribuído de forma justa entre as unidades.
          </div>
        </div>

        {/* 2 */}
        <Titulo id="quadros" n={2}>
          Os quadros do painel
        </Titulo>
        <p className="text-gray-700 mb-4">
          Ao escolher uma seguradora na lista da esquerda, você vê 5 números. A conta é sempre:
        </p>
        <p className="text-center font-semibold rounded-xl p-3 mb-5 text-sm sm:text-base" style={{ background: "#e6edf1", color: NAVY }}>
          Saldo Inicial − Reserva − Aprovado − Transmitido = <span style={{ color: "#9a7a35" }}>Disponível</span>
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <Quadro nome="Saldo Inicial" cor={NAVY} texto="A verba que a seguradora liberou no mês. Não muda durante o mês." />
          <Quadro nome="Reserva" cor="#8a6a1f" texto="Pedidos que ainda estão aguardando a análise do gestor." />
          <Quadro nome="Aprovado" cor="#1d5fb8" texto="Pedidos aprovados pelo gestor, esperando você confirmar que a proposta foi transmitida." />
          <Quadro nome="Transmitido" cor="#1f7a4d" texto="Descontos já usados: a proposta foi transmitida para a seguradora." />
          <div className="sm:col-span-2">
            <Quadro nome="Disponível" cor={OURO} destaque texto="O que ainda está livre para novos pedidos. É o número em destaque no topo do painel." />
          </div>
        </div>

        {/* 3 */}
        <Titulo id="passo-a-passo" n={3}>
          Passo a passo
        </Titulo>
        <ol className="space-y-3">
          <Passo n={1} titulo="Escolha a seguradora e confira o Disponível">
            <p>
              Na lista à esquerda (no celular, na faixa no topo), clique na seguradora. Veja o <strong>Disponível</strong> e o
              mês selecionado. A verba é <strong>mensal</strong>: começa e termina dentro do mês.
            </p>
          </Passo>
          <Passo n={2} titulo='Clique em "Solicitar reserva de verba"'>
            <p>Preencha o formulário. Todos os campos marcados com * são obrigatórios:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Seguradora</strong> e, se houver, <strong>de qual verba</strong> (Automóvel ou um desconto especial);
              </li>
              <li>
                <strong>Valor</strong> do desconto que você precisa;
              </li>
              <li>
                <strong>Franqueado</strong> (a sua unidade);
              </li>
              <li>
                <strong>Gestor</strong> que vai analisar o pedido;
              </li>
              <li>
                <strong>Número da cotação</strong>;
              </li>
              <li>
                <strong>Justificativa</strong>: explique o negócio (cliente, produto, concorrência…). Quanto mais claro, mais
                rápida a análise.
              </li>
            </ul>
            <p>
              Ao enviar, o valor vai para a <strong>Reserva</strong> e você recebe um <strong>número de protocolo</strong>.
            </p>
          </Passo>
          <Passo n={3} titulo="Acompanhe a resposta">
            <p>
              O painel se atualiza sozinho. Seu pedido aparece nas <strong>Movimentações</strong> da seguradora e também em{" "}
              <strong>&quot;Minhas solicitações&quot;</strong>, no fim da página (neste navegador). Cada pedido mostra a sua{" "}
              <strong>posição na fila</strong>: quem pede primeiro tem a preferência.
            </p>
          </Passo>
          <Passo n={4} titulo="Pedido aprovado? Você tem 48 horas">
            <p>
              Quando o gestor aprova, o valor passa da Reserva para o <strong>Aprovado</strong> e começa a contar um prazo de{" "}
              <strong>48 horas</strong> (aparece o contador ⏳).
            </p>
          </Passo>
          <Passo n={5} titulo='Transmitiu a proposta? Clique em "Proposta transmitida"'>
            <p>
              Assim que a proposta for transmitida para a seguradora, clique no botão{" "}
              <strong style={{ color: "#1f7a4d" }}>☐ Proposta transmitida</strong> na movimentação. Ele vira um check verde ✓ e
              o valor passa para <strong>Transmitido</strong>.
            </p>
          </Passo>
          <Passo n={6} titulo='O negócio não vai sair? Clique em "Proposta não transmitida"'>
            <p>
              Se desistir, clique em <strong style={{ color: "#b42318" }}>✕ Proposta não transmitida</strong>. O valor sai da
              Reserva (ou do Aprovado) e volta na hora para o <strong>Disponível</strong>, liberando para outra unidade.
            </p>
          </Passo>
        </ol>

        {/* 4 */}
        <Titulo id="respostas" n={4}>
          As respostas do gestor
        </Titulo>
        <div className="space-y-3">
          {[
            ["#1d5fb8", "#e8f0fb", "Aprovada", "O valor pedido foi aprovado. Transmita a proposta em até 48 horas."],
            [
              "#9a5b00",
              "#fff4dc",
              "⚠ Aprovada com ressalva",
              "Aprovada com uma condição, que aparece em destaque. O gestor pode aprovar um valor diferente do pedido: se for menor, a diferença volta para o Disponível; se for maior, a diferença sai do Disponível. Leia a ressalva antes de transmitir.",
            ],
            ["#b42318", "#fdecea", "Não aprovada", "O pedido foi recusado. A resposta do gestor explica o motivo e o valor volta para o Disponível."],
          ].map(([cor, fundo, nome, texto]) => (
            <div key={nome} className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap sm:flex-nowrap gap-3 items-start">
              <div className="w-56 shrink-0">
                <Selo cor={cor} fundo={fundo}>
                  {nome}
                </Selo>
              </div>
              <p className="text-sm text-gray-700">{texto}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-gray-600 mt-3">
          A resposta aparece como <strong>&quot;Resposta do gestor (nome)&quot;</strong> embaixo do seu pedido. O gestor também pode
          fazer a reserva para você, por exemplo quando você pede pelo WhatsApp.
        </p>

        {/* 5 */}
        <Titulo id="prazos" n={5}>
          Prazos e regras
        </Titulo>
        <ul className="space-y-3">
          {[
            [
              "⏳",
              "48 horas para transmitir",
              "Depois da aprovação, você tem 48 horas para clicar em \"Proposta transmitida\". Se não clicar, aparece \"Desconto expirado\" em vermelho e o valor volta para o saldo da rede.",
            ],
            ["🗓", "Verba mensal", "A verba começa e termina dentro do mês. Use o seletor de mês para consultar meses anteriores."],
            ["🥇", "Ordem de chegada", "Os pedidos são analisados por ordem de chegada: quem pede primeiro tem a preferência."],
            [
              "🔄",
              "Saldo atualizado pela seguradora",
              "A verba só é atualizada depois que a seguradora envia o report. Não é possível prever os valores antes disso.",
            ],
            ["📝", "Tudo fica registrado", "Cada pedido guarda o histórico com data e hora: quem pediu, quem aprovou, quando foi transmitido."],
          ].map(([ic, t, d]) => (
            <li key={t} className="bg-white rounded-xl shadow-sm p-4 flex gap-3">
              <span className="text-xl" aria-hidden>
                {ic}
              </span>
              <div>
                <p className="font-semibold" style={{ color: NAVY }}>
                  {t}
                </p>
                <p className="text-sm text-gray-700">{d}</p>
              </div>
            </li>
          ))}
        </ul>

        {/* 6 */}
        <Titulo id="especiais" n={6}>
          Descontos especiais
        </Titulo>
        <p className="text-gray-700 leading-relaxed">
          Além da verba de <strong>Automóvel</strong>, algumas seguradoras liberam verba para{" "}
          <strong>produtos específicos</strong> (ex.: Empresarial, Condomínio, Máquinas agrícolas). Elas aparecem com o selo{" "}
          <Selo cor="#9a3412" fundo="#fff1e8">
            ★ desconto especial
          </Selo>{" "}
          e têm <strong>saldo próprio</strong>, separado do Automóvel. Ao pedir, escolha no campo <strong>&quot;De qual verba?&quot;</strong>.
        </p>

        {/* 7 */}
        <Titulo id="cores" n={7}>
          O que significa cada cor
        </Titulo>
        <div className="bg-white rounded-xl shadow-sm p-5 grid sm:grid-cols-2 gap-3">
          {[
            ["#8a6a1f", "#fbf3e0", "Em análise", "aguardando o gestor"],
            ["#1d5fb8", "#e8f0fb", "Aprovada · aguardando transmissão", "clique em Proposta transmitida em até 48h"],
            ["#1f7a4d", "#e8f3ec", "✓ Proposta transmitida", "desconto usado"],
            ["#9a5b00", "#fff4dc", "⚠ Aprovada com ressalva", "leia a condição do gestor"],
            ["#b42318", "#fdecea", "Não aprovada", "o valor voltou para o Disponível"],
            ["#b42318", "#fdecea", "Desconto expirado", "passou o prazo de 48h"],
            ["#4b5563", "#eceef1", "Proposta não transmitida", "você desistiu do pedido"],
          ].map(([cor, fundo, nome, d]) => (
            <div key={nome} className="flex flex-col gap-1">
              <Selo cor={cor} fundo={fundo}>
                {nome}
              </Selo>
              <span className="text-xs text-gray-500 pl-1">{d}</span>
            </div>
          ))}
        </div>

        {/* 8 */}
        <Titulo id="duvidas" n={8}>
          Dúvidas frequentes
        </Titulo>
        <div className="space-y-2">
          <Pergunta q="Preciso de login ou senha?">
            <p>Não. O painel é aberto para todos os franqueados Piaseg. Basta acessar o link.</p>
          </Pergunta>
          <Pergunta q="O Disponível está negativo. O que isso quer dizer?">
            <p>
              Que há mais pedidos do que verba no mês (por exemplo, quando a verba ainda não foi lançada). O gestor avalia caso
              a caso; aguarde a análise.
            </p>
          </Pergunta>
          <Pergunta q="Meu desconto expirou. E agora?">
            <p>
              Fale com o seu gestor comercial. Se ainda houver necessidade, ele pode reabrir o pedido com um novo prazo, ou você
              pode fazer uma nova solicitação.
            </p>
          </Pergunta>
          <Pergunta q="Cliquei em “Proposta transmitida” por engano.">
            <p>Avise o seu gestor comercial: ele consegue desfazer e voltar o pedido para Aprovado.</p>
          </Pergunta>
          <Pergunta q="Fiz o pedido errado (valor, seguradora, cotação).">
            <p>
              Clique em <strong>&quot;Proposta não transmitida&quot;</strong> para devolver o valor e faça um novo pedido com os dados
              certos. Se preferir, avise o gestor.
            </p>
          </Pergunta>
          <Pergunta q="Onde vejo os meus pedidos?">
            <p>
              Nas <strong>Movimentações</strong> de cada seguradora e em <strong>&quot;Minhas solicitações&quot;</strong>, no fim do
              painel. Cada pedido também tem uma página de acompanhamento com o histórico completo.
            </p>
          </Pergunta>
          <Pergunta q="Outras unidades veem o meu pedido?">
            <p>
              Sim. O painel é a conta corrente da rede, então todos veem as movimentações de cada seguradora. Isso garante
              transparência e a ordem de chegada.
            </p>
          </Pergunta>
        </div>

        <div className="mt-12 rounded-xl p-6 text-center" style={{ background: NAVY }}>
          <p className="font-heading text-lg mb-2" style={{ color: OURO }}>
            Ficou alguma dúvida?
          </p>
          <p className="text-sm text-white/85 mb-4">Fale com o seu gestor comercial Piaseg.</p>
          <Link href="/" className="inline-block rounded-lg px-5 py-2.5 font-semibold text-sm" style={{ background: OURO, color: NAVY }}>
            Ir para o painel
          </Link>
        </div>
      </main>

      <footer className="text-center text-xs text-gray-400 py-6">Piaseg Franchising</footer>
    </>
  );
}
