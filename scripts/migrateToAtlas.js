'use strict';

/**
 * scripts/migrateToAtlas.js
 *
 * Script standalone para migrar todos os dados da base de dados local para o MongoDB Atlas.
 *
 * USO:
 *   node scripts/migrateToAtlas.js
 *
 * Ou via npm (após adicionar ao package.json):
 *   npm run seed:atlas
 *
 * VARIÁVEIS DE AMBIENTE NECESSÁRIAS (no .env ou no ambiente):
 *   MONGO_LOCAL_URI  — URI da base de dados local
 *   MONGO_ATLAS_URI  — URI do MongoDB Atlas
 *
 * NOTAS:
 *   - Pode ser executado em qualquer momento, mesmo em produção.
 *   - Idempotente: se a migração já foi feita, não faz nada.
 *   - Não afeta o servidor que esteja em execução (usa conexões separadas).
 */

// Carrega variáveis de ambiente do ficheiro .env (dois níveis acima deste script)
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { runAtlasSeed } = require('../services/atlasSeeder');

(async () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║        AzoresScore — Migração Local → Atlas          ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  const localUri = process.env.MONGO_LOCAL_URI;
  const atlasUri = process.env.MONGO_ATLAS_URI;

  if (!localUri || !atlasUri) {
    console.error('❌  ERRO: Define MONGO_LOCAL_URI e MONGO_ATLAS_URI no ficheiro .env');
    console.error('');
    console.error('   Exemplo:');
    console.error('   MONGO_LOCAL_URI=mongodb://localhost:27017/azores_score');
    console.error('   MONGO_ATLAS_URI=mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/azores_score');
    process.exit(1);
  }

  console.log(`   Origem : ${maskUri(localUri)}`);
  console.log(`   Destino: ${maskUri(atlasUri)}`);
  console.log('');

  try {
    await runAtlasSeed({ localUri, atlasUri });
    console.log('');
    console.log('✅  Script de migração concluído.');
  } catch (err) {
    // runAtlasSeed nunca deve lançar, mas por precaução:
    console.error('❌  Erro inesperado:', err.message);
    process.exit(1);
  }

  process.exit(0);
})();

// ─── Utilitário de logging seguro ─────────────────────────────────────────────

/**
 * Oculta a password numa URI MongoDB para não expor credenciais em logs.
 * Ex: mongodb+srv://admin:secret@cluster0... → mongodb+srv://admin:****@cluster0...
 *
 * @param {string} uri
 * @returns {string}
 */
function maskUri(uri) {
  try {
    return uri.replace(/:([^:@]+)@/, ':****@');
  } catch {
    return '[URI inválida]';
  }
}
