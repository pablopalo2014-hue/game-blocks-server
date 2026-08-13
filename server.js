const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();

app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const players = new Set();

// Palabras que quieres bloquear
const bannedWords = [
    "joder",
    "coño",
    "mierda",
    "puta",
    "puto",
    "gilipollas",
    "cabron",
    "cabrón",
    "idiota",
    "imbecil",
    "imbécil",
    "hostia",
    "hostias"
];

app.get("/", (req, res) => {
    res.send("Servidor funcionando");
});

app.post("/chat", (req, res) => {
    const message = req.body.message;

    if (!message || typeof message !== "string") {
        return res.status(400).json({
            error: "Mensaje inválido"
        });
    }

    const lowerMessage = message.toLowerCase();

    // Comprobar palabras prohibidas
    const containsBadWord = bannedWords.some(word => {
        return lowerMessage.includes(word);
    });

    if (containsBadWord) {
        console.log("Mensaje bloqueado:", message);

        return res.json({
            success: false,
            blocked: true
        });
    }

    console.log("Mensaje aceptado:", message);

    // Dato que recibirá Godot
    const data = JSON.stringify({
        type: "chat_message",
        message: message
    });

    // Enviar a todos los jugadores conectados
    for (const player of players) {
        if (player.readyState === WebSocket.OPEN) {
            player.send(data);
        }
    }

    res.json({
        success: true,
        blocked: false
    });
});

wss.on("connection", (socket) => {
    players.add(socket);

    console.log(
        "Jugador conectado. Jugadores:",
        players.size
    );

    socket.on("close", () => {
        players.delete(socket);

        console.log(
            "Jugador desconectado. Jugadores:",
            players.size
        );
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor iniciado en el puerto ${PORT}`);
});
