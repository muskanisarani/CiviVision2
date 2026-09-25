const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  // Clear existing data
  await prisma.alert.deleteMany({});
  await prisma.toilet.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.complaint.deleteMany({});
  await prisma.user.deleteMany({});

  // Hash passwords
  const adminPasswordHash = await bcrypt.hash('admin123', 10);
  const userPasswordHash = await bcrypt.hash('muskan123', 10);

  // Seed Users
  const admin = await prisma.user.create({
    data: {
      name: 'GMC Admin',
      email: 'civivision@gmail.com',
      mobile: '9999999999',
      passwordHash: adminPasswordHash,
      city: 'Gandhinagar',
      state: 'Gujarat',
      ward: 'Central Zone',
      role: 'admin',
    }
  });

  const citizen = await prisma.user.create({
    data: {
      name: 'Muskan',
      email: 'muskan@gmail.com',
      mobile: '8888888888',
      passwordHash: userPasswordHash,
      city: 'Gandhinagar',
      state: 'Gujarat',
      ward: 'Sector 5',
      role: 'user',
      avatarType: 'badge',
      avatarBadge: 'initials',
      credits: 50,
      rankTitle: 'Civic Scout',
      verifiedReportsCount: 0
    }
  });

  // Seed Toilets
  await prisma.toilet.createMany({
    data: [
      {
        name: 'SBM Toilet – Bus Stand',
        address: 'GMC Bus Stand Area',
        latitude: 23.2156,
        longitude: 72.6369,
        fee: 'Free',
        type: 'Unisex',
        hasVendingMachine: true,
        rating: 4.5,
        votes: 12,
        status: 'Clean'
      },
      {
        name: 'SBM Toilet – Sector 21 Market',
        address: 'Sector 21 Shopping Center',
        latitude: 23.2341,
        longitude: 72.6482,
        fee: '5 Rs',
        type: 'Unisex',
        hasVendingMachine: false,
        rating: 4.2,
        votes: 25,
        status: 'Clean'
      },
      {
        name: 'Public Toilet – Sector 28 Park',
        address: "Children's Park Road",
        latitude: 23.2505,
        longitude: 72.6620,
        fee: 'Free',
        type: 'Unisex',
        hasVendingMachine: true,
        rating: 3.8,
        votes: 8,
        status: 'Needs Attention'
      },
      {
        name: 'E-Toilet – Sector 11',
        address: 'Sardar Patel Mall Corner',
        latitude: 23.2201,
        longitude: 72.6395,
        fee: '2 Rs',
        type: 'Unisex',
        hasVendingMachine: false,
        rating: 4.6,
        votes: 42,
        status: 'Clean'
      }
    ]
  });

  // Seed Alerts
  await prisma.alert.createMany({
    data: [
      {
        title: 'Scheduled Water Supply Maintenance',
        category: 'Water Shutdown',
        date: 'July 05, 2026',
        severity: 'warning',
        details: 'Water supply will be temporarily suspended in Sectors 4, 5, and 6 on Sunday from 9:00 AM to 1:00 PM due to pipeline upgrades.'
      },
      {
        title: 'Special Swachhata Drive: Sector 21',
        category: 'Sanitation Drive',
        date: 'July 03, 2026',
        severity: 'info',
        details: 'Join the GMC clean-up campaign starting at 7:30 AM at the Sector 21 Market Square. Citizen volunteers will receive SBM credits.'
      },
      {
        title: 'Heavy Monsoon Alert',
        category: 'Weather Warning',
        date: 'July 02, 2026',
        severity: 'danger',
        details: 'Meteorological Department issues orange alert for Gandhinagar. Public is advised to report live wire contacts or drainage blocks immediately via the SOS dashboard.'
      },
      {
        title: 'Free Health & Hygiene Camp',
        category: 'Health Camp',
        date: 'July 08, 2026',
        severity: 'info',
        details: 'GMC is organizing a free immunization and sanitation awareness workshop at the Community Hall in Sector 17.'
      }
    ]
  });

  // Seed initial notifications for Muskan
  await prisma.notification.createMany({
    data: [
      {
        title: 'Welcome to CiviVision!',
        message: 'Thank you for joining Gandhinagar\'s civic portal. You can now report civic issues, track public toilets, and check service updates directly.',
        userId: citizen.id,
        read: false
      }
    ]
  });

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
