import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { getUser, isAdmin, isGestor } from '../lib/auth'
import { getTotais } from '../lib/api'

// Cores do sistema
const COR_OPERANDO = '#2e7d32'      // verde
const COR_BAIXADA = '#f57c00'        // laranja
const COR_EM_DESCA = '#e53935'       // vermelho
const COR_FUNDO = '#f5f5f5'          // cinza claro

/**
 * Donut Chart (SVG inline) - mostra 2 fatias: operando + baixada (emDescarga EXCLUIDO)
 * Props: op (operando), bai (baixada), label (texto no centro), cor1, cor2
 */
function DonutChart({ op, bai, label, sublabel, cor1, cor2 }: {
  op: number
  bai: number
  label: string
  sublabel?: string
  cor1: string
  cor2: string
}) {
  const total = op + bai
  if (total === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
        Sem dados
      </div>
    )
  }
  const raio = 60
  const circ = 2 * Math.PI * raio
  const opFrac = op / total
  const baiFrac = bai / total
  const opDash = `${opFrac * circ} ${circ}`
  const baiDash = `${baiFrac * circ} ${circ}`
  const baiOffset = -opFrac * circ
  const pctOp = Math.round(opFrac * 100)
  const pctBai = Math.round(baiFrac * 100)

  return (
    <div style={{ textAlign: 'center', padding: '12px' }}>
      <svg width="160" height="160" viewBox="0 0 160 160" style={{ display: 'block', margin: '0 auto' }}>
        {/* fundo cinza (vai ficar coberto pelas fatias) */}
        <circle cx="80" cy="80" r={raio} fill="none" stroke={COR_FUNDO} strokeWidth="24" />
        {/* operando */}
        <circle
          cx="80" cy="80" r={raio}
          fill="none"
          stroke={cor1}
          strokeWidth="24"
          strokeDasharray={opDash}
          transform="rotate(-90 80 80)"
          strokeLinecap="butt"
        />
        {/* baixada */}
        <circle
          cx="80" cy="80" r={raio}
          fill="none"
          stroke={cor2}
          strokeWidth="24"
          strokeDasharray={baiDash}
          strokeDashoffset={baiOffset}
          transform="rotate(-90 80 80)"
          strokeLinecap="butt"
        />
        {/* texto central */}
        <text x="80" y="78" textAnchor="middle" fontSize="14" fontWeight="600" fill="#333">
          {label}
        </text>
        {sublabel && (
          <text x="80" y="96" textAnchor="middle" fontSize="11" fill="#666">
            {sublabel}
          </text>
        )}
      </svg>
      {/* legenda embaixo */}
      <div style={{ marginTop: '8px', fontSize: '13px' }}>
        <div style={{ display: 'inline-block', marginRight: '12px' }}>
          <span style={{ display: 'inline-block', width: '10px', height: '10px', background: cor1, marginRight: '4px', borderRadius: '2px' }}></span>
          Operando: <strong>{op}</strong> ({pctOp}%)
        </div>
        <div style={{ display: 'inline-block' }}>
          <span style={{ display: 'inline-block', width: '10px', height: '10px', background: cor2, marginRight: '4px', borderRadius: '2px' }}></span>
          Baixadas: <strong>{bai}</strong> ({pctBai}%)
        </div>
      </div>
    </div>
  )
}

/**
 * Bar Chart horizontal (SVG inline) - uma barra por OPM
 * Props: data [{label, value, opm}], max, cor
 */
function BarChartHorizontal({ data, max, cor, titulo }: {
  data: { label: string; value: number; opm: string }[]
  max: number
  cor: string
  titulo: string
}) {
  if (!data || data.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
        Sem dados
      </div>
    )
  }
  const barHeight = 28
  const gap = 6
  const labelWidth = 110
  const valueWidth = 50
  const chartWidth = 480
  const barAreaWidth = chartWidth - labelWidth - valueWidth - 10
  const totalHeight = data.length * (barHeight + gap) + 10

  return (
    <div>
      <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', color: '#333' }}>{titulo}</h3>
      <svg width="100%" height={totalHeight} viewBox={`0 0 ${chartWidth} ${totalHeight}`} style={{ display: 'block' }}>
        {data.map((d, i) => {
          const y = i * (barHeight + gap) + 5
          const w = max > 0 ? Math.max((d.value / max) * barAreaWidth, d.value > 0 ? 2 : 0) : 0
          return (
            <g key={d.opm}>
              {/* label da unidade */}
              <text
                x={labelWidth - 6}
                y={y + barHeight / 2 + 4}
                textAnchor="end"
                fontSize="11"
                fill="#333"
              >
                {d.label}
              </text>
              {/* barra */}
              <rect
                x={labelWidth}
                y={y}
                width={w}
                height={barHeight}
                fill={cor}
                rx="2"
              />
              {/* valor numerico depois da barra */}
              <text
                x={labelWidth + w + 4}
                y={y + barHeight / 2 + 4}
                fontSize="11"
                fontWeight="600"
                fill="#333"
              >
                {d.value}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default function DashboardPage() {
  const user = getUser()
  const [dados, setDados] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  if (!user) return <Navigate to="/login" replace />
  // Bloqueia acesso se não for gestor+ (viewer/editor não ve)
  if (!isGestor() && !isAdmin()) {
    return <Navigate to="/" replace />
  }

  useEffect(() => {
    if (!user) return
    getTotais(user.cpf)
      .then((data: any) => setDados(data))
      .catch(e => setErro(e.message))
      .finally(() => setLoading(false))
  }, [user?.cpf])

  if (loading) return <p>Carregando...</p>
  if (erro) return <div className="alert alert-error">{erro}</div>
  if (!dados) return <p>Sem dados.</p>

  const { unidades = [], geral } = dados

  // Dados para graficos de barras (ordenados do maior pro menor)
  const dadosBaixas = unidades
    .map((u: any) => ({ label: u.matrizName, value: u.baixadas, opm: u.matrizCode }))
    .sort((a: any, b: any) => b.value - a.value)
  const dadosOperando = unidades
    .map((u: any) => ({ label: u.matrizName, value: u.operando, opm: u.matrizCode }))
    .sort((a: any, b: any) => b.value - a.value)
  const maxBaixas = Math.max(1, ...dadosBaixas.map((d: any) => d.value))
  const maxOperando = Math.max(1, ...dadosOperando.map((d: any) => d.value))

  return (
    <div>
      <div className="page-header">
        <h1>Mapa Geral de Viaturas</h1>
        <p>
          {isAdmin()
            ? 'Visão geral'
            : 'Visão da sua unidade (agrupada por matriz BPM)'}
        </p>
      </div>

      {geral && (
        <>
          {/* CARDS: Frota Operacional (op + manutenção) */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Total Operacional</div>
              <div className="stat-value">{geral.totalGeral}</div>
              <div className="stat-detail">operando + baixadas</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Operando</div>
              <div className="stat-value" style={{ color: COR_OPERANDO }}>{geral.totalOperando}</div>
              <div className="stat-detail">{geral.totalOperandoMoto} MT / {geral.totalOperandoCarro} CR</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Baixadas</div>
              <div className="stat-value" style={{ color: COR_BAIXADA }}>{geral.totalBaixadas}</div>
              <div className="stat-detail">{geral.totalBaixadasMoto} MT / {geral.totalBaixadasCarro} CR</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">% Baixadas</div>
              <div className="stat-value" style={{ color: COR_BAIXADA }}>{geral.mediaBaixaCarro}%</div>
              <div className="stat-detail">carros / {geral.mediaBaixaMoto}% motos</div>
            </div>
          </div>

          {/* AVISO sobre Em Descarte (vai pra aba separada) */}
          {geral.totalEmDescarga > 0 && (
            <div className="alert" style={{ background: '#fff3e0', borderLeft: '4px solid #ff9800', color: '#5d4037' }}>
              <strong>{geral.totalEmDescarga} viaturas em Processo de Descarga</strong>
            </div>
          )}
        </>
      )}

      {/* GRAFICOS: donuts (MT/CR) + bar charts (baixas/operando por OPM) */}
      {geral && (
        <>
          <div className="card" style={{ marginTop: '20px' }}>
            <h2 style={{ marginTop: 0 }}>Composição da Frota (Operacional)</h2>
            <p style={{ color: '#666', fontSize: '13px', margin: '0 0 16px 0' }}>
              Percentual de viaturas operando vs baixadas, separado por tipo (moto/carro).
              Viaturas em processo de descarga não são consideradas.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div style={{ background: '#fafafa', borderRadius: '8px', padding: '12px' }}>
                <DonutChart
                  op={geral.totalOperandoMoto}
                  bai={geral.totalBaixadasMoto}
                  label={`${geral.totalOperandoMoto + geral.totalBaixadasMoto}`}
                  sublabel="motos"
                  cor1={COR_OPERANDO}
                  cor2={COR_BAIXADA}
                />
              </div>
              <div style={{ background: '#fafafa', borderRadius: '8px', padding: '12px' }}>
                <DonutChart
                  op={geral.totalOperandoCarro}
                  bai={geral.totalBaixadasCarro}
                  label={`${geral.totalOperandoCarro + geral.totalBaixadasCarro}`}
                  sublabel="carros"
                  cor1={COR_OPERANDO}
                  cor2={COR_BAIXADA}
                />
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: '20px' }}>
            <h2 style={{ marginTop: 0 }}>Distribuição por OPM</h2>
            <p style={{ color: '#666', fontSize: '13px', margin: '0 0 16px 0' }}>
              Quantidade de viaturas, separadas por status (operando e baixadas).
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              <div style={{ background: '#fafafa', borderRadius: '8px', padding: '16px' }}>
                <BarChartHorizontal
                  data={dadosBaixas}
                  max={maxBaixas}
                  cor={COR_BAIXADA}
                  titulo="Baixadas por OPM"
                />
              </div>
              <div style={{ background: '#fafafa', borderRadius: '8px', padding: '16px' }}>
                <BarChartHorizontal
                  data={dadosOperando}
                  max={maxOperando}
                  cor={COR_OPERANDO}
                  titulo="Operando por OPM"
                />
              </div>
            </div>
          </div>
        </>
      )}

      {/* TABELA: Mapa de Viaturas (igual a capa do Excel) - William 2026-08-13 */}
      {geral && (
        <div className="card" style={{ marginTop: '20px' }}>
          <h2 style={{ marginTop: 0 }}>Mapa de Viaturas</h2>
          <p style={{ color: '#666', fontSize: '13px', margin: '0 0 12px 0' }}>
            Cálculo em tempo real com base no cadastro.
          </p>
          <table className="table" style={{ fontSize: '14px' }}>
            <thead>
              <tr>
                <th rowSpan={2} style={{ verticalAlign: 'middle', background: '#cfd8dc' }}>OPM</th>
                <th colSpan={3} style={{ textAlign: 'center', background: '#eceff1' }}>TOTAL EXISTENTE</th>
                <th colSpan={2} style={{ textAlign: 'center', background: '#eceff1' }}>OPERANDO</th>
                <th colSpan={2} style={{ textAlign: 'center', background: '#eceff1' }}>BAIXADAS</th>
                <th colSpan={2} style={{ textAlign: 'center', background: '#eceff1' }}>PORCENTAGEM DE BAIXA</th>
              </tr>
              <tr>
                <th style={{ textAlign: 'center', background: '#cfd8dc' }}>MOTOS</th>
                <th style={{ textAlign: 'center', background: '#cfd8dc' }}>CARROS</th>
                <th style={{ textAlign: 'center', background: '#cfd8dc' }}>GERAL</th>
                <th style={{ textAlign: 'center', background: '#cfd8dc' }}>MOTOS</th>
                <th style={{ textAlign: 'center', background: '#cfd8dc' }}>CARROS</th>
                <th style={{ textAlign: 'center', background: '#cfd8dc' }}>MOTOS</th>
                <th style={{ textAlign: 'center', background: '#cfd8dc' }}>CARROS</th>
                <th style={{ textAlign: 'center', background: '#cfd8dc' }}>MOTOS</th>
                <th style={{ textAlign: 'center', background: '#cfd8dc' }}>CARROS</th>
              </tr>
            </thead>
            <tbody>
              {unidades.map((u: any, idx: number) => {
                const bMotoTotal = (u.bOpMoto || 0) + (u.bAdmMoto || 0)
                const bCarroTotal = (u.bOpCarro || 0) + (u.bAdmCarro || 0)
                const totMoto = u.opMoto + bMotoTotal
                const totCarro = u.opCarro + bCarroTotal
                const pctMoto = totMoto > 0 ? Math.round((bMotoTotal / totMoto) * 10000) / 100 : 0
                const pctCarro = totCarro > 0 ? Math.round((bCarroTotal / totCarro) * 10000) / 100 : 0
                return (
                  <tr key={u.matrizId} style={{ background: idx % 2 === 0 ? '#ffffff' : '#f5f5f5' }}>
                    <td><strong>{u.matrizName}</strong></td>
                    <td style={{ textAlign: 'center' }}>{totMoto}</td>
                    <td style={{ textAlign: 'center' }}>{totCarro}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{totMoto + totCarro}</td>
                    <td style={{ textAlign: 'center', color: COR_OPERANDO, fontWeight: 600 }}>{u.opMoto}</td>
                    <td style={{ textAlign: 'center', color: COR_OPERANDO, fontWeight: 600 }}>{u.opCarro}</td>
                    <td style={{ textAlign: 'center', color: COR_BAIXADA, fontWeight: 600 }}>{bMotoTotal}</td>
                    <td style={{ textAlign: 'center', color: COR_BAIXADA, fontWeight: 600 }}>{bCarroTotal}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{pctMoto.toFixed(2)}%</td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{pctCarro.toFixed(2)}%</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: '#cfd8dc', fontWeight: 700 }}>
                <td><strong>TOTAL</strong></td>
                <td style={{ textAlign: 'center' }}>
                  <strong>{(geral.totalOperandoMoto || 0) + (geral.totalBaixadasOpMoto || 0) + (geral.totalBaixadasAdmMoto || 0)}</strong>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <strong>{(geral.totalOperandoCarro || 0) + (geral.totalBaixadasOpCarro || 0) + (geral.totalBaixadasAdmCarro || 0)}</strong>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <strong>
                    {(() => {
                      return (geral.totalOperandoMoto || 0) + (geral.totalBaixadasOpMoto || 0) + (geral.totalBaixadasAdmMoto || 0) +
                             (geral.totalOperandoCarro || 0) + (geral.totalBaixadasOpCarro || 0) + (geral.totalBaixadasAdmCarro || 0)
                    })()}
                  </strong>
                </td>
                <td style={{ textAlign: 'center', color: COR_OPERANDO }}>
                  <strong>{geral.totalOperandoMoto}</strong>
                </td>
                <td style={{ textAlign: 'center', color: COR_OPERANDO }}>
                  <strong>{geral.totalOperandoCarro}</strong>
                </td>
                <td style={{ textAlign: 'center', color: COR_BAIXADA }}>
                  <strong>{(geral.totalBaixadasOpMoto || 0) + (geral.totalBaixadasAdmMoto || 0)}</strong>
                </td>
                <td style={{ textAlign: 'center', color: COR_BAIXADA }}>
                  <strong>{(geral.totalBaixadasOpCarro || 0) + (geral.totalBaixadasAdmCarro || 0)}</strong>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <strong>
                    {(() => {
                      const tot = (geral.totalOperandoMoto || 0) + (geral.totalBaixadasOpMoto || 0) + (geral.totalBaixadasAdmMoto || 0)
                      const bai = (geral.totalBaixadasOpMoto || 0) + (geral.totalBaixadasAdmMoto || 0)
                      return tot > 0 ? (bai / tot * 100).toFixed(2) : '0.00'
                    })()}%
                  </strong>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <strong>
                    {(() => {
                      const tot = (geral.totalOperandoCarro || 0) + (geral.totalBaixadasOpCarro || 0) + (geral.totalBaixadasAdmCarro || 0)
                      const bai = (geral.totalBaixadasOpCarro || 0) + (geral.totalBaixadasAdmCarro || 0)
                      return tot > 0 ? (bai / tot * 100).toFixed(2) : '0.00'
                    })()}%
                  </strong>
                </td>
              </tr>
              <tr style={{ background: '#eceff1' }}>
                <td colSpan={4} style={{ textAlign: 'right' }}><strong>MÉDIA DE BAIXA</strong></td>
                <td colSpan={4}></td>
                <td style={{ textAlign: 'center' }}>
                  <strong>
                    {(() => {
                      const tot = (geral.totalOperandoMoto || 0) + (geral.totalBaixadasOpMoto || 0) + (geral.totalBaixadasAdmMoto || 0)
                      const bai = (geral.totalBaixadasOpMoto || 0) + (geral.totalBaixadasAdmMoto || 0)
                      return tot > 0 ? (bai / tot * 100).toFixed(2) : '0.00'
                    })()}%
                  </strong>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <strong>
                    {(() => {
                      const tot = (geral.totalOperandoCarro || 0) + (geral.totalBaixadasOpCarro || 0) + (geral.totalBaixadasAdmCarro || 0)
                      const bai = (geral.totalBaixadasOpCarro || 0) + (geral.totalBaixadasAdmCarro || 0)
                      return tot > 0 ? (bai / tot * 100).toFixed(2) : '0.00'
                    })()}%
                  </strong>
                </td>
              </tr>
            </tfoot>
          </table>

          {/* CONSOLIDADO: VTRs BAIXADAS (igual a ultima linha da capa do Excel) */}
          <div style={{ marginTop: '16px', background: '#eceff1', borderRadius: '4px', padding: '8px' }}>
            <table className="table" style={{ marginBottom: 0 }}>
              <tbody>
                <tr style={{ background: '#cfd8dc' }}>
                  <td style={{ fontWeight: 600 }}>
                    VTRs BAIXADAS — consolidado das {unidades.length} unidades
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <strong>CARROS</strong>
                  </td>
                  <td style={{ textAlign: 'center', fontSize: '18px', color: COR_BAIXADA, background: '#fff' }}>
                    <strong>{(geral.totalBaixadasOpCarro || 0) + (geral.totalBaixadasAdmCarro || 0)}</strong>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <strong>MOTOS</strong>
                  </td>
                  <td style={{ textAlign: 'center', fontSize: '18px', color: COR_BAIXADA, background: '#fff' }}>
                    <strong>{(geral.totalBaixadasOpMoto || 0) + (geral.totalBaixadasAdmMoto || 0)}</strong>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <strong>TOTAL BAIXA</strong>
                  </td>
                  <td style={{ textAlign: 'center', fontSize: '18px', color: COR_BAIXADA, background: '#fff' }}>
                    <strong>{(geral.totalBaixadasOpCarro || 0) + (geral.totalBaixadasAdmCarro || 0) + (geral.totalBaixadasOpMoto || 0) + (geral.totalBaixadasAdmMoto || 0)}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CONTAINER: Mapa de Viaturas Administrativas (William 2026-08-13)
          Igual a estrutura do Mapa de Viaturas, mas soh pras ADM.
          Todas as ADM cadastradas estao baixadas, mas mantemos a estrutura
          pra refletir mudanca em tempo real. */}
      {geral && geral.totalAdm > 0 && (
        <div className="card" style={{ marginTop: '20px' }}>
          <h2 style={{ marginTop: 0 }}>Mapa de Viaturas Administrativas</h2>
          <p style={{ color: '#666', fontSize: '13px', margin: '0 0 12px 0' }}>
            Cálculo em tempo real com base no cadastro.
          </p>
          <table className="table" style={{ fontSize: '14px' }}>
            <thead>
              <tr>
                <th rowSpan={2} style={{ verticalAlign: 'middle', background: '#cfd8dc' }}>OPM</th>
                <th colSpan={3} style={{ textAlign: 'center', background: '#eceff1' }}>TOTAL EXISTENTE</th>
                <th colSpan={2} style={{ textAlign: 'center', background: '#eceff1' }}>OPERANDO</th>
                <th colSpan={2} style={{ textAlign: 'center', background: '#eceff1' }}>BAIXADAS</th>
                <th colSpan={2} style={{ textAlign: 'center', background: '#eceff1' }}>PORCENTAGEM DE BAIXA</th>
              </tr>
              <tr>
                <th style={{ textAlign: 'center', background: '#cfd8dc' }}>MOTOS</th>
                <th style={{ textAlign: 'center', background: '#cfd8dc' }}>CARROS</th>
                <th style={{ textAlign: 'center', background: '#cfd8dc' }}>GERAL</th>
                <th style={{ textAlign: 'center', background: '#cfd8dc' }}>MOTOS</th>
                <th style={{ textAlign: 'center', background: '#cfd8dc' }}>CARROS</th>
                <th style={{ textAlign: 'center', background: '#cfd8dc' }}>MOTOS</th>
                <th style={{ textAlign: 'center', background: '#cfd8dc' }}>CARROS</th>
                <th style={{ textAlign: 'center', background: '#cfd8dc' }}>MOTOS</th>
                <th style={{ textAlign: 'center', background: '#cfd8dc' }}>CARROS</th>
              </tr>
            </thead>
            <tbody>
              {unidades
                .filter((u: any) => (u.admMotos || 0) + (u.admCarros || 0) > 0)
                .map((u: any, idx: number) => {
                  const totMoto = u.admMotos || 0
                  const totCarro = u.admCarros || 0
                  const opMoto = 0  // ADM no momento todas estao baixadas
                  const opCarro = 0
                  const bMoto = u.bAdmMoto || 0
                  const bCarro = u.bAdmCarro || 0
                  const pctMoto = totMoto > 0 ? Math.round((bMoto / totMoto) * 10000) / 100 : 0
                  const pctCarro = totCarro > 0 ? Math.round((bCarro / totCarro) * 10000) / 100 : 0
                  return (
                    <tr key={u.matrizId} style={{ background: idx % 2 === 0 ? '#ffffff' : '#f5f5f5' }}>
                      <td><strong>{u.matrizName}</strong></td>
                      <td style={{ textAlign: 'center' }}>{totMoto}</td>
                      <td style={{ textAlign: 'center' }}>{totCarro}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{totMoto + totCarro}</td>
                      <td style={{ textAlign: 'center', color: COR_OPERANDO, fontWeight: 600 }}>{opMoto}</td>
                      <td style={{ textAlign: 'center', color: COR_OPERANDO, fontWeight: 600 }}>{opCarro}</td>
                      <td style={{ textAlign: 'center', color: COR_BAIXADA, fontWeight: 600 }}>{bMoto}</td>
                      <td style={{ textAlign: 'center', color: COR_BAIXADA, fontWeight: 600 }}>{bCarro}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{pctMoto.toFixed(2)}%</td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{pctCarro.toFixed(2)}%</td>
                    </tr>
                  )
                })}
            </tbody>
            <tfoot>
              <tr style={{ background: '#cfd8dc', fontWeight: 700 }}>
                <td><strong>TOTAL</strong></td>
                <td style={{ textAlign: 'center' }}><strong>{geral.totalAdmMotos || 0}</strong></td>
                <td style={{ textAlign: 'center' }}><strong>{geral.totalAdmCarros || 0}</strong></td>
                <td style={{ textAlign: 'center' }}><strong>{geral.totalAdm || 0}</strong></td>
                <td style={{ textAlign: 'center', color: COR_OPERANDO }}><strong>0</strong></td>
                <td style={{ textAlign: 'center', color: COR_OPERANDO }}><strong>0</strong></td>
                <td style={{ textAlign: 'center', color: COR_BAIXADA }}>
                  <strong>{geral.totalBaixadasAdmMoto || 0}</strong>
                </td>
                <td style={{ textAlign: 'center', color: COR_BAIXADA }}>
                  <strong>{geral.totalBaixadasAdmCarro || 0}</strong>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <strong>
                    {geral.totalAdmMotos > 0
                      ? (((geral.totalBaixadasAdmMoto || 0) / geral.totalAdmMotos) * 100).toFixed(2)
                      : '0.00'}%
                  </strong>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <strong>
                    {geral.totalAdmCarros > 0
                      ? (((geral.totalBaixadasAdmCarro || 0) / geral.totalAdmCarros) * 100).toFixed(2)
                      : '0.00'}%
                  </strong>
                </td>
              </tr>
            </tfoot>
          </table>

          {/* CONSOLIDADO ADM: VTRs BAIXADAS */}
          <div style={{ marginTop: '16px', background: '#eceff1', borderRadius: '4px', padding: '8px' }}>
            <table className="table" style={{ marginBottom: 0 }}>
              <tbody>
                <tr style={{ background: '#cfd8dc' }}>
                  <td style={{ fontWeight: 600 }}>
                    VTRs ADMINISTRATIVAS BAIXADAS — consolidado das unidades
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <strong>CARROS</strong>
                  </td>
                  <td style={{ textAlign: 'center', fontSize: '18px', color: COR_BAIXADA, background: '#fff' }}>
                    <strong>{geral.totalBaixadasAdmCarro || 0}</strong>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <strong>MOTOS</strong>
                  </td>
                  <td style={{ textAlign: 'center', fontSize: '18px', color: COR_BAIXADA, background: '#fff' }}>
                    <strong>{geral.totalBaixadasAdmMoto || 0}</strong>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <strong>TOTAL BAIXA</strong>
                  </td>
                  <td style={{ textAlign: 'center', fontSize: '18px', color: COR_BAIXADA, background: '#fff' }}>
                    <strong>{geral.totalBaixadasAdm || 0}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
