import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  res.json({
    status: 'success',
    message: 'Backend is running correctly',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

export default router;
