# SporzaPlanner - VRT Sports Planning Tool

A production-ready sports event planning and management system for VRT (Flemish public broadcaster).

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│    Backend      │────▶│   PostgreSQL    │
│   (React/Vite)  │     │   (Node.js)     │     │   Database      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │
        │    WebSocket          │
        └───────────────────────┘
         Real-time updates
```

## Tech Stack

### Frontend
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **TailwindCSS** - Styling
- **Socket.io-client** - Real-time updates

### Backend
- **Node.js + Express** - API server
- **TypeScript** - Type safety
- **Prisma** - ORM & database migrations
- **PostgreSQL** - Database
- **Socket.io** - WebSocket server
- **Passport** - Authentication (OAuth/SSO)

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 16+
- Docker (optional)

### Development Setup

1. **Clone and install dependencies**
   ```bash
   # Frontend
   npm install
   
   # Backend
   cd backend
   npm install
   ```

2. **Configure environment**
   ```bash
   # Frontend
   cp .env.example .env
   
   # Backend
   cd backend
   cp .env.example .env
   # Edit .env with your database credentials
   ```

3. **Set up database**
   ```bash
   cd backend
   npm run db:push      # Create database schema
   npm run db:seed      # Seed initial data
   ```

4. **Start development servers**
   ```bash
   # Terminal 1 - Backend (port 3001)
   cd backend
   npm run dev
   
   # Terminal 2 - Frontend (port 5173)
   npm run dev
   ```

5. **Access the application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3001
   - API Health: http://localhost:3001/health

### Docker Deployment

1. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with production values
   ```

2. **Build and run**
   ```bash
   docker-compose up -d
   ```

3. **Run migrations**
   ```bash
   docker-compose exec backend npx prisma migrate deploy
   ```

## Project Structure

```
sporza-planner/
├── src/                    # Frontend source
│   ├── components/         # React components
│   │   ├── ui/            # Reusable UI components
│   │   └── forms/         # Form components
│   ├── views/             # Page views
│   ├── hooks/             # Custom React hooks
│   ├── utils/             # Utility functions
│   ├── data/              # Types and constants
│   └── styles/            # CSS styles
├── backend/               # Backend source
│   ├── src/
│   │   ├── routes/        # API routes
│   │   ├── middleware/    # Express middleware
│   │   ├── services/      # Business logic
│   │   ├── db/            # Database client
│   │   └── utils/         # Utilities
│   └── prisma/            # Database schema & migrations
├── docker/                # Docker configuration files
└── docker-compose.yml     # Multi-container setup
```

## API Endpoints

### Authentication
- `GET /api/auth/login` - OAuth login redirect
- `GET /api/auth/callback` - OAuth callback
- `GET /api/auth/me` - Current user
- `POST /api/auth/logout` - Logout
- `POST /api/auth/dev-login` - Dev login (non-production)

### Events
- `GET /api/events` - List events (filterable)
- `GET /api/events/:id` - Get event details
- `POST /api/events` - Create event
- `PUT /api/events/:id` - Update event
- `DELETE /api/events/:id` - Delete event

### Sports & Competitions
- `GET /api/sports` - List sports
- `GET /api/competitions` - List competitions

### Tech Plans
- `GET /api/tech-plans` - List tech plans
- `POST /api/tech-plans` - Create tech plan
- `PUT /api/tech-plans/:id` - Update tech plan
- `PATCH /api/tech-plans/:id/encoder` - Swap encoder

### Contracts
- `GET /api/contracts` - List contracts
- `GET /api/contracts/expiring` - Expiring contracts

### Encoders
- `GET /api/encoders` - List encoders with usage

## WebSocket Events

The application uses WebSockets for real-time updates:

- `event:created` - New event created
- `event:updated` - Event updated
- `event:deleted` - Event deleted
- `techPlan:created` - Tech plan created
- `techPlan:updated` - Tech plan updated
- `encoder:swapped` - Encoder reassigned

## Environment Variables

### Frontend (.env)
```
VITE_API_URL=http://localhost:3001/api
```

### Backend (.env)
```
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://user:pass@localhost:5432/sporza_planner
JWT_SECRET=your-jwt-secret
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:5173

# OAuth Configuration
OAUTH_CLIENT_ID=
OAUTH_CLIENT_SECRET=
OAUTH_AUTHORIZATION_URL=
OAUTH_TOKEN_URL=
OAUTH_USER_INFO_URL=
OAUTH_CALLBACK_URL=
```

## Roles & Permissions

| Role | Events | Tech Plans | Contracts | Admin |
|------|--------|------------|-----------|-------|
| planner | ✓ | ✗ | ✗ | ✗ |
| sports | ✓ | ✓ | ✗ | ✗ |
| contracts | ✗ | ✗ | ✓ | ✗ |
| admin | ✓ | ✓ | ✓ | ✓ |

## License

Proprietary - VRT (Vlaamse Radio- en Televisieomroep)
# AirSporza
