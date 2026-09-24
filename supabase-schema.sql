-- ============================================================
-- ZelaDF — Esquema do banco de dados
-- Cole este SQL inteiro no SQL Editor do Supabase e clique "Run"
-- Dashboard: https://supabase.com → SQL Editor → New query
-- ============================================================

-- 1. Tabela de avisos
CREATE TABLE IF NOT EXISTS reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  ra TEXT NOT NULL,
  address TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  photo_url TEXT DEFAULT '',
  status TEXT DEFAULT 'aberto' CHECK (status IN ('aberto', 'andamento', 'resolvido')),
  confirmations INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabela de votos (1 voto por dispositivo por aviso)
CREATE TABLE IF NOT EXISTS votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(report_id, device_id)
);

-- 3. Row Level Security — leitura e escrita públicas (sem auth por enquanto)
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reports_select" ON reports FOR SELECT USING (true);
CREATE POLICY "reports_insert" ON reports FOR INSERT WITH CHECK (true);
CREATE POLICY "reports_update" ON reports FOR UPDATE USING (true);

ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "votes_select" ON votes FOR SELECT USING (true);
CREATE POLICY "votes_insert" ON votes FOR INSERT WITH CHECK (true);
CREATE POLICY "votes_delete" ON votes FOR DELETE USING (true);

-- 4. Índices para performance
CREATE INDEX IF NOT EXISTS idx_reports_category ON reports(category);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_votes_report_id ON votes(report_id);
CREATE INDEX IF NOT EXISTS idx_votes_device_id ON votes(device_id);

-- ============================================================
-- 5. Dados de exemplo (seed) — os mesmos 8 avisos que o app já tinha
-- ============================================================

INSERT INTO reports (id, category, title, description, ra, address, lat, lng, photo_url, status, confirmations, created_at) VALUES
  ('00000000-0000-0000-0000-000000000001', 'buraco',
   'Cratera na W3 Sul altura da 510',
   'Buraco fundo na faixa da direita, já causou dois pneus furados essa semana. Piora quando chove.',
   'Asa Sul', 'W3 Sul, SQS 510',
   -15.8203, -47.9051,
   'https://images.unsplash.com/photo-1515162305285-0293e4767cc2?w=520&h=340&fit=crop&auto=format',
   'aberto', 27, '2026-08-09T13:20:00Z'),

  ('00000000-0000-0000-0000-000000000002', 'agua',
   'Vazamento constante na calçada',
   'Água escorrendo há mais de uma semana da rede, formando poça e limo na calçada em frente ao bloco C.',
   'Asa Norte', 'SQN 410, Bloco C',
   -15.7583, -47.8797,
   'https://images.unsplash.com/photo-1584967919857-3d80c53e6f5a?w=520&h=340&fit=crop&auto=format',
   'andamento', 14, '2026-08-07T09:05:00Z'),

  ('00000000-0000-0000-0000-000000000003', 'poste',
   'Quadra inteira sem iluminação',
   'Cinco postes apagados na via de acesso. À noite fica perigoso para quem volta do ponto de ônibus.',
   'Ceilândia', 'QNM 18, Ceilândia Sul',
   -15.8241, -48.1096,
   'https://images.unsplash.com/photo-1509395176047-4a66953fd231?w=520&h=340&fit=crop&auto=format',
   'aberto', 41, '2026-08-10T20:41:00Z'),

  ('00000000-0000-0000-0000-000000000004', 'lixo',
   'Descarte irregular de entulho',
   'Restos de obra e móveis velhos jogados no lote vago. Está atraindo mosquito e mau cheiro.',
   'Taguatinga', 'QNL 10, Taguatinga Norte',
   -15.8331, -48.0578,
   'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=520&h=340&fit=crop&auto=format',
   'aberto', 9, '2026-08-08T16:12:00Z'),

  ('00000000-0000-0000-0000-000000000005', 'semaforo',
   'Semáforo piscando no amarelo',
   'Cruzamento movimentado com semáforo em amarelo intermitente desde ontem. Risco alto no horário de pico.',
   'Águas Claras', 'Av. das Araucárias com Rua 25 Sul',
   -15.8345, -48.0243,
   'https://images.unsplash.com/photo-1573511860302-28c524319d2a?w=520&h=340&fit=crop&auto=format',
   'resolvido', 33, '2026-08-05T07:50:00Z'),

  ('00000000-0000-0000-0000-000000000006', 'buraco',
   'Asfalto afundado na entrada do Lago Sul',
   'Depressão grande no asfalto logo após a ponte, carros freiam de repente para desviar.',
   'Lago Sul', 'QI 5, Lago Sul',
   -15.8407, -47.8709,
   'https://images.unsplash.com/photo-1605256585681-455837661b18?w=520&h=340&fit=crop&auto=format',
   'andamento', 18, '2026-08-06T11:30:00Z'),

  ('00000000-0000-0000-0000-000000000007', 'agua',
   'Boca de lobo entupida alagando',
   'Bueiro tampado de folhas e lixo, a rua alaga inteira em qualquer chuva rápida.',
   'Sobradinho', 'Quadra 8, Sobradinho',
   -15.6534, -47.7908,
   'https://images.unsplash.com/photo-1547683905-f686c993aae5?w=520&h=340&fit=crop&auto=format',
   'aberto', 6, '2026-08-10T18:03:00Z'),

  ('00000000-0000-0000-0000-000000000008', 'poste',
   'Poste inclinado sobre a fiação',
   'Poste tombando após temporal, encostando nos fios. Situação de risco, precisa de vistoria urgente.',
   'Guará', 'QE 23, Guará II',
   -15.8253, -47.9709,
   'https://images.unsplash.com/photo-1519864600265-abb23847ef2c?w=520&h=340&fit=crop&auto=format',
   'aberto', 22, '2026-08-11T08:15:00Z');

-- ============================================================
-- IMPORTANTE: Após rodar este SQL, vá em Storage → New Bucket:
--   Nome: report-photos
--   Public: SIM (toggle habilitado)
--
-- Em seguida, adicione a política de upload:
--   Storage → Policies → report-photos → INSERT:
--   Policy name: "Qualquer um pode fazer upload"
--   Target roles: anon, authenticated
--   Policy: true
-- ============================================================
