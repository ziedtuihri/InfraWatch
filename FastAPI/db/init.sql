-- Local PostgreSQL schema for login authentication
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Example user: username=admin, password=admin123
-- INSERT INTO users (username, password) VALUES ('admin', 'admin123');
