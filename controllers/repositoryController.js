const pool = require("../config/db");
const { githubAxios, saveRepositories } = require("../services/githubService");

// Health check
exports.healthCheck = (req, res) => {
     res.json({ status: "OK", timestamp: new Date().toISOString() });
};

// DB test
exports.testDB = async (req, res) => {
     try {
          const result = await pool.query("SELECT COUNT(*) FROM repositories");
          res.json({ status: "Database connected", repository_count: result.rows[0].count });
     } catch (error) {
          res.status(500).json({ status: "Database error", error: error.message });
     }
};

// Add repository manually
exports.addRepository = async (req, res) => {
     try {
          const repo = req.body;
          if (!repo.github_id || !repo.name || !repo.full_name || !repo.html_url || !repo.owner_login || !repo.search_keyword) {
               return res.status(400).json({ error: "Missing required fields" });
          }

          const result = await pool.query(
               `
        INSERT INTO repositories 
        (github_id, name, full_name, description, html_url, stargazers_count, forks_count, language, owner_login, owner_avatar_url, search_keyword)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (github_id) DO UPDATE SET
          stargazers_count = EXCLUDED.stargazers_count,
          forks_count = EXCLUDED.forks_count,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `,
               [
                    repo.github_id,
                    repo.name,
                    repo.full_name,
                    repo.description || null,
                    repo.html_url,
                    repo.stargazers_count || 0,
                    repo.forks_count || 0,
                    repo.language || null,
                    repo.owner_login,
                    repo.owner_avatar_url || "https://github.com/identicons/unknown.png",
                    repo.search_keyword,
               ]
          );
          res.json({ message: "Repository stored successfully", repository: result.rows[0] });
     } catch (error) {
          res.status(500).json({ error: "Database error", message: error.message });
     }
};

// Search repositories via GitHub API
exports.searchRepositories = async (req, res) => {
     try {
          const { q, page = 1, per_page = 30, sort = "stars", order = "desc" } = req.query;
          if (!q) return res.status(400).json({ error: 'Query parameter "q" is required' });

          const response = await githubAxios.get("/search/repositories", {
               params: { q, page: parseInt(page), per_page: Math.min(parseInt(per_page), 100), sort, order },
          });

          const { items, total_count } = response.data;

          const repositories = items.map(item => ({
               id: item.id,
               github_id: item.id,
               name: item.name,
               full_name: item.full_name,
               description: item.description,
               html_url: item.html_url,
               stargazers_count: item.stargazers_count,
               forks_count: item.forks_count,
               language: item.language,
               owner_login: item.owner?.login || "unknown",
               owner_avatar_url: item.owner?.avatar_url || "https://github.com/identicons/unknown.png",
               search_keyword: q.toString().trim(),
          }));

          if (repositories.length) await saveRepositories(repositories, q);

          res.json({
               repositories,
               total_count,
               current_page: parseInt(page),
               per_page: parseInt(per_page),
          });
     } catch (error) {
          res.status(500).json({ error: "GitHub API Error", message: error.message });
     }
};
