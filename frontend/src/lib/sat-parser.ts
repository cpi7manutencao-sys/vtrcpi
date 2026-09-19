// ============================================================
// sat-parser.ts - Parser do HTML/texto do SAT (PMESP)
// Roda 100% no navegador - nao precisa de servidor
// Extrai: posto/graduacao, nome, OPM, codigo SIAFEM, CNH (categoria,
// boletim, data, cassada), publicacoes
// Fonte: skill sat-pmesp (10.61.9.19/sat/consultaReply.asp)
// ============================================================

export interface SatPublicacao {
  categoria: string
  boletim: string
  data: string
  cassada: boolean
}

export interface SatResult {
  encontrado: boolean
  erro?: string
  re?: string
  postoGraduacao?: string
  nome?: string
  opm?: string
  opmCode?: string
  cnhCategoria?: string
  boletim?: string
  dataProva?: string
  cassada?: boolean
  publicacoes?: SatPublicacao[]
  raw?: string
}

/**
 * Converte HTML do SAT em texto plain (remove tags, normaliza espacos).
 */
function htmlToText(html: string): string {
  // Quebra por tags, depois normaliza espacos
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' | ')
    .replace(/<\/th>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim()
  return text
}

/**
 * Tenta parsear texto/HTML do SAT.
 * Aceita tanto HTML puro (copia direto do navegador) quanto texto plain (CTRL+SHIFT+C).
 */
export function parseSAT(input: string, reOriginal = ''): SatResult {
  if (!input || input.trim().length < 10) {
    return { encontrado: false, erro: 'Texto vazio ou muito curto' }
  }

  // Detecta se eh HTML ou texto plain
  const isHtml = /<[a-z][^>]*>/i.test(input)
  const text = isHtml ? htmlToText(input) : input.trim()

  // Confirma que eh resposta do SAT
  if (!/Dados do Policial Militar/i.test(text) && !/Posto\s*\/\s*Gradua/i.test(text)) {
    return { encontrado: false, erro: 'Texto nao parece ser do SAT (nao achei "Dados do Policial Militar" nem "Posto/Graduacao")' }
  }

  // Confirma que o PM foi encontrado (nao eh "PM nao encontrado")
  if (/PM\s+n[ãa]o\s+encontrado/i.test(text) || /n[ãa]o\s+foi\s+localizado/i.test(text)) {
    return { encontrado: false, erro: 'PM nao encontrado no SAT' }
  }

  try {
    // BLOCO 1: Identificacao (entre "OPM Atual" e "Dados da Habilita")
    const mBloco = text.match(/OPM Atual\s+(.*?)\s+(?:Dados da Habilita|Habilita[çc][ãa]o)/i)
    let posto = ''
    let nome = ''
    let opm = ''
    let opmCode = ''

    if (mBloco) {
      const pmOpm = mBloco[1].trim()
      // Remove codigo SIAFEM entre parenteses pra extrair separado
      const codeM = pmOpm.match(/\((\d{9})\)/)
      if (codeM) opmCode = codeM[1]
      const semCode = pmOpm.replace(/\s*\(\d{9}\)\s*/, ' ').trim()

      // Posto: aceita "CABO PM", "1. TENENTE PM", "2. SGT PM", "CAP PM", etc
      // FIX: [0-9]*\.?\s* antes de [A-Z] pra pegar postos numerados
      const postoM = semCode.match(/^([0-9ºª]*\.?\s*[A-ZÇÃÕÉÊÔÚ][A-ZÇÃÕÉÊÔÚ\s/.\-ºª]*?PM)\s+(.+)$/)
      if (postoM) {
        posto = postoM[1].trim().replace(/\s+/g, ' ')
        const resto = postoM[2].trim()
        // OPM eh o ULTIMO token (CPI-7, 7BPMI, etc) - letras e numeros
        const opmM = resto.match(/\s+([A-ZÇ][A-Z0-9/\-ºª]+)\s*$/)
        if (opmM) {
          opm = opmM[1].trim()
          nome = resto.slice(0, opmM.index).trim()
        } else {
          nome = resto
        }
      } else {
        // Fallback: tudo eh nome
        nome = semCode
      }
    }

    // BLOCO 2: Habilitacao (depois de "Cassada" ate o fim do bloco)
    // Formato: cat(1-3 chars) + boletim(token) + data(dd/mm/yyyy) + cassada(Sim/Nao)
    const publicacoes: SatPublicacao[] = []
    let cnhCategoria = ''
    let cnhBoletim = ''
    let cnhDataProva = ''
    let cnhCassada = false

    // Pega todas as publicacoes (formato de tabela no SAT)
    // Tenta primeiro o formato com "Dados da Habilitacao" como header
    const habSection = text.match(/(?:Dados da Habilita[çc][ãa]o|Categoria N[úu]mero do Boletim)\s*([\s\S]+?)(?=ATEN[çc][ãa]O|Aten[çc][ãa]o|Caso voc[êe]|$)/i)
    if (habSection) {
      const linhas = habSection[1].split('\n').map(l => l.trim()).filter(l => l.length > 0)
      for (const linha of linhas) {
        // Cada linha: Categoria Boletim DataProva Cassada
        // Pode ter separadores | (vindos de </td>)
        const tokens = linha.split(/\s*\|\s*/).map(t => t.trim()).filter(Boolean)
        // Tenta encontrar padrao: 1-3 chars letra + Boletim (com pontos) + data dd/mm/aaaa + Sim/Nao
        const m = linha.match(/^([A-Z]{1,3})\s+(\S+)\s+(\d{2}\/\d{2}\/\d{4})\s+(Sim|N[ãa]o)\s*$/i)
        if (m) {
          publicacoes.push({
            categoria: m[1].toUpperCase(),
            boletim: m[2],
            data: m[3],
            cassada: m[4].toLowerCase().startsWith('s'),
          })
        } else if (tokens.length >= 4) {
          // Tenta match flexivel
          const cat = tokens[0]
          const bol = tokens[1]
          const dat = tokens.find(t => /^\d{2}\/\d{2}\/\d{4}$/.test(t)) || ''
          const cass = tokens.find(t => /^(sim|n[ãa]o)$/i.test(t)) || 'Não'
          if (cat && bol && dat) {
            publicacoes.push({
              categoria: cat,
              boletim: bol,
              data: dat,
              cassada: cass.toLowerCase().startsWith('s'),
            })
          }
        }
      }
    }

    if (publicacoes.length > 0) {
      // Pega a primeira publicacao NAO cassada como padrao
      const ativa = publicacoes.find(p => !p.cassada) || publicacoes[0]
      cnhCategoria = ativa.categoria
      cnhBoletim = ativa.boletim
      cnhDataProva = ativa.data
      cnhCassada = ativa.cassada
    } else {
      // Fallback: regex simples em uma linha
      const mHab = text.match(/Cassada\s+([A-Z]{1,3})\s+(\S+)\s+(\d{2}\/\d{2}\/\d{4})\s+(Sim|N[ãa]o)/i)
      if (mHab) {
        cnhCategoria = mHab[1].toUpperCase()
        cnhBoletim = mHab[2]
        cnhDataProva = mHab[3]
        cnhCassada = mHab[4].toLowerCase().startsWith('s')
        publicacoes.push({
          categoria: cnhCategoria,
          boletim: cnhBoletim,
          data: cnhDataProva,
          cassada: cnhCassada,
        })
      }
    }

    return {
      encontrado: true,
      re: reOriginal,
      postoGraduacao: posto,
      nome,
      opm,
      opmCode,
      cnhCategoria,
      boletim: cnhBoletim,
      dataProva: cnhDataProva,
      cassada: cnhCassada,
      publicacoes,
      raw: text.slice(0, 500),
    }
  } catch (e: any) {
    return { encontrado: false, erro: `Erro parse: ${e.message}` }
  }
}

/**
 * URL do SAT pra abrir em popup. IP direto (DNS nao resolve).
 */
export const SAT_URL = 'http://10.61.9.19/sat/consultaReply.asp'

/**
 * Abre o SAT em popup 800x600 com RE pre-preenchido.
 */
export function abrirSATPopup(re: string): void {
  const url = `${SAT_URL}?re=${encodeURIComponent(re.replace(/\D/g, ''))}`
  const w = 900
  const h = 700
  const left = (screen.width - w) / 2
  const top = (screen.height - h) / 2
  window.open(
    url,
    'sat_pm_consulta',
    `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes,toolbar=yes,location=yes`
  )
}
