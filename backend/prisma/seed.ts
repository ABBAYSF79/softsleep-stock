// backend/prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.create({
    data: {
      name: 'Admin User',
      email: 'admin@matles.com',
      password: adminPassword,
      role: 'ADMIN'
    }
  });
  console.log('Created admin user:', admin.email);

  // Create sales users
  const salesPassword = await bcrypt.hash('sales123', 10);
  const omar = await prisma.user.create({
    data: {
      name: 'Omar Khalid',
      email: 'omar@matles.com',
      password: salesPassword,
      role: 'SALES'
    }
  });
  console.log('Created sales user:', omar.email);

  const aishaPassword = await bcrypt.hash('sales123', 10);
  const aisha = await prisma.user.create({
    data: {
      name: 'Aisha Rahman',
      email: 'aisha@matles.com',
      password: aishaPassword,
      role: 'SALES'
    }
  });
  console.log('Created sales user:', aisha.email);

  // Create products with variants
  const product1 = await prisma.product.create({
    data: {
      name: 'Premium Matles Sheet',
      sku: 'MTL-001',
      description: 'High-quality premium matles sheet for ultimate comfort and durability',
      inStock: true,
      variants: {
        create: [
          { name: 'Demonstration 1', skuExt: '-V1', price: 120, weight: 1.5, stock: 50 },
          { name: 'Demonstration 2', skuExt: '-V2', price: 150, weight: 2.0, stock: 40 },
          { name: 'Demonstration 3', skuExt: '-V3', price: 180, weight: 2.5, stock: 30 }
        ]
      }
    },
    include: { variants: true }
  });
  console.log('Created product:', product1.name);

  const product2 = await prisma.product.create({
    data: {
      name: 'Deluxe Matles Cover',
      sku: 'MTL-002',
      description: 'Luxurious matles cover with advanced protection and elegant design',
      inStock: true,
      variants: {
        create: [
          { name: 'Demonstration 1', skuExt: '-V1', price: 200, weight: 2.0, stock: 35 },
          { name: 'Demonstration 2', skuExt: '-V2', price: 250, weight: 2.5, stock: 30 },
          { name: 'Demonstration 3', skuExt: '-V3', price: 300, weight: 3.0, stock: 25 }
        ]
      }
    },
    include: { variants: true }
  });
  console.log('Created product:', product2.name);

  const product3 = await prisma.product.create({
    data: {
      name: 'Comfort Matles Pillow',
      sku: 'MTL-003',
      description: 'Ergonomic matles pillow for perfect neck support and comfort',
      inStock: false,
      variants: {
        create: [
          { name: 'Demonstration 1', skuExt: '-V1', price: 80, weight: 0.8, stock: 0 },
          { name: 'Demonstration 2', skuExt: '-V2', price: 100, weight: 1.0, stock: 0 },
          { name: 'Demonstration 3', skuExt: '-V3', price: 120, weight: 1.2, stock: 0 }
        ]
      }
    },
    include: { variants: true }
  });
  console.log('Created product:', product3.name);

  const product4 = await prisma.product.create({
    data: {
      name: 'Luxury Matles Set',
      sku: 'MTL-004',
      description: 'Complete luxury matles set including sheet, cover, and pillows',
      inStock: true,
      variants: {
        create: [
          { name: 'Demonstration 1', skuExt: '-V1', price: 400, weight: 4.0, stock: 20 },
          { name: 'Demonstration 2', skuExt: '-V2', price: 500, weight: 5.0, stock: 15 },
          { name: 'Demonstration 3', skuExt: '-V3', price: 600, weight: 6.0, stock: 10 }
        ]
      }
    },
    include: { variants: true }
  });
  console.log('Created product:', product4.name);

  const product5 = await prisma.product.create({
    data: {
      name: 'Classic Matles Cover',
      sku: 'MTL-005',
      description: 'Traditional style matles cover with modern protection features',
      inStock: true,
      variants: {
        create: [
          { name: 'Demonstration 1', skuExt: '-V1', price: 150, weight: 1.8, stock: 45 },
          { name: 'Demonstration 2', skuExt: '-V2', price: 180, weight: 2.2, stock: 35 },
          { name: 'Demonstration 3', skuExt: '-V3', price: 210, weight: 2.6, stock: 25 }
        ]
      }
    },
    include: { variants: true }
  });
  console.log('Created product:', product5.name);

  // Create stock history for each variant
  for (const variant of product1.variants) {
    await prisma.stockHistory.create({
      data: {
        variantId: variant.id,
        quantity: variant.stock,
        type: "INITIAL",
        reason: "Initial stock",
        previousStock: 0,
        newStock: variant.stock,
        userId: aisha.id
      }
    });
  }

  for (const variant of product2.variants) {
    await prisma.stockHistory.create({
      data: {
        variantId: variant.id,
        quantity: variant.stock,
        type: "INITIAL",
        reason: "Initial stock",
        previousStock: 0,
        newStock: variant.stock,
        userId: aisha.id
      }
    });
  }

  // Create some sample orders
  const order1 = await prisma.order.create({
    data: {
      userId: omar.id,
      customerName: 'Ahmed Al-Farsi',
      status: 'DELIVERED',
      totalAmount: 350.00,
      commission: 35.00,
      orderItems: {
        create: [
          {
            variantId: product1.variants[0].id,
            quantity: 2,
            price: product1.variants[0].price
          },
          {
            variantId: product2.variants[1].id,
            quantity: 1,
            price: product2.variants[1].price
          }
        ]
      }
    }
  });
  console.log('Created order:', order1.id);

  const order2 = await prisma.order.create({
    data: {
      userId: aisha.id,
      customerName: 'Fatima Al-Sayed',
      status: 'IN_PROCESS',
      totalAmount: 420.00,
      commission: 42.00,
      orderItems: {
        create: [
          {
            variantId: product2.variants[0].id,
            quantity: 2,
            price: product2.variants[0].price
          }
        ]
      }
    }
  });
  console.log('Created order:', order2.id);

  const order3 = await prisma.order.create({
    data: {
      userId: omar.id,
      customerName: 'Mohammed Al-Jabri',
      status: 'PENDING',
      totalAmount: 280.00,
      commission: 28.00,
      orderItems: {
        create: [
          {
            variantId: product1.variants[1].id,
            quantity: 1,
            price: product1.variants[1].price
          },
          {
            variantId: product5.variants[0].id,
            quantity: 1,
            price: product5.variants[0].price
          }
        ]
      }
    }
  });
  console.log('Created order:', order3.id);

  // Create delivery services
  const delivery1 = await prisma.deliveryService.create({
    data: {
      name: 'Express Delivery',
      active: true,
      cities: JSON.stringify(['Riyadh', 'Jeddah', 'Dammam'])
    }
  });
  console.log('Created delivery service:', delivery1.name);

  const delivery2 = await prisma.deliveryService.create({
    data: {
      name: 'Standard Shipping',
      active: true,
      cities: JSON.stringify(['Riyadh', 'Jeddah', 'Mecca', 'Medina', 'Dammam'])
    }
  });
  console.log('Created delivery service:', delivery2.name);

  const delivery3 = await prisma.deliveryService.create({
    data: {
      name: 'Economy Delivery',
      active: false,
      cities: JSON.stringify(['Riyadh', 'Jeddah'])
    }
  });
  console.log('Created delivery service:', delivery3.name);

  // Stress test service with a very large city list (200+ cities)
  const coreMoroccanCities = [
    'Casablanca', 'Rabat', 'Fes', 'Marrakech', 'Tangier', 'Agadir', 'Meknes', 'Oujda', 'Kenitra', 'Tetouan',
    'Safi', 'ElJadida', 'Nador', 'BeniMellal', 'Taza', 'Khouribga', 'Settat', 'Larache', 'KsarElKebir', 'Guelmim',
    'Errachidia', 'Ouarzazate', 'Taroudant', 'Ifrane', 'Azrou', 'AlHoceima', 'Berkane', 'Taourirt', 'SidiKacem', 'SidiSlimane',
    'Youssoufia', 'Mohammedia', 'Essaouira', 'Dakhla', 'Laayoune', 'Khemisset', 'Chefchaouen', 'Tiflet', 'Temara', 'Sale',
    'Berrechid', 'Skhirat', 'Bouskoura', 'AinHarrouda', 'Mediouna', 'Fnideq', 'Martil', 'Asilah', 'Sefrou', 'Khenifra',
    'Bousselham', 'Azemmour', 'BenGuerir', 'FquihBenSalah', 'Jerada', 'Tinghir', 'Tiznit', 'SidiIfni', 'Zagora', 'Midelt',
    'Guercif', 'HadSoualem', 'DarBouazza', 'BeniAnsar', 'AitMelloul', 'Inzegane', 'Imzouren', 'SoukLarbaa', 'Ouazzane', 'Bouznika'
  ];

  const regionalCities = [
    'AinAouda', 'AitOurir', 'AitBaha', 'AitIshaq', 'AitYadine', 'BabBerred', 'BabTaza', 'Bhalil', 'Biougra', 'Bouarfa',
    'Boujdour', 'Boulemane', 'BouznikaPlage', 'Demnate', 'Drarga', 'ElAiounSidiMellouk', 'ElHajeb', 'ElKelaaDesSraghna', 'ElMansouria', 'ElMenzel',
    'Farkhana', 'Figuig', 'Ghafsai', 'Goulmima', 'HadKourt', 'Imintanoute', 'JerfElMelha', 'KariaBaMohamed', 'KasbaTadla', 'KelaatMguna',
    'KsarSghir', 'Lqliaa', 'Mdiq', 'MechraaBelKsiri', 'Mehdia', 'Missour', 'MoulayBousselham', 'MoulayIdriss', 'Mrirt', 'NzaletBeniAmmar',
    'Oualidia', 'OuedAmlil', 'OuladTeima', 'OuladYaich', 'RasElMa', 'Rich', 'Rommani', 'SabaaAiyoun', 'Saidia', 'SidiAllalBahraoui',
    'SidiAllalTazi', 'SidiBennour', 'SidiBibi', 'SidiBouOthmane', 'SidiRahhal', 'SidiYahyaElGharb', 'Skoura', 'Smara', 'SoukElArbaa', 'Tahla'
  ];

  const loadTestCities = Array.from({ length: 90 }, (_, i) => `TestCity${String(i + 1).padStart(3, '0')}`);
  const stressCities = [...coreMoroccanCities, ...regionalCities, ...loadTestCities];

  const deliveryStress = await prisma.deliveryService.create({
    data: {
      name: 'Stress Test Delivery 200 Cities',
      active: true,
      cities: JSON.stringify(stressCities)
    }
  });
  console.log('Created delivery service:', deliveryStress.name, `(${stressCities.length} cities)`);

  console.log('Database seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });