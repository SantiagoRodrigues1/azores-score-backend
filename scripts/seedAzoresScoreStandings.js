const { loadEnv } = require('../config/env');
const { getClient, closeClient } = require('../config/db');

loadEnv();

const EXTRACTION_TIMESTAMP = '2026-04-14 12:00:00';

const classificacao = [
  { posicao: '1', equipa: 'Santa Clara B', pontos: '44', jogos: '16', vitorias: '14', empates: '2', derrotas: '0', golos: '46-3', diferenca: '43' },
  { posicao: '2', equipa: 'São Roque (Açores)', pontos: '35', jogos: '16', vitorias: '11', empates: '2', derrotas: '3', golos: '28-15', diferenca: '13' },
  { posicao: '3', equipa: 'Operário Lagoa', pontos: '29', jogos: '16', vitorias: '9', empates: '2', derrotas: '5', golos: '29-17', diferenca: '12' },
  { posicao: '4', equipa: 'SC Praiense', pontos: '27', jogos: '16', vitorias: '8', empates: '3', derrotas: '5', golos: '20-19', diferenca: '1' },
  { posicao: '5', equipa: 'Angrense', pontos: '25', jogos: '16', vitorias: '7', empates: '4', derrotas: '5', golos: '19-14', diferenca: '5' },
  { posicao: '6', equipa: 'União Micaelense', pontos: '22', jogos: '16', vitorias: '6', empates: '4', derrotas: '6', golos: '21-16', diferenca: '5' },
  { posicao: '7', equipa: 'Rabo de Peixe', pontos: '14', jogos: '16', vitorias: '4', empates: '2', derrotas: '10', golos: '18-26', diferenca: '-8' },
  { posicao: '8', equipa: 'FC Urzelinense', pontos: '13', jogos: '16', vitorias: '4', empates: '1', derrotas: '11', golos: '13-35', diferenca: '-22' },
  { posicao: '9', equipa: 'CD Lajense', pontos: '12', jogos: '16', vitorias: '4', empates: '0', derrotas: '12', golos: '14-35', diferenca: '-21' },
  { posicao: '10', equipa: 'Flamengos', pontos: '9', jogos: '16', vitorias: '3', empates: '0', derrotas: '13', golos: '17-45', diferenca: '-28' }
];

const melhoresMarcadores = [
  { posicao: '1', jogador: 'Lucas Santos', equipa: 'Operário Lagoa', golos: '12' },
  { posicao: '2', jogador: 'Dário Simão', equipa: 'Angrense', golos: '10' },
  { posicao: '3', jogador: 'Lucas Reis', equipa: 'Santa Clara B', golos: '9' },
  { posicao: '4', jogador: 'Gabriel Okebe', equipa: 'União Micaelense', golos: '8' },
  { posicao: '5', jogador: 'Rúben Pestana', equipa: 'Santa Clara B', golos: '7' }
];

const proximosJogos = [
  {
    jornada: 'Jornada 17',
    jogos: [
      { data_hora: '19/04 - 16:00', casa: 'Santa Clara B', fora: 'Angrense', status: 'scheduled' },
      { data_hora: '19/04 - 16:00', casa: 'Operário Lagoa', fora: 'São Roque (Açores)', status: 'scheduled' },
      { data_hora: '19/04 - 16:00', casa: 'União Micaelense', fora: 'FC Urzelinense', status: 'scheduled' },
      { data_hora: '19/04 - 16:00', casa: 'Flamengos', fora: 'SC Praiense', status: 'scheduled' },
      { data_hora: '19/04 - 16:00', casa: 'CD Lajense', fora: 'Rabo de Peixe', status: 'scheduled' }
    ]
  }
];

const standingsDocument = {
  url: 'manual:screenshot:campeonato-dos-acores:2026-04-14',
  temporada: 'Campeonato dos Açores 2025/26',
  data_extracao: EXTRACTION_TIMESTAMP,
  classificacao,
  melhores_marcadores: melhoresMarcadores,
  proximos_jogos: proximosJogos,
  source: 'manual_screenshot_seed',
  notes: 'Seed manual baseado no screenshot fornecido pelo utilizador em 2026-04-14.'
};

const topScorersDocument = {
  temporada: 'Campeonato dos Açores 2025/26',
  data_extracao: EXTRACTION_TIMESTAMP,
  melhores_marcadores: melhoresMarcadores,
  source: 'manual_screenshot_seed'
};

async function run() {
  const client = await getClient();
  const db = client.db('azores_score');

  await db.collection('classificacao_completa').deleteMany({ source: 'manual_screenshot_seed' });
  await db.collection('classificacao_completa').insertOne(standingsDocument);

  await db.collection('melhores_marcadores').deleteMany({ source: 'manual_screenshot_seed' });
  await db.collection('melhores_marcadores').insertOne(topScorersDocument);

  console.log(JSON.stringify({
    success: true,
    collection: 'azores_score.classificacao_completa',
    rows: classificacao.length,
    scorers: melhoresMarcadores.length,
    upcomingMatches: proximosJogos[0].jogos.length,
    temporada: standingsDocument.temporada
  }, null, 2));
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeClient();
  });