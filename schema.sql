-- ============================================================
-- Sistema de Viaturas CPI-7 - Schema Postgres (PGlite compat)
-- SEM PL/pgSQL (DO $$ ... $$) - PGlite nao suporta
-- FKs declaradas inline no CREATE TABLE
-- ============================================================

-- ============================================================
-- 1. UNITS
-- ============================================================
CREATE TABLE IF NOT EXISTS units (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  parent_unit BIGINT REFERENCES units(id) ON DELETE SET NULL,
  command_unit BIGINT REFERENCES units(id) ON DELETE SET NULL,
  active BOOLEAN DEFAULT TRUE,
  sigla TEXT
);

CREATE INDEX IF NOT EXISTS idx_units_parent ON units(parent_unit);
CREATE INDEX IF NOT EXISTS idx_units_command ON units(command_unit);
CREATE INDEX IF NOT EXISTS idx_units_active ON units(active);

-- ============================================================
-- 2. USERS (sem FK pra units; sera adicionada depois se necessario)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  google_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  picture TEXT,

  cpf TEXT UNIQUE,
  re TEXT,
  digre TEXT,
  war_name TEXT,
  posto_graduacao TEXT,
  codptgr TEXT,
  opm_code TEXT,
  unit_id BIGINT,
  sexo TEXT,
  data_nascimento TEXT,
  telefone TEXT,

  role TEXT DEFAULT 'user',
  viaturas_role TEXT DEFAULT 'viewer',
  unidades_gestor BIGINT[] DEFAULT '{}',
  unidades_editor BIGINT[] DEFAULT '{}',
  approved BOOLEAN DEFAULT FALSE,
  active BOOLEAN DEFAULT TRUE,
  escopo TEXT DEFAULT 'restrito',
  is_master BOOLEAN DEFAULT FALSE,

  last_login BIGINT,
  login_count INTEGER DEFAULT 0,
  created_at BIGINT NOT NULL,
  promoted_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_users_cpf ON users(cpf);
CREATE INDEX IF NOT EXISTS idx_users_re ON users(re);
CREATE INDEX IF NOT EXISTS idx_users_viaturas_role ON users(viaturas_role);
CREATE INDEX IF NOT EXISTS idx_users_approved ON users(approved);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(active);

-- ============================================================
-- 3. AGENDAMENTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS agendamentos (
  id BIGSERIAL PRIMARY KEY,
  solicitante_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  posto_graduacao TEXT NOT NULL,
  re TEXT NOT NULL,
  nome_guerra TEXT NOT NULL,
  email TEXT NOT NULL,

  unidade_requerente_id BIGINT REFERENCES units(id) ON DELETE SET NULL,
  unidade_requerente_outro TEXT,
  unidade_origem_id BIGINT REFERENCES units(id) ON DELETE SET NULL,
  secao_setor TEXT,

  tipo_viatura_solicitada TEXT NOT NULL,
  tipo_viatura_outro TEXT,

  data_missao BIGINT NOT NULL,
  destino TEXT NOT NULL,
  finalidade TEXT NOT NULL,
  oficial_autorizador TEXT NOT NULL,

  solicitante_motorista BOOLEAN DEFAULT FALSE,
  motorista_re TEXT,
  motorista_posto TEXT,
  motorista_nome TEXT,
  motorista_opm TEXT,
  motorista_opm_code TEXT,
  motorista_cnh TEXT,
  motorista_boletim TEXT,
  motorista_data_prova TEXT,
  motorista_publicacoes TEXT,

  retirada_data BIGINT NOT NULL,
  retirada_hora TEXT NOT NULL,
  devolucao_data BIGINT NOT NULL,
  devolucao_hora TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'pendente',
  aprovado_por_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  aprovado_em BIGINT,
  rejeitado_por_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  rejeitado_em BIGINT,
  motivo_rejeicao TEXT,
  concluido_por_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  concluido_em BIGINT,
  nao_compareceu BOOLEAN DEFAULT FALSE,

  viatura_atribuida_id BIGINT,

  odometro_retirada INTEGER,
  odometro_retirada_em BIGINT,
  odometro_retirada_por_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  odometro_devolucao INTEGER,
  odometro_devolucao_em BIGINT,
  odometro_devolucao_por_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  km_rodados INTEGER,
  odometro_editado BOOLEAN DEFAULT FALSE,

  link_ifct TEXT,
  link_ifct_expira_em BIGINT,
  ifct_status TEXT,
  ifct_data TEXT,
  ifct_validado_por_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ifct_validado_em BIGINT,
  ifct_validado_observacao TEXT,

  criado_em BIGINT NOT NULL,
  atualizado_em BIGINT
);

CREATE INDEX IF NOT EXISTS idx_ag_solicitante ON agendamentos(solicitante_id);
CREATE INDEX IF NOT EXISTS idx_ag_unidade_req ON agendamentos(unidade_requerente_id);
CREATE INDEX IF NOT EXISTS idx_ag_unidade_orig ON agendamentos(unidade_origem_id);
CREATE INDEX IF NOT EXISTS idx_ag_status ON agendamentos(status);
CREATE INDEX IF NOT EXISTS idx_ag_data_missao ON agendamentos(data_missao);
CREATE INDEX IF NOT EXISTS idx_ag_link_ifct ON agendamentos(link_ifct);
CREATE INDEX IF NOT EXISTS idx_ag_ifct_status ON agendamentos(ifct_status);

-- ============================================================
-- 4. VIATURAS
-- ============================================================
CREATE TABLE IF NOT EXISTS viaturas (
  id BIGSERIAL PRIMARY KEY,
  opm_id BIGINT NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
  prefixo TEXT UNIQUE NOT NULL,
  tipo TEXT NOT NULL,
  categoria TEXT NOT NULL,
  marca_modelo TEXT NOT NULL,

  ativo BOOLEAN DEFAULT TRUE,
  data_baixa BIGINT,
  data_reativado_em BIGINT,
  motivo TEXT,
  situacao TEXT,
  observacao TEXT,
  em_descarga BOOLEAN DEFAULT FALSE,

  link_ronda TEXT,

  placa TEXT,
  patrimonio TEXT,
  cad_conv TEXT,
  ano_fab INTEGER,
  valor NUMERIC(12,2),
  nl TEXT,
  conta_patrimonial TEXT,
  local TEXT,

  criado_em BIGINT NOT NULL,
  criado_por_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  atualizado_em BIGINT,
  atualizado_por_id BIGINT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_vtr_opm ON viaturas(opm_id);
CREATE INDEX IF NOT EXISTS idx_vtr_ativo ON viaturas(ativo);
CREATE INDEX IF NOT EXISTS idx_vtr_em_descarga ON viaturas(em_descarga);
CREATE INDEX IF NOT EXISTS idx_vtr_placa ON viaturas(placa);
CREATE INDEX IF NOT EXISTS idx_vtr_patrimonio ON viaturas(patrimonio);

-- FK agendamentos.viatura_atribuida_id -> viaturas.id (deps circular resolvida)
CREATE INDEX IF NOT EXISTS idx_ag_viatura ON agendamentos(viatura_atribuida_id);

-- ============================================================
-- 5. VIATURA_HISTORICO
-- ============================================================
CREATE TABLE IF NOT EXISTS viatura_historico (
  id BIGSERIAL PRIMARY KEY,
  viatura_id BIGINT NOT NULL REFERENCES viaturas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  data_hora BIGINT NOT NULL,
  motivo TEXT,
  situacao TEXT,
  km INTEGER,
  observacao TEXT,
  registrado_por_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_hist_viatura ON viatura_historico(viatura_id, data_hora);

-- ============================================================
-- 6. IFCT
-- ============================================================
CREATE TABLE IF NOT EXISTS ifct (
  id BIGSERIAL PRIMARY KEY,
  agendamento_id BIGINT NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
  link_ifct TEXT UNIQUE NOT NULL,
  link_ifct_expira_em BIGINT NOT NULL,
  ifct_status TEXT NOT NULL DEFAULT 'pendente',
  hodometro_partida INTEGER,
  hodometro_retorno INTEGER,
  hodometro_diferenca INTEGER,
  abastecimento TEXT,
  defeitos_verificados TEXT,
  observacoes_multas TEXT,
  nova_apresentacao BOOLEAN DEFAULT FALSE,
  nova_apresentacao_detalhes TEXT,
  consideracoes_gerais TEXT,
  assinatura_condutor_svg TEXT,
  preenchido_em BIGINT,
  ip_origem TEXT,
  user_agent_origem TEXT,
  validado_por_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  validado_em BIGINT,
  validado_observacao TEXT,
  criado_em BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ifct_agendamento ON ifct(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_ifct_status ON ifct(ifct_status);

-- ============================================================
-- 7. RONDAS
-- ============================================================
CREATE TABLE IF NOT EXISTS rondas (
  id BIGSERIAL PRIMARY KEY,
  viatura_id BIGINT NOT NULL REFERENCES viaturas(id) ON DELETE CASCADE,
  link_ronda TEXT NOT NULL,
  rondado_por TEXT NOT NULL,
  texto_livre TEXT,
  posto TEXT,
  nome_guerra TEXT,
  unidade_pertence TEXT,
  assinatura_svg TEXT,
  preenchido_em BIGINT NOT NULL,
  ip_origem TEXT,
  user_agent_origem TEXT
);

CREATE INDEX IF NOT EXISTS idx_ronda_viatura ON rondas(viatura_id, preenchido_em);

-- ============================================================
-- 8. AUDIT_LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  cpf TEXT,
  action TEXT NOT NULL,
  resource TEXT,
  resource_id TEXT,
  details TEXT,
  ip_origem TEXT,
  user_agent TEXT,
  data_hora BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_data_hora ON audit_log(data_hora);

-- ============================================================
-- FIM
-- ============================================================
