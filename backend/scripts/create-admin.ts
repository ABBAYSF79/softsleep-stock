import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('123456', 10);
  
  const admin = await prisma.user.upsert({
    where: { email: 'admin@matles.com' },
    update: {
      name: 'Admin User',
      password: hashedPassword,
      role: 'ADMIN',
      active: true,
    },
    create: {
      name: 'Admin User',
      email: 'admin@matles.com',
      password: hashedPassword,
      role: 'ADMIN',
      active: true
    },
  });

  console.log('Admin user ready:', { id: admin.id, email: admin.email, role: admin.role, active: admin.active });
}

main()
  .catch((e) => {
    console.error('Error creating admin user:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 
