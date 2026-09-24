export type CategoryId =
  | 'agua'
  | 'buraco'
  | 'poste'
  | 'lixo'
  | 'semaforo'
  | 'outro'

export type Category = {
  id: CategoryId
  label: string
  emoji: string
  color: string
  /** Órgão distrital responsável pelo conserto */
  orgao: string
  orgaoSigla: string
  /** Telefone para o cidadão acionar direto o serviço */
  fone: string
}

export const CATEGORIES: Record<CategoryId, Category> = {
  agua: {
    id: 'agua',
    label: 'Vazamento de água',
    emoji: '💧',
    color: '#2c7fb8',
    orgao: 'Companhia de Saneamento Ambiental do DF',
    orgaoSigla: 'Caesb',
    fone: '115',
  },
  buraco: {
    id: 'buraco',
    label: 'Buraco na via',
    emoji: '🕳️',
    color: '#c0533a',
    orgao: 'Companhia Urbanizadora da Nova Capital',
    orgaoSigla: 'Novacap',
    fone: '(61) 3403-2300',
  },
  poste: {
    id: 'poste',
    label: 'Poste / luz apagada',
    emoji: '💡',
    color: '#d9a520',
    orgao: 'Neoenergia Brasília',
    orgaoSigla: 'Neoenergia',
    fone: '116',
  },
  lixo: {
    id: 'lixo',
    label: 'Lixo e entulho',
    emoji: '🗑️',
    color: '#4a7a3f',
    orgao: 'Serviço de Limpeza Urbana',
    orgaoSigla: 'SLU',
    fone: '(61) 3213-0153',
  },
  semaforo: {
    id: 'semaforo',
    label: 'Semáforo / sinalização',
    emoji: '🚦',
    color: '#7d4bb3',
    orgao: 'Departamento de Trânsito do DF',
    orgaoSigla: 'Detran-DF',
    fone: '154',
  },
  outro: {
    id: 'outro',
    label: 'Outro problema',
    emoji: '📍',
    color: '#6b6a62',
    orgao: 'Ouvidoria — Participa DF',
    orgaoSigla: 'Participa DF',
    fone: '162',
  },
}

export type Status = 'aberto' | 'andamento' | 'resolvido'

export const STATUS_LABEL: Record<Status, string> = {
  aberto: 'Aberto',
  andamento: 'Em andamento',
  resolvido: 'Resolvido',
}

export type Report = {
  id: string
  category: CategoryId
  title: string
  description: string
  ra: string // Região Administrativa
  address: string
  lat: number
  lng: number
  photo: string
  status: Status
  createdAt: string // ISO
  confirmations: number
  /** Calculado para a sessão atual; não identifica publicamente o autor. */
  isOwner?: boolean
}

export const RA_CENTER: [number, number] = [-15.7942, -47.8822]
