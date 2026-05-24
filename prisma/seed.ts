import bcrypt from "bcryptjs";
import { prisma } from "../src/db/prisma.js";

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const name = process.env.SUPER_ADMIN_NAME || "Super Admin";

  if (!email || !password) {
    console.error("SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD env vars are required");
    process.exit(1);
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (existingUser) {
    console.log("Super admin already exists");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      role: "ADMIN",
    },
  });

  console.log(`Super admin created: ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });