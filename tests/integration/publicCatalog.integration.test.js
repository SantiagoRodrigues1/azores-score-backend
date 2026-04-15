const request = require('supertest');
const { MongoClient } = require('mongodb');
const Competition = require('../../models/Competition');
const { createTestContext, clearDatabase, destroyTestContext } = require('./helpers/testContext');
const { createClub } = require('./helpers/factories');

const CHAMPIONSHIP_SOURCES = [
  {
    campeonato: 'azores_score',
    collectionName: 'Sao Roque',
    standingsName: 'Sao Roque',
    playerName: 'Andre Costa',
    staffCollectionName: 'Equipa Tecnica Sao Roque',
    staffName: 'Helder Melo'
  },
  {
    campeonato: 'campeonato_graciosa',
    collectionName: 'GraciosaFC',
    standingsName: 'Graciosa FC',
    playerName: 'Tiago Mota',
    staffCollectionName: 'GraciosaFC_tecnica',
    staffName: 'Luis Rocha'
  },
  {
    campeonato: 'campeonato_horta',
    collectionName: 'FayalSportClub',
    standingsName: 'Fayal',
    playerName: 'Pedro Silveira',
    staffCollectionName: 'FayalSportClub_tecnica',
    staffName: 'Marco Garcia'
  },
  {
    campeonato: 'campeonato_sao_jorge',
    collectionName: 'FCCalheta',
    standingsName: 'FC Calheta',
    playerName: 'Hugo Paiva',
    staffCollectionName: 'FCCalheta_tecnica',
    staffName: 'Joao Bettencourt'
  },
  {
    campeonato: 'campeonato_sao_miguel',
    collectionName: 'ValeFormoso',
    standingsName: 'Vale Formoso',
    playerName: 'Joao Furtado',
    staffCollectionName: 'ValeFormoso_tecnica',
    staffName: 'Rui Faria'
  },
  {
    campeonato: 'campeonato_terceira',
    collectionName: 'SCBarreiro',
    standingsName: 'SC Barreiro',
    playerName: 'Alvaro Dinis',
    staffCollectionName: 'SCBarreiro_tecnica',
    staffName: 'Antonio Martins'
  }
];

async function seedChampionshipTeam(mongoClient, source, { includeStaff = true, includeStandings = true } = {}) {
  const insertResult = await mongoClient.db(source.campeonato).collection(source.collectionName).insertOne({
    id_jogador: `${source.campeonato}-1`,
    nome: source.playerName,
    equipa: source.collectionName,
    numero_camisola: '1',
    posicao_print: 'Guarda-redes',
    temporada: '2025/26'
  });

  if (includeStaff) {
    await mongoClient.db(source.campeonato).collection(source.staffCollectionName).insertOne({
      nome: source.staffName,
      cargo: 'Treinador',
      equipa: source.collectionName
    });
  }

  if (includeStandings) {
    await mongoClient.db(source.campeonato).collection('classificacao_completa').insertOne({
      data_extracao: '2026-04-13T20:00:00.000Z',
      classificacao: [
        {
          posicao: '1',
          equipa: '',
          pontos: source.standingsName,
          jogos: '1',
          vitorias: '1',
          empates: '0',
          derrotas: '0',
          golos: '1',
          diferenca: '1'
        }
      ]
    });
  }

  return String(insertResult.insertedId);
}

describe('public catalog integration', () => {
  let app;
  let mongoClient;

  beforeAll(async () => {
    ({ app } = await createTestContext());
    mongoClient = new MongoClient(process.env.MONGO_URI);
    await mongoClient.connect();
  });

  afterEach(async () => {
    await clearDatabase();

    await Promise.all(
      CHAMPIONSHIP_SOURCES.map((source) =>
        mongoClient.db(source.campeonato).dropDatabase().catch(() => undefined)
      )
    );
  });

  afterAll(async () => {
    if (mongoClient) {
      await mongoClient.close();
    }

    await destroyTestContext();
  });

  it('aggregates teams, players, staff and standings from all championship databases including azores_score', async () => {
    for (const source of CHAMPIONSHIP_SOURCES) {
      await seedChampionshipTeam(mongoClient, source);
    }

    const response = await request(app).get('/api/teams');

    expect(response.status).toBe(200);

    const championships = new Set(response.body.map((team) => team.campeonato));
    expect(Array.from(championships)).toEqual(expect.arrayContaining(CHAMPIONSHIP_SOURCES.map((source) => source.campeonato)));

    CHAMPIONSHIP_SOURCES.forEach((source) => {
      expect(response.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            campeonato: source.campeonato,
            equipa: source.standingsName,
            name: source.standingsName,
            totalPlayers: 1,
            totalStaff: 1,
            players: expect.arrayContaining([
              expect.objectContaining({ nome: source.playerName })
            ]),
            staff: expect.arrayContaining([
              expect.objectContaining({ nome: source.staffName })
            ]),
            classificacao: expect.objectContaining({
              name: source.standingsName
            })
          })
        ])
      );
    });

    expect(
      response.body.filter((team) => team.campeonato === 'azores_score' && team.equipa === 'Sao Roque')
    ).toHaveLength(1);
  });

  it('keeps staff and standings optional with empty-array/null fallbacks', async () => {
    const source = CHAMPIONSHIP_SOURCES.find((entry) => entry.campeonato === 'campeonato_terceira');

    await seedChampionshipTeam(mongoClient, source, {
      includeStaff: false,
      includeStandings: false
    });

    const response = await request(app).get('/api/teams');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          campeonato: 'campeonato_terceira',
          name: 'SC Barreiro',
          totalPlayers: 1,
          totalStaff: 0,
          staff: [],
          classificacao: null
        })
      ])
    );
  });

  it('loads players from the requested championship database instead of only azores_score', async () => {
    const source = CHAMPIONSHIP_SOURCES.find((entry) => entry.campeonato === 'campeonato_sao_jorge');

    const playerId = await seedChampionshipTeam(mongoClient, source);

    const response = await request(app).get('/api/teams/campeonato_sao_jorge/FC%20Calheta/players');

    expect(response.status).toBe(200);
    expect(response.body['Guarda-redes']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nome: source.playerName,
          teamName: 'FC Calheta',
          campeonato: 'campeonato_sao_jorge'
        })
      ])
    );

    const detailsResponse = await request(app).get(`/api/players/${playerId}`);

    expect(detailsResponse.status).toBe(200);
    expect(detailsResponse.body).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          nome: source.playerName,
          teamName: 'FC Calheta',
          campeonato: 'campeonato_sao_jorge'
        })
      })
    );
  });

  it('lists public competitions from the database', async () => {
    const club = await createClub({ name: 'Operário Lagoa' });

    await Competition.create({
      name: 'Campeonato São Miguel',
      season: '2025/2026',
      status: 'active',
      teams: [club._id]
    });

    const response = await request(app).get('/api/competitions');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Campeonato São Miguel',
          season: '2025/2026',
          status: 'active'
        })
      ])
    );
  });
});