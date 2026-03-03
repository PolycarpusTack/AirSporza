-- Run these commands in psql or pgAdmin to set up the database

-- Create user (if doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'sporza') THEN
        CREATE USER sporza WITH PASSWORD 'sporza123';
    END IF;
END
$$;

-- Create database
CREATE DATABASE sporza_planner OWNER sporza;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE sporza_planner TO sporza;

-- Connect to the database and grant schema permissions
\c sporza_planner
GRANT ALL ON SCHEMA public TO sporza;
