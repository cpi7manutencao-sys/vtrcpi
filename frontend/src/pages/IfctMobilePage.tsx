// ============================================================
// IfctMobilePage.tsx
// Pagina PUBLICA (sem auth, sem chrome do app) que o motorista
// acessa via link /ifct/<token> pra preencher o IFCT.
// Mobile-first, sem sidebar/header do app.
// 3 acoes: ENCERRAMENTO (obrigatorio) | ABASTECIMENTO (opcional) | RONDA (opcional)
// + botao FINALIZAR.
// ============================================================

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'

// API publica (sem Authorization)
async function apiPublic(url: string, opts: RequestInit = {}): Promise<any> {
  const res = await fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || data.erro || 'Erro')
  return data
}

export default function IfctMobilePage() {
  const { token } = useParams<{ token: string }>()
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [ag, setAg] = useState<any>(null)
  const [abastecimentos, setAbastecimentos] = useState<any[]>([])
  const [rondas, setRondas] = useState<any[]>([])

  // Modal de qual acao
  const [modal, setModal] = useState<null | 'encerramento' | 'abastecimento' | 'ronda'>(null)

  // FIX (William 2026-09-09 v31): fluxo de boas-vindas
  // Antes da home do IFCT mobile, o motorista precisa:
  //   1) confirmar o KM inicial (com sugestao pre-preenchida do ultimo encerramento da viatura)
  //   2) preencher "A manutencao de 1 escalao foi realizada?" (com fallback automatico)
  // So apos os 2 passos abre a home com 3 botoes.
  type Etapa = 'km' | 'manutencao' | 'concluido'
  const [etapaInicial, setEtapaInicial] = useState<Etapa>('km')
  const [sugestaoKm, setSugestaoKm] = useState<number | null>(null)
  const [kmPartidaInicial, setKmPartidaInicial] = useState('')
  const [manutencaoTexto, setManutencaoTexto] = useState('')
  const [salvandoInicial, setSalvandoInicial] = useState(false)

  // FIX (William 2026-09-09 v32): flag pra decidir a etapa APENAS na
  // primeira carga. Sem isso, o carregar() chamado DEPOIS de confirmar
  // cada passo resetava a etapa de volta pra 'km'/'manutencao' e o
  // fluxo de boas-vindas entrava em loop.
  const isInitialLoad = useRef(true)

  function carregar() {
    if (!token) return
    setLoading(true)
    Promise.all([
      apiPublic('/api/ifct/get-by-token?token=' + encodeURIComponent(token)),
      apiPublic('/api/ifct/listar-abastecimentos?token=' + encodeURIComponent(token)).catch(() => ({ abastecimentos: [] })),
    ])
      .then(async ([d, abs]) => {
        setAg(d.agendamento)
        setAbastecimentos(abs.abastecimentos || [])
        // FIX (William 2026-09-09 v32): decide etapa APENAS na primeira carga
        // Em chamadas subsequentes (depois de confirmar KM ou manutencao),
        // a etapa eh controlada manualmente pelo fluxo de boas-vindas.
        if (isInitialLoad.current) {
          isInitialLoad.current = false
          const enc = d.agendamento.encerramento
          if (!enc?.hodometroPartida) {
            setEtapaInicial('km')
            // busca sugestao do KM de partida
            try {
              const sug = await apiPublic('/api/ifct/sugestao-km-partida?token=' + encodeURIComponent(token))
              const sugKm = sug?.sugestao ?? null
              setSugestaoKm(sugKm)
              if (sugKm != null) setKmPartidaInicial(String(sugKm))
            } catch {
              // sem sugestao - motorista digita manualmente
            }
          } else if (!enc?.consideracoesVeiculo || enc.consideracoesVeiculo.trim() === '') {
            setEtapaInicial('manutencao')
          } else {
            setEtapaInicial('concluido')
          }
        }
      })
      .catch(e => setErro(e.message))
      .finally(() => setLoading(false))
  }

  // Confirma o KM inicial digitado pelo motorista
  async function confirmarKmInicial() {
    if (!kmPartidaInicial || isNaN(Number(kmPartidaInicial)) || Number(kmPartidaInicial) < 0) {
      setErro('Informe um KM inicial válido')
      return
    }
    setSalvandoInicial(true)
    setErro('')
    try {
      await apiPublic('/api/ifct/encerramento', {
        method: 'POST',
        body: JSON.stringify({ token, hodometroPartida: Number(kmPartidaInicial) }),
      })
      setEtapaInicial('manutencao')
      carregar() // recarrega pra ter encerramento.hodometroPartida
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setSalvandoInicial(false)
    }
  }

  // Confirma a manutencao de 1 escalao (com fallback automatico se vazio)
  async function confirmarManutencao() {
    const texto = manutencaoTexto.trim() || 'A manutenção de 1º escalão foi realizada sem novidades'
    setSalvandoInicial(true)
    setErro('')
    try {
      await apiPublic('/api/ifct/encerramento', {
        method: 'POST',
        body: JSON.stringify({ token, consideracoesVeiculo: texto }),
      })
      setEtapaInicial('concluido')
      carregar()
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setSalvandoInicial(false)
    }
  }

  useEffect(() => { carregar() }, [token])

  // Finalizar
  async function finalizar() {
    if (!confirm('Tem certeza que quer FINALIZAR o ICT? Apos isso, o gestor vai revisar.')) return
    try {
      await apiPublic('/api/ifct/finalizar', {
        method: 'POST',
        body: JSON.stringify({ token }),
      })
      alert('ICT finalizado com sucesso! O gestor foi notificado.')
      carregar()
    } catch (e: any) {
      alert(e.message)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center', fontFamily: 'sans-serif' }}>
        <p>Carregando ICT...</p>
      </div>
    )
  }
  if (erro) {
    return (
      <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
        <div className="alert alert-error">{erro}</div>
        <p>Verifique se o link esta correto ou se ja expirou.</p>
      </div>
    )
  }
  if (!ag) return null

  // FIX (William 2026-09-09 v33): encerramento so eh considerado "feito"
  // quando o motorista confirma o KM de RETORNO (hodometroRetorno).
  // Antes (v31): bastava ter o encerramento salvo (so com partida) pra
  // mostrar "✓ Preenchido" e deixar o botao "FINALIZAR IFCT" habilitado.
  // Isso era bug: o motorista podia finalizar sem ter confirmado o KM final.
  const temPartida = !!ag.encerramento?.hodometroPartida
  const temRetorno = !!ag.encerramento?.hodometroRetorno
  const encerramentoFeito = temPartida && temRetorno
  const encerramentoParcial = temPartida && !temRetorno
  const finalizado = ag.ifctStatus === 'preenchido' || ag.ifctStatus === 'validado'

  // FIX (William 2026-09-09 v31): fluxo de boas-vindas ANTES da home do IFCT.
  // Etapa 1: confirmar KM inicial (com sugestao pre-preenchida).
  // Etapa 2: "A manutencao de 1 escalao foi realizada?" (com fallback automatico).
  // So apos as 2, a home com 3 botoes aparece.
  if (etapaInicial === 'km') {
    return (
      <div style={{ minHeight: '100vh', background: '#f5f5f5', padding: 16, fontFamily: 'sans-serif', maxWidth: 720, margin: '0 auto' }}>
        <div style={{ background: 'white', borderRadius: 8, padding: 24, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <img src="/brasao.jpg" alt="Brasão PMESP" style={{ width: 50, height: 50, objectFit: 'contain', borderRadius: 4 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Confirme o KM inicial</div>
              <div style={{ fontSize: 12, color: '#666' }}>Viatura {ag.viatura?.placa || '—'} • {ag.viatura?.patrimonio || '—'}</div>
            </div>
          </div>

          <p style={{ fontSize: 14, color: '#444' }}>
            Confirme (ou edite) o KM inicial da viatura no momento em que voce esta assumindo.
          </p>

          {sugestaoKm != null && (
            <div style={{ background: '#e3f2fd', padding: 12, borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
              <strong>Último KM registrado nesta viatura:</strong> {sugestaoKm.toLocaleString('pt-BR')} km
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              KM inicial (hodometro) <span style={{ color: '#d32f2f' }}>*</span>
            </label>
            <input
              type="number"
              value={kmPartidaInicial}
              onChange={e => setKmPartidaInicial(e.target.value)}
              placeholder="Ex: 50000"
              style={{ width: '100%', padding: 12, fontSize: 16, border: '1px solid #ccc', borderRadius: 6 }}
              autoFocus
            />
          </div>

          {erro && <div className="alert alert-error" style={{ marginBottom: 12 }}>{erro}</div>}

          <button
            onClick={confirmarKmInicial}
            disabled={salvandoInicial || !kmPartidaInicial}
            style={{
              width: '100%', padding: 14, fontSize: 15, fontWeight: 700,
              background: salvandoInicial || !kmPartidaInicial ? '#ccc' : '#1976d2',
              color: 'white', border: 'none', borderRadius: 6, cursor: salvandoInicial || !kmPartidaInicial ? 'not-allowed' : 'pointer',
            }}
          >
            {salvandoInicial ? 'Salvando...' : 'Confirmar KM inicial'}
          </button>
        </div>
      </div>
    )
  }

  if (etapaInicial === 'manutencao') {
    return (
      <div style={{ minHeight: '100vh', background: '#f5f5f5', padding: 16, fontFamily: 'sans-serif', maxWidth: 720, margin: '0 auto' }}>
        <div style={{ background: 'white', borderRadius: 8, padding: 24, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <img src="/brasao.jpg" alt="Brasão PMESP" style={{ width: 50, height: 50, objectFit: 'contain', borderRadius: 4 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>A manutenção de 1º escalão foi realizada?</div>
              <div style={{ fontSize: 12, color: '#666' }}>Viatura {ag.viatura?.placa || '—'} • KM confirmado: {ag.encerramento?.hodometroPartida?.toLocaleString('pt-BR') || '—'} km</div>
            </div>
          </div>

          <p style={{ fontSize: 14, color: '#444' }}>
            Descreva o que foi feito na manutenção (ou deixe em branco para confirmar que foi realizada sem novidades).
          </p>

          <div style={{ marginBottom: 16 }}>
            <textarea
              value={manutencaoTexto}
              onChange={e => setManutencaoTexto(e.target.value)}
              placeholder="Ex: Trocado oleo do motor, calibrado os pneus, verificada a agua..."
              rows={4}
              style={{ width: '100%', padding: 12, fontSize: 14, border: '1px solid #ccc', borderRadius: 6, fontFamily: 'inherit' }}
              autoFocus
            />
            <small style={{ color: '#666', fontSize: 12 }}>
              Se deixar em branco, sera gravado automaticamente: <em>"A manutenção de 1º escalão foi realizada sem novidades"</em>
            </small>
          </div>

          {erro && <div className="alert alert-error" style={{ marginBottom: 12 }}>{erro}</div>}

          <button
            onClick={confirmarManutencao}
            disabled={salvandoInicial}
            style={{
              width: '100%', padding: 14, fontSize: 15, fontWeight: 700,
              background: salvandoInicial ? '#ccc' : '#2e7d32',
              color: 'white', border: 'none', borderRadius: 6, cursor: salvandoInicial ? 'not-allowed' : 'pointer',
            }}
          >
            {salvandoInicial ? 'Salvando...' : 'Confirmar manutenção'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', padding: 16, fontFamily: 'sans-serif', maxWidth: 720, margin: '0 auto' }}>
      {/* Cabecalho do IFCT (read-only, vem do agendamento) */}
      <div style={{ background: 'white', borderRadius: 8, padding: 16, marginBottom: 12, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', alignAlignItems: 'center', gap: 12, marginBottom: 8 }}>
          <img src="/brasao.jpg" alt="Brasao PM" style={{ width: 50, height: 50, objectFit: 'contain', borderRadius: 4 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>Secretaria da Seguranca Publica</div>
            <div style={{ fontSize: 12, color: '#666' }}>{ag.unidadeRequerente?.sigla || ag.unidadeRequerente?.name || 'Subfrota CPI-7'}</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, color: '#666' }}>
            <div>Partida</div>
            <strong style={{ fontSize: 13 }}>{new Date(ag.retiradaData).toLocaleDateString('pt-BR')} {ag.retiradaHora}</strong>
            <div style={{ marginTop: 4 }}>Retorno</div>
            <strong style={{ fontSize: 13 }}>{new Date(ag.devolucaoData).toLocaleDateString('pt-BR')} {ag.devolucaoHora}</strong>
          </div>
        </div>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={td}>Nº ICT</td>
              <td colSpan={3} style={td}><strong>ICT-2026-{String(ag.id).padStart(3, '0')}</strong></td>
            </tr>
            <tr>
              <td style={td}>PLACA</td>
              <td style={td}><strong>{ag.viatura?.placa || '-'}</strong></td>
              <td style={td}>PATRIMÔNIO</td>
              <td style={td}><strong>{ag.viatura?.patrimonio || '-'}</strong></td>
            </tr>
            <tr>
              <td style={td}>CONDUTOR</td>
              <td colSpan={3} style={td}><strong>{ag.motoristaPosto || ag.postoGraduacao} {ag.motoristaNome || ag.nomeGuerra}</strong></td>
            </tr>
            <tr>
              <td style={td}>DESTINO</td>
              <td colSpan={3} style={td}><strong>{ag.destino}</strong></td>
            </tr>
            <tr>
              <td style={td}>FINALIDADE</td>
              <td colSpan={3} style={td}>{ag.finalidade}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 3 botoes de acao (ENCERRAMENTO, ABASTECIMENTO, RONDA) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginBottom: 12 }}>
        <ActionButton
          cor={encerramentoFeito ? '#2e7d32' : (encerramentoParcial ? '#f57c00' : '#d32f2f')}
          emoji="📋"
          titulo="Encerramento"
          subtitulo={
            encerramentoFeito ? '✓ Preenchido'
              : encerramentoParcial ? 'Parcialmente preenchido'
                : 'Obrigatório após a missão'
          }
          feito={encerramentoFeito}
          onClick={() => setModal('encerramento')}
          disabled={finalizado}
        />
        <ActionButton
          cor="#1976d2"
          emoji="⛽"
          titulo="Abastecimento"
          subtitulo={abastecimentos.length > 0 ? `${abastecimentos.length} registro(s)` : 'Opcional - só se houve'}
          feito={abastecimentos.length > 0}
          onClick={() => setModal('abastecimento')}
          disabled={finalizado}
        />
        <ActionButton
          cor="#7b1fa2"
          emojiImg="/ronda.png"
          titulo="Ronda"
          subtitulo={rondas.length > 0 ? `${rondas.length} registro(s)` : 'Opcional - só se houve'}
          feito={rondas.length > 0}
          onClick={() => setModal('ronda')}
          disabled={finalizado}
        />
      </div>

      {/* Lista de abastecimentos ja feitos */}
      {abastecimentos.length > 0 && (
        <div style={{ background: 'white', borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <h3 style={{ marginTop: 0, fontSize: 14 }}>⛽ Abastecimentos ({abastecimentos.length})</h3>
          {abastecimentos.map((a: any) => (
            <div key={a.id} style={{ borderBottom: '1px solid #eee', padding: '8px 0', fontSize: 12 }}>
              <strong>{a.natureza}</strong>: {a.quantidadeLitros}L @ {a.odometro.toLocaleString('pt-BR')} km
              {a.posto && <span style={{ color: '#666' }}> ({a.posto})</span>}
              {a.fotoComprovante && <span style={{ color: '#2e7d32', marginLeft: 6 }}>📷</span>}
              {a.observacao && <div style={{ color: '#666', fontSize: 11 }}>{a.observacao}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Botao FINALIZAR */}
      {!finalizado && (
        <button
          onClick={finalizar}
          disabled={!encerramentoFeito}
          style={{
            width: '100%', padding: 16, fontSize: 16, fontWeight: 700,
            background: encerramentoFeito ? '#2e7d32' : '#ccc',
            color: 'white', border: 'none', borderRadius: 8, cursor: encerramentoFeito ? 'pointer' : 'not-allowed',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          }}
        >
          {encerramentoFeito
            ? '✓ FINALIZAR ICT'
            : encerramentoParcial
              ? 'Confirme o KM final (retorno) para finalizar'
              : 'Preencha o ENCERRAMENTO primeiro'}
        </button>
      )}

      {finalizado && (
        <div style={{ background: '#e8f5e9', border: '1px solid #4caf50', borderRadius: 8, padding: 16, textAlign: 'center', color: '#2e7d32' }}>
          <strong>✅ ICT {ag.ifctStatus === 'validado' ? 'validado' : 'preenchido'}</strong>
          {ag.ifctStatus === 'preenchido' && <p style={{ margin: '4px 0 0 0', fontSize: 13 }}>Aguardando validacao do gestor.</p>}
          {/* FIX (William 2026-09-08): botao de baixar PDF (Frente/Verso) */}
          <a
            href={ '/api/ifct/pdf?token=' + encodeURIComponent(token || '') }
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block', marginTop: 12, padding: '10px 20px',
              background: '#1976d2', color: 'white', textDecoration: 'none',
              borderRadius: 6, fontWeight: 600, fontSize: 14,
            }}
          >
            📥 Baixar PDF do ICT
          </a>
        </div>
      )}

      {/* Modais */}
      {modal === 'encerramento' && ag && (
        <EncerramentoModal token={token!} ag={ag} onClose={() => setModal(null)} onSaved={carregar} />
      )}
      {modal === 'abastecimento' && (
        <AbastecimentoModal token={token!} onClose={() => setModal(null)} onSaved={carregar} />
      )}
      {modal === 'ronda' && ag?.viatura && (
        <RondaModal token={token!} onClose={() => setModal(null)} onSaved={carregar} />
      )}
    </div>
  )
}

const td: React.CSSProperties = { padding: '4px 6px', border: '1px solid #ddd', fontSize: 12 }

// ============================================================
// ActionButton - botao grande estilo mobile
// ============================================================
function ActionButton({ cor, emoji, emojiImg, titulo, subtitulo, feito, onClick, disabled }: {
  cor: string; emoji?: string; emojiImg?: string; titulo: string; subtitulo: string;
  feito: boolean; onClick: () => void; disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: 14, background: feito ? '#f1f8e9' : 'white',
        border: `2px solid ${feito ? cor : '#ddd'}`,
        borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'left',
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)', opacity: disabled ? 0.5 : 1,
      }}
    >
      {emojiImg
        ? <img src={emojiImg} alt="" style={{ width: 32, height: 32, objectFit: 'contain' }} />
        : <div style={{ fontSize: 28 }}>{emoji}</div>}
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: cor }}>{titulo}</div>
        <div style={{ fontSize: 12, color: '#666' }}>{subtitulo}</div>
      </div>
      <div style={{ fontSize: 20, color: cor }}>{feito ? '✓' : '›'}</div>
    </button>
  )
}

// ============================================================
// SignaturePad - canvas pra capturar assinatura digital
// (toque ou mouse) e exportar como SVG
// ============================================================
function SignaturePad({ onChange }: { onChange: (svg: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const lastRef = useRef<{ x: number; y: number } | null>(null)
  const pathsRef = useRef<Array<Array<{ x: number; y: number }>>>([])
  const [, force] = useState(0)

  function getPos(e: any): { x: number; y: number } {
    const rect = canvasRef.current!.getBoundingClientRect()
    const t = e.touches?.[0] || e
    return { x: t.clientX - rect.left, y: t.clientY - rect.top }
  }

  function start(e: any) {
    e.preventDefault()
    drawingRef.current = true
    lastRef.current = getPos(e)
    pathsRef.current.push([lastRef.current])
    force(x => x + 1)
  }
  function move(e: any) {
    if (!drawingRef.current) return
    e.preventDefault()
    const p = getPos(e)
    pathsRef.current[pathsRef.current.length - 1].push(p)
    lastRef.current = p
    redraw()
  }
  function end() {
    if (!drawingRef.current) return
    drawingRef.current = false
    onChange(exportSvg())
  }
  function redraw() {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const path of pathsRef.current) {
      if (path.length < 2) continue
      ctx.beginPath()
      ctx.moveTo(path[0].x, path[0].y)
      for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y)
      ctx.stroke()
    }
  }
  function exportSvg(): string {
    const w = canvasRef.current?.width || 300
    const h = canvasRef.current?.height || 120
    const d = pathsRef.current.map(p =>
      p.length < 2 ? '' : 'M ' + p.map(pt => `${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' L ')
    ).filter(Boolean).join(' ')
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><path d="${d}" stroke="#000" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  }
  function clear() {
    pathsRef.current = []
    const c = canvasRef.current
    if (c) c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    onChange('')
    force(x => x + 1)
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={300}
        height={120}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
        style={{ width: '100%', height: 120, border: '1px dashed #999', borderRadius: 4, background: '#fafafa', touchAction: 'none' }}
      />
      <button type="button" onClick={clear} style={{ marginTop: 4, padding: '4px 10px', fontSize: 11, background: '#eee', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer' }}>
        🗑️ Limpar
      </button>
    </div>
  )
}

// ============================================================
// EncerramentoModal - preenche "O CONDUTOR PREENCHERA" + assinatura
// ============================================================
function EncerramentoModal({ token, ag, onClose, onSaved }: { token: string; ag: any; onClose: () => void; onSaved: () => void }) {
  // FIX (William 2026-09-07 v2): KM inicial (partida) e KM final (retorno) AMBOS pelo motorista
  // O KM inicial vem pre-preenchido com o ultimo registrado (sugestao) - motorista confirma ou edita
  const enc = ag.encerramento
  const [hodometroPartida, setHodometroPartida] = useState(enc?.hodometroPartida?.toString() || '')
  const [hodometroRetorno, setHodometroRetorno] = useState(enc?.hodometroRetorno?.toString() || '')
  const [sugestaoKm, setSugestaoKm] = useState<number | null>(null)
  const [sugestaoCarregada, setSugestaoCarregada] = useState(false)
  const [defeitos, setDefeitos] = useState(enc?.defeitosVerificados || '')
  const [obs, setObs] = useState(enc?.observacoes || '')
  const [novaApresData, setNovaApresData] = useState(enc?.novaApresentacaoData ? new Date(enc.novaApresentacaoData).toISOString().slice(0, 10) : '')
  const [novaApresHora, setNovaApresHora] = useState(enc?.novaApresentacaoHora || '')
  const [novaApresLocal, setNovaApresLocal] = useState(enc?.novaApresentacaoLocal || '')
  const [consideracoes, setConsideracoes] = useState(enc?.consideracoesVeiculo || '')
  const [assinaturaSvg, setAssinaturaSvg] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [erro, setErro] = useState('')

  // Carrega sugestao do KM inicial (ultima entrega da viatura)
  useEffect(() => {
    if (sugestaoCarregada) return
    apiPublic('/api/ifct/sugestao-km-partida?token=' + encodeURIComponent(token))
      .then((d: any) => {
        setSugestaoCarregada(true)
        if (typeof d.sugestao === 'number') {
          setSugestaoKm(d.sugestao)
          // So preenche se o usuario ainda nao digitou nada
          if (!hodometroPartida) setHodometroPartida(String(d.sugestao))
        }
      })
      .catch(() => setSugestaoCarregada(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Calcula KM rodado em tempo real (preview)
  const kmPartida = parseInt(hodometroPartida, 10)
  const kmRetorno = parseInt(hodometroRetorno, 10)
  const kmRodadoPreview = (!isNaN(kmPartida) && !isNaN(kmRetorno) && kmRetorno >= kmPartida)
    ? kmRetorno - kmPartida
    : null

  async function handleSalvar() {
    setErro('')
    // FIX (William 2026-09-09 v30): a assinatura do condutor NAO eh
    // mais obrigatoria - eh gerada digitalmente pelo sistema (token) no PDF.
    // Mantemos o SignaturePad pra futuro (desenho livre opcional),
    // mas NAO bloqueia o salvamento se vazio.
    if (!hodometroPartida || isNaN(kmPartida) || kmPartida < 0) {
      setErro('Informe o KM de partida (odômetro no momento de pegar a viatura).')
      return
    }
    if (!hodometroRetorno || isNaN(kmRetorno) || kmRetorno < 0) {
      setErro('Informe o KM de retorno (odômetro no momento de devolver a viatura).')
      return
    }
    if (kmRetorno < kmPartida) {
      setErro('KM de retorno (' + kmRetorno + ') eh menor que o de partida (' + kmPartida + ').')
      return
    }
    setSubmitting(true)
    try {
      await apiPublic('/api/ifct/encerramento', {
        method: 'POST',
        body: JSON.stringify({
          token,
          hodometroPartida: kmPartida,
          hodometroRetorno: kmRetorno,
          defeitosVerificados: defeitos || undefined,
          observacoes: obs || undefined,
          novaApresentacaoData: novaApresData ? new Date(novaApresData).getTime() : undefined,
          novaApresentacaoHora: novaApresHora || undefined,
          novaApresentacaoLocal: novaApresLocal || undefined,
          consideracoesVeiculo: consideracoes || undefined,
          assinaturaCondutorSvg: assinaturaSvg,
        }),
      })
      onSaved()
      onClose()
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal titulo="📋 Encerramento do ICT" onClose={onClose}>
      {/* KM de partida (com sugestao) + KM de retorno + preview do KM rodado */}
      <div style={{ background: '#e3f2fd', padding: 12, borderRadius: 4, marginBottom: 12, fontSize: 13 }}>
        <Field label="Hodômetro de PARTIDA (km) - confirme o valor do painel">
          <input
            type="number"
            value={hodometroPartida}
            onChange={e => setHodometroPartida(e.target.value)}
            placeholder="Ex: 50000"
            style={inputStyle}
          />
          {sugestaoKm !== null && (
            <small style={{ color: '#666', display: 'block', marginTop: 4 }}>
              Sugestao da ultima entrega: <strong>{sugestaoKm.toLocaleString('pt-BR')} km</strong> (confirme com o painel)
            </small>
          )}
        </Field>

        <Field label="Hodômetro de RETORNO (km) - valor atual do painel">
          <input
            type="number"
            value={hodometroRetorno}
            onChange={e => setHodometroRetorno(e.target.value)}
            placeholder="Ex: 50150"
            style={inputStyle}
          />
        </Field>

        {kmRodadoPreview !== null && (
          <div style={{
            marginTop: 4, padding: 10, background: kmRodadoPreview > 0 ? '#e8f5e9' : '#fff3e0',
            border: `1px solid ${kmRodadoPreview > 0 ? '#4caf50' : '#ff9800'}`,
            borderRadius: 4, textAlign: 'center',
          }}>
            <div style={{ fontSize: 11, color: '#666' }}>PREVIA DO KM RODADO</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: kmRodadoPreview > 0 ? '#2e7d32' : '#e65100' }}>
              {kmRodadoPreview.toLocaleString('pt-BR')} km
            </div>
          </div>
        )}
      </div>

      <Field label="Defeitos verificados">
        <textarea value={defeitos} onChange={e => setDefeitos(e.target.value)} rows={3} placeholder="Descreva defeitos verificados (ou deixe vazio se nenhum)" style={inputStyle} />
      </Field>

      <Field label="Observações sobre multas, irregularidades e acidentes">
        <textarea value={obs} onChange={e => setObs(e.target.value)} rows={3} placeholder="Descreva ocorrencias" style={inputStyle} />
      </Field>

      <Field label="Nova apresentação (se necessário)">
        <div style={{ display: 'flex', gap: 6 }}>
          <input type="date" value={novaApresData} onChange={e => setNovaApresData(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          <input type="time" value={novaApresHora} onChange={e => setNovaApresHora(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
        </div>
        <input type="text" value={novaApresLocal} onChange={e => setNovaApresLocal(e.target.value)} placeholder="Local" style={{ ...inputStyle, marginTop: 4 }} />
      </Field>

      <Field label="Considerações gerais sobre o veículo / condutor">
        <textarea value={consideracoes} onChange={e => setConsideracoes(e.target.value)} rows={2} placeholder="Observações adicionais" style={inputStyle} />
      </Field>

      {/* FIX (William 2026-09-14 v56): assinatura do condutor REMOVIDA.
          A assinatura do motorista eh 100% digital - gerada pelo sistema
          no PDF (token SHA-256 baseado no cadastro + timestamp), igual ao
          que ja faz pro gestor/expedidor. Nao precisa mais o campo de
          desenho livre no celular. */}

      {erro && <div className="alert alert-error" style={{ marginTop: 8 }}>{erro}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={onClose} style={{ ...btnStyle, background: '#eee' }}>Cancelar</button>
        <button onClick={handleSalvar} disabled={submitting} style={{ ...btnStyle, background: '#1976d2', color: 'white', flex: 1 }}>
          {submitting ? 'Salvando...' : 'Salvar Encerramento'}
        </button>
      </div>
    </Modal>
  )
}

// ============================================================
// AbastecimentoModal - registra um abastecimento
// ============================================================
function AbastecimentoModal({ token, onClose, onSaved }: { token: string; onClose: () => void; onSaved: () => void }) {
  const [dataHora, setDataHora] = useState(new Date().toISOString().slice(0, 16))
  const [natureza, setNatureza] = useState('Gasolina')
  const [quantidade, setQuantidade] = useState('')
  const [odometro, setOdometro] = useState('')
  const [posto, setPosto] = useState('')
  const [observacao, setObservacao] = useState('')
  const [fotoBase64, setFotoBase64] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [erro, setErro] = useState('')

  function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 5 * 1024 * 1024) {
      setErro('Foto muito grande (max 5MB)')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setFotoBase64(reader.result as string)
    reader.onerror = () => setErro('Erro ao ler foto')
    reader.readAsDataURL(f)
  }

  async function handleSalvar() {
    setErro('')
    if (!quantidade || Number(quantidade) <= 0) { setErro('Quantidade (em litros) obrigatoria'); return }
    if (!odometro || Number(odometro) < 0) { setErro('Odômetro obrigatório'); return }
    // FIX (William 2026-09-09 v35): foto do comprovante eh OBRIGATORIA
    if (!fotoBase64) { setErro('Tire a foto do comprovante para salvar'); return }
    setSubmitting(true)
    try {
      await apiPublic('/api/ifct/abastecimento', {
        method: 'POST',
        body: JSON.stringify({
          token,
          dataHora: new Date(dataHora).getTime(),
          natureza,
          quantidadeLitros: Number(quantidade),
          odometro: Number(odometro),
          posto: posto || undefined,
          fotoComprovante: fotoBase64,
          observacao: observacao || undefined,
        }),
      })
      onSaved()
      onClose()
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal titulo="⛽ Registrar Abastecimento" onClose={onClose}>
      <Field label="Data e hora">
        <input type="datetime-local" value={dataHora} onChange={e => setDataHora(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Tipo de combustivel">
        <select value={natureza} onChange={e => setNatureza(e.target.value)} style={inputStyle}>
          <option>Gasolina</option>
          <option>Alcool</option>
          <option>Diesel</option>
          <option>Oleo</option>
        </select>
      </Field>
      <Field label="Quantidade (litros)">
        <input type="number" step="0.01" value={quantidade} onChange={e => setQuantidade(e.target.value)} placeholder="Ex: 45.5" style={inputStyle} />
      </Field>
      <Field label="Odômetro no momento do abastecimento (km)">
        <input type="number" value={odometro} onChange={e => setOdometro(e.target.value)} placeholder="Ex: 50100" style={inputStyle} />
      </Field>
      <Field label="Posto (opcional)">
        <input type="text" value={posto} onChange={e => setPosto(e.target.value)} placeholder="Nome do posto" style={inputStyle} />
      </Field>
      <Field label="Observacao (opcional)">
        <textarea value={observacao} onChange={e => setObservacao(e.target.value)} rows={2} style={inputStyle} />
      </Field>
      {/* FIX (William 2026-09-09 v35): foto do comprovante eh OBRIGATORIA.
          No celular o `capture="environment"` abre a camera traseira direto. */}
      <Field label="Foto do comprovante *">
        <label
          htmlFor="foto-comprovante-input"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '16px 12px', fontSize: 15, fontWeight: 600,
            background: fotoBase64 ? '#e8f5e9' : '#1976d2',
            color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer',
            textAlign: 'center',
          }}
        >
          {fotoBase64 ? '✅ Foto anexada (toque para trocar)' : '📷 Tirar foto do comprovante'}
        </label>
        <input
          id="foto-comprovante-input"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFoto}
          style={{ display: 'none' }}
        />
        {fotoBase64 && (
          <div style={{ marginTop: 8 }}>
            <img src={fotoBase64} alt="comprovante" style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 4, border: '1px solid #ddd' }} />
            <button
              type="button"
              onClick={() => setFotoBase64('')}
              style={{
                display: 'block', width: '100%', marginTop: 6, padding: 8, fontSize: 12,
                background: '#fee', color: '#c62828', border: '1px solid #c62828', borderRadius: 4, cursor: 'pointer',
              }}
            >
              🗑️ Remover foto
            </button>
          </div>
        )}
      </Field>
      {erro && <div className="alert alert-error" style={{ marginTop: 8 }}>{erro}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={onClose} style={{ ...btnStyle, background: '#eee' }}>Cancelar</button>
        <button onClick={handleSalvar} disabled={submitting} style={{ ...btnStyle, background: '#1976d2', color: 'white', flex: 1 }}>
          {submitting ? 'Salvando...' : 'Salvar Abastecimento'}
        </button>
      </div>
    </Modal>
  )
}

// ============================================================
// RondaModal - registra uma ronda via IFCT
// ============================================================
function RondaModal({ token, onClose, onSaved }: { token: string; onClose: () => void; onSaved: () => void }) {
  const [rondadoPor, setRondadoPor] = useState('')
  const [textoLivre, setTextoLivre] = useState('')
  const [posto, setPosto] = useState('')
  const [nomeGuerra, setNomeGuerra] = useState('')
  const [re, setRe] = useState('')
  const [digre, setDigre] = useState('')
  const [unidadePertence, setUnidadePertence] = useState('')
  const [assinaturaSvg, setAssinaturaSvg] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [erro, setErro] = useState('')

  async function handleSalvar() {
    setErro('')
    if (!rondadoPor.trim()) { setErro('Nome de quem fez a ronda é obrigatório'); return }
    if (!textoLivre.trim()) { setErro('Descreva o que foi verificado na ronda'); return }
    setSubmitting(true)
    try {
      await apiPublic('/api/rondas/salvar-por-ifct', {
        method: 'POST',
        body: JSON.stringify({
          token,
          rondadoPor,
          textoLivre,
          posto: posto || undefined,
          nomeGuerra: nomeGuerra || undefined,
          re: re || undefined,
          digre: digre || undefined,
          unidadePertence: unidadePertence || undefined,
          assinaturaSvg: assinaturaSvg || undefined,
        }),
      })
      onSaved()
      onClose()
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal titulo="🚶 Registrar Ronda" onClose={onClose}>
      <Field label="Rondado por (nome completo) *">
        <input type="text" value={rondadoPor} onChange={e => setRondadoPor(e.target.value)} placeholder="Nome do PM que fez a ronda" style={inputStyle} />
      </Field>
      <Field label="Texto livre (o que foi verificado / irregularidade encontrada) *">
        <textarea value={textoLivre} onChange={e => setTextoLivre(e.target.value)} rows={4} placeholder="Descreva a ronda" style={inputStyle} />
      </Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <Field label="Posto">
            <input type="text" value={posto} onChange={e => setPosto(e.target.value)} placeholder="Ex: Cb PM" style={inputStyle} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Nome de Guerra">
            <input type="text" value={nomeGuerra} onChange={e => setNomeGuerra(e.target.value)} placeholder="Ex: SILVA" style={inputStyle} />
          </Field>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <Field label="RE (6 digitos)">
            <input type="text" inputMode="numeric" maxLength={6} value={re} onChange={e => setRe(e.target.value.replace(/\D/g, ''))} placeholder="Ex: 111926" style={inputStyle} />
          </Field>
        </div>
        <div style={{ width: 100 }}>
          <Field label="Digito">
            <input type="text" inputMode="numeric" maxLength={1} value={digre} onChange={e => setDigre(e.target.value.replace(/\D/g, ''))} placeholder="5" style={inputStyle} />
          </Field>
        </div>
      </div>
      <Field label="Unidade que pertence">
        <input type="text" value={unidadePertence} onChange={e => setUnidadePertence(e.target.value)} placeholder="Ex: 1a Cia do 7o BPM/I" style={inputStyle} />
      </Field>
      <Field label="Assinatura do rondante (opcional)">
        <SignaturePad onChange={setAssinaturaSvg} />
      </Field>
      {erro && <div className="alert alert-error" style={{ marginTop: 8 }}>{erro}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={onClose} style={{ ...btnStyle, background: '#eee' }}>Cancelar</button>
        <button onClick={handleSalvar} disabled={submitting} style={{ ...btnStyle, background: '#7b1fa2', color: 'white', flex: 1 }}>
          {submitting ? 'Salvando...' : 'Salvar Ronda'}
        </button>
      </div>
    </Modal>
  )
}

// ============================================================
// Modal - wrapper generico
// ============================================================
function Modal({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex',
      alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: 'white', borderRadius: '12px 12px 0 0', padding: 20,
        width: '100%', maxWidth: 720, maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.2)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{titulo}</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 24, cursor: 'pointer', color: '#999' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children, obrigatorio }: { label: string; children: React.ReactNode; obrigatorio?: boolean }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
        {label}{obrigatorio && <span style={{ color: '#d32f2f' }}> *</span>}
      </label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 14,
  border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box',
  fontFamily: 'inherit',
}
const btnStyle: React.CSSProperties = {
  padding: '10px 16px', fontSize: 14, fontWeight: 600,
  border: 'none', borderRadius: 4, cursor: 'pointer',
}
