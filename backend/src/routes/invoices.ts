import express from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { adminOnly, authMiddleware } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

const TAX_RATE = new Prisma.Decimal(20);

const toDecimal = (value: unknown) => {
  if (value === null || value === undefined || value === '') {
    return new Prisma.Decimal(0);
  }
  return new Prisma.Decimal(value as Prisma.Decimal.Value);
};

const getNextReference = async () => {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;

  const latest = await prisma.invoice.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { createdAt: 'desc' },
    select: { reference: true }
  });

  let sequence = 1;
  if (latest?.reference) {
    const parts = latest.reference.split('-');
    const latestSequence = Number(parts[2]);
    if (!Number.isNaN(latestSequence)) {
      sequence = latestSequence + 1;
    }
  }

  return `${prefix}${String(sequence).padStart(6, '0')}`;
};

router.get('/next-reference', authMiddleware, adminOnly, async (_req, res) => {
  try {
    const reference = await getNextReference();
    res.json({ reference });
  } catch (error) {
    console.error('Error generating invoice reference:', error);
    res.status(500).json({ error: 'Failed to generate invoice reference' });
  }
});

router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const {
      invoiceNumber,
      invoiceDate,
      dueDate,
      paymentMode,
      notes,
      companyName,
      companyAddress,
      companyPhone,
      companyEmail,
      companyRib,
      companyIce,
      clientName,
      clientPhone,
      clientAddress,
      clientCity,
      orderIds,
      items,
      subtotalHt,
      taxRate,
      taxAmount,
      totalTtc,
      currency
    } = req.body;

    if (!invoiceNumber || !invoiceDate || !dueDate || !clientName || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ error: 'Missing required invoice fields' });
    }

    let createdInvoice = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const reference = await getNextReference();
      try {
        createdInvoice = await prisma.invoice.create({
          data: {
            reference,
            invoiceNumber,
            invoiceDate: new Date(invoiceDate),
            dueDate: new Date(dueDate),
            paymentMode: paymentMode || 'Espèce',
            notes: notes || null,
            companyName: companyName || '',
            companyAddress: companyAddress || '',
            companyPhone: companyPhone || null,
            companyEmail: companyEmail || null,
            companyRib: companyRib || null,
            companyIce: companyIce || null,
            clientName,
            clientPhone: clientPhone || null,
            clientAddress: clientAddress || null,
            clientCity: clientCity || null,
            orderIdsJson: JSON.stringify(orderIds),
            itemsJson: JSON.stringify(items || []),
            subtotalHt: toDecimal(subtotalHt),
            taxRate: toDecimal(taxRate || TAX_RATE),
            taxAmount: toDecimal(taxAmount),
            totalTtc: toDecimal(totalTtc),
            currency: currency || 'MAD',
            createdByUserId: req.user.id
          },
          include: {
            createdBy: {
              select: { id: true, name: true, email: true }
            }
          }
        });

        await prisma.activity.create({
          data: {
            userId: req.user.id,
            type: 'INVOICE_CREATE',
            description: `Invoice ${reference} created for ${clientName}`,
            details: JSON.stringify({
              invoiceId: createdInvoice.id,
              reference,
              invoiceNumber,
              orderIds,
              totalTtc
            })
          }
        });
        break;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          attempt < 2
        ) {
          continue;
        }
        throw error;
      }
    }

    if (!createdInvoice) {
      return res.status(500).json({ error: 'Failed to save invoice after retries' });
    }

    res.status(201).json({
      ...createdInvoice,
      orderIds: JSON.parse(createdInvoice.orderIdsJson),
      items: JSON.parse(createdInvoice.itemsJson)
    });
  } catch (error) {
    console.error('Error creating invoice:', error);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

router.get('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { search = '' } = req.query;

    const invoices = await prisma.invoice.findMany({
      where: search
        ? {
            OR: [
              { reference: { contains: String(search) } },
              { invoiceNumber: { contains: String(search) } },
              { clientName: { contains: String(search) } }
            ]
          }
        : undefined,
      include: {
        createdBy: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(
      invoices.map((invoice: any) => ({
        ...invoice,
        orderIds: JSON.parse(invoice.orderIdsJson),
        items: JSON.parse(invoice.itemsJson)
      }))
    );
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

export default router;
