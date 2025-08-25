require("dotenv").config();
const express = require("express");
const cors = require("cors");
const initDB = require("./utils/dbInit");
const repositoryRoutes = require("./routes/repositoryRoutes");
const errorHandler = require("./middleware/errorHandler");
const pool = require("./config/db");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Routes
app.use("/api", repositoryRoutes);

// Error middleware
app.use(errorHandler);

// 404 handler
app.use("*", (req, res) => res.status(404).json({ error: "Route not found" }));

// Start server
const startServer = async () => {
     await initDB();
     app.listen(PORT, () => {
          console.log(`🚀 Server running on port ${PORT}`);
     });
};

startServer();

// Graceful shutdown
process.on("SIGTERM", async () => { await pool.end(); process.exit(0); });
process.on("SIGINT", async () => { await pool.end(); process.exit(0); });
