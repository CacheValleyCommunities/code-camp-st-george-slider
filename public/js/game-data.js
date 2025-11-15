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
        },
        {
            id: 'tech-history-beginner',
            name: 'Tech History - Beginner',
            description: 'Essential tech milestones everyone should know',
            difficulty: 'Easy',
            questions: [
                {
                    id: 1,
                    question: "What year was the first iPhone released?",
                    answers: [
                        { text: "2005", correct: false },
                        { text: "2007", correct: true },
                        { text: "2009", correct: false },
                        { text: "2010", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 2,
                    question: "Who created Linux?",
                    answers: [
                        { text: "Bill Gates", correct: false },
                        { text: "Steve Jobs", correct: false },
                        { text: "Linus Torvalds", correct: true },
                        { text: "Mark Zuckerberg", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 3,
                    question: "What does USB stand for?",
                    answers: [
                        { text: "Universal Serial Bus", correct: true },
                        { text: "United System Board", correct: false },
                        { text: "Universal Storage Block", correct: false },
                        { text: "Unified Serial Buffer", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 4,
                    question: "Which company owns YouTube?",
                    answers: [
                        { text: "Microsoft", correct: false },
                        { text: "Apple", correct: false },
                        { text: "Google", correct: true },
                        { text: "Meta", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 5,
                    question: "What is the name of Apple's voice assistant?",
                    answers: [
                        { text: "Alexa", correct: false },
                        { text: "Cortana", correct: false },
                        { text: "Siri", correct: true },
                        { text: "Google Assistant", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 6,
                    question: "What does 'WWW' stand for in a website address?",
                    answers: [
                        { text: "World Wide Web", correct: true },
                        { text: "Wide Web World", correct: false },
                        { text: "Web World Wide", correct: false },
                        { text: "Worldwide Website", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 7,
                    question: "Which social media platform is known for 280-character posts?",
                    answers: [
                        { text: "Facebook", correct: false },
                        { text: "Instagram", correct: false },
                        { text: "Twitter/X", correct: true },
                        { text: "LinkedIn", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 8,
                    question: "What does 'AI' stand for?",
                    answers: [
                        { text: "Artificial Intelligence", correct: true },
                        { text: "Automated Information", correct: false },
                        { text: "Advanced Internet", correct: false },
                        { text: "Applied Innovation", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 9,
                    question: "Which company created the Windows operating system?",
                    answers: [
                        { text: "Apple", correct: false },
                        { text: "Microsoft", correct: true },
                        { text: "IBM", correct: false },
                        { text: "Dell", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 10,
                    question: "What is the shortened name for malicious software?",
                    answers: [
                        { text: "Badware", correct: false },
                        { text: "Virus", correct: false },
                        { text: "Malware", correct: true },
                        { text: "Spyware", correct: false }
                    ],
                    points: 10
                }
            ]
        },
        {
            id: 'silicon-valley-culture',
            name: 'Silicon Valley Culture',
            description: 'Tech companies and startup culture',
            difficulty: 'Medium',
            questions: [
                {
                    id: 1,
                    question: "What animal mascot is associated with the Linux operating system?",
                    answers: [
                        { text: "Fox", correct: false },
                        { text: "Penguin", correct: true },
                        { text: "Eagle", correct: false },
                        { text: "Bear", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 2,
                    question: "Which tech company was founded in a garage in Palo Alto?",
                    answers: [
                        { text: "Microsoft", correct: false },
                        { text: "Apple", correct: true },
                        { text: "Google", correct: false },
                        { text: "Facebook", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 3,
                    question: "What is GitHub primarily used for?",
                    answers: [
                        { text: "Social networking", correct: false },
                        { text: "Video streaming", correct: false },
                        { text: "Version control and code hosting", correct: true },
                        { text: "Online shopping", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 4,
                    question: "Which company uses the slogan 'Don't be evil' (historically)?",
                    answers: [
                        { text: "Apple", correct: false },
                        { text: "Google", correct: true },
                        { text: "Microsoft", correct: false },
                        { text: "Amazon", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 5,
                    question: "What programming language shares its name with a type of coffee?",
                    answers: [
                        { text: "Python", correct: false },
                        { text: "Ruby", correct: false },
                        { text: "Java", correct: true },
                        { text: "Swift", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 6,
                    question: "What does 'MVP' stand for in startup terminology?",
                    answers: [
                        { text: "Most Valuable Player", correct: false },
                        { text: "Maximum Value Product", correct: false },
                        { text: "Minimum Viable Product", correct: true },
                        { text: "Major Version Production", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 7,
                    question: "Which company acquired Instagram in 2012?",
                    answers: [
                        { text: "Google", correct: false },
                        { text: "Twitter", correct: false },
                        { text: "Facebook", correct: true },
                        { text: "Snapchat", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 8,
                    question: "What is the name of Tesla's CEO?",
                    answers: [
                        { text: "Jeff Bezos", correct: false },
                        { text: "Elon Musk", correct: true },
                        { text: "Tim Cook", correct: false },
                        { text: "Sundar Pichai", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 9,
                    question: "Which platform is known for disappearing messages and stories?",
                    answers: [
                        { text: "Facebook", correct: false },
                        { text: "Twitter", correct: false },
                        { text: "Snapchat", correct: true },
                        { text: "LinkedIn", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 10,
                    question: "What does 'SaaS' stand for in the tech industry?",
                    answers: [
                        { text: "Software as a Service", correct: true },
                        { text: "System and Application Software", correct: false },
                        { text: "Server as a System", correct: false },
                        { text: "Security and Authentication Service", correct: false }
                    ],
                    points: 10
                }
            ]
        },
        {
            id: 'programming-fundamentals',
            name: 'Programming Fundamentals',
            description: 'Core programming concepts and languages',
            difficulty: 'Medium',
            questions: [
                {
                    id: 1,
                    question: "What is the time complexity of binary search?",
                    answers: [
                        { text: "O(n)", correct: false },
                        { text: "O(log n)", correct: true },
                        { text: "O(n²)", correct: false },
                        { text: "O(1)", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 2,
                    question: "Which data structure uses LIFO (Last In, First Out)?",
                    answers: [
                        { text: "Queue", correct: false },
                        { text: "Array", correct: false },
                        { text: "Stack", correct: true },
                        { text: "Tree", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 3,
                    question: "What does JSON stand for?",
                    answers: [
                        { text: "JavaScript Object Notation", correct: true },
                        { text: "Java Source Object Notation", correct: false },
                        { text: "JavaScript Operational Network", correct: false },
                        { text: "Java Standard Object Name", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 4,
                    question: "Which programming paradigm does Python primarily support?",
                    answers: [
                        { text: "Only functional", correct: false },
                        { text: "Only procedural", correct: false },
                        { text: "Multi-paradigm", correct: true },
                        { text: "Only object-oriented", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 5,
                    question: "What is the purpose of a constructor in OOP?",
                    answers: [
                        { text: "To destroy objects", correct: false },
                        { text: "To initialize objects", correct: true },
                        { text: "To copy objects", correct: false },
                        { text: "To compare objects", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 6,
                    question: "Which protocol is used for secure web browsing?",
                    answers: [
                        { text: "HTTP", correct: false },
                        { text: "FTP", correct: false },
                        { text: "HTTPS", correct: true },
                        { text: "SMTP", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 7,
                    question: "What does SQL stand for?",
                    answers: [
                        { text: "Structured Query Language", correct: true },
                        { text: "Simple Question Language", correct: false },
                        { text: "Standard Query Library", correct: false },
                        { text: "Structured Question List", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 8,
                    question: "Which keyword is used to prevent inheritance in Java?",
                    answers: [
                        { text: "static", correct: false },
                        { text: "final", correct: true },
                        { text: "abstract", correct: false },
                        { text: "private", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 9,
                    question: "What is the main purpose of a hash function?",
                    answers: [
                        { text: "Sorting data", correct: false },
                        { text: "Mapping data to fixed-size values", correct: true },
                        { text: "Compressing files", correct: false },
                        { text: "Encrypting passwords only", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 10,
                    question: "Which design pattern ensures a class has only one instance?",
                    answers: [
                        { text: "Factory", correct: false },
                        { text: "Observer", correct: false },
                        { text: "Singleton", correct: true },
                        { text: "Adapter", correct: false }
                    ],
                    points: 10
                }
            ]
        },
        {
            id: 'advanced-computer-science',
            name: 'Advanced Computer Science',
            description: 'Deep technical knowledge and theory',
            difficulty: 'Hard',
            questions: [
                {
                    id: 1,
                    question: "What year was the Linux kernel first released?",
                    answers: [
                        { text: "1989", correct: false },
                        { text: "1991", correct: true },
                        { text: "1993", correct: false },
                        { text: "1995", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 2,
                    question: "Which NP-complete problem asks if a graph can be colored with k colors?",
                    answers: [
                        { text: "Traveling Salesman", correct: false },
                        { text: "Graph Coloring", correct: true },
                        { text: "Knapsack", correct: false },
                        { text: "Subset Sum", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 3,
                    question: "What is the CAP theorem in distributed systems?",
                    answers: [
                        { text: "Consistency, Availability, Performance", correct: false },
                        { text: "Consistency, Availability, Partition tolerance", correct: true },
                        { text: "Caching, Authentication, Privacy", correct: false },
                        { text: "Concurrency, Atomicity, Performance", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 4,
                    question: "Which sorting algorithm has the best worst-case time complexity?",
                    answers: [
                        { text: "Quick Sort", correct: false },
                        { text: "Bubble Sort", correct: false },
                        { text: "Merge Sort", correct: true },
                        { text: "Insertion Sort", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 5,
                    question: "What does ACID stand for in database transactions?",
                    answers: [
                        { text: "Atomicity, Consistency, Isolation, Durability", correct: true },
                        { text: "Accuracy, Consistency, Integrity, Data", correct: false },
                        { text: "Access, Control, Isolation, Design", correct: false },
                        { text: "Atomic, Complete, Indexed, Durable", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 6,
                    question: "Which data structure is used in implementing a priority queue efficiently?",
                    answers: [
                        { text: "Array", correct: false },
                        { text: "Linked List", correct: false },
                        { text: "Heap", correct: true },
                        { text: "Stack", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 7,
                    question: "What is the space complexity of Depth-First Search (DFS)?",
                    answers: [
                        { text: "O(1)", correct: false },
                        { text: "O(log n)", correct: false },
                        { text: "O(n)", correct: true },
                        { text: "O(n²)", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 8,
                    question: "Which consensus algorithm does Bitcoin use?",
                    answers: [
                        { text: "Raft", correct: false },
                        { text: "Paxos", correct: false },
                        { text: "Proof of Work", correct: true },
                        { text: "Byzantine Fault Tolerance", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 9,
                    question: "What is the primary purpose of a compiler's lexical analyzer?",
                    answers: [
                        { text: "Generate machine code", correct: false },
                        { text: "Tokenize source code", correct: true },
                        { text: "Optimize code", correct: false },
                        { text: "Check syntax errors", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 10,
                    question: "Which TCP congestion control algorithm uses additive increase, multiplicative decrease?",
                    answers: [
                        { text: "Tahoe", correct: false },
                        { text: "Reno", correct: true },
                        { text: "Vegas", correct: false },
                        { text: "Cubic", correct: false }
                    ],
                    points: 10
                }
            ]
        },
        {
            id: 'modern-tech-trends',
            name: 'Modern Tech Trends',
            description: 'Current technology and emerging innovations',
            difficulty: 'Medium-Hard',
            questions: [
                {
                    id: 1,
                    question: "What does 'GPT' stand for in ChatGPT?",
                    answers: [
                        { text: "General Purpose Technology", correct: false },
                        { text: "Generative Pre-trained Transformer", correct: true },
                        { text: "Global Processing Tool", correct: false },
                        { text: "Graphical Programming Template", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 2,
                    question: "Which company developed the Kubernetes container orchestration system?",
                    answers: [
                        { text: "Microsoft", correct: false },
                        { text: "Amazon", correct: false },
                        { text: "Google", correct: true },
                        { text: "Docker", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 3,
                    question: "What is the primary function of a blockchain?",
                    answers: [
                        { text: "Video streaming", correct: false },
                        { text: "Distributed ledger for transactions", correct: true },
                        { text: "Cloud storage", correct: false },
                        { text: "Network routing", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 4,
                    question: "Which neural network architecture revolutionized natural language processing?",
                    answers: [
                        { text: "CNN", correct: false },
                        { text: "RNN", correct: false },
                        { text: "Transformer", correct: true },
                        { text: "GAN", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 5,
                    question: "What does 'IoT' stand for?",
                    answers: [
                        { text: "Internet of Things", correct: true },
                        { text: "Integration of Technology", correct: false },
                        { text: "Interface of Tools", correct: false },
                        { text: "Internet Operation Terminal", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 6,
                    question: "Which cloud computing model provides the most control over infrastructure?",
                    answers: [
                        { text: "SaaS", correct: false },
                        { text: "PaaS", correct: false },
                        { text: "IaaS", correct: true },
                        { text: "FaaS", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 7,
                    question: "What is quantum computing's basic unit of information?",
                    answers: [
                        { text: "Bit", correct: false },
                        { text: "Qubit", correct: true },
                        { text: "Byte", correct: false },
                        { text: "Quantum", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 8,
                    question: "Which programming language is primarily used for iOS app development?",
                    answers: [
                        { text: "Java", correct: false },
                        { text: "Kotlin", correct: false },
                        { text: "Swift", correct: true },
                        { text: "Python", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 9,
                    question: "What does 'CI/CD' stand for in DevOps?",
                    answers: [
                        { text: "Central Integration/Central Deployment", correct: false },
                        { text: "Continuous Integration/Continuous Deployment", correct: true },
                        { text: "Code Integration/Code Development", correct: false },
                        { text: "Cloud Installation/Cloud Distribution", correct: false }
                    ],
                    points: 10
                },
                {
                    id: 10,
                    question: "Which technology enables self-sovereign identity on the blockchain?",
                    answers: [
                        { text: "OAuth", correct: false },
                        { text: "SAML", correct: false },
                        { text: "DID (Decentralized Identifiers)", correct: true },
                        { text: "LDAP", correct: false }
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

