// Game data - Multiple games support
const gameData = {
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
        },
        {
            id: 'general-knowledge',
            name: 'General Knowledge',
            description: 'Test your general knowledge',
            questions: [
                {
                    id: 1,
                    question: "What is the capital of France?",
                    answers: [
                        { text: "London", correct: false },
                        { text: "Berlin", correct: false },
                        { text: "Paris", correct: true },
                        { text: "Madrid", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 2,
                    question: "How many continents are there?",
                    answers: [
                        { text: "5", correct: false },
                        { text: "6", correct: false },
                        { text: "7", correct: true },
                        { text: "8", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 3,
                    question: "What is the largest ocean?",
                    answers: [
                        { text: "Atlantic Ocean", correct: false },
                        { text: "Indian Ocean", correct: false },
                        { text: "Pacific Ocean", correct: true },
                        { text: "Arctic Ocean", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 4,
                    question: "What year did World War II end?",
                    answers: [
                        { text: "1943", correct: false },
                        { text: "1944", correct: false },
                        { text: "1945", correct: true },
                        { text: "1946", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 5,
                    question: "What is the chemical symbol for gold?",
                    answers: [
                        { text: "Go", correct: false },
                        { text: "Gd", correct: false },
                        { text: "Au", correct: true },
                        { text: "Ag", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 6,
                    question: "Who painted the Mona Lisa?",
                    answers: [
                        { text: "Vincent van Gogh", correct: false },
                        { text: "Leonardo da Vinci", correct: true },
                        { text: "Pablo Picasso", correct: false },
                        { text: "Michelangelo", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 7,
                    question: "What is the smallest planet in our solar system?",
                    answers: [
                        { text: "Mars", correct: false },
                        { text: "Venus", correct: false },
                        { text: "Mercury", correct: true },
                        { text: "Earth", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 8,
                    question: "How many sides does a hexagon have?",
                    answers: [
                        { text: "5", correct: false },
                        { text: "6", correct: true },
                        { text: "7", correct: false },
                        { text: "8", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 9,
                    question: "What is the speed of light?",
                    answers: [
                        { text: "300,000 km/s", correct: true },
                        { text: "150,000 km/s", correct: false },
                        { text: "450,000 km/s", correct: false },
                        { text: "600,000 km/s", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 10,
                    question: "What is the largest mammal?",
                    answers: [
                        { text: "Elephant", correct: false },
                        { text: "Blue Whale", correct: true },
                        { text: "Giraffe", correct: false },
                        { text: "Hippopotamus", correct: false }
                    ],
                    points: 10
                }
            ]
        }
    ]
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = gameData;
} else {
    window.gameData = gameData;
}

