-- Insert a dummy test user for development
-- Password hash for "testpass123" using bcrypt
INSERT INTO users (email, display_name, password_hash, role, is_active)
VALUES (
  'test@example.com',
  'Test User',
  '$2a$10$USpb95RIZdbu8k84i4E6hexEqHo9odaC/S0r7hwZciAjv0.Ovk986',
  'member',
  true
)
ON CONFLICT (email) DO NOTHING;
