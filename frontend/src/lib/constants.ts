// Constantes do Sistema de Viaturas CPI-7
// Transcricao do Forms atual

// Select "Unidade REQUERENTE" (10 unidades do CPI-7, mais "Outro")
// O PM escolhe PRA QUAL unidade ele quer a viatura.
// Pode ser a dele (40BPMI) ou outra (CPI-7). Gestor da unidade REQUERENTE que ve.
export const UNIDADES_REQUERENTES = [
  { value: "607000000", label: "CPI-7 (Comando de Policiamento do Interior 7)" },
  { value: "607070000", label: "7º BPM/I" },
  { value: "607120000", label: "12º BPM/I" },
  { value: "607140000", label: "14º BAEP" },
  { value: "607220000", label: "22º BPM/I" },
  { value: "607400000", label: "40º BPM/I" },
  { value: "607500000", label: "50º BPM/I" },
  { value: "607530000", label: "53º BPM/I" },
  { value: "607540000", label: "54º BPM/I" },
  { value: "607550000", label: "55º BPM/I" },
  { value: "OUTRO", label: "Outro (especificar)" },
];

// Select "Seção/Setor" (dentro da unidade requerente) - texto livre
// Mantido do Forms original. PM digita "P-3", "Administrativo", etc.
export const SELECT_SECOES_SETORES = [
  { value: "P-1", label: "P-1 (Pessoal)" },
  { value: "P-2", label: "P-2 (Inteligencia)" },
  { value: "P-3", label: "P-3 (Operações)" },
  { value: "P-4", label: "P-4 (Logistica)" },
  { value: "P-5", label: "P-5 (Comunicação Social)" },
  { value: "PJMD", label: "PJMD (Justica e Disciplina)" },
  { value: "COPOM", label: "COPOM" },
  { value: "BANDA", label: "Banda Musical" },
  { value: "GUARDA", label: "Guarda do Quartel" },
  { value: "ESCOLA", label: "Escola de Formacao" },
  { value: "RESERVA", label: "Reserva de Armas" },
  { value: "OUTRO", label: "Outro" },
];

// Select "Tipo de Viatura" (igual Forms)
export const SELECT_TIPOS_VIATURA = [
  { value: "ONIBUS_7_2_CARACT", label: "Ônibus 7-2 Caracterizado" },
  { value: "ONIBUS_7_120_DESCARACT", label: "Ônibus 7-120 Descaracterizado (Transp. Seguro)" },
  { value: "MICRO_ONIBUS", label: "Micro-Ônibus" },
  { value: "FURGAO", label: "Furgão" },
  { value: "CAMINHAO_GUINCHO", label: "Caminhão Guincho" },
  { value: "CAMINHAO_BAU", label: "Caminhão Baú" },
  { value: "GM_TRAILBLAZER", label: "GM/Trailblazer" },
  { value: "CAMINHONETE", label: "Caminhonete" },
  { value: "AMBULANCIA", label: "Ambulância" },
  { value: "OUTRO", label: "Outro" },
];

// Posto/Graduação (do SOAP, mas visual)
export const POSTO_GRADUACAO = [
  "Cel PM", "Ten Cel PM", "Maj PM", "Cap PM",
  "1o Ten PM", "2o Ten PM", "Asp Of PM",
  "Subten PM", "1o Sgt PM", "2o Sgt PM", "3o Sgt PM",
  "Cb PM", "Sd PM", "Al Sd PM",
];

// Mapeamento de role pra label amigavel
export const ROLE_LABELS: Record<string, string> = {
  viewer: "Usuário",
  editor: "Editor",
  gestor: "Gestor",
  admin: "Administrador",
};

// Status de agendamento
export const STATUS_AGENDAMENTO: Record<string, { label: string; cor: string }> = {
  pendente: { label: "Pendente", cor: "orange" },
  aprovado: { label: "Aprovado", cor: "green" },
  rejeitado: { label: "Rejeitado", cor: "red" },
  concluido: { label: "Concluído", cor: "gray" },
  cancelado: { label: "Cancelado", cor: "gray" },
};
