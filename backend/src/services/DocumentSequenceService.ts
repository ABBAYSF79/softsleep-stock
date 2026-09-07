import { Prisma, PrismaClient } from '@prisma/client';

export type SequenceType = 'TR' | 'BS' | 'BE' | 'RV';

type TxClient = Prisma.TransactionClient;

/**
 * Concurrency-safe document numbering.
 * Uses SELECT … FOR UPDATE on DocumentSequence (type, year).
 * Format: PREFIX-YYYY-000001
 */
export class DocumentSequenceService {
  constructor(private readonly prisma: PrismaClient) {}

  async nextNumber(type: SequenceType, year = new Date().getFullYear()): Promise<string> {
    return this.prisma.$transaction((tx) => this.nextNumberInTx(tx, type, year));
  }

  async nextNumberInTx(tx: TxClient, type: SequenceType, year = new Date().getFullYear()): Promise<string> {
    const rows = await tx.$queryRaw<Array<{ id: number; lastNumber: number }>>`
      SELECT id, lastNumber
      FROM DocumentSequence
      WHERE type = ${type} AND year = ${year}
      FOR UPDATE
    `;

    let next: number;
    if (!rows[0]) {
      try {
        await tx.documentSequence.create({
          data: { type, year, lastNumber: 1 },
        });
        next = 1;
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) {
          throw e;
        }
        const again = await tx.$queryRaw<Array<{ id: number; lastNumber: number }>>`
          SELECT id, lastNumber
          FROM DocumentSequence
          WHERE type = ${type} AND year = ${year}
          FOR UPDATE
        `;
        if (!again[0]) {
          throw new Error(`DocumentSequence missing after race for ${type}-${year}`);
        }
        next = again[0].lastNumber + 1;
        await tx.documentSequence.update({
          where: { id: again[0].id },
          data: { lastNumber: next },
        });
      }
    } else {
      next = rows[0].lastNumber + 1;
      await tx.documentSequence.update({
        where: { id: rows[0].id },
        data: { lastNumber: next },
      });
    }

    return `${type}-${year}-${String(next).padStart(6, '0')}`;
  }
}
