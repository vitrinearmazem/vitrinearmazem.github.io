// ===== Vitrine Armazém – gera uma página por máquina =====
// Roda no GitHub (tarefa "Páginas das máquinas"), todo dia às 7h e pelo botão Run workflow.
//  - Lê os dados da vitrine no Apps Script (o mesmo link que o site usa).
//  - Máquina na vitrine: página completa (fotos, preço, ficha, WhatsApp, Quem vende).
//  - Máquina que saiu: a página continua no ar, com selo VENDIDO (ou INDISPONÍVEL),
//    até 3 parecidas da mesma categoria e o botão "Encomendar uma parecida".
//  - Se o nome da máquina mudar, o endereço antigo vira um atalho para o novo.
//  - Atualiza o sitemap.xml (vitrine + todas as páginas de máquinas).
// O controle fica em maquinas/estado.json (não apague).

const fs = require('fs');
const path = require('path');

const URL_DADOS = 'https://script.google.com/macros/s/AKfycbzX6TfdgbSE6N6R-M7saDM5BScIjwjVEjWdaNIK5jP4ZJbDtTA94IgqaYWDQddXPmjM/exec?formato=json';
const SITE = 'https://vitrinearmazem.com.br/';
const RAIZ = path.join(__dirname, '..', '..');
const PASTA = path.join(RAIZ, 'maquinas');
const ARQ_ESTADO = path.join(PASTA, 'estado.json');
const WHATS = '5517981991295';

// ---------- utilidades ----------
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
const titulo = i => (i.marca && String(i.desc || '').toLowerCase().indexOf(String(i.marca).toLowerCase()) < 0 ? i.marca + ' ' : '') + (i.desc || '');
const tituloLink = i => (i.marca ? i.marca + ' ' : '') + (i.desc || '');   // igual ao index.html (para o endereço)
const arquivoDe = i => i.n + '-' + (slug(tituloLink(i)) || 'maquina') + '.html';
const brl = v => Number(v) > 0 ? 'R$ ' + Math.round(Number(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') : 'Consulte';
const ehVeiculo = i => /ve[ií]c/i.test(String(i.cat || ''));
const horTexto = i => Number(i.hor) > 0 ? Math.round(Number(i.hor)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (ehVeiculo(i) ? ' km' : ' h') : '';
const hojeIso = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);   // data de Brasília
const jsonLd = o => JSON.stringify(o).replace(/</g, '\\u003c');

const PLURAL = {
  'Trator': 'todos os tratores', 'Implemento': 'todos os implementos', 'Acessório': 'todos os acessórios',
  'Colheitadeira': 'todas as colheitadeiras', 'Veículos': 'todos os veículos',
  'Pulverizador Autopropelido': 'todos os pulverizadores autopropelidos', 'Outro': 'todos os outros itens'
};
const todosDa = cat => PLURAL[cat] || ('todos os itens de ' + String(cat || '').toLowerCase());

// ---------- peças da página ----------
const CSS = `
:root{--azul:#0E4D8A;--verde:#1F7A3A;--verde-cl:#DDF0E2;--fundo:#F3F4F1;--texto:#1D2329;--sec:#5B6570;--linha:#E1E4E0}
*{box-sizing:border-box}
html,body{margin:0}
body{font-family:Barlow,Arial,sans-serif;background:var(--fundo);color:var(--texto);font-size:16px}
h1,.sc{font-family:"Barlow Semi Condensed",Arial,sans-serif}
a{color:var(--azul)}
.wrap{max-width:640px;margin:0 auto;min-height:100vh;display:flex;flex-direction:column}
.cab{background:var(--azul);color:#fff;padding:12px 16px;padding-top:calc(12px + env(safe-area-inset-top,0px));display:flex;align-items:center;gap:10px;text-decoration:none}
.cab img{width:38px;height:38px;border-radius:6px;background:#fff;object-fit:contain}
.cab b{display:block;font-family:"Barlow Semi Condensed",Arial,sans-serif;font-size:19px;font-weight:600;line-height:1.1}
.cab span{font-size:13px;color:#C9DCEF}
.trilha{padding:10px 16px 0;font-size:13px;color:var(--sec)}
.fwrap{margin:10px 16px 0;position:relative}
.fotos{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;border-radius:12px;background:#D9DDD6;aspect-ratio:4/3;scrollbar-width:none}
.fotos::-webkit-scrollbar{display:none}
.fotos img{flex:none;width:100%;height:100%;object-fit:cover;scroll-snap-align:start}
.semfoto{width:100%;display:flex;align-items:center;justify-content:center;color:var(--sec)}
.cinza img{filter:grayscale(1)}
.cont{position:absolute;bottom:10px;right:10px;background:rgba(0,0,0,.55);color:#fff;font-size:13px;padding:3px 10px;border-radius:999px}
.selo{position:absolute;top:12px;left:12px;color:#fff;font-weight:600;font-size:14px;border-radius:6px;padding:5px 12px}
.selo.vend{background:var(--verde)}.selo.ind{background:#5B6570}.selo.res{background:#B65A0B}
.topo{padding:14px 16px 0;display:flex;flex-direction:column;gap:6px}
h1{margin:0;font-size:26px;font-weight:600;line-height:1.15}
.sub{font-size:15px;color:var(--sec)}
.preco{font-family:"Barlow Semi Condensed",Arial,sans-serif;font-size:30px;font-weight:600;color:var(--azul);margin-top:4px}
.acoes{padding:12px 16px 0;display:flex;flex-direction:column;gap:10px}
.bt{display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;border-radius:10px;padding:14px;font-size:17px;font-weight:600}
.bt.zap{background:var(--verde);color:#fff}
.bt.sec{background:#fff;color:var(--azul);border:1px solid var(--azul);font-size:16px;padding:13px}
.box{margin:16px 16px 0;background:#fff;border:1px solid var(--linha);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px}
.box .tt{font-family:"Barlow Semi Condensed",Arial,sans-serif;font-size:18px;font-weight:600}
.ficha{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 12px;font-size:15px}
.ficha small{display:block;font-size:12px;color:var(--sec)}
.texto{margin:14px 16px 0;font-size:15px;line-height:1.5}
.quem{gap:8px}
.quem .rot{font-size:12px;color:var(--sec)}
.quem .nm{font-family:"Barlow Semi Condensed",Arial,sans-serif;font-size:20px;font-weight:600;color:var(--azul)}
.quem p{margin:0;font-size:15px;line-height:1.5}
.quem .end{font-size:14px;line-height:1.6;color:#374151}
.quem a{font-size:15px;font-weight:600}
.vt{margin:18px 16px 0;padding-top:14px;border-top:1px solid var(--linha);display:flex;flex-direction:column;gap:8px}
.vt .tt{font-family:"Barlow Semi Condensed",Arial,sans-serif;font-size:18px;font-weight:600}
.aviso{margin:14px 16px 0;background:var(--verde-cl);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px}
.aviso p{margin:0;font-size:15px;line-height:1.5;color:#14532D}
.par{margin:18px 16px 0;display:flex;flex-direction:column;gap:10px}
.par .tt{font-family:"Barlow Semi Condensed",Arial,sans-serif;font-size:18px;font-weight:600}
.pc{display:flex;gap:12px;background:#fff;border:1px solid var(--linha);border-radius:12px;padding:10px;text-decoration:none;color:var(--texto)}
.pc .f{width:92px;height:72px;border-radius:8px;background:#D9DDD6 center/cover no-repeat;flex-shrink:0}
.pc .n{font-family:"Barlow Semi Condensed",Arial,sans-serif;font-size:16px;font-weight:600;line-height:1.2}
.pc .s{font-size:13px;color:var(--sec)}
.pc .v{font-family:"Barlow Semi Condensed",Arial,sans-serif;font-size:18px;font-weight:600;color:var(--azul)}
.rod{margin-top:auto;background:var(--azul);color:#C9DCEF;padding:16px;padding-bottom:calc(16px + env(safe-area-inset-bottom,0px));font-size:13px;line-height:1.5;margin-top:24px}
:focus-visible{outline:3px solid #F2B035;outline-offset:2px}
`;

const ICONE_ZAP = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-12.6 7.3L3 21l2.2-5.2A8.4 8.4 0 1 1 21 11.5z"></path></svg>';

function cabeca(t, desc, url, foto, ld, indexar) {
  return '<!DOCTYPE html>\n<html lang="pt-BR"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
    '<title>' + esc(t) + '</title>' +
    '<meta name="description" content="' + esc(desc) + '">' +
    (indexar ? '' : '<meta name="robots" content="noindex">') +
    '<link rel="canonical" href="' + esc(url) + '">' +
    '<meta property="og:title" content="' + esc(t) + '">' +
    '<meta property="og:description" content="' + esc(desc) + '">' +
    (foto ? '<meta property="og:image" content="' + esc(foto) + '">' : '<meta property="og:image" content="' + SITE + 'logo-jumil.jpg">') +
    '<meta property="og:url" content="' + esc(url) + '"><meta property="og:type" content="product">' +
    '<meta property="og:site_name" content="Vitrine Armazém"><meta property="og:locale" content="pt_BR">' +
    '<meta name="theme-color" content="#0E4D8A"><link rel="icon" href="/icon-192.png">' +
    '<link rel="preconnect" href="https://fonts.googleapis.com">' +
    '<link href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@500;600&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet">' +
    '<style>' + CSS + '</style>' +
    '<script type="application/ld+json">' + jsonLd(ld) + '</script>' +
    '</head><body><div class="wrap">' +
    '<a class="cab" href="/"><img src="/logo.jpg" alt="Armazém do Agro"><div><b>Vitrine Armazém</b><span>Tratores e implementos · Rio Preto/SP</span></div></a>';
}

function quemVende(cfg) {
  return '<div class="box quem"><div class="rot">Quem vende</div><div class="nm">Armazém do Agro</div>' +
    '<p>Nossa loja em São José do Rio Preto: tratores, implementos e peças, novos e usados. Revenda oficial Jumil.</p>' +
    '<div class="end">Rua Sebastião Rodrigues Goulart, 45 · Vila Cassini<br>Loja (17) 3388-0422 · WhatsApp (17) 98199-1295</div>' +
    (cfg.chegar ? '<a href="' + esc(cfg.chegar) + '" target="_blank" rel="noopener">Como chegar na loja</a>' : '') +
    '</div>';
}

const RODAPE = '<div class="rod">Armazém do Agro · Revenda oficial Jumil<br>Rua Sebastião Rodrigues Goulart, 45 · São José do Rio Preto/SP</div></div>';

function blocoFotos(i, selo, cinza) {
  const fotos = (i.fotos || []).filter(Boolean);
  const imgs = fotos.length
    ? fotos.map((f, k) => '<img ' + (k ? 'loading="lazy" ' : '') + 'src="' + esc(f) + '" alt="' + esc(titulo(i)) + (k ? ' – foto ' + (k + 1) : '') + '">').join('')
    : '<div class="semfoto">Foto em breve</div>';
  return '<div class="fwrap' + (cinza ? ' cinza' : '') + '"><div class="fotos" id="fotos">' + imgs + '</div>' + selo +
    (fotos.length > 1 && !cinza ? '<span class="cont" id="cont">1/' + fotos.length + ' ⇆</span>' : '') + '</div>';
}

const SCRIPT_FOTOS = '<script>(function(){var f=document.getElementById("fotos"),c=document.getElementById("cont");' +
  'if(f&&c)f.addEventListener("scroll",function(){c.textContent=(Math.round(f.scrollLeft/f.clientWidth)+1)+"/"+f.children.length+" ⇆";});})();</script>';

function ldProduto(i, url, disponibilidade) {
  const o = {
    '@context': 'https://schema.org', '@type': 'Product', name: titulo(i), sku: String(i.n),
    description: textoMaquina(i), category: i.cat || undefined,
    image: (i.fotos || []).filter(Boolean),
    itemCondition: i.cond === 'Novo' ? 'https://schema.org/NewCondition' : 'https://schema.org/UsedCondition',
    offers: {
      '@type': 'Offer', url: url, priceCurrency: 'BRL', availability: disponibilidade,
      seller: { '@type': 'Organization', name: 'Armazém do Agro' }
    }
  };
  if (i.marca) o.brand = { '@type': 'Brand', name: i.marca };
  if (Number(i.valor) > 0) o.offers.price = Math.round(Number(i.valor));
  return o;
}

function textoMaquina(i) {
  const partes = [titulo(i), i.ano, String(i.cond || '').toLowerCase()].filter(Boolean).join(', ');
  return partes + (i.regiao ? ', disponível em ' + i.regiao : '') +
    '. À venda pelo Armazém do Agro, loja de máquinas e implementos em São José do Rio Preto, que atende produtores de toda a região. ' +
    'Fale com a gente pelo WhatsApp para fotos, vídeo e condições de pagamento.';
}

// ---------- página: máquina disponível ----------
function paginaDisponivel(i, cfg) {
  const url = SITE + 'maquinas/' + arquivoDe(i);
  const t = titulo(i);
  const sub = [i.ano, i.cond, i.regiao].filter(Boolean).join(' · ');
  const tituloAba = t + (i.ano ? ' ' + i.ano : '') + (i.cond ? ' ' + String(i.cond).toLowerCase() : '') +
    (i.regiao ? ' em ' + i.regiao : '') + ' | Vitrine Armazém';
  const reservado = i.disp === 'Reservado';
  const ficha = [['Categoria', i.cat], ['Marca', i.marca], ['Ano', i.ano], ['Condição', i.cond],
    ['Estado', i.estado && i.estado !== i.cond ? i.estado : ''], [ehVeiculo(i) ? 'KM' : 'Horímetro', horTexto(i)],
    ['Região', i.regiao], ['Nº na vitrine', i.n]]
    .filter(x => x[1] !== '' && x[1] != null).map(x => '<div><small>' + x[0] + '</small>' + esc(x[1]) + '</div>').join('');
  const zap = i.link || ('https://wa.me/' + WHATS + '?text=' + encodeURIComponent('Olá Vitor! Vi na Vitrine Armazém o item nº ' + i.n + ' – ' + t + '.'));

  return cabeca(tituloAba, textoMaquina(i).slice(0, 155), url, (i.fotos || [])[0],
      ldProduto(i, url, reservado ? 'https://schema.org/LimitedAvailability' : 'https://schema.org/InStock'), true) +
    '<div class="trilha"><a href="/">Vitrine</a> › <a href="/#cat-' + encodeURIComponent(i.cat || '') + '">' + esc(i.cat) + '</a> › ' + esc(i.desc) + '</div>' +
    blocoFotos(i, reservado ? '<span class="selo res">Reservado</span>' : '', false) +
    '<div class="topo"><h1>' + esc(t) + '</h1>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') +
    '<div class="preco">' + brl(i.valor) + '</div></div>' +
    '<div class="acoes"><a class="bt zap" href="' + esc(zap) + '" target="_blank" rel="noopener">' + ICONE_ZAP + 'Chamar no WhatsApp</a>' +
    '<a class="bt sec" href="/#item-' + encodeURIComponent(i.n) + '">Tenho interesse</a></div>' +
    '<div class="box"><div class="tt">Ficha da máquina</div><div class="ficha">' + ficha + '</div></div>' +
    '<div class="texto">' + esc(textoMaquina(i)) + '</div>' +
    quemVende(cfg) +
    '<div class="vt"><div class="tt">Veja também</div>' +
    '<a href="/#cat-' + encodeURIComponent(i.cat || '') + '">Ver ' + esc(todosDa(i.cat)) + ' da vitrine</a>' +
    (cfg.encomendar ? '<a href="' + esc(cfg.encomendar) + '" target="_blank" rel="noopener">Não achou? Encomende sua máquina</a>' : '') +
    '</div>' + RODAPE + SCRIPT_FOTOS + '</body></html>\n';
}

// ---------- página: máquina vendida / indisponível ----------
function paginaSaiu(i, arquivo, situacao, parecidas, cfg) {
  const url = SITE + 'maquinas/' + arquivo;
  const t = titulo(i);
  const vendido = situacao === 'Vendido';
  const sub = (i.cat ? i.cat + ' · ' : '') + (vendido ? 'Vendido pelo Armazém do Agro' : 'Não está mais disponível');
  const encomendar = cfg.encomendar ||
    ('https://wa.me/' + WHATS + '?text=' + encodeURIComponent('Olá Vitor! Procuro um parecido com o item nº ' + i.n + ' – ' + t + '.'));
  const lista = parecidas.map(p =>
    '<a class="pc" href="/maquinas/' + esc(arquivoDe(p)) + '"><div class="f"' +
    ((p.fotos || [])[0] ? ' style="background-image:url(\'' + esc(String(p.fotos[0]).replace(/sz=w\d+/, 'sz=w300')) + '\')"' : '') + '></div>' +
    '<div><div class="n">' + esc(titulo(p)) + '</div><div class="s">' + esc([p.ano, p.cond].filter(Boolean).join(' · ')) + '</div>' +
    '<div class="v">' + brl(p.valor) + '</div></div></a>').join('');

  return cabeca(t + (vendido ? ' – vendido' : '') + ' | Vitrine Armazém',
      (vendido ? 'Vendido pelo Armazém do Agro. ' : '') + 'Procura um ' + t + ' parecido? O Armazém do Agro encontra para você.', url,
      (i.fotos || [])[0], ldProduto(i, url, vendido ? 'https://schema.org/SoldOut' : 'https://schema.org/OutOfStock'), true) +
    '<div class="trilha"><a href="/">Vitrine</a> › <a href="/#cat-' + encodeURIComponent(i.cat || '') + '">' + esc(i.cat) + '</a> › ' + esc(i.desc) + '</div>' +
    blocoFotos(i, vendido ? '<span class="selo vend">VENDIDO</span>' : '<span class="selo ind">INDISPONÍVEL</span>', true) +
    '<div class="topo"><h1>' + esc(t) + '</h1><div class="sub">' + esc(sub) + '</div></div>' +
    '<div class="aviso"><p>' + (vendido ? 'Esta máquina já foi vendida.' : 'Esta máquina não está mais na vitrine.') +
    ' Procura uma parecida? A gente encontra para você.</p>' +
    '<a class="bt zap" href="' + esc(encomendar) + '" target="_blank" rel="noopener">Encomendar uma parecida</a></div>' +
    '<div class="par">' + (lista ? '<div class="tt">Parecidas disponíveis agora</div>' + lista : '') +
    '<a href="/#cat-' + encodeURIComponent(i.cat || '') + '" style="font-size:15px;margin-top:4px">Ver ' + esc(todosDa(i.cat)) + ' da vitrine</a></div>' +
    quemVende(cfg) + RODAPE + '</body></html>\n';
}

// Endereço antigo (o nome da máquina mudou): leva para o novo
function paginaAtalho(novo) {
  const url = SITE + 'maquinas/' + novo;
  return '<!DOCTYPE html>\n<html lang="pt-BR"><head><meta charset="utf-8"><title>Vitrine Armazém</title>' +
    '<meta name="robots" content="noindex"><link rel="canonical" href="' + url + '">' +
    '<meta http-equiv="refresh" content="0; url=' + novo + '"></head>' +
    '<body><a href="' + novo + '">Abrir a página da máquina</a></body></html>\n';
}

// ---------- principal ----------
async function main() {
  const r = await fetch(URL_DADOS, { redirect: 'follow' });
  if (!r.ok) throw new Error('Dados da vitrine indisponíveis (' + r.status + ')');
  const dados = await r.json();
  if (!dados || !Array.isArray(dados.itens)) throw new Error('Dados da vitrine sem a lista de itens.');

  if (!fs.existsSync(PASTA)) fs.mkdirSync(PASTA, { recursive: true });
  let estado = {};
  if (fs.existsSync(ARQ_ESTADO)) estado = JSON.parse(fs.readFileSync(ARQ_ESTADO, 'utf8'));

  // Proteção: se a vitrine vier vazia de repente, não marca tudo como vendido
  const ativosAntes = Object.values(estado).filter(e => e.situacao === 'Disponível').length;
  if (!dados.itens.length && ativosAntes > 3) throw new Error('A vitrine veio vazia; nada foi alterado.');

  const linkCfg = nome => {
    const c = (dados.config || []).find(x => String(x.opcao || '').toLowerCase().indexOf(nome) >= 0);
    return c ? c.link : '';
  };
  const cfg = { encomendar: linkCfg('encomendar'), chegar: linkCfg('chegar') };
  const saidas = {};
  (dados.saidas || []).forEach(s => { saidas[String(s.n)] = String(s.sit || ''); });

  const hoje = hojeIso();
  const ativos = {};
  dados.itens.forEach(i => { ativos[String(i.n)] = i; });

  // 1) Máquinas na vitrine
  dados.itens.forEach(i => {
    const n = String(i.n);
    const arq = arquivoDe(i);
    const antigo = estado[n];
    if (antigo && antigo.arquivo && antigo.arquivo !== arq) {
      fs.writeFileSync(path.join(PASTA, antigo.arquivo), paginaAtalho(arq));
      antigo.antigos = (antigo.antigos || []).concat(antigo.arquivo);
    }
    const dadosItem = {
      n: i.n, cat: i.cat, cond: i.cond, marca: i.marca, desc: i.desc, ano: i.ano, estado: i.estado,
      regiao: i.regiao, valor: i.valor, hor: i.hor, fotos: i.fotos, disp: i.disp
    };
    const html = paginaDisponivel(i, cfg);
    const caminho = path.join(PASTA, arq);
    const mudou = !fs.existsSync(caminho) || fs.readFileSync(caminho, 'utf8') !== html;
    if (mudou) fs.writeFileSync(caminho, html);
    estado[n] = {
      arquivo: arq, situacao: 'Disponível', dados: dadosItem,
      antigos: (antigo && antigo.antigos) || [],
      atualizado: mudou || !antigo ? hoje : (antigo.atualizado || hoje)
    };
  });

  // 2) Máquinas que saíram da vitrine
  Object.keys(estado).forEach(n => {
    if (ativos[n]) return;
    const e = estado[n];
    const situacao = saidas[n] === 'Vendido' ? 'Vendido' : 'Indisponível';
    const base = e.dados || {};
    const parecidas = dados.itens.filter(p => p.cat === base.cat)
      .sort((a, b) => Math.abs((a.valor || 0) - (base.valor || 0)) - Math.abs((b.valor || 0) - (base.valor || 0)))
      .slice(0, 3);
    const html = paginaSaiu(base, e.arquivo, situacao, parecidas, cfg);
    const caminho = path.join(PASTA, e.arquivo);
    const mudou = !fs.existsSync(caminho) || fs.readFileSync(caminho, 'utf8') !== html;
    if (mudou) fs.writeFileSync(caminho, html);
    if (e.situacao === 'Disponível') e.saiuEm = hoje;
    if (mudou) e.atualizado = hoje;
    e.situacao = situacao;
  });

  // 3) Sitemap
  const urls = ['  <url><loc>' + SITE + '</loc><changefreq>daily</changefreq><priority>1.0</priority></url>']
    .concat(Object.keys(estado).sort((a, b) => Number(b) - Number(a)).map(n => {
      const e = estado[n];
      return '  <url><loc>' + SITE + 'maquinas/' + e.arquivo + '</loc><lastmod>' + (e.atualizado || hoje) + '</lastmod>' +
        '<priority>' + (e.situacao === 'Disponível' ? '0.8' : '0.4') + '</priority></url>';
    }));
  fs.writeFileSync(path.join(RAIZ, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.join('\n') + '\n</urlset>\n');

  fs.writeFileSync(ARQ_ESTADO, JSON.stringify(estado, null, 1));
  const disp = Object.values(estado).filter(e => e.situacao === 'Disponível').length;
  console.log('Páginas: ' + disp + ' disponíveis, ' + (Object.keys(estado).length - disp) + ' vendidas/indisponíveis.');
}

main().catch(e => { console.error(e.message); process.exit(1); });
