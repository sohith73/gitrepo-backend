// server.js - Backend Server with Express and PostgreSQL
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// PostgreSQL connection (Neon DB)
const pool = new Pool({
     connectionString: process.env.DATABASE_URL,
     ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database
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
          console.log('Database initialized successfully');
     } catch (error) {
          console.error('Database initialization error:', error);
     }
};

// GitHub API configuration
const GITHUB_API_BASE = 'https://api.github.com';

const githubAxios = axios.create({
     baseURL: GITHUB_API_BASE,
     headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'GitHub-Repository-Explorer',
     },
     timeout: 15000,
});

// Helper function to save repositories to database
const saveRepositories = async (repositories, keyword) => {
     const client = await pool.connect();
     try {
          for (const repo of repositories) {
               await client.query(
                    `
        INSERT INTO repositories 
        (github_id, name, full_name, description, html_url, stargazers_count, 
         forks_count, language, owner_login, owner_avatar_url, search_keyword)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (github_id) DO UPDATE SET
          stargazers_count = EXCLUDED.stargazers_count,
          forks_count = EXCLUDED.forks_count,
          updated_at = CURRENT_TIMESTAMP
      `,
                    [
                         repo.id, // Use repo.id as github_id
                         repo.name,
                         repo.full_name,
                         repo.description,
                         repo.html_url,
                         repo.stargazers_count,
                         repo.forks_count,
                         repo.language,
                         repo.owner?.login || 'unknown',
                         repo.owner?.avatar_url || 'https://github.com/identicons/unknown.png',
                         keyword || 'unknown',
                    ]
               );
          }
     } finally {
          client.release();
     }
};

// Routes
app.get('/api/health', (req, res) => {
     res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/api/test-db', async (req, res) => {
     try {
          const result = await pool.query('SELECT COUNT(*) FROM repositories');
          res.json({
               status: 'Database connected',
               repository_count: result.rows[0].count,
          });
     } catch (error) {
          res.status(500).json({
               status: 'Database error',
               error: error.message,
          });
     }
});

app.post('/api/repositories', async (req, res) => {
     try {
          const repo = req.body;

          // Validate required fields
          if (!repo.github_id || !repo.name || !repo.full_name || !repo.html_url || !repo.owner_login || !repo.search_keyword) {
               return res.status(400).json({
                    error: 'Missing required fields',
                    message: 'github_id, name, full_name, html_url, owner_login, and search_keyword are required',
               });
          }

          const result = await pool.query(
               `
      INSERT INTO repositories 
      (github_id, name, full_name, description, html_url, stargazers_count, 
       forks_count, language, owner_login, owner_avatar_url, search_keyword)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
                    repo.owner_avatar_url || 'https://github.com/identicons/unknown.png',
                    repo.search_keyword,
               ]
          );
          res.json({ message: 'Repository stored successfully', repository: result.rows[0] });
     } catch (error) {
          console.error('Store repository error:', error);
          res.status(500).json({
               error: 'Database error',
               message: error.message || 'Failed to store repository',
          });
     }
});

app.get('/api/search/repositories', async (req, res) => {
     try {
          const { q, page = 1, per_page = 30, sort = 'stars', order = 'desc' } = req.query;

          if (!q) {
               return res.status(400).json({
                    error: 'Query parameter "q" is required',
                    message: 'Please provide a search keyword',
               });
          }

          const limitedPerPage = Math.min(parseInt(per_page), 100);

          const response = await githubAxios.get('/search/repositories', {
               params: {
                    q: q.toString().trim(),
                    page: parseInt(page),
                    per_page: limitedPerPage,
                    sort,
                    order,
               },
          });

          const { items, total_count, incomplete_results } = response.data;

          // Transform items to match Repository type
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
               owner_login: item.owner?.login || 'unknown',
               owner_avatar_url: item.owner?.avatar_url || 'https://github.com/identicons/unknown.png',
               created_at: item.created_at,
               updated_at: item.updated_at,
               search_keyword: q.toString().trim(),
          }));

          if (repositories.length > 0) {
               await saveRepositories(repositories, q.toString().trim());
          }

          const rateLimit = {
               limit: response.headers['x-ratelimit-limit'],
               remaining: response.headers['x-ratelimit-remaining'],
               reset: response.headers['x-ratelimit-reset'],
          };

          res.json({
               repositories,
               total_count,
               incomplete_results,
               current_page: parseInt(page),
               per_page: limitedPerPage,
               total_pages: Math.ceil(total_count / limitedPerPage),
               rate_limit: rateLimit,
          });
     } catch (error) {
          console.error('GitHub API Error:', error.response?.data || error.message);

          if (error.response?.status === 403) {
               const resetTime = error.response.headers['x-ratelimit-reset'];
               const resetDate = resetTime ? new Date(resetTime * 1000).toLocaleTimeString() : 'unknown';

               return res.status(429).json({
                    error: 'Rate limit exceeded',
                    message: `GitHub API rate limit reached (60 requests/hour for unauthenticated requests). Rate limit resets at ${resetDate}.`,
                    retry_after: resetTime,
                    suggestion: 'Try searching your stored repositories or wait for the rate limit to reset.',
               });
          }

          if (error.response?.status === 422) {
               return res.status(400).json({
                    error: 'Invalid search query',
                    message: 'The search query is malformed or invalid. Please check your search terms.',
               });
          }

          if (error.response?.status === 401) {
               return res.status(500).json({
                    error: 'Authentication error',
                    message: 'GitHub API authentication failed. The service is configured to work without authentication.',
               });
          }

          if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
               return res.status(504).json({
                    error: 'Request timeout',
                    message: 'GitHub API request timed out. Please try again.',
               });
          }

          res.status(500).json({
               error: 'Internal server error',
               message: 'Failed to fetch repositories from GitHub. Please try again later.',
          });
     }
});

app.get('/api/repositories', async (req, res) => {
     try {
          const { page = 1, per_page = 30, keyword, sort_by = 'created_at', order = 'desc' } = req.query;
          const offset = (page - 1) * per_page;

          let whereClause = '';
          let queryParams = [per_page, offset];

          if (keyword) {
               whereClause = 'WHERE search_keyword ILIKE $3';
               queryParams.push(`%${keyword}%`);
          }

          const validSortColumns = ['created_at', 'stargazers_count', 'forks_count', 'name'];
          const sortColumn = validSortColumns.includes(sort_by) ? sort_by : 'created_at';
          const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

          const repositoriesQuery = `
      SELECT * FROM repositories 
      ${whereClause}
      ORDER BY ${sortColumn} ${sortOrder}
      LIMIT $1 OFFSET $2
    `;

          const countQuery = `
      SELECT COUNT(*) as total FROM repositories ${whereClause}
    `;

          const [repositoriesResult, countResult] = await Promise.all([
               pool.query(repositoriesQuery, queryParams),
               pool.query(countQuery, keyword ? [queryParams[2]] : []),
          ]);

          const total_count = parseInt(countResult.rows[0].total);

          res.json({
               repositories: repositoriesResult.rows,
               total_count,
               current_page: parseInt(page),
               per_page: parseInt(per_page),
               total_pages: Math.ceil(total_count / per_page),
          });
     } catch (error) {
          console.error('Database query error:', error);
          res.status(500).json({
               error: 'Database error',
               message: 'Failed to fetch repositories from database',
          });
     }
});

app.get('/api/repositories/stats', async (req, res) => {
     try {
          const statsQuery = `
      SELECT 
        COUNT(*) as total_repositories,
        COUNT(DISTINCT search_keyword) as unique_keywords,
        AVG(stargazers_count) as avg_stars,
        MAX(stargazers_count) as max_stars,
        COUNT(DISTINCT language) as unique_languages
      FROM repositories
    `;

          const languageStatsQuery = `
      SELECT language, COUNT(*) as count
      FROM repositories 
      WHERE language IS NOT NULL
      GROUP BY language
      ORDER BY count DESC
      LIMIT 10
    `;

          const [statsResult, languageResult] = await Promise.all([
               pool.query(statsQuery),
               pool.query(languageStatsQuery),
          ]);

          res.json({
               overview: statsResult.rows[0],
               top_languages: languageResult.rows,
          });
     } catch (error) {
          console.error('Stats query error:', error);
          res.status(500).json({
               error: 'Database error',
               message: 'Failed to fetch repository statistics',
          });
     }
});

app.delete('/api/repositories/:id', async (req, res) => {
     try {
          const { id } = req.params;
          const result = await pool.query('DELETE FROM repositories WHERE id = $1 RETURNING *', [id]);

          if (result.rows.length === 0) {
               return res.status(404).json({
                    error: 'Repository not found',
                    message: 'The specified repository does not exist',
               });
          }

          res.json({
               message: 'Repository deleted successfully',
               deleted_repository: result.rows[0],
          });
     } catch (error) {
          console.error('Delete error:', error);
          res.status(500).json({
               error: 'Database error',
               message: 'Failed to delete repository',
          });
     }
});

app.use((err, req, res, next) => {
     console.error(err.stack);
     res.status(500).json({
          error: 'Something went wrong!',
          message: 'Internal server error',
     });
});

app.use('*', (req, res) => {
     res.status(404).json({
          error: 'Route not found',
          message: 'The requested endpoint does not exist',
     });
});

const startServer = async () => {
     await initDB();
     app.listen(PORT, () => {
          console.log(` Server running on port ${PORT}`);
          console.log(` Health check: http://localhost:${PORT}/api/health`);
     });
};

startServer().catch(console.error);

process.on('SIGTERM', async () => {
     console.log('SIGTERM received, shutting down gracefully');
     await pool.end();
     process.exit(0);
});

process.on('SIGINT', async () => {
     console.log('SIGINT received, shutting down gracefully');
     await pool.end();
     process.exit(0);
});