const socket = createSocket("/ws/admin");
const statusEl = document.getElementById("status");
const statusTextEl = document.getElementById("status-text");
let notificationType = "info";
let selectedGameId = "";

const canned = {
    "break-start": { type: "info", title: "Break Time", message: "Take a 15-minute break. Refreshments are in the lobby." },
    breakfast: { type: "success", title: "Breakfast", message: "Breakfast is being served." },
    lunch: { type: "success", title: "Lunch", message: "Lunch is being served." },
    dinner: { type: "success", title: "Dinner", message: "Dinner is being served." },
    "prize-time": { type: "info", title: "Prize Time", message: "Prize time. Make some noise." },
    joke: { type: "info", title: "Tech Humor", message: "Why do programmers prefer dark mode? Because light attracts bugs." }
};

socket.on("connect", () => {
    statusEl.classList.add("connected");
    statusTextEl.textContent = "Live link to the display";
});

socket.on("disconnect", () => {
    statusEl.classList.remove("connected");
    statusTextEl.textContent = "Display link disconnected";
});

function ready() {
    if (socket.connected) {
        return true;
    }
    alert("The dashboard is not connected yet.");
    return false;
}

function on(id, handler) {
    const element = document.getElementById(id);
    if (element) {
        element.addEventListener("click", handler);
    }
}

on("show-window", () => socket.emit("media-control", { action: "show" }));
on("hide-window", () => socket.emit("media-control", { action: "hide" }));
on("toggle-window", () => socket.emit("media-control", { action: "toggle" }));
on("show-video", () => {
    socket.emit("media-control", { action: "mode", mode: "video", url: document.getElementById("video-url").value.trim() });
});
on("show-image", () => {
    socket.emit("media-control", { action: "mode", mode: "image", url: document.getElementById("image-url").value.trim() });
});
on("show-text", () => {
    socket.emit("media-control", {
        action: "mode",
        mode: "text",
        title: document.getElementById("text-title").value.trim(),
        content: document.getElementById("text-content").value.trim()
    });
});

on("update-ticker", () => {
    if (!ready()) return;
    const lines = document.getElementById("ticker-announcements").value.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) {
        alert("Add at least one announcement.");
        return;
    }
    socket.emit("ticker-update", { announcements: lines });
});

on("clear-ticker", () => {
    document.getElementById("ticker-announcements").value = "Welcome to CodeCamp 2025!";
    socket.emit("ticker-update", { announcements: ["Welcome to CodeCamp 2025!"] });
});

document.querySelectorAll("[data-ticker]").forEach((button) => {
    button.addEventListener("click", () => {
        const box = document.getElementById("ticker-announcements");
        const current = box.value.trim();
        box.value = current ? current + "\n" + button.dataset.ticker : button.dataset.ticker;
    });
});

on("play-audio", () => {
    if (!ready()) return;
    const url = document.getElementById("youtube-audio-url").value.trim();
    if (!url.includes("youtube.com") && !url.includes("youtu.be")) {
        alert("Paste a YouTube link.");
        return;
    }
    socket.emit("youtube-audio", { action: "play", url: url });
});

on("stop-audio", () => socket.emit("youtube-audio", { action: "stop" }));

document.querySelectorAll("[data-audio]").forEach((button) => {
    button.addEventListener("click", () => {
        document.getElementById("youtube-audio-url").value = button.dataset.audio;
    });
});

document.querySelectorAll("[data-notif-type]").forEach((button) => {
    button.addEventListener("click", () => {
        notificationType = button.dataset.notifType;
        document.querySelectorAll("[data-notif-type]").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
    });
});

const cannedBox = document.getElementById("precanned");
if (cannedBox) {
    Object.keys(canned).forEach((key) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = canned[key].title;
        button.addEventListener("click", () => {
            const item = canned[key];
            socket.emit("notification", { type: item.type, title: item.title, message: item.message, id: "notif-" + Date.now() });
        });
        cannedBox.appendChild(button);
    });
}

on("send-notif", () => {
    const title = document.getElementById("notif-title").value.trim();
    const message = document.getElementById("notif-message").value.trim();
    if (!title && !message) {
        alert("Add a title or a message.");
        return;
    }
    socket.emit("notification", { type: notificationType, title: title, message: message, id: "notif-" + Date.now() });
    document.getElementById("notif-title").value = "";
    document.getElementById("notif-message").value = "";
});

on("dismiss-notifs", () => socket.emit("dismiss-notification", { id: "all" }));

const gameSelect = document.getElementById("game-select");
if (gameSelect) {
    gameSelect.addEventListener("change", () => {
        selectedGameId = gameSelect.value;
        if (selectedGameId) {
            socket.emit("game-select", { gameId: selectedGameId });
        }
    });
}

on("start-game", () => {
    const gameId = (gameSelect && gameSelect.value) || selectedGameId;
    if (!gameId) {
        alert("Choose a quiz first.");
        return;
    }
    socket.emit("game-start", { gameId: gameId });
});

on("stop-game", () => socket.emit("game-stop"));
on("toggle-game", () => socket.emit("game-window-toggle"));

socket.on("game-error", (data) => {
    const message = data && typeof data.message === "string" ? data.message : "Could not start the quiz.";
    alert(message);
});

socket.on("game-list-update", (data) => {
    if (!gameSelect) {
        return;
    }
    gameSelect.replaceChildren();
    const games = data && data.games ? data.games : [];
    if (games.length === 0) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "No quizzes available";
        gameSelect.appendChild(option);
        return;
    }
    games.forEach((game) => {
        const option = document.createElement("option");
        option.value = game.id;
        option.textContent = game.name + " (" + game.questionCount + " questions)";
        if (data.selectedGame === game.id) {
            option.selected = true;
            selectedGameId = game.id;
        }
        gameSelect.appendChild(option);
    });
    if (!selectedGameId && gameSelect.value) {
        selectedGameId = gameSelect.value;
    }
});

socket.on("game-players-update", (data) => {
    const count = document.getElementById("player-count");
    const list = document.getElementById("player-list");
    if (!count || !list) {
        return;
    }
    count.textContent = String(data.totalPlayers || 0);
    list.replaceChildren();
    const players = data.players || [];
    if (players.length === 0) {
        const empty = document.createElement("div");
        empty.className = "player";
        empty.textContent = "No players connected";
        list.appendChild(empty);
        return;
    }
    players.forEach((name, index) => {
        const item = document.createElement("div");
        item.className = "player";
        item.textContent = (index + 1) + ". " + name;
        list.appendChild(item);
    });
});

document.querySelectorAll("form[data-confirm]").forEach((form) => {
    form.addEventListener("submit", (event) => {
        if (!window.confirm(form.dataset.confirm)) {
            event.preventDefault();
        }
    });
});
