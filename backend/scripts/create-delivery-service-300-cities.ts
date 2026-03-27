import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function buildCities(total = 300): string[] {
  const baseCities = [
    'Casablanca', 'Rabat', 'Fes', 'Marrakech', 'Tangier', 'Agadir', 'Meknes', 'Oujda', 'Kenitra', 'Tetouan',
    'Safi', 'ElJadida', 'Nador', 'BeniMellal', 'Taza', 'Khouribga', 'Settat', 'Larache', 'KsarElKebir', 'Guelmim',
    'Errachidia', 'Ouarzazate', 'Taroudant', 'Ifrane', 'Azrou', 'AlHoceima', 'Berkane', 'Taourirt', 'SidiKacem', 'SidiSlimane',
    'Youssoufia', 'Mohammedia', 'Essaouira', 'Dakhla', 'Laayoune', 'Khemisset', 'Chefchaouen', 'Tiflet', 'Temara', 'Sale'
  ];

  if (baseCities.length >= total) {
    return baseCities.slice(0, total);
  }

  const generated = Array.from({ length: total - baseCities.length }, (_, i) => `CityLoad${String(i + 1).padStart(3, '0')}`);
  return [...baseCities, ...generated];
}

async function main() {
  const serviceName = 'Delivery Stress 300 Cities';
  const cities = buildCities(300);
  const existing = await prisma.deliveryService.findFirst({ where: { name: serviceName } });
  const service = existing
    ? await prisma.deliveryService.update({
        where: { id: existing.id },
        data: {
          active: true,
          cities: JSON.stringify(cities)
        }
      })
    : await prisma.deliveryService.create({
        data: {
          name: serviceName,
          active: true,
          cities: JSON.stringify(cities)
        }
      });

  console.log(`Delivery service saved: ${service.name}`);
  console.log(`Total cities inserted: ${cities.length}`);
  console.log(`Service ID: ${service.id}`);
}

main()
  .catch((error) => {
    console.error('Error creating 300-cities delivery service:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
