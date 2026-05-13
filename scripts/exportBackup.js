'use strict';

/**
 * scripts/exportBackup.js
 *
 * Exporta TODOS os dados da base de dados LOCAL para um ficheiro JSON.
 *
 * USO:
 *   node scripts/exportBackup.js
 *   npm run db:export
 *
 * VARIÁVEIS DE AMBIENTE (.env):
 *   MONGO_LOCAL_URI  — URI da BD local (obrigatório)
 *                      ex: mongodb://localhost:27017/AzoresScorepap
 *
 * OUTPUT:
 *   backup/backup-YYYY-MM-DD_HH-MM-SS.json
 *
 * ESTRUTURA DO FICHEIRO:
 *   {
 *     metadata: { exportedAt, dbName, totalDocuments, totalCollections, collections: [] },
 *     data:     { <colecao>: [ ...documentos ] }
 *   }
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { MongoClient } = require('mongodb');
const fs   = require('fs');
const path = require('path');

// ─── Configuração ─────────────────────────────────────────────────────────────

const BATCH_SIZE        = 500;
const BACKUP_DIR        = path.join(__dirname, '../backup');
const SKIP_COLLECTIONS  = new Set(['system.indexes', 'system.users', 'system.version']);

// ─── Utilitários ──────────────────────────────────────────────────────────────

/** Formata uma data para o nome do ficheiro: 2026-05-13_14-30-00 */
function formatDateForFilename(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + '_' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('-');
}

/** Mascara a password numa URI MongoDB para logs seguros. */
function maskUri(uri) {
  try {
    return uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
  } catch {
    return '(URI inválida)';
  }
}

/** Extrai o nome da BD de uma URI MongoDB. */
function getDbNameFromUri(uri) {
  try {
    const normalized = uri
      .replace(/^mongodb\+srv:\/\//, 'http://')
      .replace(/^mongodb:\/\//, 'http://');
    const url  = new URL(normalized);
    const name = url.pathname.slice(1).split('?')[0];
    return name || 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Loga uma linha formatada com timestamp. */
function log(level, msg) {
  const ts    = new Date().toISOString();
  const icons = { INFO: 'ℹ', OK: '✅', WARN: '⚠', ERR: '❌', DATA: '📦' };
  const icon  = icons[level] ?? '•';
  console.log(`[${ts}] ${icon}  ${msg}`);
}

/** Lê todos os documentos de uma coleção em batches, devolvendo um array. */
async function readCollectionInBatches(collection, colName) {
  const cursor  = collection.find({});
  const results = [];
  let   batch   = [];

  for await (const doc of cursor) {
    // Converte _id para string para que seja serializável independentemente do tipo
    batch.push(doc);
    if (batch.length >= BATCH_SIZE) {
      results.push(...batch);
      log('DATA', `  "${colName}" — ${results.length} docs lidos...`);
      batch = [];
    }
  }
  if (batch.length > 0) results.push(...batch);

  return results;
}

// ─── Script principal ─────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║         AzoresScore — Exportação de Base de Dados        ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  // ── 1. Validação das variáveis de ambiente ────────────────────────────────
  const localUri = process.env.MONGO_LOCAL_URI;

  if (!localUri) {
    log('ERR', 'MONGO_LOCAL_URI não está definida no ficheiro .env');
    log('ERR', 'Exemplo: MONGO_LOCAL_URI=mongodb://localhost:27017/AzoresScorepap');
    process.exit(1);
  }

  log('INFO', `Origem : ${maskUri(localUri)}`);
  const dbName = getDbNameFromUri(localUri);
  log('INFO', `Base de dados: ${dbName}`);
  console.log('');

  // ── 2. Criar pasta backup/ se não existir ─────────────────────────────────
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    log('OK', `Pasta criada: backup/`);
  }

  // ── 3. Nome do ficheiro de saída ──────────────────────────────────────────
  const now      = new Date();
  const filename = `backup-${formatDateForFilename(now)}.json`;
  const outPath  = path.join(BACKUP_DIR, filename);

  log('INFO', `Ficheiro de saída: backup/${filename}`);
  console.log('');

  // ── 4. Ligação ao MongoDB ─────────────────────────────────────────────────
  let client;
  try {
    log('INFO', 'A ligar à base de dados local...');
    client = new MongoClient(localUri, {
      serverSelectionTimeoutMS: 10_000,
      connectTimeoutMS: 10_000,
    });
    await client.connect();
    log('OK', 'Ligação estabelecida.');
  } catch (err) {
    log('ERR', `Não foi possível ligar: ${err.message}`);
    log('ERR', 'Verifique se o MongoDB está em execução e se MONGO_LOCAL_URI está correto.');
    process.exit(1);
  }

  const db = client.db(dbName);

  try {
    // ── 5. Descobrir todas as coleções ────────────────────────────────────
    const collectionInfos = await db.listCollections().toArray();
    const collectionNames = collectionInfos
      .map((c) => c.name)
      .filter((n) => !SKIP_COLLECTIONS.has(n) && !n.startsWith('system.'));

    log('INFO', `Coleções encontradas: ${collectionNames.length}`);
    console.log('');

    // ── 6. Exportar cada coleção ──────────────────────────────────────────
    const exportData      = {};
    const collectionStats = [];
    let   totalDocuments  = 0;
    let   collectionsOk   = 0;
    let   collectionsErr  = 0;
    const startTime       = Date.now();

    for (const colName of collectionNames) {
      log('INFO', `Exportando "${colName}"...`);
      try {
        const docs = await readCollectionInBatches(db.collection(colName), colName);
        exportData[colName] = docs;
        totalDocuments     += docs.length;
        collectionsOk++;
        collectionStats.push({ name: colName, count: docs.length, status: 'OK' });
        log('OK', `  "${colName}" — ${docs.length} documentos exportados.`);
      } catch (err) {
        collectionsErr++;
        collectionStats.push({ name: colName, count: 0, status: 'ERRO', error: err.message });
        log('ERR', `  "${colName}" — Erro ao exportar: ${err.message}`);
        exportData[colName] = []; // inclui a coleção vazia no JSON para indicar que existia
      }
    }

    const elapsedMs = Date.now() - startTime;

    // ── 7. Construir o objecto final ──────────────────────────────────────
    const backup = {
      metadata: {
        exportedAt:        now.toISOString(),
        exportDurationMs:  elapsedMs,
        dbName,
        sourceUri:         maskUri(localUri),
        totalCollections:  collectionNames.length,
        collectionsOk,
        collectionsErr,
        totalDocuments,
        collections:       collectionStats,
      },
      data: exportData,
    };

    // ── 8. Escrever o ficheiro JSON ────────────────────────────────────────
    console.log('');
    log('INFO', 'A escrever o ficheiro de backup...');
    const jsonStr = JSON.stringify(backup, (_key, value) => {
      // Converte Buffer / BinData para string base64 para serialização segura
      if (value && value.type === 'Buffer' && Array.isArray(value.data)) {
        return Buffer.from(value.data).toString('base64');
      }
      return value;
    }, 2);

    fs.writeFileSync(outPath, jsonStr, 'utf8');
    const fileSizeMb = (fs.statSync(outPath).size / 1_048_576).toFixed(2);

    // ── 9. Resumo final ───────────────────────────────────────────────────
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║                     RESUMO DA EXPORTAÇÃO                 ║');
    console.log('╠══════════════════════════════════════════════════════════╣');
    console.log(`║  Ficheiro : backup/${filename.padEnd(36)}║`);
    console.log(`║  Tamanho  : ${String(fileSizeMb + ' MB').padEnd(43)}║`);
    console.log(`║  Coleções : ${String(collectionsOk + ' OK  /  ' + collectionsErr + ' Erros').padEnd(43)}║`);
    console.log(`║  Docs     : ${String(totalDocuments).padEnd(43)}║`);
    console.log(`║  Duração  : ${String(elapsedMs + ' ms').padEnd(43)}║`);
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('');

    if (collectionsErr > 0) {
      log('WARN', `${collectionsErr} coleção(ões) com erros. Verifique os logs acima.`);
    } else {
      log('OK', 'Exportação concluída com sucesso!');
    }

    console.log('');
    log('INFO', `Para importar no Render: npm run db:import`);
    log('INFO', `Ou com ficheiro específico: node scripts/importBackup.js backup/${filename}`);
    console.log('');

  } finally {
    await client.close();
  }
}

main().catch((err) => {
  log('ERR', `Erro inesperado: ${err.message}`);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
