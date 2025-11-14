const express = require('express');
const exphbs = require('express-handlebars');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

// Configure Handlebars
app.engine('hbs', exphbs.engine({
    extname: '.hbs',
    defaultLayout: false,
    helpers: {
        json: function (context) {
            return JSON.stringify(context);
        }
    }
}));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files
app.use(express.static(__dirname));
app.use('/images', express.static(path.join(__dirname, 'public/images')));
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/js', express.static(path.join(__dirname, 'public/js')));

// Function to scan logos folder and get sponsors
function getSponsors() {
    const logosDir = path.join(__dirname, 'logos');
    const sponsors = [];
    // Ordered by tier: highest to lowest
    const tiers = ['platinum', 'gold', 'silver', 'bronze'];

    tiers.forEach(tier => {
        const tierDir = path.join(logosDir, tier);
        if (fs.existsSync(tierDir) && fs.statSync(tierDir).isDirectory()) {
            try {
                const files = fs.readdirSync(tierDir);
                const imageFiles = files.filter(file => {
                    const filePath = path.join(tierDir, file);
                    if (!fs.statSync(filePath).isFile()) return false;
                    const ext = path.extname(file).toLowerCase();
                    return ['.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp'].includes(ext);
                });

                imageFiles.forEach(file => {
                    const name = path.basename(file, path.extname(file));
                    // Format name: replace dashes/underscores with spaces, capitalize words
                    const formattedName = name
                        .replace(/[-_]/g, ' ')
                        .replace(/\b\w/g, l => l.toUpperCase())
                        .trim();

                    sponsors.push({
                        name: formattedName || name,
                        tier: tier.toUpperCase(),
                        logo: `/logos/${tier}/${file}`
                    });
                });
            } catch (err) {
                console.error(`Error reading ${tier} directory:`, err.message);
            }
        }
    });

    return sponsors;
}

// Route to serve the main page
app.get('/', (req, res) => {
    const sponsors = getSponsors();
    // Event dates - update these with actual event dates
    // Using ISO strings so they can be serialized to JSON
    const eventDates = {
        start: '2025-11-14T08:00:00', // Code Camp start date/time
        dayCampEnd: '2025-11-14T17:00:00', // Day Camp end date/time
        camp24End: '2025-11-15T08:00:00' // 24 HR Camp end date/time
    };
    res.render('index', { sponsors, eventDates });
});

// Route to serve the admin panel
app.get('/admin-cc-25-panel', (req, res) => {
    res.render('admin');
});

// Route to serve the game page
app.get('/game', (req, res) => {
    res.render('game');
});

// Game state
let gameState = {
    active: false,
    currentGame: null, // Selected game ID
    currentQuestion: null,
    questionIndex: 0,
    players: new Map(), // sessionToken -> { score, name, socketId, sessionToken }
    answers: new Map(), // sessionToken -> answerIndex
    startTime: null,
    questionTimeout: null, // Store timeout ID for current question
    adminSockets: new Set(), // socketId -> Set of admin panel socket IDs
    displaySockets: new Set() // socketId -> Set of display/game screen socket IDs
};

// Generate random user name
function generateUserName() {
    const colors = ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange', 'Pink', 'Cyan', 'Magenta', 'Lime', 'Teal', 'Violet'];
    const animals = ['Lion', 'Tiger', 'Bear', 'Eagle', 'Shark', 'Dolphin', 'Wolf', 'Fox', 'Rabbit', 'Deer', 'Hawk', 'Panther'];
    const languages = ['JavaScript', 'Python', 'Java', 'C++', 'Ruby', 'Go', 'Rust', 'Swift', 'Kotlin', 'TypeScript', 'PHP', 'C#'];
    
    const color = colors[Math.floor(Math.random() * colors.length)];
    const animal = animals[Math.floor(Math.random() * animals.length)];
    const language = languages[Math.floor(Math.random() * languages.length)];
    
    return `${color}${animal}${language}`;
}

// Generate session token
function generateSessionToken() {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Load game data
let gameData = { games: [] };
try {
    const gameDataPath = path.join(__dirname, 'public', 'js', 'game-data.js');
    const gameDataContent = fs.readFileSync(gameDataPath, 'utf8');
    
    // Extract gameData object using regex - match from "const gameData = {" to the closing "};" before "if"
    const startMarker = 'const gameData = ';
    const startIdx = gameDataContent.indexOf(startMarker);
    if (startIdx !== -1) {
        let braceCount = 0;
        let inString = false;
        let stringChar = null;
        let i = startIdx + startMarker.length;
        
        // Find the matching closing brace
        for (; i < gameDataContent.length; i++) {
            const char = gameDataContent[i];
            
            if (!inString && (char === '"' || char === "'")) {
                inString = true;
                stringChar = char;
            } else if (inString && char === stringChar && gameDataContent[i - 1] !== '\\') {
                inString = false;
                stringChar = null;
            } else if (!inString) {
                if (char === '{') braceCount++;
                if (char === '}') {
                    braceCount--;
                    if (braceCount === 0) {
                        // Found the closing brace
                        const gameDataStr = gameDataContent.substring(startIdx + startMarker.length, i + 1);
                        gameData = eval('(' + gameDataStr + ')');
                        break;
                    }
                }
            }
        }
    }
    
    if (!gameData.games || gameData.games.length === 0) {
        throw new Error('No games loaded');
    }
    
    console.log(`Loaded ${gameData.games.length} game(s)`);
    gameData.games.forEach(game => {
        console.log(`  - ${game.name}: ${game.questions.length} questions`);
    });
} catch (error) {
    console.error('Error loading game data:', error);
    console.log('Using fallback game data');
    // Fallback: hardcode games if loading fails
    gameData = {
        games: [
            {
                id: 'codecamp-quiz',
                name: 'CodeCamp Quiz',
                description: 'Programming and web development quiz',
                questions: [
            {
                id: 1,
                question: "What does HTML stand for?",
                answers: [
                    { text: "HyperText Markup Language", correct: true },
                    { text: "High Tech Modern Language", correct: false },
                    { text: "Home Tool Markup Language", correct: false },
                    { text: "Hyperlink Text Markup Language", correct: false }
                ],
                points: 10
            },
            {
                id: 2,
                question: "Which programming language is known as the 'language of the web'?",
                answers: [
                    { text: "Python", correct: false },
                    { text: "JavaScript", correct: true },
                    { text: "Java", correct: false },
                    { text: "C++", correct: false }
                ],
                points: 10
            },
            {
                id: 3,
                question: "What is the correct way to declare a variable in JavaScript?",
                answers: [
                    { text: "var myVar = 5;", correct: true },
                    { text: "variable myVar = 5;", correct: false },
                    { text: "v myVar = 5;", correct: false },
                    { text: "declare myVar = 5;", correct: false }
                ],
                points: 10
            },
            {
                id: 4,
                question: "What does CSS stand for?",
                answers: [
                    { text: "Computer Style Sheets", correct: false },
                    { text: "Creative Style Sheets", correct: false },
                    { text: "Cascading Style Sheets", correct: true },
                    { text: "Colorful Style Sheets", correct: false }
                ],
                points: 10
            },
            {
                id: 5,
                question: "Which method is used to add an element to the end of an array in JavaScript?",
                answers: [
                    { text: "push()", correct: true },
                    { text: "add()", correct: false },
                    { text: "append()", correct: false },
                    { text: "insert()", correct: false }
                ],
                points: 10
            },
            {
                id: 6,
                question: "What is the purpose of Git?",
                answers: [
                    { text: "To write code", correct: false },
                    { text: "To manage code versions", correct: true },
                    { text: "To compile code", correct: false },
                    { text: "To debug code", correct: false }
                ],
                points: 10
            },
            {
                id: 7,
                question: "Which HTTP method is used to retrieve data?",
                answers: [
                    { text: "POST", correct: false },
                    { text: "PUT", correct: false },
                    { text: "GET", correct: true },
                    { text: "DELETE", correct: false }
                ],
                points: 10
            },
            {
                id: 8,
                question: "What does API stand for?",
                answers: [
                    { text: "Application Programming Interface", correct: true },
                    { text: "Advanced Programming Interface", correct: false },
                    { text: "Application Program Integration", correct: false },
                    { text: "Automated Programming Interface", correct: false }
                ],
                points: 10
            },
            {
                id: 9,
                question: "Which symbol is used for comments in JavaScript?",
                answers: [
                    { text: "//", correct: true },
                    { text: "<!-- -->", correct: false },
                    { text: "#", correct: false },
                    { text: "/* */", correct: false }
                ],
                points: 10
            },
            {
                id: 10,
                question: "What is the result of: console.log(typeof null)?",
                answers: [
                    { text: "null", correct: false },
                    { text: "undefined", correct: false },
                    { text: "object", correct: true },
                    { text: "number", correct: false }
                ],
                points: 10
            }
                ]
            }
        ]
    };
    console.log(`Using fallback: ${gameData.games.length} game(s)`);
}

// WebSocket connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    // Check the referer/request headers to identify connection type
    const referer = socket.handshake.headers.referer || '';
    const isAdmin = referer.includes('/admin');
    const isGame = referer.includes('/game');
    const isDisplay = referer.includes('/') && !isAdmin && !isGame; // Main display page
    
    if (isDisplay) {
        gameState.displaySockets.add(socket.id);
        console.log('Display screen connected:', socket.id);
    } else if (isAdmin) {
        gameState.adminSockets.add(socket.id);
        console.log('Admin panel connected:', socket.id);
        // Send initial player list to admin
        sendPlayerUpdateToSocket(socket);
        // Send game list to admin
        const adminSocket = io.sockets.sockets.get(socket.id);
        if (adminSocket) {
            const gameListData = {
                games: gameData.games.map(g => ({
                    id: g.id,
                    name: g.name,
                    description: g.description,
                    questionCount: g.questions.length
                })),
                selectedGame: gameState.currentGame
            };
            adminSocket.emit('game-list-update', gameListData);
        }
    }

    // Mark this socket as admin panel when it sends admin-specific events
    socket.on('media-control', (data) => {
        // This is an admin panel action, mark socket as admin
        gameState.adminSockets.add(socket.id);
        
        // Broadcast to all clients except sender
        socket.broadcast.emit('media-command', data);
        console.log('Media command:', data);
    });

    socket.on('notification', (data) => {
        // This is an admin panel action, mark socket as admin
        gameState.adminSockets.add(socket.id);
        
        // Generate ID if not provided
        if (!data.id) {
            data.id = `notif-${Date.now()}-${socket.id}`;
        }
        // Broadcast notification to all clients except sender
        socket.broadcast.emit('notification', data);
        console.log('Notification:', data);
    });

    socket.on('dismiss-notification', (data) => {
        // This is an admin panel action, mark socket as admin
        gameState.adminSockets.add(socket.id);
        
        // Broadcast dismiss command to all clients except sender
        socket.broadcast.emit('dismiss-notification', data);
        console.log('Dismiss notification:', data);
    });

    socket.on('ticker-update', (data) => {
        // This is an admin panel action, mark socket as admin
        gameState.adminSockets.add(socket.id);
        
        // Broadcast ticker update to all clients
        io.emit('ticker-update', data);
        console.log('Ticker updated:', data.announcements);
    });

    // Game handlers
    socket.on('game-join', (data) => {
        const { sessionToken } = data; // Client may send existing token
        
        // Don't register display screens as players
        if (gameState.displaySockets.has(socket.id)) {
            console.log('Display screen attempted to join as player, ignoring:', socket.id);
            return;
        }
        
        // Don't register admin panels as players
        if (gameState.adminSockets.has(socket.id)) {
            console.log('Admin panel attempted to join as player, ignoring:', socket.id);
            return;
        }
        
        let playerToken = sessionToken;
        let playerName;
        
        // Check if this is a reconnection with existing token
        if (sessionToken && gameState.players.has(sessionToken)) {
            // Reconnecting player - update socket ID
            const player = gameState.players.get(sessionToken);
            player.socketId = socket.id;
            playerName = player.name;
            console.log('Player reconnected:', playerName, 'Token:', sessionToken);
        } else {
            // New player - generate token and name
            playerToken = generateSessionToken();
            playerName = generateUserName();
            gameState.players.set(playerToken, {
                score: 0,
                name: playerName,
                socketId: socket.id,
                sessionToken: playerToken
            });
            console.log('New player joined:', playerName, 'Token:', playerToken);
        }
        
        // Send session token and name to client
        socket.emit('game-joined', {
            sessionToken: playerToken,
            userName: playerName
        });
        
        // Send notification when new player joins (only for new players, not reconnects)
        if (!sessionToken || !gameState.players.has(sessionToken)) {
            io.emit('notification', {
                type: 'info',
                title: 'Player Joined',
                message: `${playerName} joined the game!`,
                id: `notif-join-${Date.now()}-${socket.id}`,
                autoDismiss: 5000 // Auto-dismiss after 5 seconds
            });
        }
        
        // Broadcast updated player count to admin panels only
        broadcastPlayerUpdate();
    });

    socket.on('game-start', (data) => {
        // This is an admin panel action, mark socket as admin
        gameState.adminSockets.add(socket.id);
        
        console.log('Game start requested');
        if (gameState.active) {
            console.log('Game already active');
            return;
        }
        
        const gameId = data?.gameId || gameState.currentGame || (gameData.games.length > 0 ? gameData.games[0].id : null);
        
        if (!gameId) {
            console.error('No game selected');
            socket.emit('game-error', { message: 'No game selected' });
            return;
        }
        
        const selectedGame = gameData.games.find(g => g.id === gameId);
        if (!selectedGame) {
            console.error('Game not found:', gameId);
            socket.emit('game-error', { message: `Game "${gameId}" not found` });
            return;
        }
        
        if (!selectedGame.questions || selectedGame.questions.length === 0) {
            console.error('No questions in selected game');
            socket.emit('game-error', { message: 'Selected game has no questions' });
            return;
        }
        
        gameState.currentGame = gameId;
        console.log(`Starting game: ${selectedGame.name} with ${selectedGame.questions.length} questions`);
        console.log(`Players in game: ${gameState.players.size}`);
        gameState.active = true;
        gameState.questionIndex = 0;
        gameState.answers.clear();
        gameState.players.forEach(player => player.score = 0);
        
        // Show game window on all displays
        io.emit('game-command', { action: 'show' });
        console.log('Game window shown, starting first question');
        
        // Start first question
        startNextQuestion();
    });
    
    socket.on('game-select', (data) => {
        // This is an admin panel action, mark socket as admin
        gameState.adminSockets.add(socket.id);
        
        const { gameId } = data;
        if (gameId && gameData.games.find(g => g.id === gameId)) {
            gameState.currentGame = gameId;
            console.log('Game selected:', gameId);
            // Broadcast to all admin panels
            broadcastGameList();
        }
    });

    socket.on('game-answer', (data) => {
        const { sessionToken, questionId, answerIndex } = data;
        
        if (!sessionToken || !gameState.players.has(sessionToken)) {
            console.log('Invalid session token:', sessionToken);
            return;
        }
        
        if (!gameState.active || gameState.answers.has(sessionToken)) {
            return; // Already answered or game not active
        }

        const selectedGame = gameData.games.find(g => g.id === gameState.currentGame);
        if (!selectedGame) return;
        
        const question = selectedGame.questions.find(q => q.id === questionId);
        if (!question) return;

        const isCorrect = question.answers[answerIndex].correct;
        
        // Calculate points based on time
        let points = 0;
        if (isCorrect) {
            const elapsedSeconds = Math.floor((Date.now() - gameState.startTime) / 1000);
            const basePoints = 50;
            
            // Calculate time penalty
            // Every second: -1 point
            // Every 10 seconds: penalty multiplier increases by 1.5x
            let timePenalty = 0;
            let currentMultiplier = 1.0;
            
            // Calculate penalty for each second
            for (let second = 1; second <= elapsedSeconds; second++) {
                // Increase multiplier every 10 seconds (at 10, 20, 30, etc.)
                if (second % 10 === 0 && second > 0) {
                    currentMultiplier *= 1.5;
                }
                
                // Apply penalty for this second
                timePenalty += currentMultiplier;
            }
            
            points = Math.max(0, Math.floor(basePoints - timePenalty));
        }
        
        gameState.answers.set(sessionToken, answerIndex);
        
        const player = gameState.players.get(sessionToken);
        if (player) {
            player.score += points;
        }

        socket.emit('game-answer-result', {
            correct: isCorrect,
            points: points,
            timeElapsed: Math.floor((Date.now() - gameState.startTime) / 1000)
        });

        // Check if all players have answered
        checkIfAllPlayersAnswered();
    });

    socket.on('game-stop', () => {
        // This is an admin panel action, mark socket as admin
        gameState.adminSockets.add(socket.id);
        
        gameState.active = false;
        // Hide game window
        io.emit('game-command', { action: 'hide' });
        // Show leaderboard if game was active
        if (gameState.currentGame) {
            showLeaderboard();
        }
    });

    socket.on('game-window-toggle', () => {
        // This is an admin panel action, mark socket as admin
        gameState.adminSockets.add(socket.id);
        
        console.log('Game window toggle requested');
        io.emit('game-window-toggle');
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        
        // Remove from admin sockets if it was an admin
        const wasAdmin = gameState.adminSockets.delete(socket.id);
        
        // Remove from display sockets if it was a display
        const wasDisplay = gameState.displaySockets.delete(socket.id);
        
        if (wasDisplay) {
            console.log('Display screen disconnected:', socket.id);
            return; // Don't process as player disconnect
        }
        
        if (wasAdmin) {
            console.log('Admin panel disconnected:', socket.id);
            return; // Don't process as player disconnect
        }
        
        // Check if this was a game player and remove them
        let playerRemoved = false;
        for (const [sessionToken, player] of gameState.players.entries()) {
            if (player.socketId === socket.id) {
                // Keep player in list for leaderboard, but mark as disconnected
                // Remove socket ID so they can reconnect with same token
                console.log('Player disconnected:', player.name, 'Token:', sessionToken);
                player.socketId = null; // Mark as disconnected but keep for leaderboard
                playerRemoved = true;
                break;
            }
        }
        
        // Broadcast updated player count to admin panels only
        if (playerRemoved) {
            broadcastPlayerUpdate();
        }
    });
});

function startNextQuestion() {
    if (!gameState.currentGame) {
        console.error('No game selected');
        return;
    }
    
    const selectedGame = gameData.games.find(g => g.id === gameState.currentGame);
    if (!selectedGame) {
        console.error('Selected game not found');
        return;
    }
    
    console.log(`Starting question ${gameState.questionIndex + 1} of ${selectedGame.questions.length}`);
    
    if (!selectedGame.questions || gameState.questionIndex >= selectedGame.questions.length) {
        // Game over - show leaderboard and wait for admin
        console.log('Game over - no more questions, showing leaderboard');
        gameState.active = false;
        // Don't hide the game window - show leaderboard instead
        showLeaderboard();
        return;
    }

    const question = selectedGame.questions[gameState.questionIndex];
    if (!question) {
        console.error(`Question ${gameState.questionIndex} not found`);
        return;
    }
    
    console.log(`Question: ${question.question}`);
    gameState.currentQuestion = question;
    gameState.answers.clear();
    gameState.startTime = Date.now();

    // Clear any existing timeout
    if (gameState.questionTimeout) {
        clearTimeout(gameState.questionTimeout);
        gameState.questionTimeout = null;
    }

    // Send question to all players
    io.emit('game-question', {
        id: question.id,
        question: question.question,
        answers: question.answers.map(a => ({ text: a.text })),
        questionNumber: gameState.questionIndex + 1,
        totalQuestions: selectedGame.questions.length
    });

    // Show question on display
    io.emit('game-display-question', {
        id: question.id,
        question: question.question,
        answers: question.answers.map(a => ({ text: a.text })),
        questionNumber: gameState.questionIndex + 1,
        totalQuestions: selectedGame.questions.length
    });

    // Set timeout for 30 seconds as fallback
    gameState.questionTimeout = setTimeout(() => {
        console.log('Question timeout - moving to next question');
        advanceToNextQuestion();
    }, 30000);
}

function checkIfAllPlayersAnswered() {
    const totalPlayers = gameState.players.size;
    const answeredPlayers = gameState.answers.size;
    
    console.log(`Players answered: ${answeredPlayers} / ${totalPlayers}`);
    
    if (totalPlayers > 0 && answeredPlayers >= totalPlayers) {
        console.log('All players have answered - moving to next question');
        // Clear the timeout since all players answered
        if (gameState.questionTimeout) {
            clearTimeout(gameState.questionTimeout);
            gameState.questionTimeout = null;
        }
        // Wait 2 seconds to show results, then advance
        setTimeout(() => {
            advanceToNextQuestion();
        }, 2000);
    }
}

function advanceToNextQuestion() {
    showQuestionResults();
    gameState.questionIndex++;
    
    const selectedGame = gameData.games.find(g => g.id === gameState.currentGame);
    if (selectedGame && gameState.questionIndex < selectedGame.questions.length) {
        setTimeout(() => startNextQuestion(), 3000); // 3 second break between questions
    } else {
        // Game is over - show leaderboard and wait for admin to end
        gameState.active = false;
        console.log('All questions completed - showing leaderboard');
        setTimeout(() => {
            showLeaderboard();
        }, 3000);
    }
}

function showQuestionResults() {
    const question = gameState.currentQuestion;
    const correctAnswerIndex = question.answers.findIndex(a => a.correct);
    
    io.emit('game-question-results', {
        correctAnswerIndex,
        answers: gameState.answers
    });
}

function showLeaderboard() {
    console.log('Showing leaderboard...');
    const players = Array.from(gameState.players.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map((player, index) => ({
            rank: index + 1,
            name: player.name,
            score: player.score
        }));

    console.log(`Leaderboard: ${players.length} players`);
    console.log('Top players:', players.map(p => `${p.name}: ${p.score}`).join(', '));
    
    // Send leaderboard to all clients (display and players)
    io.emit('game-leaderboard', { players });
    
    // Also send to display screens to show in game window
    io.emit('game-display-leaderboard', { players });
}

// Helper function to broadcast player updates to admin panels only
function broadcastPlayerUpdate() {
    const playerData = {
        totalPlayers: gameState.players.size,
        players: Array.from(gameState.players.values())
            .filter(p => p.socketId !== null) // Only show connected players
            .map(p => p.name)
    };
    
    // Send to all admin sockets
    gameState.adminSockets.forEach(socketId => {
        const adminSocket = io.sockets.sockets.get(socketId);
        if (adminSocket) {
            adminSocket.emit('game-players-update', playerData);
        }
    });
    
    console.log(`Broadcasted player update to ${gameState.adminSockets.size} admin panel(s):`, playerData);
}

// Helper function to send player update to a specific socket
function sendPlayerUpdateToSocket(socket) {
    const playerData = {
        totalPlayers: gameState.players.size,
        players: Array.from(gameState.players.values())
            .filter(p => p.socketId !== null) // Only show connected players
            .map(p => p.name)
    };
    socket.emit('game-players-update', playerData);
}

// Helper function to broadcast game list to admin panels
function broadcastGameList() {
    const gameListData = {
        games: gameData.games.map(g => ({
            id: g.id,
            name: g.name,
            description: g.description,
            questionCount: g.questions.length
        })),
        selectedGame: gameState.currentGame
    };
    
    gameState.adminSockets.forEach(socketId => {
        const adminSocket = io.sockets.sockets.get(socketId);
        if (adminSocket) {
            adminSocket.emit('game-list-update', gameListData);
        }
    });
    
    console.log(`Broadcasted game list to ${gameState.adminSockets.size} admin panel(s)`);
}

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Admin panel available at http://localhost:${PORT}/admin`);
});

