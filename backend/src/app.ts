import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// Configure CORS
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      'http://localhost:8080',
      'http://localhost:5173',
      'http://localhost:4173',
      'https://mangesoftsleep.store'
    ];

    // allow server-to-server / postman
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.use(express.json());

// Import routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import productRoutes from './routes/products';
import orderRoutes from './routes/orders';
import stockRoutes from './routes/stock';
import deliveryRoutes from './routes/delivery';
import dashboardRoutes from './routes/dashboard';
import settingsRoutes from './routes/settings';
import sizeRoutes from './routes/sizes';
import activitiesRoutes from './routes/activities';
import confirmationUsersRoutes from './routes/confirmation-users';

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/sizes', sizeRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/confirmation-users', confirmationUsersRoutes);

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});