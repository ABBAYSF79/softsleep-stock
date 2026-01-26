import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('123456', 10);
  
  const admin = await prisma.user.create({
    data: {
      name: 'Admin User',
      email: 'admin@matles.com',
      password: hashedPassword,
      role: 'ADMIN',
      active: true
    }
  });

  console.log('Admin user created successfully:', admin);
}

main()
  .catch((e) => {
    console.error('Error creating admin user:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 