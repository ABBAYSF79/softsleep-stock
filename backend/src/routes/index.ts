import { Router } from 'express';
import authRoutes from './auth';
import usersRoutes from './users';
import productsRoutes from './products';
import ordersRoutes from './orders';
import stockRoutes from './stock';
import activitiesRoutes from './activities';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/products', productsRoutes);
router.use('/orders', ordersRoutes);
router.use('/stock', stockRoutes);
router.use('/activities', activitiesRoutes);

export default router; 