const express = require("express");
const controller = require("../controllers/repositoryController");
const router = express.Router();

router.get("/health", controller.healthCheck);
router.get("/test-db", controller.testDB);
router.post("/repositories", controller.addRepository);
router.get("/search/repositories", controller.searchRepositories);

module.exports = router;
