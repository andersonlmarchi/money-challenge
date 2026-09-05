import { ProcessWagerTransactionUseCase } from '../../../src/application/use-cases/process-wager-transaction.use-case.js';
import { MikroOrmUnitOfWork } from '../../../src/infrastructure/persistence/unit-of-work.js';
import { getTestOrm, closeTestOrm } from '../../integration/setup.js';

const walletId = process.argv[2];
const playerId = process.argv[3];
const externalId = process.argv[4];

if (!walletId || !playerId || !externalId) {
  console.error('Usage: bun test/concurrency/scripts/process-bet.worker.ts <walletId> <playerId> <externalId>');
  process.exit(1);
}

const orm = await getTestOrm();
const unitOfWork = new MikroOrmUnitOfWork(orm.em);
const processWager = new ProcessWagerTransactionUseCase(unitOfWork);

const result = await processWager.execute({
  providerId: 'provider-a',
  externalTransactionId: externalId,
  idempotencyKey: `provider-a:${externalId}`,
  playerId,
  walletId,
  roundId: 'round-multi-instance',
  gameId: 'game-1',
  kind: 'BET',
  money: { amount: '80.00', currency: 'BRL' },
});

console.log(JSON.stringify(result));
await closeTestOrm();
