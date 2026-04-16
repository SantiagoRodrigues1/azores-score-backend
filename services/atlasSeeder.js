'use strict';

/**
 * atlasSeeder.js
 *
 * Copia automaticamente todos os dados da base de dados local para o MongoDB Atlas
 * quando o backend arranca em produção pela primeira vez.
 *
 * Comportamento:
 *  - Usa DUAS conexões nativas MongoClient (local + Atlas) — independentes do Mongoose.
 *  - Verifica uma coleção de controlo "_migrations" no Atlas antes de correr.
 *  - Se a migração já foi registada (ou o Atlas já tem dados), não faz nada.
 *  - Copia TODAS as coleções e documentos dinamicamente, preservando os _id originais.
 *  - Processa em batches para suportar coleções grandes sem problemas de memória.
 *  - Tolerante a erros: falhas numa coleção não bloqueiam as restantes.
 *  - Nunca lança exceção — falhas são logadas mas não crasham o servidor.
 */

const { MongoClient } = require('mongodb');
const logger = require('../utils/logger');

// ─── Configuração ────────────────────────────────────────────────────────────

/** Nome da coleção de controlo de migrações no Atlas. */
const MIGRATIONS_COLLECTION = '_migrations';

/** Chave única desta migração. Muda este valor se precisares repetir a migração. */
const MIGRATION_KEY = 'initial_atlas_seed_v1';

/**
 * Limiar de documentos para considerar o Atlas "não-vazio".
 * Se o Atlas tiver mais do que este número de documentos no total,
 * a seed é ignorada mesmo sem registo na coleção de migrações.
 */
const NON_EMPTY_THRESHOLD = 10;

/** Número de documentos por batch durante a cópia. */
const BATCH_SIZE = 500;

// ─── Utilitários internos ─────────────────────────────────────────────────────

/**
 * Extrai o nome da base de dados de uma URI MongoDB.
 * Suporta mongodb:// e mongodb+srv://.
 *
 * @param {string} uri
 * @returns {string|null}
 */
function getDbNameFromUri(uri) {
  try {
    // Substitui o protocolo por http:// para usar a API URL standard do Node.js
    const normalized = uri
      .replace(/^mongodb\+srv:\/\//, 'http://')
      .replace(/^mongodb:\/\//, 'http://');
    const url = new URL(normalized);
    const name = url.pathname.slice(1).split('?')[0];
    return name || null;
  } catch {
    return null;
  }
}

/**
 * Verifica se a migração já foi registada no Atlas.
 *
 * @param {import('mongodb').Db} atlasDb
 * @returns {Promise<boolean>} true se a migração JÁ foi feita
 */
async function isMigrationDone(atlasDb) {
  const record = await atlasDb
    .collection(MIGRATIONS_COLLECTION)
    .findOne({ key: MIGRATION_KEY });
  return record !== null;
}

/**
 * Conta o total de documentos em todas as coleções de uma BD,
 * excluindo a coleção de controlo de migrações.
 *
 * @param {import('mongodb').Db} db
 * @returns {Promise<number>}
 */
async function countTotalDocuments(db) {
  const collections = await db.listCollections().toArray();
  let total = 0;
  for (const { name } of collections) {
    if (name === MIGRATIONS_COLLECTION || name.startsWith('system.')) continue;
    total += await db.collection(name).countDocuments();
  }
  return total;
}

/**
 * Copia uma coleção da BD de origem para a BD de destino em batches.
 * Preserva todos os _id originais.
 *
 * @param {import('mongodb').Collection} sourceCol
 * @param {import('mongodb').Collection} targetCol
 * @param {string} colName  — apenas para logging
 * @returns {Promise<number>} número de documentos inseridos
 */
async function copyCollectionInBatches(sourceCol, targetCol, colName) {
  const cursor = sourceCol.find({});
  let batch = [];
  let totalInserted = 0;

  try {
    for await (const doc of cursor) {
      batch.push(doc);

      if (batch.length >= BATCH_SIZE) {
        await targetCol.insertMany(batch, { ordered: false });
        totalInserted += batch.length;
        logger.info(`[AtlasSeed]   "${colName}" → ${totalInserted} docs inseridos...`);
        batch = [];
      }
    }

    // Último batch
    if (batch.length > 0) {
      await targetCol.insertMany(batch, { ordered: false });
      totalInserted += batch.length;
    }
  } finally {
    await cursor.close();
  }

  return totalInserted;
}

/**
 * Copia todas as coleções da BD de origem para a BD de destino.
 * Ignora coleções de sistema e coleções que já tenham dados no destino.
 *
 * @param {import('mongodb').Db} sourceDb
 * @param {import('mongodb').Db} targetDb
 * @returns {Promise<{ copied: number, skipped: number, errors: Array<{collection: string, error: string}> }>}
 */
async function copyAllCollections(sourceDb, targetDb) {
  const collections = await sourceDb.listCollections().toArray();
  const results = { copied: 0, skipped: 0, errors: [] };

  logger.info(`[AtlasSeed] ${collections.length} coleções encontradas na base de dados local.`);

  for (const { name: colName } of collections) {
    // Ignorar coleção de controlo e coleções de sistema
    if (colName === MIGRATIONS_COLLECTION || colName.startsWith('system.')) {
      results.skipped++;
      continue;
    }

    try {
      const sourceCol = sourceDb.collection(colName);
      const targetCol = targetDb.collection(colName);

      // Verificar se o destino já tem dados (evitar duplicação)
      const existingCount = await targetCol.countDocuments();
      if (existingCount > 0) {
        logger.info(`[AtlasSeed] SKIP "${colName}" — já tem ${existingCount} documentos no Atlas.`);
        results.skipped++;
        continue;
      }

      const sourceCount = await sourceCol.countDocuments();
      if (sourceCount === 0) {
        logger.info(`[AtlasSeed] SKIP "${colName}" — coleção vazia na origem.`);
        results.skipped++;
        continue;
      }

      logger.info(`[AtlasSeed] Copiando "${colName}" (${sourceCount} documentos)...`);
      const inserted = await copyCollectionInBatches(sourceCol, targetCol, colName);
      logger.info(`[AtlasSeed] ✓ "${colName}" — ${inserted} documentos copiados.`);
      results.copied++;

    } catch (err) {
      // BulkWriteError com código 11000 = duplicate key (doc já existe) — não é fatal
      const isDuplicate = err.code === 11000 || err.name === 'MongoBulkWriteError';
      if (isDuplicate) {
        logger.warn(`[AtlasSeed] AVISO em "${colName}": alguns documentos já existiam (duplicate key). A continuar.`);
        results.skipped++;
      } else {
        logger.error(`[AtlasSeed] ERRO ao copiar "${colName}": ${err.message}`);
        results.errors.push({ collection: colName, error: err.message });
      }
    }
  }

  return results;
}

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Executa a migração inicial local → Atlas.
 *
 * Só corre se:
 *  1. As duas variáveis de ambiente estiverem definidas.
 *  2. Os dois URIs forem diferentes (segurança contra auto-cópia).
 *  3. A migração ainda não tiver sido registada no Atlas.
 *  4. O Atlas ainda estiver (praticamente) vazio.
 *
 * Chama esta função no arranque do servidor, APÓS connectDB().
 *
 * @param {object} [options]
 * @param {string} [options.localUri]    — Sobrescreve MONGO_LOCAL_URI do env
 * @param {string} [options.atlasUri]    — Sobrescreve MONGO_ATLAS_URI do env
 * @param {string} [options.localDbName] — Nome da BD local (deteta automaticamente da URI se omitido)
 * @param {string} [options.atlasDbName] — Nome da BD Atlas (deteta automaticamente da URI se omitido)
 */
async function runAtlasSeed(options = {}) {
  const localUri = options.localUri || process.env.MONGO_LOCAL_URI;
  const atlasUri = options.atlasUri || process.env.MONGO_ATLAS_URI;

  // ── Validações de pré-condição ──────────────────────────────────────────────
  if (!localUri) {
    logger.warn('[AtlasSeed] MONGO_LOCAL_URI não está definida. Seed ignorada.');
    return;
  }
  if (!atlasUri) {
    logger.warn('[AtlasSeed] MONGO_ATLAS_URI não está definida. Seed ignorada.');
    return;
  }
  if (localUri === atlasUri) {
    logger.warn('[AtlasSeed] MONGO_LOCAL_URI e MONGO_ATLAS_URI são iguais — seed ignorada para evitar auto-cópia.');
    return;
  }

  let localClient = null;
  let atlasClient = null;

  try {
    // ── Ligar às duas bases de dados ────────────────────────────────────────
    logger.info('[AtlasSeed] A ligar à base de dados local (origem)...');
    localClient = new MongoClient(localUri, {
      serverSelectionTimeoutMS: 10_000,
      connectTimeoutMS: 10_000,
    });
    await localClient.connect();

    logger.info('[AtlasSeed] A ligar ao MongoDB Atlas (destino)...');
    atlasClient = new MongoClient(atlasUri, {
      serverSelectionTimeoutMS: 20_000,
      connectTimeoutMS: 20_000,
    });
    await atlasClient.connect();

    // ── Resolver nomes das BDs ──────────────────────────────────────────────
    const localDbName =
      options.localDbName || getDbNameFromUri(localUri) || 'azores_score';
    const atlasDbName =
      options.atlasDbName || getDbNameFromUri(atlasUri) || 'azores_score';

    logger.info(`[AtlasSeed] Origem: "${localDbName}" | Destino: "${atlasDbName}"`);

    const sourceDb = localClient.db(localDbName);
    const targetDb = atlasClient.db(atlasDbName);

    // ── Verificação 1: migração já registada? ───────────────────────────────
    if (await isMigrationDone(targetDb)) {
      logger.info('[AtlasSeed] Migração inicial já registada. Nada a fazer.');
      return;
    }

    // ── Verificação 2: Atlas já tem dados? ─────────────────────────────────
    const currentDocCount = await countTotalDocuments(targetDb);
    if (currentDocCount > NON_EMPTY_THRESHOLD) {
      logger.info(
        `[AtlasSeed] Atlas já tem ${currentDocCount} documentos (limite: ${NON_EMPTY_THRESHOLD}). ` +
        'A registar migração como concluída e a ignorar seed.'
      );
      await targetDb.collection(MIGRATIONS_COLLECTION).insertOne({
        key: MIGRATION_KEY,
        completedAt: new Date(),
        note: 'Skipped — Atlas already contained data',
        docsFound: currentDocCount,
      });
      return;
    }

    // ── Cópia ───────────────────────────────────────────────────────────────
    logger.info('');
    logger.info('[AtlasSeed] ══════════════════════════════════════════');
    logger.info('[AtlasSeed]  INICIANDO MIGRAÇÃO LOCAL → ATLAS');
    logger.info('[AtlasSeed] ══════════════════════════════════════════');

    const results = await copyAllCollections(sourceDb, targetDb);

    // ── Registar migração concluída ─────────────────────────────────────────
    await targetDb.collection(MIGRATIONS_COLLECTION).insertOne({
      key: MIGRATION_KEY,
      completedAt: new Date(),
      collectionsCopied: results.copied,
      collectionsSkipped: results.skipped,
      errors: results.errors,
    });

    // ── Resumo ──────────────────────────────────────────────────────────────
    logger.info('');
    logger.info('[AtlasSeed] ══════════════════════════════════════════');
    logger.info('[AtlasSeed]  MIGRAÇÃO CONCLUÍDA');
    logger.info(`[AtlasSeed]    Coleções copiadas:  ${results.copied}`);
    logger.info(`[AtlasSeed]    Coleções ignoradas: ${results.skipped}`);
    logger.info(`[AtlasSeed]    Erros:              ${results.errors.length}`);
    if (results.errors.length > 0) {
      logger.warn('[AtlasSeed]  Coleções com erros:');
      results.errors.forEach(({ collection, error }) =>
        logger.warn(`[AtlasSeed]    • ${collection}: ${error}`)
      );
    }
    logger.info('[AtlasSeed] ══════════════════════════════════════════');
    logger.info('');

  } catch (err) {
    // Nunca crashar o servidor por causa da seed
    logger.error(`[AtlasSeed] Erro fatal durante a migração: ${err.message}`);
    logger.error('[AtlasSeed] O servidor continuará a arrancar normalmente.');
  } finally {
    // Fechar as duas conexões mesmo em caso de erro
    if (localClient) {
      await localClient.close().catch((e) =>
        logger.warn('[AtlasSeed] Erro ao fechar conexão local: ' + e.message)
      );
    }
    if (atlasClient) {
      await atlasClient.close().catch((e) =>
        logger.warn('[AtlasSeed] Erro ao fechar conexão Atlas: ' + e.message)
      );
    }
    logger.info('[AtlasSeed] Conexões de migração fechadas.');
  }
}

module.exports = { runAtlasSeed };
