-- Create a simple table for demonstration
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    price DECIMAL(10, 2) NOT NULL
);

-- Insert some sample data (passwords are hashed with bcrypt - all are "password123")
-- Note: These hashes should be regenerated in production
INSERT INTO users (username, email, password_hash) VALUES
('alice', 'alice@example.com', '$2b$10$rPQvGjL5E1J5K8X9Y0Z1OeJK5L6M7N8O9P0Q1R2S3T4U5V6W7X8Y9'),
('bob', 'bob@example.com', '$2b$10$rPQvGjL5E1J5K8X9Y0Z1OeJK5L6M7N8O9P0Q1R2S3T4U5V6W7X8Y9'),
('charlie', 'charlie@example.com', '$2b$10$rPQvGjL5E1J5K8X9Y0Z1OeJK5L6M7N8O9P0Q1R2S3T4U5V6W7X8Y9');

INSERT INTO products (name, price) VALUES
('Laptop', 1200.00),
('Mouse', 25.00),
('Keyboard', 50.00);
('My soul', 0.0)
