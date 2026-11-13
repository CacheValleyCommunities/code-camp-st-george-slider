const socket = createSocket("/ws/game");
let sessionToken = localStorage.getItem("game-session-token");
let currentScore = 0;
let currentQuestion = null;
let selectedAnswer = null;
let countdownInterval = null;

socket.on("connect", () => {
    socket.emit("game-join", { sessionToken: sessionToken });
});

socket.on("game-joined", (data) => {
    sessionToken = data.sessionToken;
    localStorage.setItem("game-session-token", sessionToken);
    document.getElementById("user-id").textContent = data.userName;
    document.getElementById("status-message").textContent = "Joined. Waiting for the next question...";
});

socket.on("game-question", (data) => {
    currentQuestion = data;
    selectedAnswer = null;
    document.getElementById("status-message").style.display = "none";
    document.getElementById("question-container").style.display = "block";
    document.getElementById("score-display").style.display = "block";
    document.getElementById("question-text").textContent = data.question;

    const answersGrid = document.getElementById("answers-grid");
    answersGrid.replaceChildren();
    data.answers.forEach((answer, index) => {
        const button = document.createElement("button");
        button.className = "answer-button";
        button.type = "button";
        button.textContent = answer.text;
        button.addEventListener("click", () => selectAnswer(index));
        answersGrid.appendChild(button);
    });
    startCountdown(data.timeLeft || 30);
});

socket.on("game-answer-result", (data) => {
    const buttons = document.querySelectorAll(".answer-button");
    buttons.forEach((button, index) => {
        button.classList.add("disabled");
        if (index === data.correctAnswerIndex) {
            button.classList.add("correct");
        } else if (index === selectedAnswer) {
            button.classList.add("incorrect");
        }
        if (data.correct && index === selectedAnswer && data.points > 0) {
            currentScore += data.points;
            button.textContent += ` (+${data.points} pts)`;
        }
    });
    document.getElementById("score-value").textContent = String(currentScore);
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
});

socket.on("game-end", () => {
    document.getElementById("question-container").style.display = "none";
    const status = document.getElementById("status-message");
    status.style.display = "block";
    status.textContent = `Game over. Your score: ${currentScore} points`;
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
});

function selectAnswer(index) {
    if (selectedAnswer !== null || !sessionToken || !currentQuestion) {
        return;
    }
    selectedAnswer = index;
    document.querySelectorAll(".answer-button").forEach((button, buttonIndex) => {
        button.classList.add(buttonIndex === index ? "selected" : "disabled");
    });
    socket.emit("game-answer", {
        questionId: currentQuestion.id,
        answerIndex: index
    });
}

function startCountdown(seconds) {
    const countdown = document.getElementById("countdown-display");
    let timeLeft = seconds;
    countdown.textContent = String(timeLeft);
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
    countdownInterval = setInterval(() => {
        timeLeft -= 1;
        countdown.textContent = String(timeLeft);
        if (timeLeft <= 0) {
            clearInterval(countdownInterval);
            countdownInterval = null;
            if (selectedAnswer === null) {
                selectAnswer(0);
            }
        }
    }, 1000);
}
