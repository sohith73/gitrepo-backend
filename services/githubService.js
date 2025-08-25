const axios = require("axios");
const pool = require("../config/db");

const githubAxios = axios.create({
     baseURL: "https://api.github.com",
     headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "GitHub-Repository-Explorer" },
     timeout: 15000,
});

const saveRepositories = async (repositories, keyword) => {
     const client = await pool.connect();
     try {
          for (const repo of repositories) {
               await client.query(
                    `
          INSERT INTO repositories 
          (github_id, name, full_name, description, html_url, stargazers_count, forks_count, language, owner_login, owner_avatar_url, search_keyword)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          ON CONFLICT (github_id) DO UPDATE SET
            stargazers_count = EXCLUDED.stargazers_count,
            forks_count = EXCLUDED.forks_count,
            updated_at = CURRENT_TIMESTAMP
        `,
                    [
                         repo.id,
                         repo.name,
                         repo.full_name,
                         repo.description,
                         repo.html_url,
                         repo.stargazers_count,
                         repo.forks_count,
                         repo.language,
                         repo.owner?.login || "unknown",
                         repo.owner?.avatar_url || "https://github.com/identicons/unknown.png",
                         keyword,
                    ]
               );
          }
     } finally {
          client.release();
     }
};

module.exports = { githubAxios, saveRepositories };
