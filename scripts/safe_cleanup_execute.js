const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!uri) {
  console.error('ERROR: MONGO_URI/MONGODB_URI not set');
  process.exit(1);
}

const DB_NAME = 'azores_score';

function toObjectIdSafe(value) {
  try {
    return new ObjectId(String(value));
  } catch {
    return null;
  }
}

(async () => {
  const client = new MongoClient(uri);
  const report = {
    deleted: {
      collectionsDropped: [],
      players: [],
      competitions: [],
      lineups: [],
      notificationsCount: 0,
      socialpostsCount: 0,
      editrequestsCount: 0,
      users: []
    },
    counts: {},
    integrity: {},
    errors: []
  };

  try {
    await client.connect();
    const db = client.db(DB_NAME);

    console.log('=== SAFE CLEANUP START ===');
    console.log('DB:', DB_NAME);

    // STEP 1 — SAFE DELETES
    console.log('\n[STEP 1] SAFE DELETES');

    const collections = await db.listCollections({ name: 'matches_jornada_15' }).toArray();
    if (collections.length > 0) {
      const dropOk = await db.collection('matches_jornada_15').drop();
      if (!dropOk) throw new Error('Failed to drop matches_jornada_15');
      report.deleted.collectionsDropped.push('matches_jornada_15');
      console.log('Dropped collection: matches_jornada_15');
    } else {
      console.log('Collection matches_jornada_15 not found (already absent)');
    }

    const fakePlayerNames = ['ASDASDADASD', 'ASDASDASD'];
    for (const name of fakePlayerNames) {
      const docs = await db.collection('players').find({ $or: [{ name }, { nome: name }] }).toArray();
      if (docs.length > 0) {
        const ids = docs.map((d) => d._id);
        const del = await db.collection('players').deleteMany({ _id: { $in: ids } });
        if (del.deletedCount !== docs.length) throw new Error(`Failed deleting all docs for player ${name}`);
        report.deleted.players.push(...docs.map((d) => ({ id: String(d._id), name: d.name || d.nome || name })));
        console.log(`Deleted player docs for ${name}:`, del.deletedCount);
      } else {
        console.log(`Player not found (skip): ${name}`);
      }
    }

    const compNamesToDelete = [
      'Torneio de Teste',
      'Campeonato de Pico',
      'Campeonato de Terceira',
      'Campeonato de Açores',
      'Campeonato de São Miguel'
    ];

    for (const name of compNamesToDelete) {
      const comps = await db.collection('competitions').find({ name }).toArray();
      if (comps.length === 0) {
        console.log(`Competition not found (skip): ${name}`);
        continue;
      }

      for (const comp of comps) {
        const refCount = await db.collection('matches').countDocuments({ competition: comp._id });
        if (refCount > 0) {
          throw new Error(`ABORT: competition '${name}' is referenced by ${refCount} matches`);
        }

        const del = await db.collection('competitions').deleteOne({ _id: comp._id });
        if (del.deletedCount !== 1) {
          throw new Error(`Failed deleting competition '${name}' (${String(comp._id)})`);
        }
        report.deleted.competitions.push({ id: String(comp._id), name });
        console.log(`Deleted competition: ${name} (${String(comp._id)})`);
      }
    }

    // STEP 2 — ORPHAN LINEUPS
    console.log('\n[STEP 2] ORPHAN LINEUPS (status=draft AND missing match)');

    const draftLineups = await db.collection('lineups').find({ status: 'draft' }).toArray();
    const orphanDraftIds = [];

    for (const lineup of draftLineups) {
      const matchIdObj = toObjectIdSafe(lineup.match);
      let exists = false;
      if (matchIdObj) {
        exists = Boolean(await db.collection('matches').findOne({ _id: matchIdObj }, { projection: { _id: 1 } }));
      }
      if (!exists) {
        orphanDraftIds.push(lineup._id);
      }
    }

    if (orphanDraftIds.length > 0) {
      const orphanDocs = await db.collection('lineups').find({ _id: { $in: orphanDraftIds } }).toArray();
      const del = await db.collection('lineups').deleteMany({ _id: { $in: orphanDraftIds } });
      if (del.deletedCount !== orphanDraftIds.length) {
        throw new Error(`Failed deleting orphan draft lineups. expected=${orphanDraftIds.length} got=${del.deletedCount}`);
      }
      report.deleted.lineups.push(...orphanDocs.map((d) => ({ id: String(d._id), match: String(d.match), status: d.status })));
      console.log('Deleted orphan draft lineups:', del.deletedCount);
    } else {
      console.log('No orphan draft lineups found');
    }

    // STEP 3 — TEST USERS CASCADE DELETE
    console.log('\n[STEP 3] TEST USERS CASCADE DELETE');

    const allUsers = await db.collection('users').find({}, { projection: { _id: 1, email: 1 } }).toArray();
    const re = /^(smoke\.|verify\.|browser\.|stripe\.|audit\.user\.)/i;
    const testUsers = allUsers.filter((u) => typeof u.email === 'string' && re.test(u.email));

    const testUserObjectIds = testUsers.map((u) => u._id);
    const testUserIdStrings = testUsers.map((u) => String(u._id));

    console.log('Matched test users:', testUsers.length);

    if (testUsers.length > 0) {
      const notifDel = await db.collection('notifications').deleteMany({
        $or: [
          { userId: { $in: testUserObjectIds } },
          { userId: { $in: testUserIdStrings } }
        ]
      });
      report.deleted.notificationsCount = notifDel.deletedCount;
      console.log('Deleted notifications:', notifDel.deletedCount);

      const postsDel = await db.collection('socialposts').deleteMany({
        $or: [
          { author: { $in: testUserObjectIds } },
          { author: { $in: testUserIdStrings } }
        ]
      });
      report.deleted.socialpostsCount = postsDel.deletedCount;
      console.log('Deleted socialposts:', postsDel.deletedCount);

      const erDel = await db.collection('editrequests').deleteMany({
        $or: [
          { userId: { $in: testUserObjectIds } },
          { userId: { $in: testUserIdStrings } }
        ]
      });
      report.deleted.editrequestsCount = erDel.deletedCount;
      console.log('Deleted editrequests:', erDel.deletedCount);

      const userDel = await db.collection('users').deleteMany({ _id: { $in: testUserObjectIds } });
      if (userDel.deletedCount !== testUsers.length) {
        throw new Error(`Failed deleting all test users. expected=${testUsers.length} got=${userDel.deletedCount}`);
      }
      report.deleted.users = testUsers.map((u) => ({ id: String(u._id), email: u.email }));
      console.log('Deleted users:', userDel.deletedCount);
    } else {
      console.log('No matching test users found');
    }

    // STEP 4 — VERIFY SYSTEM INTEGRITY
    console.log('\n[STEP 4] VERIFY SYSTEM INTEGRITY');

    const clubs = await db.collection('clubs').find({}, { projection: { _id: 1 } }).toArray();
    const clubIdSet = new Set(clubs.map((c) => String(c._id)));
    const matches = await db.collection('matches').find({}, { projection: { _id: 1, homeTeam: 1, awayTeam: 1, competition: 1 } }).toArray();

    const orphanMatchClubRefs = [];
    for (const m of matches) {
      if (!clubIdSet.has(String(m.homeTeam))) {
        orphanMatchClubRefs.push({ matchId: String(m._id), field: 'homeTeam', value: String(m.homeTeam) });
      }
      if (!clubIdSet.has(String(m.awayTeam))) {
        orphanMatchClubRefs.push({ matchId: String(m._id), field: 'awayTeam', value: String(m.awayTeam) });
      }
    }

    const competitions = await db.collection('competitions').find({}, { projection: { _id: 1 } }).toArray();
    const compIdSet = new Set(competitions.map((c) => String(c._id)));
    const orphanMatchCompRefs = [];
    for (const m of matches) {
      if (!compIdSet.has(String(m.competition))) {
        orphanMatchCompRefs.push({ matchId: String(m._id), competition: String(m.competition) });
      }
    }

    const allLineups = await db.collection('lineups').find({}, { projection: { _id: 1, match: 1, status: 1 } }).toArray();
    const matchIdSet = new Set(matches.map((m) => String(m._id)));
    const orphanLineupsAnyStatus = allLineups.filter((l) => !matchIdSet.has(String(l.match)));

    const remainingUsers = await db.collection('users').find({}, { projection: { _id: 1, email: 1 } }).toArray();
    const remainingTestUsers = remainingUsers.filter((u) => typeof u.email === 'string' && /^(smoke\.|verify\.|browser\.|stripe\.|audit\.user\.)/i.test(u.email));

    report.integrity = {
      orphanMatchClubRefsCount: orphanMatchClubRefs.length,
      orphanMatchCompRefsCount: orphanMatchCompRefs.length,
      orphanLineupsCount: orphanLineupsAnyStatus.length,
      remainingTestUsersCount: remainingTestUsers.length
    };

    const collectionsForCounts = [
      'users',
      'players',
      'competitions',
      'clubs',
      'matches',
      'lineups',
      'notifications',
      'socialposts',
      'editrequests'
    ];

    for (const c of collectionsForCounts) {
      const exists = (await db.listCollections({ name: c }).toArray()).length > 0;
      report.counts[c] = exists ? await db.collection(c).countDocuments() : 0;
    }

    if (orphanMatchClubRefs.length > 0) {
      throw new Error(`Integrity failure: ${orphanMatchClubRefs.length} orphan match->club refs`);
    }
    if (orphanMatchCompRefs.length > 0) {
      throw new Error(`Integrity failure: ${orphanMatchCompRefs.length} orphan match->competition refs`);
    }
    if (orphanLineupsAnyStatus.length > 0) {
      throw new Error(`Integrity failure: ${orphanLineupsAnyStatus.length} lineups still reference missing matches`);
    }

    console.log('\n=== CLEANUP REPORT ===');
    console.log(JSON.stringify(report, null, 2));
    console.log('=== SAFE CLEANUP COMPLETED SUCCESSFULLY ===');
  } catch (err) {
    report.errors.push(err.message || String(err));
    console.error('\n=== CLEANUP FAILED ===');
    console.error(JSON.stringify(report, null, 2));
    console.error('ERROR:', err.message || err);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
})();
