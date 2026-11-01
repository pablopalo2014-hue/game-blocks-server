const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const app = express();

// Los juegos pueden ocupar bastante espacio.
app.use(express.json({ limit: "25mb" }));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const players = new Set();

const positions = [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 }
];

// =====================================================
// BASE DE DATOS DE JUEGOS
// =====================================================

const gamesDirectory = path.join(__dirname, "games");
const gamesDatabase = path.join(__dirname, "games.json");

if (!fs.existsSync(gamesDirectory)) {
    fs.mkdirSync(gamesDirectory, { recursive: true });
}

if (!fs.existsSync(gamesDatabase)) {
    fs.writeFileSync(gamesDatabase, "[]", "utf8");
}

function readGamesDatabase() {
    try {
        const content = fs.readFileSync(gamesDatabase, "utf8");
        const games = JSON.parse(content);
        return Array.isArray(games) ? games : [];
    } catch (error) {
        console.error("Error leyendo games.json:", error);
        return [];
    }
}

// =====================================================
// QUE HAY DE NUEVO
// =====================================================

const queHayDeNuevo = `
Hola viajero, no hay ningun update por ahora, sigue jugando tranquilo.

Recuerda que hemos añadido:
- nuevo juego
- cosas en desarrollo
- mejoras a la web
- avatares
- reportes
- monedas
- entre otras cosas

Si al abrir el juego sale que lo reinstales, es por una actualizacion.
Por ahora no hay nada.
`;

// =====================================================
// ACTUALIZACION
// =====================================================

const actualizacionProgramada = false;

const mensajeActualizacion =
    "Game Blocks se actualizará próximamente.";

const fechaActualizacion =
    "Próximamente";

// =====================================================
// PALABRAS PROHIBIDAS
// =====================================================

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
    "roblox",
    "discord",
    "discord name",
    "usuario de discord",
    "vortex",
    "dis-cord",
    "hostias"
];

// =====================================================
// API PRINCIPAL
// =====================================================

app.get("/", (req, res) => {
    res.status(200);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send("Game Blocks API funcionando correctamente");
});

// =====================================================
// HEALTH CHECK - RENDER
// =====================================================

app.get("/health", (req, res) => {
    res.status(200).json({
        success: true,
        server: "Game Blocks",
        status: "online"
    });
});

// =====================================================
// NEWS
// =====================================================

app.get("/news", (req, res) => {
    res.status(200);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(queHayDeNuevo);
});

// =====================================================
// DISTRIBUTION CENTER - JUEGO ALEATORIO
// =====================================================

app.get("/games/random", (req, res) => {
    const games = readGamesDatabase();

    // Solo aceptar entradas con un nombre y un archivo .tscn.
    const validGames = games.filter((game) => {
        return (
            game &&
            typeof game.name === "string" &&
            typeof game.file === "string" &&
            game.file.toLowerCase().endsWith(".tscn") &&
            path.basename(game.file) === game.file
        );
    });

    if (validGames.length === 0) {
        return res.status(404).json({
            success: false,
            message: "Todavía no hay juegos publicados."
        });
    }

    const selectedGame =
        validGames[Math.floor(Math.random() * validGames.length)];

    const gamePath = path.join(gamesDirectory, selectedGame.file);

    if (!fs.existsSync(gamePath)) {
        console.error("No se encuentra el juego:", selectedGame.file);

        return res.status(404).json({
            success: false,
            message: "El archivo del juego no está disponible."
        });
    }

    try {
        const scene = fs.readFileSync(gamePath, "utf8");

        if (!scene.startsWith("[gd_scene")) {
            return res.status(500).json({
                success: false,
                message: "El archivo seleccionado no parece una escena TSCN válida."
            });
        }

        return res.status(200).json({
            success: true,
            id: String(selectedGame.id ?? ""),
            name: selectedGame.name,
            scene: scene
        });
    } catch (error) {
        console.error("Error leyendo el juego:", error);

        return res.status(500).json({
            success: false,
            message: "No se pudo leer el juego."
        });
    }
});

// =====================================================
// CHAT
// =====================================================

app.post("/chat", (req, res) => {
    const message = req.body.message;

    if (!message || typeof message !== "string") {
        return res.status(400).json({
            success: false,
            blocked: false,
            message: "Mensaje inválido"
        });
    }

    const cleanMessage = message.trim();

    if (cleanMessage.length === 0) {
        return res.status(400).json({
            success: false,
            blocked: false,
            message: "Mensaje vacío"
        });
    }

    const lowerMessage = cleanMessage.toLowerCase();

    const containsBadWord = bannedWords.some((word) => {
        return lowerMessage.includes(word.toLowerCase());
    });

    if (containsBadWord) {
        console.log("Mensaje censurado:", cleanMessage);

        return res.json({
            success: false,
            blocked: true,
            message: "[CENSURADO POR LA MODERACION]"
        });
    }

    console.log("Mensaje aceptado:", cleanMessage);

    const data = JSON.stringify({
        type: "chat_message",
        message: cleanMessage
    });

    for (const player of players) {
        if (player.readyState === WebSocket.OPEN) {
            player.send(data);
        }
    }

    res.json({
        success: true,
        blocked: false,
        message: cleanMessage
    });
});

// =====================================================
// WEBSOCKET
// =====================================================

wss.on("connection", (socket) => {
    if (players.size >= 2) {
        console.log("Servidor lleno. Conexión rechazada.");
        socket.close();
        return;
    }

    players.add(socket);

    const slot = players.size - 1;
    socket.slot = slot;

    console.log(
        "Jugador conectado. Slot:",
        slot + 1,
        "Jugadores:",
        players.size
    );

    socket.send(JSON.stringify({
        type: "positions",
        positions: positions
    }));

    socket.on("message", (message) => {
        try {
            const data = JSON.parse(message.toString());

            if (data.type !== "position") {
                return;
            }

            const x = Number(data.x);
            const y = Number(data.y);
            const z = Number(data.z);

            if (
                !Number.isFinite(x) ||
                !Number.isFinite(y) ||
                !Number.isFinite(z)
            ) {
                return;
            }

            positions[socket.slot] = {
                x: x,
                y: y,
                z: z
            };

            const response = JSON.stringify({
                type: "positions",
                positions: positions
            });

            for (const player of players) {
                if (player.readyState === WebSocket.OPEN) {
                    player.send(response);
                }
            }
        } catch (error) {
            console.log("Paquete WebSocket inválido.");
        }
    });

    socket.on("close", () => {
        players.delete(socket);

        positions[socket.slot] = {
            x: 0,
            y: 0,
            z: 0
        };

        console.log(
            "Jugador desconectado. Jugadores:",
            players.size
        );
    });

    socket.on("error", (error) => {
        console.log("Error WebSocket:", error);
    });
});

// =====================================================
// SERVIDOR
// =====================================================

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
    console.log(
        "Servidor de Game Blocks iniciado en el puerto " + PORT
    );
});
