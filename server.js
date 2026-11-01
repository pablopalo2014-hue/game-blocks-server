const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json({ limit: "20mb" }));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const players = new Set();

const positions = [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 }
];

// =====================================================
// ALMACENAMIENTO DE JUEGOS
// =====================================================

const gamesDirectory = path.join(__dirname, "games");
const gamesDatabase = path.join(__dirname, "games.json");

if (!fs.existsSync(gamesDirectory)) {
    fs.mkdirSync(gamesDirectory, { recursive: true });
}

if (!fs.existsSync(gamesDatabase)) {
    fs.writeFileSync(gamesDatabase, "[]", "utf8");
}

function readGames() {
    try {
        const data = JSON.parse(fs.readFileSync(gamesDatabase, "utf8"));
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error("No se pudo leer games.json:", error);
        return [];
    }
}

function writeGames(games) {
    fs.writeFileSync(gamesDatabase, JSON.stringify(games, null, 2), "utf8");
}

function validGameEntry(game) {
    return (
        game &&
        typeof game.id === "string" &&
        typeof game.name === "string" &&
        typeof game.file === "string" &&
        game.file.endsWith(".tscn") &&
        path.basename(game.file) === game.file
    );
}

// =====================================================
// NOTICIAS
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

const actualizacionProgramada = false;
const mensajeActualizacion = "Game Blocks se actualizará próximamente.";
const fechaActualizacion = "Próximamente";

// =====================================================
// MODERACIÓN DEL CHAT
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
    res.type("text/plain").status(200).send(
        "Game Blocks API funcionando correctamente"
    );
});

// =====================================================
// HEALTH CHECK
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
    res.type("text/plain").status(200).send(queHayDeNuevo);
});

// =====================================================
// PUBLICAR JUEGO
// =====================================================

// Esta ruta coincide con el script de Godot:
// POST /games/publish
// Body JSON: { "name": "Nombre", "scene": "[gd_scene ...]" }
//
// Para proteger la publicación, configura PUBLISH_TOKEN en Render.
// Si PUBLISH_TOKEN no está configurado, la publicación queda abierta
// (útil solo para pruebas; no recomendable para una comunidad pública).

app.post("/games/publish", (req, res) => {
    const configuredToken = process.env.PUBLISH_TOKEN;

    if (configuredToken) {
        const authorization = req.headers.authorization || "";
        const suppliedToken = authorization.startsWith("Bearer ")
            ? authorization.slice(7)
            : "";

        if (suppliedToken !== configuredToken) {
            return res.status(401).json({
                success: false,
                message: "No tienes permiso para publicar."
            });
        }
    }

    const name = typeof req.body.name === "string"
        ? req.body.name.trim()
        : "";

    const scene = typeof req.body.scene === "string"
        ? req.body.scene
        : "";

    if (!name || name.length > 80) {
        return res.status(400).json({
            success: false,
            message: "El nombre del juego no es válido (máximo 80 caracteres)."
        });
    }

    if (!scene.startsWith("[gd_scene")) {
        return res.status(400).json({
            success: false,
            message: "El contenido enviado no parece una escena TSCN válida."
        });
    }

    // ID numérico generado por el servidor.
    const games = readGames();
    let id;

    do {
        id = String(Math.floor(100000 + Math.random() * 900000));
    } while (games.some((game) => String(game.id) === id));

    const fileName = `game_${id}.tscn`;
    const filePath = path.join(gamesDirectory, fileName);

    try {
        fs.writeFileSync(filePath, scene, "utf8");

        const newGame = {
            id: id,
            name: name,
            file: fileName
        };

        games.push(newGame);
        writeGames(games);

        console.log(`Juego publicado: ${name} (ID ${id})`);

        return res.status(200).json({
            success: true,
            message: "Juego publicado correctamente.",
            game: newGame
        });
    } catch (error) {
        console.error("Error publicando el juego:", error);

        // Si se creó el archivo pero falló la base de datos, intentar limpiarlo.
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (_) {}

        return res.status(500).json({
            success: false,
            message: "No se pudo guardar el juego en el servidor."
        });
    }
});

// =====================================================
// OBTENER JUEGO ALEATORIO
// =====================================================

app.get("/games/random", (req, res) => {
    const games = readGames();

    const validGames = games.filter(validGameEntry);

    // Excluir juegos cuyo archivo ya no exista.
    const availableGames = validGames.filter((game) => {
        return fs.existsSync(path.join(gamesDirectory, game.file));
    });

    if (availableGames.length === 0) {
        return res.status(404).json({
            success: false,
            message: "Todavía no hay juegos publicados."
        });
    }

    const selectedGame =
        availableGames[Math.floor(Math.random() * availableGames.length)];

    try {
        const scene = fs.readFileSync(
            path.join(gamesDirectory, selectedGame.file),
            "utf8"
        );

        if (!scene.startsWith("[gd_scene")) {
            return res.status(500).json({
                success: false,
                message: "El archivo publicado no es una escena TSCN válida."
            });
        }

        return res.status(200).json({
            success: true,
            id: String(selectedGame.id),
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

    return res.json({
        success: true,
        blocked: false,
        message: cleanMessage
    });
});

// =====================================================
// WEBSOCKET MULTIJUGADOR
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

            positions[socket.slot] = { x, y, z };

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

        positions[socket.slot] = { x: 0, y: 0, z: 0 };

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
// INICIO DEL SERVIDOR
// =====================================================

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
    console.log("Servidor de Game Blocks iniciado en el puerto " + PORT);
});
