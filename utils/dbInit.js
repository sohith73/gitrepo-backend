const pool = require("../config/db");

const initDB = async () => {
     try {
          await pool.query(`
      CREATE TABLE IF NOT EXISTS repositories (
        id SERIAL PRIMARY KEY,
        github_id INTEGER UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        description TEXT,
        html_url VARCHAR(500) NOT NULL,
        stargazers_count INTEGER DEFAULT 0,
        forks_count INTEGER DEFAULT 0,
        language VARCHAR(100),
        owner_login VARCHAR(255) NOT NULL,
        owner_avatar_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        search_keyword VARCHAR(255) NOT NULL
      )
    `);
          console.log(" Database initialized");
     } catch (error) {
          console.error(" Database initialization error:", error);
     }
};

module.exports = initDB;
