import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { authMiddleware, adminOnly } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

// Get all confirmation users (admin and salesperson)
router.get("/", authMiddleware, async (req, res) => {
  try {
    if (req.user.role === "ADMIN") {
      // Admin: return all confirmation users
      const confirmationUsers = await prisma.confirmationUser.findMany({
        include: {
          salesman: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          linkedSalesUser: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });
      return res.json(confirmationUsers);
    } else {
      // Salesperson: return only their confirmation users
      const confirmationUsers = await prisma.confirmationUser.findMany({
        where: { salesmanId: req.user.id },
        include: {
          salesman: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          linkedSalesUser: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });
      return res.json(confirmationUsers);
    }
  } catch (error) {
    console.error("Error in GET /confirmation-users:", error);
    res.status(500).json({ 
      error: "Failed to fetch confirmation users",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// Get confirmation users for a specific salesman
router.get("/my-team", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const confirmationUsers = await prisma.confirmationUser.findMany({
      where: {
        salesmanId: userId
      },
      include: {
        linkedSalesUser: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });
    res.json(confirmationUsers);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch confirmation users" });
  }
});

// Get available sales users for linking (admin only)
router.get("/available-sales-users", authMiddleware, adminOnly, async (req, res) => {
  try {
    console.log("Fetching available sales users...");
    console.log("Current user role:", req.user.role);
    console.log("User ID:", req.user.id);
    
    // First, let's check all users to see what we have
    const allUsers = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true
      }
    });
    console.log("All users in database:", JSON.stringify(allUsers, null, 2));

    // Use the correct enum value for SALES role
    const salesUsers = await prisma.user.findMany({
      where: {
        role: "SALES",
        active: true
      },
      select: {
        id: true,
        name: true,
        email: true
      }
    });
    
    if (!salesUsers || salesUsers.length === 0) {
      console.log("No sales users found in database");
      return res.json([]);
    }
    
    console.log("Found sales users:", JSON.stringify(salesUsers, null, 2));
    res.json(salesUsers);
  } catch (error) {
    console.error("Error fetching sales users:", error);
    res.status(500).json({ 
      error: "Failed to fetch sales users",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// Create a new confirmation user
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { name, phone, email, linkedSalesUserId } = req.body;
    const userId = req.user.id;
    let finalLinkedSalesUserId = linkedSalesUserId;

    // If user is not admin, force linkedSalesUserId to their own ID
    if (req.user.role !== "ADMIN") {
      finalLinkedSalesUserId = userId;
    }

    const confirmationUser = await prisma.confirmationUser.create({
      data: {
        name,
        phone,
        email,
        salesmanId: userId,
        linkedSalesUserId: finalLinkedSalesUserId || null
      },
      include: {
        linkedSalesUser: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });
    res.json(confirmationUser);
  } catch (error) {
    res.status(500).json({ error: "Failed to create confirmation user" });
  }
});

// Update a confirmation user
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, email, active, linkedSalesUserId } = req.body;
    const userId = req.user.id;

    // Check if user owns this confirmation user
    const existingUser = await prisma.confirmationUser.findFirst({
      where: {
        id: parseInt(id),
        salesmanId: userId
      }
    });

    if (!existingUser) {
      return res.status(403).json({ error: "Not authorized to update this confirmation user" });
    }

    // If user is not admin, they can only link to themselves
    if (req.user.role !== "ADMIN" && linkedSalesUserId && linkedSalesUserId !== userId) {
      return res.status(403).json({ error: "Not authorized to link confirmation user to other sales users" });
    }

    const confirmationUser = await prisma.confirmationUser.update({
      where: { id: parseInt(id) },
      data: {
        name,
        phone,
        email,
        active,
        linkedSalesUserId: linkedSalesUserId || null
      },
      include: {
        linkedSalesUser: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });
    res.json(confirmationUser);
  } catch (error) {
    res.status(500).json({ error: "Failed to update confirmation user" });
  }
});

// Delete a confirmation user
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if user owns this confirmation user
    const existingUser = await prisma.confirmationUser.findFirst({
      where: {
        id: parseInt(id),
        salesmanId: userId
      }
    });

    if (!existingUser) {
      return res.status(403).json({ error: "Not authorized to delete this confirmation user" });
    }

    await prisma.confirmationUser.delete({
      where: { id: parseInt(id) }
    });
    res.json({ message: "Confirmation user deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete confirmation user" });
  }
});

export default router; 