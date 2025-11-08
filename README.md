# CodeCamp 2025 Event Display System

A comprehensive event display and interactive quiz system for CodeCamp 2025, featuring sponsor slides, real-time media control, interactive games, and a Linux desktop-themed interface.

## Features

### 🖥️ Main Display (`/`)
- **Sponsor Logo Slider**: Automatically cycles through sponsor logos organized by tier (Platinum, Gold, Silver, Bronze)
- **Media Window**: Remote-controlled video/image/text display with YouTube support
- **Event Countdown Timer**: Dynamic countdown showing time until Code Camp starts, Day Camp ends, and 24 HR Camp ends
- **Game Window**: Full-screen interactive quiz game display
- **Announcements Ticker**: Scrolling ticker for event announcements
- **System Notifications**: Real-time notifications with different types (info, success, warning, error)
- **Linux Desktop Theme**: Catppuccin-inspired color scheme with tiling window manager layout

### 🎮 Interactive Quiz Game (`/game`)
- **Multi-Player Quiz**: Real-time quiz game with multiple-choice questions
- **Session-Based Players**: Server-generated user names and session tokens
- **Time-Based Scoring**: Points decrease over time with penalty multipliers
- **Live Leaderboard**: Top 10 players displayed at game end
- **Mobile-Friendly**: Responsive design optimized for mobile devices

### ⚙️ Admin Panel (`/admin`)
- **Media Control**: Remote control for video, image, and text displays
- **Game Management**: Start/stop games, select from multiple game sets, toggle game window
- **Player Monitoring**: View connected players in real-time
- **Notification System**: Send custom or pre-canned notifications
- **Ticker Management**: Update event announcements ticker
- **Mobile-Friendly**: Fully responsive admin interface

## Tech Stack

- **Backend**: Node.js with Express.js
- **Templating**: Handlebars.js
- **Real-Time**: Socket.IO for WebSocket communication
- **Frontend**: Vanilla JavaScript, CSS3
- **Containerization**: Docker

## Installation

### Prerequisites
- Node.js 20+ (or use Docker)
- npm or yarn

### Local Development

1. Clone the repository:
```bash
git clone <repository-url>
cd code-camp-slider-2025
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

The application will be available at `http://localhost:3000`

### Docker Deployment

1. Build the Docker image:
```bash
docker build -t code-camp-slider-2025 .
```

2. Run the container:
```bash
docker run -p 8080:80 code-camp-slider-2025
```

The application will be available at `http://localhost:8080`

### Environment Variables

- `PORT`: Server port (default: 3000, Docker: 80)

## Project Structure

```
code-camp-slider-2025/
├── server.js              # Main Express server and Socket.IO setup
├── package.json           # Dependencies and scripts
├── Dockerfile            # Docker configuration
├── views/                # Handlebars templates
│   ├── index.hbs        # Main display page
│   ├── admin.hbs        # Admin control panel
│   └── game.hbs         # Player game interface
├── public/               # Static assets
│   ├── css/
│   │   └── styles.css   # Main stylesheet
│   └── js/
│       ├── script.js    # Main display JavaScript
│       └── game-data.js # Quiz game questions
└── logos/                # Sponsor logos organized by tier
    ├── platinum/
    ├── gold/
    ├── silver/
    └── bronze/
```

## Usage

### Adding Sponsor Logos

Place sponsor logo images in the appropriate tier folder:
- `logos/platinum/` - Platinum sponsors (1 minute display)
- `logos/gold/` - Gold sponsors (1 minute display)
- `logos/silver/` - Silver sponsors (30 seconds display)
- `logos/bronze/` - Bronze sponsors (15 seconds display)

Supported formats: PNG, JPG, JPEG, SVG, GIF, WEBP

### Configuring Event Dates

Edit `server.js` to update event dates:
```javascript
const eventDates = {
    start: '2025-01-15T09:00:00',      // Code Camp start
    dayCampEnd: '2025-01-15T17:00:00', // Day Camp end
    camp24End: '2025-01-16T09:00:00'   // 24 HR Camp end
};
```

### Adding Quiz Games

Edit `public/js/game-data.js` to add or modify quiz games:
```javascript
const gameData = {
    games: [
        {
            id: 'your-game-id',
            name: 'Your Game Name',
            description: 'Game description',
            questions: [
                {
                    id: 1,
                    question: "Your question?",
                    answers: [
                        { text: "Answer 1", correct: true },
                        { text: "Answer 2", correct: false },
                        // ...
                    ]
                }
                // ...
            ]
        }
    ]
};
```

## API Endpoints

- `GET /` - Main display page
- `GET /admin` - Admin control panel
- `GET /game` - Player game interface

## WebSocket Events

### Client → Server

**Media Control:**
- `media-control` - Control media window (show/hide/mode)

**Notifications:**
- `notification` - Send notification
- `dismiss-notification` - Dismiss notification

**Game Control:**
- `game-join` - Join game as player
- `game-start` - Start game (admin only)
- `game-stop` - Stop game (admin only)
- `game-select` - Select game (admin only)
- `game-answer` - Submit answer
- `game-window-toggle` - Toggle game window (admin only)

**Ticker:**
- `ticker-update` - Update announcements ticker (admin only)

### Server → Client

- `media-command` - Media window commands
- `notification` - Display notification
- `dismiss-notification` - Dismiss notification
- `game-joined` - Game join confirmation
- `game-question` - New question
- `game-answer-result` - Answer result
- `game-leaderboard` - Final leaderboard
- `game-players-update` - Player list update
- `game-list-update` - Available games list
- `ticker-update` - Ticker content update

## Features in Detail

### Sponsor Display
- Automatically loads logos from `logos/` directory
- Displays logos by tier with appropriate duration
- Smooth transitions between sponsors

### Media Window
- Supports YouTube URLs (auto-embeds)
- Supports direct video files
- Supports images
- Supports custom text content
- Remote controlled via admin panel

### Quiz Game System
- Server-managed game state
- Session-based player identification
- Time-based scoring with penalties
- Real-time updates via WebSocket
- Supports multiple game sets
- Auto-advances when all players answer

### Notifications
- Four types: info, success, warning, error
- Pre-canned notifications available
- Custom notifications supported
- Auto-dismiss option
- Manual dismissal

## Mobile Support

Both the admin panel and game interface are fully responsive and optimized for mobile devices:
- Touch-friendly buttons (minimum 44px height)
- Responsive layouts
- Optimized font sizes
- Landscape orientation support

## Deployment

### Coolify Deployment

The Dockerfile is configured for Coolify deployment:
- Exposes port 80
- Uses non-root user for security
- Includes health checks
- Production-ready configuration

### Environment Configuration

Set the `PORT` environment variable if deploying to a different port.

## Development

### Running in Development Mode

```bash
npm start
# or
npm run dev
```

### File Watching

For development with auto-reload, consider using `nodemon`:
```bash
npm install -g nodemon
nodemon server.js
```

## License

ISC

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Support

For issues or questions, please open an issue on the repository.

---

**CodeCamp 2025: Bring Your Genius** 🚀

