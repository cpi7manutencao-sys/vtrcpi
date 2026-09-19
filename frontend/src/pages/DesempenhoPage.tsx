import { useEffect, useState, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { getUser } from '../lib/auth'
import { getEvolucaoMensal, listUnits } from '../lib/api'

export default function DesempenhoPage() {
  const user = getUser()
  const [units, setUnits] = useState<any[]>([])
  const [filtroOpm, setFiltroOpm] = useState<string>('')
  const [filtroSubordinada, setFiltroSubordinada] = useState<string>('')
  const [dados, setDados] = useState<{ pontos: any[]; totalGeral: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  if (!user) return <Navigate to="/login" replace />

  // Carrega units uma vez
  useEffect(() => {
    if (!user) return
    listUnits()
      .then(setUnits)
      .catch(e => setErro(e.message))
  }, [user?.cpf])

  // SÓ MATRIZES no filtro (igual ViaturasPage/MapaGeral)
  const matrizes = useMemo(() => {
    return units
      .filter(u => u.code && u.code.length === 9 && u.code.endsWith('0000'))
      .sort((a, b) => a.code.localeCompare(b.code))
  }, [units])

  // Subordinadas (filhas diretas) da unidade selecionada
  const subordinadas = useMemo(() => {
    if (!filtroOpm) return []
    return units
      .filter(u => u.parentUnit === filtroOpm)
      .sort((a, b) => a.code.localeCompare(b.code))
  }, [units, filtroOpm])

  // FIX (William 2026-08-18): escopo (mesma logica do ViaturasPage)
  const escopoInfo = useMemo(() => {
    if (!user) return { lockedUnidade: false, lockedSubordinada: false, unidadeFixa: '', subordinadaFixa: '' }
    if (user.viaturasRole === 'admin') {
      return { lockedUnidade: false, lockedSubordinada: false, unidadeFixa: '', subordinadaFixa: '' }
    }
    if ((user as any).escopo === 'livre') {
      return { lockedUnidade: false, lockedSubordinada: false, unidadeFixa: '', subordinadaFixa: '' }
    }
    const unidadesUser = user.unidadesEditor && user.unidadesEditor.length > 0
      ? user.unidadesEditor
      : (user.unidadesGestor || [])
    if (unidadesUser.length !== 1) {
      return { lockedUnidade: false, lockedSubordinada: false, unidadeFixa: '', subordinadaFixa: '' }
    }
    const unicaUnidade = unidadesUser[0]
    const unit = units.find(u => u._id === unicaUnidade)
    if (!unit) {
      return { lockedUnidade: false, lockedSubordinada: false, unidadeFixa: '', subordinadaFixa: '' }
    }
    if (unit.code === '607000000') {
      return { lockedUnidade: false, lockedSubordinada: false, unidadeFixa: '', subordinadaFixa: '' }
    }
    if (unit.code.endsWith('0000')) {
      return { lockedUnidade: true, lockedSubordinada: false, unidadeFixa: unit._id, subordinadaFixa: '' }
    }
    return { lockedUnidade: true, lockedSubordinada: true, unidadeFixa: unit.parentUnit, subordinadaFixa: unit._id }
  }, [user, units])

  // Aplica escopo travado
  useEffect(() => {
    if (escopoInfo.lockedUnidade && escopoInfo.unidadeFixa) setFiltroOpm(escopoInfo.unidadeFixa)
    if (escopoInfo.lockedSubordinada && escopoInfo.subordinadaFixa) setFiltroSubordinada(escopoInfo.subordinadaFixa)
  }, [escopoInfo.unidadeFixa, escopoInfo.subordinadaFixa, escopoInfo.lockedUnidade, escopoInfo.lockedSubordinada])

  // Carrega evolucao
  useEffect(() => {
    if (!user) return
    setLoading(true)
    setErro('')
    getEvolucaoMensal(user.cpf, filtroOpm || undefined, filtroSubordinada || undefined)
      .then(setDados)
      .catch(e => setErro(e.message))
      .finally(() => setLoading(false))
  }, [user?.cpf, filtroOpm, filtroSubordinada])

  return (
    <div>
      <div className="page-header">
        <h1>📈 Desempenho de Viaturas</h1>
        <p>
          Evolução mensal da frota: viaturas operando vs baixadas.
          Filtros iguais ao Mapa Geral (mesma RLS).
        </p>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={filtroOpm}
          onChange={e => { setFiltroOpm(e.target.value); setFiltroSubordinada('') }}
          disabled={escopoInfo.lockedUnidade}
          style={{
            padding: '6px 10px',
            borderRadius: '4px',
            border: escopoInfo.lockedUnidade ? '2px solid #ff9800' : '1px solid #ccc',
            background: escopoInfo.lockedUnidade ? '#fff3e0' : 'white',
            minWidth: '220px',
            cursor: escopoInfo.lockedUnidade ? 'not-allowed' : 'pointer',
          }}
          title={escopoInfo.lockedUnidade ? '🔒 Unidade travada pelo seu escopo' : 'Filtrar por unidade'}
        >
          <option value="">Todas as unidades</option>
          {matrizes.map(u => (
            <option key={u._id} value={u._id}>
              {u.code} - {u.sigla || u.name}
            </option>
          ))}
        </select>

        {subordinadas.length > 0 && (
          <select
            value={filtroSubordinada}
            onChange={e => setFiltroSubordinada(e.target.value)}
            disabled={escopoInfo.lockedSubordinada}
            style={{
              padding: '6px 10px',
              borderRadius: '4px',
              border: escopoInfo.lockedSubordinada ? '2px solid #ff9800' : '1px solid #ccc',
              background: escopoInfo.lockedSubordinada ? '#fff3e0' : 'white',
              minWidth: '240px',
              cursor: escopoInfo.lockedSubordinada ? 'not-allowed' : 'pointer',
            }}
            title={escopoInfo.lockedSubordinada ? '🔒 Subordinada travada pelo seu escopo' : 'Filtrar por uma subordinada'}
          >
            <option value="">Todas as subordinadas</option>
            {subordinadas.map(u => (
              <option key={u._id} value={u._id}>
                {u.code} - {u.name}
              </option>
            ))}
          </select>
        )}

        {(escopoInfo.lockedUnidade || escopoInfo.lockedSubordinada) && (
          <span style={{
            padding: '4px 10px',
            background: '#fff3e0',
            border: '1px solid #ff9800',
            borderRadius: 12,
            fontSize: 12,
            color: '#e65100',
            fontWeight: 600,
          }}>
            🔒 Escopo restrito
          </span>
        )}

        {dados && (
          <span style={{ marginLeft: 'auto', color: '#666', fontSize: 13 }}>
            <strong>{dados.totalGeral}</strong> viatura{dados.totalGeral !== 1 ? 's' : ''} considerada{dados.totalGeral !== 1 ? 's' : ''} · {dados.pontos.length} meses
          </span>
        )}
      </div>

      {erro && <div className="alert alert-error">{erro}</div>}
      {loading && <p>Carregando...</p>}

      {dados && dados.pontos.length > 0 && (
        <GraficoEvolucao pontos={dados.pontos} />
      )}

      {dados && dados.pontos.length === 0 && !loading && (
        <p style={{ color: '#666' }}>Nenhuma viatura encontrada com esses filtros.</p>
      )}
    </div>
  )
}

/**
 * Grafico SVG inline com 2 linhas (operando + baixada)
 * Performance: SVG puro, sem dependencia externa
 */
function GraficoEvolucao({ pontos }: { pontos: any[] }) {
  // Dimensoes
  const W = 900
  const H = 380
  const margin = { top: 20, right: 20, bottom: 50, left: 50 }
  const chartW = W - margin.left - margin.right
  const chartH = H - margin.top - margin.bottom

  // Limites
  const maxTotal = Math.max(...pontos.map(p => p.total), 1)
  const maxY = Math.ceil(maxTotal / 50) * 50  // arredonda pra multiplo de 50

  // Escala X: distribui pontos uniformemente
  const xStep = pontos.length > 1 ? chartW / (pontos.length - 1) : 0
  function xPos(i: number): number {
    return margin.left + (pontos.length === 1 ? chartW / 2 : i * xStep)
  }
  // Escala Y: 0 embaixo, maxY em cima
  function yPos(v: number): number {
    return margin.top + chartH - (v / maxY) * chartH
  }

  // Gera paths SVG
  function pathFor(values: number[]): string {
    return values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xPos(i)} ${yPos(v)}`).join(' ')
  }

  // Cores
  const COR_OPERANDO = '#2e7d32'   // verde
  const COR_BAIXADA = '#f57c00'    // laranja
  const COR_EIXO = '#999'
  const COR_GRADE = '#eee'

  // Labels do eixo X: pega so alguns (a cada N) pra nao ficar apertado
  const labelSkip = Math.max(1, Math.floor(pontos.length / 12))

  // Tooltip state
  const [hover, setHover] = useState<number | null>(null)

  // Stats
  const totalFinal = pontos[pontos.length - 1]?.total || 0
  const operandoFinal = pontos[pontos.length - 1]?.operando || 0
  const baixadaFinal = pontos[pontos.length - 1]?.baixada || 0
  const pctFinal = pontos[pontos.length - 1]?.pctOperando || 0
  const picoBaixada = Math.max(...pontos.map(p => p.baixada))
  const picoOperando = Math.max(...pontos.map(p => p.operando))

  return (
    <div>
      {/* Cards de stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <Card titulo="Frota total" valor={totalFinal.toString()} cor="#1976d2" />
        <Card titulo="Operando (mês atual)" valor={operandoFinal.toString()} cor={COR_OPERANDO} />
        <Card titulo="Baixada (mês atual)" valor={baixadaFinal.toString()} cor={COR_BAIXADA} />
        <Card titulo="% Operando" valor={`${pctFinal}%`} cor={pctFinal >= 80 ? COR_OPERANDO : pctFinal >= 50 ? '#fbc02d' : '#c62828'} />
        <Card titulo="Pico baixada" valor={picoBaixada.toString()} cor="#e65100" subtitulo="(histórico)" />
        <Card titulo="Pico operando" valor={picoOperando.toString()} cor="#1b5e20" subtitulo="(histórico)" />
      </div>

      {/* Grafico SVG */}
      <div className="card" style={{ padding: 16, overflowX: 'auto' }}>
        <svg width={W} height={H} style={{ display: 'block', minWidth: W }}>
          {/* Grade horizontal (linhas Y) */}
          {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
            const y = margin.top + chartH * p
            const v = Math.round(maxY * (1 - p))
            return (
              <g key={i}>
                <line x1={margin.left} y1={y} x2={W - margin.right} y2={y} stroke={COR_GRADE} strokeDasharray="3 3" />
                <text x={margin.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill={COR_EIXO}>{v}</text>
              </g>
            )
          })}

          {/* Labels X */}
          {pontos.map((p, i) => {
            if (i % labelSkip !== 0 && i !== pontos.length - 1) return null
            return (
              <text
                key={i}
                x={xPos(i)}
                y={H - margin.bottom + 20}
                textAnchor="middle"
                fontSize="11"
                fill={COR_EIXO}
              >{p.label}</text>
            )
          })}

          {/* Linha OPERANDO (verde) */}
          <path
            d={pathFor(pontos.map(p => p.operando))}
            fill="none"
            stroke={COR_OPERANDO}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          {/* Pontos OPERANDO */}
          {pontos.map((p, i) => (
            <circle
              key={'op-' + i}
              cx={xPos(i)}
              cy={yPos(p.operando)}
              r={hover === i ? 5 : 3}
              fill={COR_OPERANDO}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'pointer' }}
            />
          ))}

          {/* Linha BAIXADA (laranja) */}
          <path
            d={pathFor(pontos.map(p => p.baixada))}
            fill="none"
            stroke={COR_BAIXADA}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          {/* Pontos BAIXADA */}
          {pontos.map((p, i) => (
            <circle
              key={'bx-' + i}
              cx={xPos(i)}
              cy={yPos(p.baixada)}
              r={hover === i ? 5 : 3}
              fill={COR_BAIXADA}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'pointer' }}
            />
          ))}

          {/* Linha de hover vertical */}
          {hover !== null && (
            <line
              x1={xPos(hover)}
              y1={margin.top}
              x2={xPos(hover)}
              y2={margin.top + chartH}
              stroke="#666"
              strokeDasharray="4 4"
            />
          )}

          {/* Eixo X */}
          <line x1={margin.left} y1={margin.top + chartH} x2={W - margin.right} y2={margin.top + chartH} stroke={COR_EIXO} />
          {/* Eixo Y */}
          <line x1={margin.left} y1={margin.top} x2={margin.left} y2={margin.top + chartH} stroke={COR_EIXO} />

          {/* Tooltip */}
          {hover !== null && pontos[hover] && (
            <g>
              <rect
                x={xPos(hover) + 8}
                y={margin.top + 4}
                width={170}
                height={90}
                fill="white"
                stroke="#666"
                strokeWidth="1"
                rx="4"
              />
              <text x={xPos(hover) + 16} y={margin.top + 20} fontSize="12" fontWeight="600" fill="#333">
                {pontos[hover].mes}
              </text>
              <text x={xPos(hover) + 16} y={margin.top + 38} fontSize="12" fill={COR_OPERANDO}>
                <tspan fontWeight="600">● </tspan>
                Operando: {pontos[hover].operando}
              </text>
              <text x={xPos(hover) + 16} y={margin.top + 54} fontSize="12" fill={COR_BAIXADA}>
                <tspan fontWeight="600">● </tspan>
                Baixada: {pontos[hover].baixada}
              </text>
              <text x={xPos(hover) + 16} y={margin.top + 70} fontSize="12" fill="#666">
                Total: {pontos[hover].total}
              </text>
              <text x={xPos(hover) + 16} y={margin.top + 86} fontSize="12" fill="#1976d2" fontWeight="600">
                {pontos[hover].pctOperando}% operante
              </text>
            </g>
          )}

          {/* Legenda */}
          <g transform={`translate(${margin.left}, 12)`}>
            <rect x="0" y="0" width="14" height="3" fill={COR_OPERANDO} />
            <text x="20" y="4" fontSize="12" fill="#333">Operando</text>
            <rect x="100" y="0" width="14" height="3" fill={COR_BAIXADA} />
            <text x="120" y="4" fontSize="12" fill="#333">Baixada</text>
          </g>
        </svg>
      </div>

      <p style={{ color: '#666', fontSize: 12, marginTop: 8, fontStyle: 'italic' }}>
        ⚠️ Dados históricos antes de 24/08/2026 são aproximados: o registro detalhado de reativações começou
        com a feature de Histórico de Baixa. A partir de agora, cada mudança de estado é registrada
        individualmente e o gráfico passa a refletir a realidade exata.
      </p>
    </div>
  )
}

function Card({ titulo, valor, cor, subtitulo }: { titulo: string; valor: string; cor: string; subtitulo?: string }) {
  return (
    <div style={{
      flex: '1 1 140px',
      minWidth: 140,
      background: 'white',
      border: `1px solid ${cor}40`,
      borderLeft: `4px solid ${cor}`,
      borderRadius: 6,
      padding: '12px 16px',
    }}>
      <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 }}>{titulo}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: cor, marginTop: 2 }}>{valor}</div>
      {subtitulo && <div style={{ fontSize: 10, color: '#999' }}>{subtitulo}</div>}
    </div>
  )
}
