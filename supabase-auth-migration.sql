-- ============================================================
-- ZelaDF — Migração: Autenticação de Usuários
-- Cole este SQL no SQL Editor do Supabase e clique "Run"
-- ============================================================

-- 1. Adicionar campos de autor à tabela reports
ALTER TABLE reports ADD COLUMN IF NOT EXISTS author_id UUID;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS author_name TEXT DEFAULT 'Cidadão anônimo';

-- 2. Migrar tabela votes: adicionar user_id (manter device_id como fallback)
ALTER TABLE votes ADD COLUMN IF NOT EXISTS user_id UUID;

-- 3. Índice para buscar votos por usuário
CREATE INDEX IF NOT EXISTS idx_votes_user_id ON votes(user_id);

-- 4. Constraint de unicidade por usuário (1 voto por conta por aviso)
-- A constraint UNIQUE(report_id, device_id) já existe para anônimos
CREATE UNIQUE INDEX IF NOT EXISTS idx_votes_user_report
  ON votes(report_id, user_id) WHERE user_id IS NOT NULL;

-- 5. Atualizar políticas RLS para reports (permitir update do author)
-- As políticas existentes já permitem update público, não precisa alterar.
