// backend/src/routes/orders.ts
import express from 'express';
import { PrismaClient, OrderStatus, Prisma, Activity } from '@prisma/client';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// Get order statistics
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const where = req.user?.role === 'ADMIN' ? {} : { userId: req.user?.id };
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const oneWeekAgo = new Date(today);
    oneWeekAgo.setDate(today.getDate() - 7);
    
    const oneMonthAgo = new Date(today);
    oneMonthAgo.setDate(today.getDate() - 30);

    const [
      totalOrders,
      deliveredOrders,
      todayOrdersCount,
      totalLastWeek,
      deliveredLastWeek,
      totalLastMonth,
      deliveredLastMonth
    ] = await Promise.all([
      // Total orders
      prisma.order.count({ where }),
      // Total delivered
      prisma.order.count({ where: { ...where, status: 'DELIVERED' } }),
      // Today's orders
      prisma.order.count({ 
        where: { 
          ...where, 
          createdAt: { gte: today } 
        } 
      }),
      // Last week total
      prisma.order.count({ 
        where: { 
          ...where, 
          createdAt: { gte: oneWeekAgo } 
        } 
      }),
      // Last week delivered
      prisma.order.count({ 
        where: { 
          ...where, 
          status: 'DELIVERED',
          createdAt: { gte: oneWeekAgo } 
        } 
      }),
      // Last month total
      prisma.order.count({ 
        where: { 
          ...where, 
          createdAt: { gte: oneMonthAgo } 
        } 
      }),
      // Last month delivered
      prisma.order.count({ 
        where: { 
          ...where, 
          status: 'DELIVERED',
          createdAt: { gte: oneMonthAgo } 
        } 
      })
    ]);

    res.json({
      totalOrders,
      deliveredOrders,
      todayOrdersCount,
      totalLastWeek,
      deliveredLastWeek,
      totalLastMonth,
      deliveredLastMonth
    });
  } catch (error) {
    console.error('Error fetching order stats:', error);
    res.status(500).json({ error: 'Failed to fetch order stats' });
  }
});

// Get all orders
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { 
      page, 
      limit, 
      status, 
      search, 
      salesman, 
      deliveryService,
      productId,
      startDate, 
      endDate,
      dateFilter 
    } = req.query;

    const where: any = req.user?.role === 'ADMIN' ? {} : { userId: req.user?.id };

    // Apply filters
    if (status && status !== 'all') {
      where.status = status.toString().toUpperCase();
    }

    if (search) {
      const searchStr = search.toString();
      where.OR = [
        { customerName: { contains: searchStr } }, // Remove mode: 'insensitive' for MySQL compatibility if needed, but Prisma usually handles it
        { phone: { contains: searchStr } },
        { trackingCode: { contains: searchStr } },
        // For ID search, we need to check if it's a valid number
        ...(isNaN(Number(searchStr)) ? [] : [{ id: Number(searchStr) }])
      ];
    }

    if (salesman && salesman !== 'all') {
      where.user = {
        name: salesman.toString()
      };
    }

    if (deliveryService && deliveryService !== 'all') {
      const ds = deliveryService.toString();
      // In production, filtering by ID is safer than name (case/whitespace/collation).
      if (!Number.isNaN(Number(ds))) {
        where.deliveryServiceId = Number(ds);
      } else {
        // Backward compatibility: allow name-based filter
        where.deliveryService = {
          name: ds
        };
      }
    }

    if (productId && productId !== 'all' && !Number.isNaN(Number(productId))) {
      where.orderItems = {
        some: {
          variant: {
            productId: Number(productId)
          }
        }
      };
    }

    // Date filtering
    if (dateFilter === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      where.createdAt = { gte: today };
    } else if (dateFilter === 'last7days') {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      where.createdAt = { gte: oneWeekAgo };
    } else if (dateFilter === 'last30days') {
      const oneMonthAgo = new Date();
      oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);
      where.createdAt = { gte: oneMonthAgo };
    } else if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate.toString()),
        lte: new Date(endDate.toString())
      };
    }

    // Pagination
    const pageNum = page ? parseInt(page.toString()) : 1;
    const limitNum = limit ? parseInt(limit.toString()) : 2000;
    const skip = (pageNum - 1) * limitNum;

    // Get total count for pagination metadata
    const total = await prisma.order.count({ where });

    const orders = await prisma.order.findMany({
      where,
      skip: page ? skip : 0,
      take: limitNum,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        deliveryService: {
          select: {
            id: true,
            name: true,
            cities: true
          }
        },
        orderItems: {
          include: {
            variant: {
              include: {
                product: true,
                size: true
              }
            }
          }
        },
        confirmationUser: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            linkedSalesUser: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    // Parse cities from JSON string and format the response
    const formattedOrders = orders.map(order => {
      let deliveryService = null;
      
      if (order.deliveryService) {
        try {
          deliveryService = {
            ...order.deliveryService,
            cities: JSON.parse(order.deliveryService.cities)
          };
        } catch (e) {
          console.error(`Error parsing cities for delivery service ${order.deliveryService.id}:`, e);
          // Fallback to empty array or raw string if parsing fails
          deliveryService = {
            ...order.deliveryService,
            cities: []
          };
        }
      }

      return {
        ...order,
        salesman: order.user,
        deliveryService,
        cities: order.city ? [order.city] : [],
        // Format order items
        items: order.orderItems.map(item => ({
          id: item.id,
          productId: item.variant.productId,
          variantId: item.variantId,
          product: item.variant.product,
          variant: item.variant,
          price: item.price,
          quantity: item.quantity
        })),
        confirmationUser: order.confirmationUser
      };
    });
    
    // Return paginated response if page is provided
    if (page) {
      res.json({
        data: formattedOrders,
        meta: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    } else {
      // Backward compatibility
      res.json(formattedOrders);
    }
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Create new order
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { customerName, address, phone, totalAmount, items, deliveryServiceId, city, confirmationUserId, note, trackingCode } = req.body;
    console.log('Creating order for customer:', customerName);
    console.log('Items:', items);
    console.log('Delivery Service:', deliveryServiceId);
    console.log('City:', city);
    console.log('Confirmation User:', confirmationUserId);
    console.log('Note:', note);
    console.log('Tracking Code:', trackingCode);
    
    let calculatedTotal = new Prisma.Decimal(0);
    let calculatedCommission = new Prisma.Decimal(0);
    const orderItems = [];
    
    // Get commission settings
    const commissionSettings = await prisma.commissionSettings.findFirst();
    
    // Validate stock for each item
    for (const item of items) {
      const variant = await prisma.productVariant.findUnique({
        where: { id: item.variantId },
        include: { 
          product: true,
          size: true
        }
      });
      
      if (!variant) {
        return res.status(400).json({ error: `Variant ${item.variantId} not found` });
      }
      
      if (variant.stock < item.quantity) {
        return res.status(400).json({ 
          error: `Insufficient stock for ${variant.product.name} - ${variant.name}. Available: ${variant.stock}, Requested: ${item.quantity}` 
        });
      }
      
      const itemTotal = new Prisma.Decimal(variant.price).mul(new Prisma.Decimal(item.quantity));
      calculatedTotal = calculatedTotal.add(itemTotal);
      
      // Calculate commission based on variant's commission rate or settings
      if (variant.commission) {
        const itemCommission = new Prisma.Decimal(variant.commission).mul(new Prisma.Decimal(item.quantity));
        calculatedCommission = calculatedCommission.add(itemCommission);
      } else if (commissionSettings) {
        if (commissionSettings.useFixedAmount && commissionSettings.defaultFixedAmount) {
          calculatedCommission = calculatedCommission.add(new Prisma.Decimal(commissionSettings.defaultFixedAmount));
        } else {
          const itemCommission = itemTotal.mul(new Prisma.Decimal(commissionSettings.defaultRate).div(100));
          calculatedCommission = calculatedCommission.add(itemCommission);
        }
      }
      
      orderItems.push({
        variantId: item.variantId,
        quantity: item.quantity,
        price: variant.price
      });
    }
    
    const finalTotal = totalAmount ? new Prisma.Decimal(totalAmount) : calculatedTotal;
    
    // Create order without affecting stock (PENDING status)
    const order = await prisma.order.create({
      data: {
        userId: req.user!.id,
        customerName,
        address,
        phone,
        city,
        deliveryServiceId: parseInt(deliveryServiceId),
        totalAmount: finalTotal,
        commission: calculatedCommission,
        status: 'PENDING',
        confirmationUserId: confirmationUserId ? parseInt(confirmationUserId) : null,
        note: note || null,
        trackingCode: trackingCode || null,
        orderItems: {
          create: orderItems
        }
      } as unknown as Prisma.OrderCreateInput,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        orderItems: {
          include: {
            variant: {
              include: {
                product: true,
                size: true
              }
            }
          }
        },
        deliveryService: {
          select: {
            id: true,
            name: true,
            cities: true
          }
        },
        confirmationUser: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            linkedSalesUser: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      }
    });
    
    // Log activity
    await prisma.activity.create({
      data: {
        userId: req.user!.id,
        type: 'ORDER_CREATE',
        description: `New order #${order.id} created for ${customerName}`,
        details: JSON.stringify({
          orderId: order.id,
          customerName,
          totalAmount: finalTotal,
          itemCount: orderItems.length
        })
      }
    });
    
    console.log('Order created successfully:', order.id);
    
    // Format the response
    const formattedOrder = {
      ...order,
      salesman: order.user,
      cities: order.city ? [order.city] : [],
      deliveryService: order.deliveryService ? {
        ...order.deliveryService,
        cities: JSON.parse(order.deliveryService.cities)
      } : null,
      items: order.orderItems.map(item => ({
        id: item.id,
        productId: item.variant.productId,
        variantId: item.variantId,
        product: item.variant.product,
        variant: item.variant,
        price: item.price,
        quantity: item.quantity
      })),
      confirmationUser: order.confirmationUser
    };
    
    res.status(201).json(formattedOrder);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(400).json({ error: 'Failed to create order' });
  }
});

// Update order status
router.patch('/:id/status', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status: newStatus, note, trackingCode } = req.body;
    
    console.log(`Updating order ${id} to status ${newStatus}`);
    console.log('Note:', note);
    console.log('Tracking Code:', trackingCode);
    
    // Get current order
    const currentOrder = await prisma.order.findUnique({
      where: { id: parseInt(id) },
      include: {
        orderItems: {
          include: {
            variant: {
              include: {
                product: true,
                size: true
              }
            }
          }
        }
      }
    });
    
    if (!currentOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const oldStatus = currentOrder.status;
    console.log(`Current status: ${oldStatus}, New status: ${newStatus}`);
    
    // If status hasn't changed and note/tracking code haven't changed, just return
    if (oldStatus === newStatus && currentOrder.note === note && currentOrder.trackingCode === trackingCode) {
      return res.json(currentOrder);
    }
    
    // Update order status and note
    const updatedOrder = await prisma.$transaction(async (tx) => {
      // Update order status and note
      const order = await tx.order.update({
        where: { id: parseInt(id) },
        data: { 
          ...(newStatus && { status: newStatus }),
          ...(note !== undefined && { note }),
          ...(trackingCode !== undefined && { trackingCode })
        },
        include: {
          orderItems: {
            include: {
              variant: {
                include: {
                  product: true,
                  size: true
                }
              }
            }
          }
        }
      });

      // Only handle stock updates if status has changed
      if (newStatus && oldStatus !== newStatus) {
        // Handle stock updates based on status change
        if (oldStatus === 'PENDING' && (newStatus === 'IN_PROCESS' || newStatus === 'DELIVERED')) {
          // Decrease stock when order moves to IN_PROCESS or DELIVERED
          for (const item of order.orderItems) {
            const previousStock = item.variant.stock;
            const newStock = previousStock - item.quantity;
            
            // Update variant stock
            await tx.productVariant.update({
              where: { id: item.variantId },
              data: { stock: newStock }
            });

            // Create stock history record
            await tx.stockHistory.create({
              data: {
                variantId: item.variantId,
                quantity: -item.quantity,
                type: 'ORDER',
                reason: `Order #${order.id} moved to ${newStatus}`,
                previousStock,
                newStock,
                userId: req.user!.id
              }
            });
          }
        } else if ((oldStatus === 'IN_PROCESS' || oldStatus === 'DELIVERED') && newStatus === 'PENDING') {
          // Increase stock (Restore) when order moves back to PENDING (Cancellation/Hold)
          for (const item of order.orderItems) {
            const previousStock = item.variant.stock;
            const newStock = previousStock + item.quantity;
            
            // Update variant stock
            await tx.productVariant.update({
              where: { id: item.variantId },
              data: { stock: newStock }
            });

            // Create stock history record
            await tx.stockHistory.create({
              data: {
                variantId: item.variantId,
                quantity: item.quantity,
                type: 'RETURN', // Using RETURN type as it's returning to stock
                reason: `Order #${order.id} reverted to PENDING from ${oldStatus}`,
                previousStock,
                newStock,
                userId: req.user!.id
              }
            });
          }
        } else if (newStatus === 'RETURNED') {
          // Increase stock when order is returned (from any status)
          for (const item of order.orderItems) {
            const previousStock = item.variant.stock;
            const newStock = previousStock + item.quantity;
            
            // Update variant stock
            await tx.productVariant.update({
              where: { id: item.variantId },
              data: { stock: newStock }
            });

            // Create stock history record
            await tx.stockHistory.create({
              data: {
                variantId: item.variantId,
                quantity: item.quantity,
                type: 'RETURN',
                reason: `Order #${order.id} returned from ${oldStatus}`,
                previousStock,
                newStock,
                userId: req.user!.id
              }
            });
          }
        } else if (oldStatus === 'RETURNED' && (newStatus === 'IN_PROCESS' || newStatus === 'DELIVERED')) {
          // Decrease stock again if order is reprocessed after return
          for (const item of order.orderItems) {
            const previousStock = item.variant.stock;
            const newStock = previousStock - item.quantity;
            
            // Update variant stock
            await tx.productVariant.update({
              where: { id: item.variantId },
              data: { stock: newStock }
            });

            // Create stock history record
            await tx.stockHistory.create({
              data: {
                variantId: item.variantId,
                quantity: -item.quantity,
                type: 'ORDER',
                reason: `Order #${order.id} reprocessed after return to ${newStatus}`,
                previousStock,
                newStock,
                userId: req.user!.id
              }
            });
          }
        }
      }

      return order;
    });
      
    // Log activity
    await prisma.activity.create({
      data: {
        userId: req.user!.id,
        type: newStatus ? 'ORDER_STATUS_CHANGE' : 'ORDER_UPDATE',
        description: newStatus 
          ? `Order #${id} status changed from ${oldStatus} to ${newStatus}`
          : `Order #${id} updated`,
        details: JSON.stringify({
          orderId: id,
          oldStatus,
          newStatus,
          note,
          trackingCode
        })
      }
    });
    
    res.json(updatedOrder);
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(400).json({ error: 'Failed to update order' });
  }
});

// Get single order
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const order = await prisma.order.findUnique({
      where: { id: parseInt(id) },
      include: {
        orderItems: {
          include: {
            variant: {
              include: {
                product: true,
                size: true
              }
            }
          }
        },
        user: {
          select: {
            name: true,
            email: true
          }
        },
        deliveryService: {
          select: {
            id: true,
            name: true,
            cities: true
          }
        },
        confirmationUser: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            linkedSalesUser: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      }
    });
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    console.log('Raw order data:', JSON.stringify(order, null, 2));
    console.log('Confirmation User in raw data:', order.confirmationUser);
    
    // Parse cities from JSON string and ensure deliveryServiceId is included
    const formattedOrder = {
      ...order,
      salesman: order.user,
      cities: order.city ? [order.city] : [],
      deliveryService: order.deliveryService ? {
        ...order.deliveryService,
        cities: JSON.parse(order.deliveryService.cities)
      } : null,
      items: order.orderItems.map(item => ({
        id: item.id,
        productId: item.variant.productId,
        variantId: item.variantId,
        product: item.variant.product,
        variant: item.variant,
        price: item.price,
        quantity: item.quantity
      })),
      confirmationUser: order.confirmationUser
    };
    
    console.log('Formatted order data:', JSON.stringify(formattedOrder, null, 2));
    console.log('Confirmation User in formatted data:', formattedOrder.confirmationUser);
    
    res.json(formattedOrder);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Update order payment status
router.patch('/:id/payment', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { isPaid } = req.body;
    
    const order = await prisma.order.update({
      where: { id: parseInt(id) },
      data: { isPaid: Boolean(isPaid) }
    });
    
    // Log activity
    await prisma.activity.create({
      data: {
        userId: req.user!.id,
        type: 'ORDER_PAYMENT_UPDATE',
        description: `Payment status updated for order #${order.id} to ${isPaid ? 'Paid' : 'Not Paid'}`,
        details: JSON.stringify({
          orderId: order.id,
          isPaid,
          customerName: order.customerName
        })
      }
    });
    
    res.json(order);
  } catch (error) {
    console.error('Error updating payment status:', error);
    res.status(400).json({ error: 'Failed to update payment status' });
  }
});

// Update order delivery service and city
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { deliveryServiceId, city } = req.body;
    if (!deliveryServiceId && !city) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    const updateData: Prisma.OrderUpdateInput = {};
    if (deliveryServiceId) updateData.deliveryService = { connect: { id: parseInt(deliveryServiceId) } };
    if (city) updateData.city = city;
    const order = await prisma.order.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: {
        orderItems: {
          include: {
            variant: {
              include: {
                product: true,
                size: true
              }
            }
          }
        },
        user: { select: { name: true, email: true } },
        deliveryService: { select: { id: true, name: true, cities: true } },
        confirmationUser: { select: { id: true, name: true, phone: true, email: true, linkedSalesUser: { select: { id: true, name: true, email: true } } } }
      }
    });
    await prisma.activity.create({
      data: {
        userId: req.user!.id,
        type: 'ORDER_DELIVERY_UPDATE',
        description: `Order #${id} delivery service/city updated`,
        details: JSON.stringify({ orderId: id, deliveryServiceId, city })
      }
    });
    res.json(order);
  } catch (error) {
    console.error('Error updating order delivery service/city:', error);
    res.status(400).json({ error: 'Failed to update order delivery service/city' });
  }
});

// Full update order (Advanced Edit)
router.put('/:id/full', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      password,
      customerName, 
      phone, 
      address, 
      city, 
      deliveryServiceId, 
      items, 
      totalAmount,
      status,
      trackingCode,
      note
    } = req.body;
    
    // Verify password (Static password check)
    const staticPassword = 'admin123456'; 
    if (password !== staticPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id }
    });

    if (!user || user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only admins can perform full updates' });
    }

    const orderId = parseInt(id);

    // Get current order with items
    const currentOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: { orderItems: true }
    });

    if (!currentOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Transaction to handle everything safely
    const updatedOrder = await prisma.$transaction(async (tx) => {
      // 1. Revert stock changes from old items IF they were deducted
      // Stock is deducted if status was IN_PROCESS or DELIVERED
      const stockWasDeducted = currentOrder.status === 'IN_PROCESS' || currentOrder.status === 'DELIVERED';
      
      if (stockWasDeducted) {
        for (const item of currentOrder.orderItems) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stock: { increment: item.quantity } }
          });
          
          // We don't log every single revert here to avoid spamming logs, 
          // but we could if strict auditing is needed.
        }
      }

      // 2. Delete old items
      await tx.orderItem.deleteMany({
        where: { orderId }
      });

      // 3. Prepare new items and calculate totals (if not provided)
      const newOrderItems = [];
      let calculatedTotal = new Prisma.Decimal(0);
      let calculatedCommission = new Prisma.Decimal(0);
      const commissionSettings = await tx.commissionSettings.findFirst();

      for (const item of items) {
        const variant = await tx.productVariant.findUnique({
          where: { id: item.variantId },
          include: { product: true }
        });

        if (!variant) throw new Error(`Variant ${item.variantId} not found`);

        const quantity = parseInt(item.quantity);
        const price = new Prisma.Decimal(item.price || variant.price); // Allow price override or use variant price

        const itemTotal = price.mul(new Prisma.Decimal(quantity));
        calculatedTotal = calculatedTotal.add(itemTotal);

        // Commission logic (simplified)
        if (variant.commission) {
          calculatedCommission = calculatedCommission.add(new Prisma.Decimal(variant.commission).mul(new Prisma.Decimal(quantity)));
        } else if (commissionSettings) {
          if (commissionSettings.useFixedAmount && commissionSettings.defaultFixedAmount) {
             calculatedCommission = calculatedCommission.add(new Prisma.Decimal(commissionSettings.defaultFixedAmount));
          } else {
             calculatedCommission = calculatedCommission.add(itemTotal.mul(new Prisma.Decimal(commissionSettings.defaultRate).div(100)));
          }
        }

        newOrderItems.push({
          variantId: item.variantId,
          quantity: quantity,
          price: price
        });
      }

      // 4. Update Order
      const finalTotal = totalAmount ? new Prisma.Decimal(totalAmount) : calculatedTotal;
      const finalStatus = status || currentOrder.status;

      const order = await tx.order.update({
        where: { id: orderId },
        data: {
          customerName,
          phone,
          address,
          city,
          deliveryServiceId: deliveryServiceId ? parseInt(deliveryServiceId) : null,
          totalAmount: finalTotal,
          commission: calculatedCommission,
          status: finalStatus,
          trackingCode,
          note,
          orderItems: {
            create: newOrderItems
          }
        },
        include: {
          orderItems: {
             include: {
                variant: {
                   include: { product: true, size: true }
                }
             }
          }
        }
      });

      // 5. Apply stock deduction for NEW items IF new status implies deduction
      const stockShouldBeDeducted = finalStatus === 'IN_PROCESS' || finalStatus === 'DELIVERED';

      if (stockShouldBeDeducted) {
        for (const item of newOrderItems) {
           // Check stock availability first? 
           // For "Advanced Edit" we might allow negative stock or force it, 
           // but let's just decrement.
           await tx.productVariant.update({
             where: { id: item.variantId },
             data: { stock: { decrement: item.quantity } }
           });
        }
      }

      return order;
    });

    // Log activity
    await prisma.activity.create({
      data: {
        userId: req.user!.id,
        type: 'ORDER_UPDATE',
        description: `Full update performed on Order #${orderId}`,
        details: JSON.stringify({
          orderId,
          changes: 'Full update (customer, items, status, etc.)'
        })
      }
    });

    res.json(updatedOrder);

  } catch (error) {
    console.error('Error performing full update:', error);
    res.status(500).json({ error: (error as Error).message || 'Failed to update order' });
  }
});

// Delete order
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    
    // Verify password (Static password check)
    // Hardcoded as requested
    const staticPassword = 'admin123456'; 
    if (password !== staticPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id }
    });

    if (!user) {
       return res.status(401).json({ error: 'User not found' });
    }

    // Only ADMIN can delete orders
    if (user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only admins can delete orders' });
    }

    const orderId = parseInt(id);

    // Get order details for logging and stock restoration before deletion
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        orderItems: {
          include: {
            variant: true
          }
        }
      }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Restore stock if order was not cancelled/returned/pending
    // Logic: If stock was deducted (IN_PROCESS, DELIVERED), restore it.
    if (order.status === 'IN_PROCESS' || order.status === 'DELIVERED') {
      for (const item of order.orderItems) {
        await prisma.productVariant.update({
          where: { id: item.variantId },
          data: { stock: { increment: item.quantity } }
        });

        // Log stock restoration
        await prisma.stockHistory.create({
          data: {
            variantId: item.variantId,
            quantity: item.quantity,
            type: 'ADJUSTMENT',
            reason: `Order #${order.id} deleted (Restored)`,
            previousStock: item.variant.stock, // Approximation
            newStock: item.variant.stock + item.quantity,
            userId: req.user!.id
          }
        });
      }
    }

    // Delete order (cascade delete will handle order items)
    await prisma.order.delete({
      where: { id: orderId }
    });

    // Log activity
    await prisma.activity.create({
      data: {
        userId: req.user!.id,
        type: 'ORDER_DELETE',
        description: `Order #${orderId} deleted by ${user.name}`,
        details: JSON.stringify({
          orderId,
          customerName: order.customerName,
          amount: order.totalAmount
        })
      }
    });

    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ error: 'Failed to delete order' });
  }
});

export default router;