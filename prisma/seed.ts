import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

let PrismaClient: any;
try {
  PrismaClient = require('../dist/generated/prisma/client').PrismaClient;
} catch {
  PrismaClient = require('../generated/prisma/client').PrismaClient;
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is missing');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const categories = [
  'Electronics',
  'Clothing',
  'Home & Kitchen',
  'Books',
  'Sports',
  'Beauty',
  'Toys',
  'Automotive',
];

const sampleProducts = [
  'Wireless Headphones',
  'Gaming Laptop',
  'Mechanical Keyboard',
  'Ergonomic Mouse',
  '4K Monitor',
  'Smartphone Stand',
  'USB-C Hub',
  'Bluetooth Speaker',
  'Smart Watch',
  'Noise Canceling Earbuds',
  'Leather Wallet',
  'Cotton T-Shirt',
  'Denim Jacket',
  'Running Shoes',
  'Backpack',
  'Stainless Steel Water Bottle',
  'Coffee Maker',
  'Air Purifier',
  'Desk Lamp',
  'Fitness Tracker',
];

async function main() {
  console.log('Seeding 100 products...');

  await prisma.product.deleteMany();

  const productsData: Array<{
    name: string;
    currency: string;
    is_active: boolean;
    price: number;
    quantity: number;
    reserved_quantity: number;
  }> = [];

  for (let i = 1; i <= 100; i++) {
    const baseName = sampleProducts[(i - 1) % sampleProducts.length];
    const category = categories[(i - 1) % categories.length];
    const name = `${baseName} Vol.${i} (${category})`;
    const price = parseFloat((Math.random() * 490 + 10).toFixed(2));
    const quantity = Math.floor(Math.random() * 150) + 10;
    const reserved_quantity = Math.floor(Math.random() * 8);
    const currency = i % 4 === 0 ? 'EGP' : 'USD';
    const is_active = i % 10 !== 0;

    productsData.push({
      name,
      currency,
      is_active,
      price,
      quantity,
      reserved_quantity,
    });
  }

  await prisma.product.createMany({
    data: productsData,
  });

  console.log('Successfully seeded 100 product records into PostgreSQL! 🚀');
}

main()
  .catch((e) => {
    console.error('Error seeding data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
